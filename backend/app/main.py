import logging
import time
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import RequestResponseEndpoint
from starlette.responses import JSONResponse, Response

from app.api.routes import router
from app.core.settings import get_settings
from app.models.contracts import Health

settings = get_settings()
app = FastAPI(
    title="Synaptiq API",
    version="1.0.0",
    docs_url=None if settings.app_env == "production" else "/docs",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["X-Request-ID"],
)
app.include_router(router)
logger = logging.getLogger("synaptiq")


@app.middleware("http")
async def request_metadata(
    request: Request, call_next: RequestResponseEndpoint
) -> Response:
    request_id = str(uuid4())
    start = time.monotonic()
    size = request.headers.get("content-length")
    if size and (not size.isdigit() or int(size) > 1_200_000):
        return JSONResponse({"detail": "Request exceeds 1.2 MB"}, status_code=413)
    if request.method in {"POST", "PATCH", "PUT"}:
        # Bound actual bytes, including requests with no Content-Length.
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 1_200_000:
                return JSONResponse(
                    {"detail": "Request exceeds 1.2 MB"}, status_code=413
                )
        request._body = bytes(body)
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    logger.info(
        "request id=%s method=%s status=%s duration_ms=%.1f",
        request_id,
        request.method,
        response.status_code,
        (time.monotonic() - start) * 1000,
    )
    return response


@app.get("/health", response_model=Health)
async def health() -> Health:
    return Health(
        status="ok",
        database_configured=bool(
            settings.supabase_url and settings.supabase_publishable_key
        ),
        model_configured=settings.model_jobs_configured,
        executor_configured=settings.execution_jobs_configured,
    )
