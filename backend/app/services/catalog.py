from functools import lru_cache
from pathlib import Path

from fastapi import HTTPException
from pydantic import TypeAdapter

from app.models.contracts import Challenge, PrivateChallenge


@lru_cache
def private_catalog() -> dict[str, PrivateChallenge]:
    path = Path(__file__).resolve().parent.parent / "data" / "challenges.json"
    rows = TypeAdapter(list[PrivateChallenge]).validate_json(path.read_bytes())
    return {row.id: row for row in rows}


def challenge_by_id(challenge_id: str) -> PrivateChallenge:
    result = private_catalog().get(challenge_id)
    if result is None:
        path = (
            Path(__file__).resolve().parent.parent / "data" / "legacy_challenges.json"
        )
        legacy = TypeAdapter(list[PrivateChallenge]).validate_json(path.read_bytes())
        result = next((row for row in legacy if row.id == challenge_id), None)
    if result is None:
        raise HTTPException(404, "Challenge not found")
    return result


def catalog() -> list[Challenge]:
    return [
        Challenge.model_validate(
            item.model_dump(exclude={"reference", "hints", "cases_repr"})
        )
        for item in private_catalog().values()
    ]
