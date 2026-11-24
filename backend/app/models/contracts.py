from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    field_validator,
    model_validator,
)


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Health(Contract):
    status: str
    database_configured: bool
    model_configured: bool
    executor_configured: bool


class Challenge(Contract):
    id: str
    name: str
    topic: str
    difficulty: Literal["Easy", "Medium", "Hard"]
    description: str
    code: str
    family: str


class PrivateChallenge(Challenge):
    reference: str
    hints: list[str]
    cases_repr: list[str]


class Workspace(Contract):
    id: UUID
    name: str
    created_by: UUID
    created_at: datetime


class StartSession(Contract):
    workspace_id: UUID
    challenge_id: str = Field(min_length=1, max_length=60)
    mode: Literal["practice", "assessment"] = "practice"
    assistance: bool = Field(default=False, strict=True)


class SaveDraft(Contract):
    revision: int = Field(ge=1, strict=True)
    code: str = Field(max_length=18000)
    diagnosis: str = Field(default="", max_length=3000)


class Session(Contract):
    id: UUID
    workspace_id: UUID
    owner_id: UUID
    challenge_id: str
    mode: Literal["practice", "assessment"]
    assistance: bool
    code: str
    diagnosis: str
    revision: int
    hints: list[str]
    status: Literal["active", "submitted"]
    deadline: datetime | None
    created_at: datetime
    updated_at: datetime


class CreateRun(Contract):
    idempotency_key: UUID
    operation: Literal["test", "submit", "explain"] = "test"
    revision: int = Field(ge=1, strict=True)


class Run(Contract):
    id: UUID
    workspace_id: UUID
    owner_id: UUID
    session_id: UUID | None
    operation: str
    revision: int
    status: Literal["queued", "running", "completed", "failed", "cancelled"]
    result: JsonValue | None
    error: str | None
    created_at: datetime
    completed_at: datetime | None


class RunEvent(Contract):
    id: int
    run_id: UUID
    event: str
    payload: JsonValue
    created_at: datetime


class Finding(Contract):
    severity: Literal["error", "warning", "info"]
    line: int | None = Field(default=None, ge=1)
    message: str = Field(max_length=3000)


class Analysis(Contract):
    summary: str = Field(min_length=1, max_length=4000)
    findings: list[Finding] = Field(max_length=30)
    explanation: str = Field(max_length=12000)
    suggested_code: str | None = Field(default=None, max_length=18000)


class SourceFile(Contract):
    path: str = Field(min_length=1, max_length=260)
    source: str

    @field_validator("path")
    @classmethod
    def valid_path(cls, value: str) -> str:
        value = value.replace("\\", "/")
        if (
            any(part in {"", ".", ".."} for part in value.split("/"))
            or ":" in value
            or "\0" in value
        ):
            raise ValueError("Use a relative project path")
        if any(
            part == ".env"
            or part.startswith(".env.")
            or part.lower().endswith((".pem", ".key", ".p12", ".pfx"))
            for part in value.split("/")
        ):
            raise ValueError("Credential files cannot be imported")
        return value

    @field_validator("source")
    @classmethod
    def valid_source(cls, value: str) -> str:
        if "\0" in value:
            raise ValueError("Files must contain text, not binary data")
        return value


class CreateProject(Contract):
    workspace_id: UUID
    name: str = Field(min_length=1, max_length=100)
    files: list[SourceFile] = Field(default_factory=list)

    @field_validator("files")
    @classmethod
    def valid_files(cls, files: list[SourceFile]) -> list[SourceFile]:
        if len({f.path for f in files}) != len(files):
            raise ValueError("Duplicate paths")
        return files


class Project(Contract):
    id: UUID
    workspace_id: UUID
    name: str
    created_at: datetime


class ProjectFile(SourceFile):
    id: UUID
    project_id: UUID
    revision: int
    updated_at: datetime


class UpdateFile(Contract):
    source: str
    revision: int = Field(ge=1, strict=True)

    @field_validator("source")
    @classmethod
    def valid_source(cls, value: str) -> str:
        return SourceFile.valid_source(value)


class Reflection(Contract):
    run_id: UUID
    explanation: str = Field(min_length=12, max_length=3000)


class Success(Contract):
    ok: bool = True


class SavedReflection(Reflection):
    confidence: float = Field(ge=0, le=5)
    code_score: float = Field(ge=0, le=5)
    diagnosis_score: float | None
    explanation_score: float | None
    feedback: str | None
    evaluation_status: Literal["queued", "running", "completed", "failed"]
    version: int
    owner_id: UUID
    created_at: datetime


class RunReport(Run):
    source: str
    challenge_id: str
    diagnosis: str
    hints_used: int
    reflection: SavedReflection | None = None


class ExecutorCase(Contract):
    passed: bool = Field(strict=True)
    error: str = ""
    input: str = ""
    expected: JsonValue = None
    actual: JsonValue = None
    stdout: str = ""


class TestResult(Contract):
    passed: int = Field(ge=0, le=7, strict=True)
    total: Literal[7] = 7
    visible: list[ExecutorCase] = Field(min_length=2, max_length=2)
    hidden_passed: int = Field(ge=0, le=5, strict=True)
    source_hash: str = Field(pattern=r"^[0-9a-f]{64}$")

    @model_validator(mode="after")
    def consistent_score(self) -> "TestResult":
        if self.passed != self.hidden_passed + sum(
            item.passed for item in self.visible
        ):
            raise ValueError("Pass count does not match the test outcomes")
        return self


class BeginUpload(Contract):
    project_id: UUID
    path: str
    revision: int | None = Field(default=None, ge=1, strict=True)

    @field_validator("path")
    @classmethod
    def valid_path(cls, value: str) -> str:
        return SourceFile(path=value, source="").path


class UploadPart(Contract):
    part: int = Field(ge=0, strict=True)
    content: str = Field(max_length=65536)

    @field_validator("content")
    @classmethod
    def valid_content(cls, value: str) -> str:
        return SourceFile.valid_source(value)


class FinishUpload(Contract):
    parts: int = Field(ge=1, strict=True)


class UploadState(Contract):
    id: UUID
    next_part: int


class ChatRequest(Contract):
    file_id: UUID
    revision: int = Field(ge=1, strict=True)
    message: str = Field(min_length=1, max_length=4000)
    auto_apply: bool = Field(default=True, strict=True)
    idempotency_key: UUID

    @field_validator("message")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Describe what you need help with")
        return value.strip()


class ChatTurn(Contract):
    id: UUID
    thread_id: UUID
    file_id: UUID
    revision: int
    prompt: str
    auto_apply: bool
    status: Literal["queued", "running", "completed", "failed", "cancelled"]
    response: JsonValue | None
    error: str | None
    applied_revision: int | None
    reverted_revision: int | None
    created_at: datetime
    completed_at: datetime | None


class ChatThread(Contract):
    id: UUID
    project_id: UUID
    owner_id: UUID
    created_at: datetime
