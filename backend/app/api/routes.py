import asyncio
import json
from collections.abc import AsyncIterator
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import TypeAdapter

from app.core.database import DB
from app.core.settings import get_settings
from app.models.contracts import (
    BeginUpload,
    Challenge,
    ChatRequest,
    ChatThread,
    ChatTurn,
    CreateProject,
    CreateRun,
    Finding,
    FinishUpload,
    Project,
    ProjectFile,
    Reflection,
    Run,
    RunEvent,
    RunReport,
    SaveDraft,
    SavedReflection,
    Session,
    SourceFile,
    StartSession,
    Success,
    UpdateFile,
    UploadPart,
    UploadState,
    Workspace,
)
from app.services.catalog import catalog, challenge_by_id
from app.services.inspection import inspect_source

router = APIRouter(prefix="/v1")
RUN_COLUMNS = "id,workspace_id,owner_id,session_id,operation,revision,status,result,error,created_at,completed_at"


@router.get("/reports", response_model=list[RunReport])
async def reports(
    db: DB, limit: int = Query(30, ge=1, le=100), offset: int = Query(0, ge=0)
) -> list[RunReport]:
    raw_runs = await db.request(
        "GET",
        "synaptiq_runs",
        params={
            "select": RUN_COLUMNS + ",source,challenge_id,diagnosis,hints_used",
            "order": "created_at.desc",
            "limit": str(limit),
            "offset": str(offset),
        },
    )
    rows = TypeAdapter(list[RunReport]).validate_python(raw_runs)
    if not rows:
        return []
    ids = ",".join(str(row.id) for row in rows)
    reflections = TypeAdapter(list[SavedReflection]).validate_python(
        await db.request(
            "GET", "synaptiq_reflections", params={"run_id": f"in.({ids})"}
        )
    )
    by_run = {reflection.run_id: reflection for reflection in reflections}
    return [row.model_copy(update={"reflection": by_run.get(row.id)}) for row in rows]


@router.get("/catalog", response_model=list[Challenge])
async def get_catalog() -> list[Challenge]:
    return catalog()


@router.post("/workspaces/bootstrap", response_model=Workspace)
async def bootstrap(db: DB) -> Workspace:
    return Workspace.model_validate(await db.rpc("bootstrap"))


@router.get("/sessions", response_model=list[Session])
async def sessions(
    db: DB, limit: int = Query(30, ge=1, le=100), offset: int = Query(0, ge=0)
) -> list[Session]:
    return TypeAdapter(list[Session]).validate_python(
        await db.request(
            "GET",
            "synaptiq_sessions",
            params={
                "order": "updated_at.desc",
                "limit": str(limit),
                "offset": str(offset),
            },
        )
    )


@router.post("/sessions", response_model=Session, status_code=201)
async def start_session(body: StartSession, db: DB) -> Session:
    if body.mode == "assessment" and not get_settings().execution_jobs_configured:
        raise HTTPException(
            503, "Configure the isolated executor before starting a timed assessment"
        )
    challenge = challenge_by_id(body.challenge_id)
    return Session.model_validate(
        await db.rpc(
            "start_session",
            {
                "p_workspace": str(body.workspace_id),
                "p_challenge": challenge.id,
                "p_code": challenge.code,
                "p_mode": body.mode,
                "p_assistance": body.assistance,
            },
        )
    )


@router.get("/sessions/{session_id}", response_model=Session)
async def get_session(session_id: UUID, db: DB) -> Session:
    rows = TypeAdapter(list[Session]).validate_python(
        await db.request("GET", "synaptiq_sessions", params={"id": f"eq.{session_id}"})
    )
    if not rows:
        raise HTTPException(404, "Session not found")
    return rows[0]


@router.patch("/sessions/{session_id}", response_model=Session)
async def save_session(session_id: UUID, body: SaveDraft, db: DB) -> Session:
    return Session.model_validate(
        await db.rpc(
            "save_draft",
            {
                "p_session": str(session_id),
                "p_revision": body.revision,
                "p_code": body.code,
                "p_diagnosis": body.diagnosis,
            },
        )
    )


@router.post("/sessions/{session_id}/hints", response_model=Session)
async def hint(session_id: UUID, db: DB) -> Session:
    rows = TypeAdapter(list[Session]).validate_python(
        await db.request("GET", "synaptiq_sessions", params={"id": f"eq.{session_id}"})
    )
    if not rows:
        raise HTTPException(404, "Session not found")
    session = rows[0]
    challenge = challenge_by_id(session.challenge_id)
    index = len(session.hints)
    if index >= len(challenge.hints):
        raise HTTPException(409, "All hints have been revealed")
    return Session.model_validate(
        await db.rpc(
            "reveal_hint",
            {
                "p_session": str(session_id),
                "p_index": index,
                "p_hint": challenge.hints[index],
            },
        )
    )


@router.post("/sessions/{session_id}/runs", response_model=Run, status_code=202)
async def create_run(session_id: UUID, body: CreateRun, db: DB) -> Run:
    settings = get_settings()
    if body.operation == "explain" and not settings.model_jobs_configured:
        raise HTTPException(503, "Connect a model before requesting AI feedback")
    if body.operation != "explain" and not settings.execution_jobs_configured:
        raise HTTPException(503, "The isolated code executor is not configured")
    value = await db.rpc(
        "enqueue_run",
        {
            "p_session": str(session_id),
            "p_revision": body.revision,
            "p_operation": body.operation,
            "p_key": str(body.idempotency_key),
        },
    )
    return Run.model_validate(value)


@router.get("/runs", response_model=list[Run])
async def runs(
    db: DB,
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session_id: UUID | None = None,
) -> list[Run]:
    params = {
        "select": RUN_COLUMNS,
        "order": "created_at.desc",
        "limit": str(limit),
        "offset": str(offset),
    }
    if session_id:
        params["session_id"] = f"eq.{session_id}"
    return TypeAdapter(list[Run]).validate_python(
        await db.request("GET", "synaptiq_runs", params=params)
    )


async def find_run(run_id: UUID, db: DB) -> Run:
    rows = TypeAdapter(list[Run]).validate_python(
        await db.request(
            "GET", "synaptiq_runs", params={"id": f"eq.{run_id}", "select": RUN_COLUMNS}
        )
    )
    if not rows:
        raise HTTPException(404, "Run not found")
    return rows[0]


@router.get("/runs/{run_id}", response_model=Run)
async def get_run(run_id: UUID, db: DB) -> Run:
    return await find_run(run_id, db)


@router.post("/runs/{run_id}/cancel", response_model=Success)
async def cancel_run(run_id: UUID, db: DB) -> Success:
    await db.rpc("cancel_run", {"p_run": str(run_id)})
    return Success()


@router.get("/runs/{run_id}/events")
async def stream_events(
    run_id: UUID, request: Request, db: DB, after: int = Query(0, ge=0)
) -> StreamingResponse:
    await find_run(run_id, db)

    async def events() -> AsyncIterator[str]:
        cursor = after
        for _ in range(120):
            if await request.is_disconnected():
                return
            rows = TypeAdapter(list[RunEvent]).validate_python(
                await db.request(
                    "GET",
                    "synaptiq_run_events",
                    params={
                        "run_id": f"eq.{run_id}",
                        "id": f"gt.{cursor}",
                        "order": "id.asc",
                        "limit": "100",
                    },
                )
            )
            for row in rows:
                cursor = row.id
                yield f"id: {row.id}\nevent: {row.event}\ndata: {json.dumps(row.payload)}\n\n"
            state = await find_run(run_id, db)
            if state.status in {"completed", "failed", "cancelled"} and len(rows) < 100:
                yield f"event: state\ndata: {state.model_dump_json()}\n\n"
                return
            yield ": heartbeat\n\n"
            await asyncio.sleep(1)
        yield "event: reconnect\ndata: {}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


@router.post("/reflections", response_model=SavedReflection)
async def reflect(body: Reflection, db: DB) -> SavedReflection:
    return SavedReflection.model_validate(
        await db.rpc(
            "reflect",
            {
                "p_run": str(body.run_id),
                "p_explanation": body.explanation.strip(),
            },
        )
    )


@router.post("/inspect", response_model=list[Finding])
async def inspect(body: SourceFile, db: DB) -> list[Finding]:
    return inspect_source(body)


@router.get("/projects", response_model=list[Project])
async def projects(db: DB) -> list[Project]:
    return TypeAdapter(list[Project]).validate_python(
        await db.request(
            "GET",
            "synaptiq_projects",
            params={
                "select": "id,workspace_id,name,created_at",
                "order": "created_at.desc",
                "limit": "100",
            },
        )
    )


@router.post("/projects", response_model=Project, status_code=201)
async def create_project(body: CreateProject, db: DB) -> Project:
    return Project.model_validate(
        await db.rpc(
            "create_project",
            {
                "p_workspace": str(body.workspace_id),
                "p_name": body.name,
                "p_files": [f.model_dump(mode="json") for f in body.files],
            },
        )
    )


@router.get("/projects/{project_id}/files", response_model=list[ProjectFile])
async def project_files(project_id: UUID, db: DB) -> list[ProjectFile]:
    files: list[ProjectFile] = []
    while True:
        page = TypeAdapter(list[ProjectFile]).validate_python(
            await db.request(
                "GET",
                "synaptiq_files",
                params={
                    "project_id": f"eq.{project_id}",
                    "order": "path.asc",
                    "limit": "100",
                    "offset": str(len(files)),
                },
            )
        )
        files.extend(page)
        if len(page) < 100:
            return files


@router.patch("/files/{file_id}", response_model=ProjectFile)
async def update_file(file_id: UUID, body: UpdateFile, db: DB) -> ProjectFile:
    return ProjectFile.model_validate(
        await db.rpc(
            "save_file",
            {
                "p_file": str(file_id),
                "p_revision": body.revision,
                "p_source": body.source,
            },
        )
    )


@router.post("/uploads", response_model=UploadState, status_code=201)
async def begin_upload(body: BeginUpload, db: DB) -> UploadState:
    return UploadState.model_validate(
        await db.request(
            "POST",
            "rpc/synaptiq_upload",
            {
                "action": "begin",
                "data": body.model_dump(mode="json"),
            },
        )
    )


@router.put("/uploads/{upload_id}/parts", response_model=UploadState)
async def upload_part(upload_id: UUID, body: UploadPart, db: DB) -> UploadState:
    return UploadState.model_validate(
        await db.request(
            "POST",
            "rpc/synaptiq_upload",
            {
                "action": "append",
                "data": {"upload_id": str(upload_id), **body.model_dump(mode="json")},
            },
        )
    )


@router.post("/uploads/{upload_id}/finish", response_model=ProjectFile)
async def finish_upload(upload_id: UUID, body: FinishUpload, db: DB) -> ProjectFile:
    return ProjectFile.model_validate(
        await db.request(
            "POST",
            "rpc/synaptiq_upload",
            {
                "action": "finish",
                "data": {"upload_id": str(upload_id), "parts": body.parts},
            },
        )
    )


@router.delete("/uploads/{upload_id}", response_model=Success)
async def abort_upload(upload_id: UUID, db: DB) -> Success:
    await db.request(
        "POST",
        "rpc/synaptiq_upload",
        {
            "action": "abort",
            "data": {"upload_id": str(upload_id)},
        },
    )
    return Success()


@router.post("/files/{file_id}/inspect", response_model=list[Finding])
async def inspect_file(file_id: UUID, db: DB) -> list[Finding]:
    rows = TypeAdapter(list[ProjectFile]).validate_python(
        await db.request(
            "GET",
            "synaptiq_files",
            params={"id": f"eq.{file_id}"},
        )
    )
    if not rows:
        raise HTTPException(404, "File not found")
    return inspect_source(SourceFile(path=rows[0].path, source=rows[0].source))


@router.post("/projects/{project_id}/chat", response_model=ChatTurn, status_code=202)
async def project_chat(project_id: UUID, body: ChatRequest, db: DB) -> ChatTurn:
    if not get_settings().model_jobs_configured:
        raise HTTPException(503, "Connect a model before starting project chat")
    return ChatTurn.model_validate(
        await db.request(
            "POST",
            "rpc/synaptiq_chat",
            {
                "action": "enqueue",
                "data": {"project_id": str(project_id), **body.model_dump(mode="json")},
            },
        )
    )


@router.get("/projects/{project_id}/chat", response_model=list[ChatTurn])
async def project_chat_history(
    project_id: UUID, db: DB, offset: int = Query(0, ge=0)
) -> list[ChatTurn]:
    threads = TypeAdapter(list[ChatThread]).validate_python(
        await db.request(
            "GET", "synaptiq_chat_threads", params={"project_id": f"eq.{project_id}"}
        )
    )
    if not threads:
        return []
    return TypeAdapter(list[ChatTurn]).validate_python(
        await db.request(
            "GET",
            "synaptiq_chat_turns",
            params={
                "thread_id": f"eq.{threads[0].id}",
                "order": "created_at.desc,id.desc",
                "limit": "30",
                "offset": str(offset),
                "select": "id,thread_id,file_id,revision,prompt,auto_apply,status,response,error,applied_revision,reverted_revision,created_at,completed_at",
            },
        )
    )


@router.post("/chat/{turn_id}/{action}", response_model=ChatTurn)
async def change_chat(turn_id: UUID, action: str, db: DB) -> ChatTurn:
    if action not in {"apply", "undo", "cancel"}:
        raise HTTPException(404, "Unknown chat action")
    return ChatTurn.model_validate(
        await db.request(
            "POST",
            "rpc/synaptiq_chat",
            {
                "action": action,
                "data": {"turn_id": str(turn_id)},
            },
        )
    )


@router.get("/reflections/{run_id}", response_model=SavedReflection)
async def get_reflection(run_id: UUID, db: DB) -> SavedReflection:
    rows = TypeAdapter(list[SavedReflection]).validate_python(
        await db.request(
            "GET", "synaptiq_reflections", params={"run_id": f"eq.{run_id}"}
        )
    )
    if not rows:
        raise HTTPException(404, "Reflection not found")
    return rows[0]
