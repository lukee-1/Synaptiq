import json

import httpx
import pytest

from app.core.settings import Settings
from app.services import inference


@pytest.mark.asyncio
@pytest.mark.parametrize("runtime", ["openai", "unsloth"])
async def test_streaming_tutor_never_requests_tools(
    monkeypatch: pytest.MonkeyPatch, runtime: str
) -> None:
    async def handle(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        assert request.url.path == "/v1/chat/completions"
        assert body["tool_choice"] == "none"
        assert body["response_format"]["type"] == "json_schema"
        if runtime == "unsloth":
            assert body["enable_tools"] is False
            assert body["enabled_tools"] == []
            assert body["run_tools_locally"] is False
        else:
            assert "enable_tools" not in body
        event = json.dumps({"choices": [{"delta": {"content": "feedback"}}]})
        return httpx.Response(200, text=f"data: {event}\n\ndata: [DONE]\n\n")

    original_client = httpx.AsyncClient

    def client(**kwargs: object) -> httpx.AsyncClient:
        return original_client(transport=httpx.MockTransport(handle))

    monkeypatch.setattr(inference.httpx, "AsyncClient", client)
    settings = Settings(_env_file=None, model_name="fixture", model_runtime=runtime)
    chunks = [part async for part in inference.inference_chunks(settings, "x = 1", "")]
    assert chunks == ["feedback"]
