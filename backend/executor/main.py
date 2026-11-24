import asyncio
import hashlib
import json
import secrets
from pathlib import Path
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import Field, JsonValue, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.models.contracts import Contract, ExecutorCase, TestResult


class ExecutorSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    executor_token: SecretStr = SecretStr("")
    sandbox_image: str = "synaptiq-sandbox:1"
    # Do not fall back to the host interpreter or an ordinary Docker runtime.
    sandbox_runtime: str = "runsc"
    executor_backend: Literal["wasi", "gvisor"] = "gvisor"
    wasm_module: str = str(Path(__file__).resolve().parents[1] / ".runtime/python.wasm")


class Execution(Contract):
    code: str = Field(max_length=18000)
    reference: str = Field(max_length=18000)
    cases_repr: list[str] = Field(min_length=7, max_length=7)


class Outcome(Contract):
    ok: bool
    result: JsonValue = None
    error: str = ""
    stdout: str = ""


class SandboxOutput(Contract):
    results: list[Outcome] = Field(min_length=7, max_length=7)


settings = ExecutorSettings()
app = FastAPI(title="Synaptiq private executor", docs_url=None, openapi_url=None)
slots = asyncio.Semaphore(2)
bearer = HTTPBearer(auto_error=False)


def authorize(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> None:
    token = settings.executor_token.get_secret_value()
    if (
        not token
        or credentials is None
        or not secrets.compare_digest(credentials.credentials, token)
    ):
        raise HTTPException(401, "Executor authentication required")


async def sandbox(source: str, cases: list[str]) -> SandboxOutput:
    if settings.executor_backend == "wasi":
        from executor.wasm import run

        wasm_output = await asyncio.to_thread(run, source, cases, settings.wasm_module)
        return SandboxOutput.model_validate_json(wasm_output)
    name = f"synaptiq-{uuid4().hex}"
    command = [
        "docker",
        "run",
        "--rm",
        "--name",
        name,
        "--runtime",
        settings.sandbox_runtime,
        "--network=none",
        "--read-only",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--memory=128m",
        "--memory-swap=128m",
        "--cpus=0.5",
        "--pids-limit=16",
        "--ulimit",
        "cpu=3:3",
        "--ulimit",
        "nofile=32:32",
        "--user=65532:65532",
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,size=8m",
        "--log-driver=none",
        "-i",
        settings.sandbox_image,
    ]
    process = await asyncio.create_subprocess_exec(
        *command,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        async with asyncio.timeout(8):
            if process.stdin is None or process.stdout is None:
                raise RuntimeError("Sandbox pipes are unavailable")
            process.stdin.write(
                json.dumps({"source": source, "cases_repr": cases}).encode()
            )
            await process.stdin.drain()
            process.stdin.close()
            output = bytearray()
            while chunk := await process.stdout.read(8192):
                output.extend(chunk)
                if len(output) > 262144:
                    raise ValueError("Sandbox output limit exceeded")
            if await process.wait() != 0:
                raise RuntimeError("Sandbox exited without a valid result")
            return SandboxOutput.model_validate_json(bytes(output))
    finally:
        # Kill the container as well as its CLI. Cancelling docker alone leaves code running.
        cleanup = await asyncio.create_subprocess_exec(
            "docker",
            "rm",
            "-f",
            name,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        try:
            await asyncio.wait_for(cleanup.wait(), timeout=5)
        finally:
            if cleanup.returncode is None:
                cleanup.kill()
                await cleanup.wait()
            if process.returncode is None:
                process.kill()
                await process.wait()


@app.post("/execute", response_model=TestResult, dependencies=[Depends(authorize)])
async def execute(payload: Execution) -> TestResult:
    if any(len(case.encode()) > 20000 for case in payload.cases_repr):
        raise HTTPException(422, "Test input limit exceeded")
    async with slots:
        try:
            # Reference code never shares a container with learner code.
            expected = await sandbox(payload.reference, payload.cases_repr)
            if not all(item.ok for item in expected.results):
                raise HTTPException(503, "Reference fixture is invalid")
        except (OSError, RuntimeError, TimeoutError, ValueError) as exc:
            raise HTTPException(503, "Sandbox runtime is unavailable") from exc
        try:
            actual = await sandbox(payload.code, payload.cases_repr)
        except (RuntimeError, TimeoutError, ValueError):
            actual = SandboxOutput(
                results=[
                    Outcome(
                        ok=False,
                        error="Execution exceeded limits or returned invalid output",
                    )
                    for _ in range(7)
                ]
            )
        outcomes = [
            ExecutorCase(
                passed=a.ok and a.result == b.result,
                error=a.error if not a.ok else "",
                input=payload.cases_repr[index] if index < 2 else "",
                expected=b.result if index < 2 else None,
                actual=a.result if index < 2 else None,
                stdout=a.stdout if index < 2 else "",
            )
            for index, (a, b) in enumerate(
                zip(actual.results, expected.results, strict=True)
            )
        ]
        return TestResult(
            passed=sum(item.passed for item in outcomes),
            total=7,
            visible=outcomes[:2],
            hidden_passed=sum(item.passed for item in outcomes[2:]),
            source_hash=hashlib.sha256(payload.code.encode()).hexdigest(),
        )
