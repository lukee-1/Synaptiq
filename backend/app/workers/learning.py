import asyncio
import logging
from contextlib import suppress
from typing import Protocol

import httpx
from pydantic import JsonValue

from app.core.settings import Settings
from app.services.assistant import (
    ChatContext,
    ReflectionContext,
    repair,
    review_reasoning,
)

logger = logging.getLogger("synaptiq.learning")


class LearningQueue(Protocol):
    async def call(self, action: str, data: JsonValue) -> JsonValue: ...


async def process_learning(
    kind: str, raw: JsonValue, queue: LearningQueue, settings: Settings
) -> None:
    context = (
        ChatContext.model_validate(raw)
        if kind == "chat"
        else ReflectionContext.model_validate(raw)
    )
    lease: dict[str, JsonValue] = {"lease_token": context.lease_token}
    if isinstance(context, ChatContext):
        lease["turn_id"] = context.turn_id
    else:
        lease.update(run_id=context.run_id, version=context.version)

    async def work() -> None:
        if isinstance(context, ChatContext):
            response, candidate = await repair(settings, context)
            await queue.call(
                "chat_complete", {**lease, "response": response, "candidate": candidate}
            )
        else:
            review = await review_reasoning(settings, context)
            await queue.call(
                "reflection_complete", {**lease, **review.model_dump(mode="json")}
            )

    async def heartbeat() -> None:
        while True:
            await asyncio.sleep(20)
            await queue.call(f"{kind}_heartbeat", lease)

    tasks = {asyncio.create_task(work()), asyncio.create_task(heartbeat())}
    try:
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            await task
    except (httpx.HTTPError, TimeoutError, RuntimeError, ValueError) as error:
        logger.warning(
            "learning job failed kind=%s error=%s", kind, type(error).__name__
        )
        with suppress(httpx.HTTPError):
            await queue.call(
                f"{kind}_fail",
                {
                    **lease,
                    "error": "The model could not complete a validated reply. Your source was preserved. Try a smaller, more specific request.",
                },
            )
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
            with suppress(
                asyncio.CancelledError, httpx.HTTPError, RuntimeError, ValueError
            ):
                await task


async def consume_learning(kind: str, queue: LearningQueue, settings: Settings) -> None:
    while True:
        try:
            raw = await queue.call(f"{kind}_claim", {})
            if raw is not None:
                await process_learning(kind, raw, queue, settings)
                continue
        except (httpx.HTTPError, ValueError) as error:
            logger.warning(
                "learning queue unavailable kind=%s error=%s",
                kind,
                type(error).__name__,
            )
        await asyncio.sleep(settings.worker_poll_seconds)
