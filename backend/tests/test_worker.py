from collections.abc import AsyncIterator
from uuid import uuid4

import pytest
from pydantic import JsonValue

from app.core.settings import Settings
from app.workers import main as worker


class FakeQueue(worker.Queue):
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def call(self, action: str, data: JsonValue) -> JsonValue:
        self.calls.append(action)
        return {"ok": True}


def make_job() -> worker.Job:
    return worker.Job(
        job_id=uuid4(),
        lease_token=uuid4(),
        run=worker.WorkRun(
            id=uuid4(),
            operation="explain",
            source="return 1",
            challenge_id="INT-01-1-1",
        ),
        mode="practice",
        diagnosis="Check the boundary condition",
        hints=0,
    )


@pytest.mark.asyncio
async def test_provider_failure_does_not_kill_worker(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def broken(*args: object) -> AsyncIterator[str]:
        yield '{"partial":'
        raise RuntimeError("provider failed with sensitive body")

    monkeypatch.setattr(worker, "inference_chunks", broken)
    queue = FakeQueue()
    await worker.process(make_job(), queue, Settings(_env_file=None))
    assert queue.calls == ["fail"]


@pytest.mark.asyncio
async def test_only_validated_feedback_can_complete(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def invalid(*args: object) -> AsyncIterator[str]:
        yield '{"summary":"Answer","findings":[],"explanation":"repair","suggested_code":"return 42"}'

    monkeypatch.setattr(worker, "inference_chunks", invalid)
    queue = FakeQueue()
    await worker.process(make_job(), queue, Settings(_env_file=None))
    assert "complete" not in queue.calls
    assert queue.calls[-1] == "fail"
