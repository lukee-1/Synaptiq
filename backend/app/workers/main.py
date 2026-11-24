import asyncio
import hashlib
import logging
from contextlib import suppress
from typing import Literal
from uuid import UUID

import httpx
from pydantic import BaseModel, ConfigDict, JsonValue, TypeAdapter
from pydantic_settings import SettingsConfigDict

from app.core.settings import Settings
from app.models.contracts import TestResult
from app.services.catalog import challenge_by_id
from app.services.inference import inference_chunks, validate_analysis
from app.workers.learning import consume_learning

logger = logging.getLogger("synaptiq.worker")


class WorkRun(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: UUID
    operation: Literal["test", "submit", "explain"]
    source: str
    challenge_id: str


class Job(BaseModel):
    job_id: UUID
    lease_token: UUID
    run: WorkRun
    mode: str
    diagnosis: str
    hints: int


class Queue:
    def __init__(self, client: httpx.AsyncClient, token: str = ""):
        self.client = client
        self.token = token

    async def call(self, action: str, data: JsonValue) -> JsonValue:
        payload: dict[str, JsonValue] = {"action": action, "data": data}
        endpoint = "synaptiq_worker"
        if self.token:
            endpoint = "synaptiq_worker_token"
            payload["token"] = self.token
        response = await self.client.post(f"/rest/v1/rpc/{endpoint}", json=payload)
        response.raise_for_status()
        return TypeAdapter(JsonValue).validate_json(response.content)


async def process(job: Job, queue: Queue, settings: Settings) -> None:
    lease: dict[str, JsonValue] = {
        "job_id": str(job.job_id),
        "lease_token": str(job.lease_token),
    }

    async def heartbeat() -> None:
        while True:
            await asyncio.sleep(20)
            await queue.call("heartbeat", lease)

    async def work() -> None:
        if job.run.operation == "explain":
            text = ""
            buffered = ""
            async for fragment in inference_chunks(
                settings, job.run.source, job.diagnosis
            ):
                text += fragment
                buffered += fragment
                if len(buffered) >= 200:
                    await queue.call("event", {**lease, "payload": {"text": buffered}})
                    buffered = ""
            if buffered:
                await queue.call("event", {**lease, "payload": {"text": buffered}})
            analysis = validate_analysis(text, job.run.source)
            await queue.call(
                "complete", {**lease, "result": analysis.model_dump(mode="json")}
            )
        else:
            if (
                not settings.executor_url
                or not settings.executor_token.get_secret_value()
            ):
                raise RuntimeError("Isolated executor is not configured")
            challenge = challenge_by_id(job.run.challenge_id)
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    f"{settings.executor_url.rstrip('/')}/execute",
                    headers={
                        "Authorization": f"Bearer {settings.executor_token.get_secret_value()}"
                    },
                    json={
                        "code": job.run.source,
                        "reference": challenge.reference,
                        "cases_repr": challenge.cases_repr,
                    },
                )
                response.raise_for_status()
                result = TestResult.model_validate_json(response.content)
                expected_hash = hashlib.sha256(job.run.source.encode()).hexdigest()
                if result.source_hash != expected_hash:
                    raise RuntimeError(
                        "Executor returned a result for a different source revision"
                    )
                output = result.model_dump(mode="json")
                output["rating"] = round(
                    max(0, 5 * result.passed / result.total - 0.2 * job.hints), 2
                )
                await queue.call("complete", {**lease, "result": output})

    work_task = asyncio.create_task(work())
    heartbeat_task = asyncio.create_task(heartbeat())
    try:
        done, _ = await asyncio.wait(
            {work_task, heartbeat_task}, return_when=asyncio.FIRST_COMPLETED
        )
        for task in done:
            await task
    except (httpx.HTTPError, TimeoutError, RuntimeError, ValueError) as exc:
        # Never store provider response bodies or auth headers in user-visible errors.
        logger.warning("job failed id=%s kind=%s", job.job_id, type(exc).__name__)
        with suppress(httpx.HTTPError):
            await queue.call(
                "fail",
                {
                    **lease,
                    "error": f"{type(exc).__name__}: execution did not complete. Check worker configuration and logs.",
                },
            )
    finally:
        for task in (work_task, heartbeat_task):
            if not task.done():
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task


class WorkerSettings(Settings):
    model_config = SettingsConfigDict(
        env_file=(".env", ".runtime/worker.env"), extra="ignore"
    )


async def run_worker() -> None:
    settings = WorkerSettings()
    token = settings.worker_token.get_secret_value()
    key = (
        settings.supabase_publishable_key
        if token
        else settings.supabase_secret_key.get_secret_value()
    )
    if not key or not settings.supabase_url:
        raise RuntimeError("Worker requires SUPABASE_URL and SUPABASE_SECRET_KEY")
    async with httpx.AsyncClient(
        base_url=settings.supabase_url,
        headers={"apikey": key}
        if token
        else {"apikey": key, "Authorization": f"Bearer {key}"},
        timeout=15,
    ) as client:
        queue = Queue(client, token)

        async def consume(lane: str) -> None:
            while True:
                try:
                    raw = await queue.call("claim", {"lane": lane})
                    if raw is not None:
                        await process(Job.model_validate(raw), queue, settings)
                        continue
                except httpx.HTTPError as exc:
                    logger.warning("queue unavailable kind=%s", type(exc).__name__)
                await asyncio.sleep(settings.worker_poll_seconds)

        async def sweep() -> None:
            while True:
                try:
                    await queue.call("sweep", {})
                except httpx.HTTPError as exc:
                    logger.warning(
                        "deadline sweep unavailable kind=%s", type(exc).__name__
                    )
                await asyncio.sleep(settings.worker_poll_seconds)

        await asyncio.gather(
            consume("grading"),
            consume("explain"),
            sweep(),
            consume_learning("chat", queue, settings),
            consume_learning("reflection", queue, settings),
        )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_worker())
