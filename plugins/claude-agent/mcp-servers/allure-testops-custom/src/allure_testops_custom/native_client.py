"""Thin HTTP JSON-RPC client for allure-testops-native's own MCP endpoint.

Confirmed live (2026-09-01, see docs/architecture/2026-09-01-allure-testops-custom-design.md
Section 2): a plain HTTP POST with a JSON-RPC 2.0 body works against this endpoint with no
session state and no Claude-Code-specific machinery - initialize does not create a session that
must be reused, so each call_tool() is fully self-contained.

The exact shape of tools/call's result envelope (content blocks vs. structuredContent) was NOT
independently re-confirmed byte-for-byte during this file's own design - _unwrap_result() below
is deliberately defensive (tries the documented MCP content-block shape first, falls back to a
raw structured result) and this file's own test/verification step (Step 3) calls it live against
the real endpoint to confirm or correct this.
"""

from __future__ import annotations

import itertools
import json
import os

import httpx

_id_counter = itertools.count(1)


class NativeClientError(RuntimeError):
    """Raised when allure-testops-native returns a JSON-RPC error or an unparseable response."""


def _unwrap_result(body: dict, tool_name: str) -> dict:
    if "error" in body:
        raise NativeClientError(f"{tool_name} failed: {body['error']}")
    result = body.get("result")
    if result is None:
        raise NativeClientError(f"{tool_name} returned no result: {body}")
    # Documented MCP shape: result.content is a list of content blocks; a text block's `text`
    # is the tool's actual JSON-stringified return value.
    content = result.get("content")
    if content:
        first = content[0]
        if first.get("type") == "text":
            try:
                return json.loads(first["text"])
            except json.JSONDecodeError:
                return {"text": first["text"]}
    # Fallback: some servers put structured data directly under result.structuredContent or
    # return it as `result` itself.
    if "structuredContent" in result:
        return result["structuredContent"]
    if isinstance(result, dict) and "content" not in result:
        return result
    raise NativeClientError(f"{tool_name} returned an unrecognized result shape: {result}")


class NativeClient:
    def __init__(self, base_url: str | None = None, token: str | None = None) -> None:
        raw_base = base_url or os.environ["ALLURE_URL"]
        self.base_url = raw_base.rstrip("/") + "/api/mcp"
        self.token = token or os.environ["ALLURE_TOKEN"]

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"api-token {self.token}",
            "Content-Type": "application/json",
        }

    async def call_tool(self, name: str, arguments: dict) -> dict:
        payload = {
            "jsonrpc": "2.0",
            "id": next(_id_counter),
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments},
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(self.base_url, json=payload, headers=self._headers())
        response.raise_for_status()
        return _unwrap_result(response.json(), name)
