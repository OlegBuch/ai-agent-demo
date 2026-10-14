"""tests/test_native_client.py"""
import json

import httpx
import pytest

from allure_testops_custom.native_client import NativeClient, NativeClientError


@pytest.mark.asyncio
async def test_call_tool_unwraps_text_content(monkeypatch):
    async def fake_post(self, url, json=None, headers=None):
        body = {
            "jsonrpc": "2.0",
            "id": json["id"],
            "result": {"content": [{"type": "text", "text": '{"id": 3426, "name": "Example"}'}]},
        }
        request = httpx.Request("POST", url)
        return httpx.Response(200, json=body, request=request)

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    client = NativeClient(base_url="http://fake", token="fake-token")
    result = await client.call_tool("testops_find_testcases", {"projectId": 2})
    assert result == {"id": 3426, "name": "Example"}


@pytest.mark.asyncio
async def test_call_tool_raises_on_jsonrpc_error(monkeypatch):
    async def fake_post(self, url, json=None, headers=None):
        body = {"jsonrpc": "2.0", "id": json["id"], "error": {"code": -32000, "message": "boom"}}
        request = httpx.Request("POST", url)
        return httpx.Response(200, json=body, request=request)

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    client = NativeClient(base_url="http://fake", token="fake-token")
    with pytest.raises(NativeClientError, match="boom"):
        await client.call_tool("testops_find_testcases", {"projectId": 2})
