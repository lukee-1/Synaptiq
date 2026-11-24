from collections.abc import AsyncIterator
from typing import Annotated

import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import JsonValue, TypeAdapter

from app.core.settings import Settings, get_settings

bearer = HTTPBearer(auto_error=False)
json_adapter = TypeAdapter(JsonValue)


class Database:
    def __init__(self, client: httpx.AsyncClient):
        self.client = client

    async def request(
        self,
        method: str,
        path: str,
        payload: JsonValue = None,
        params: dict[str, str] | None = None,
    ) -> JsonValue:
        try:
            response = await self.client.request(
                method, f"/rest/v1/{path}", json=payload, params=params
            )
        except httpx.HTTPError as exc:
            raise HTTPException(503, "Database is temporarily unavailable") from exc
        if response.is_error:
            value = json_adapter.validate_json(response.content)
            code = value.get("code") if isinstance(value, dict) else ""
            message = (
                value.get("message", "Database request failed")
                if isinstance(value, dict)
                else "Database request failed"
            )
            status = (
                409
                if code in {"40001", "23505", "P0001"}
                else 403
                if response.status_code in {401, 403}
                else 400
            )
            raise HTTPException(status, str(message)[:300])
        return (
            json_adapter.validate_json(response.content) if response.content else None
        )

    async def rpc(self, name: str, payload: JsonValue = None) -> JsonValue:
        return await self.request(
            "POST", "rpc/synaptiq_action", {"action": name, "data": payload or {}}
        )


async def database(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AsyncIterator[Database]:
    if not credentials:
        raise HTTPException(
            401, "Sign in to continue", headers={"WWW-Authenticate": "Bearer"}
        )
    if not settings.supabase_url or not settings.supabase_publishable_key:
        raise HTTPException(503, "Authentication has not been configured")
    async with httpx.AsyncClient(
        base_url=settings.supabase_url,
        timeout=15,
        headers={
            "apikey": settings.supabase_publishable_key,
            "Authorization": f"Bearer {credentials.credentials}",
            "Prefer": "return=representation",
        },
    ) as client:
        try:
            verified = await client.get("/auth/v1/user")
        except httpx.HTTPError as exc:
            raise HTTPException(503, "Authentication service is unavailable") from exc
        if verified.status_code in {401, 403}:
            raise HTTPException(401, "Session expired; sign in again")
        if verified.is_error:
            raise HTTPException(503, "Authentication service is unavailable")
        yield Database(client)


DB = Annotated[Database, Depends(database)]
