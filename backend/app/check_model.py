"""Discover model IDs and optionally verify the real streaming adapter."""

import argparse
import asyncio
import sys

import httpx
from pydantic import BaseModel, ConfigDict, ValidationError

from app.core.settings import Settings
from app.services.inference import inference_chunks, validate_analysis


class Model(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str


class Models(BaseModel):
    model_config = ConfigDict(extra="ignore")
    data: list[Model]


async def check(smoke: bool) -> int:
    settings = Settings()
    key = settings.model_api_key.get_secret_value()
    headers = {"Authorization": f"Bearer {key}"} if key else {}
    try:
        async with httpx.AsyncClient(timeout=10, headers=headers) as client:
            response = await client.get(settings.model_base_url.rstrip("/") + "/models")
        if response.status_code in {401, 403}:
            print(
                "Server reached; authentication is required. Put its API key in MODEL_API_KEY in backend/.env (never in chat)."
            )
            return 1
        response.raise_for_status()
        models = Models.model_validate_json(response.content)
        if not models.data:
            print(
                "Server reached; no models are available. Download and load a model in Unsloth's Model hub first."
            )
            return 1
        print("Available model IDs:")
        for model in models.data:
            print(f"  {model.id}")
        if not smoke:
            print(
                "Set MODEL_NAME to an ID above, then run: python -m app.check_model --smoke"
            )
            return 0
        if settings.model_name not in {model.id for model in models.data}:
            print("MODEL_NAME does not match an available ID; update backend/.env.")
            return 1
        source = "def first(items):\n    return items[1]\n"
        text = "".join(
            [
                chunk
                async for chunk in inference_chunks(
                    settings, source, "The function should return the first item."
                )
            ]
        )
        validate_analysis(text, source)
        print(
            "PASS: real streaming response matched the feedback schema and tutor constraints. This does not validate model quality or the database queue."
        )
        return 0
    except httpx.HTTPStatusError as error:
        print(
            f"Model server returned HTTP {error.response.status_code}; check its API/runtime settings."
        )
    except (httpx.RequestError, TimeoutError):
        print(
            "Could not reach the model server in time. Start Unsloth and confirm MODEL_BASE_URL and its port."
        )
    except (ValidationError, ValueError, RuntimeError):
        print(
            "The server response did not satisfy Synaptiq's model contract. Check structured-output support and the model server logs."
        )
    return 1


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--smoke",
        action="store_true",
        help="Send a small synthetic debugging prompt and validate the streaming response.",
    )
    args = parser.parse_args()
    sys.exit(asyncio.run(check(args.smoke)))


if __name__ == "__main__":
    main()
