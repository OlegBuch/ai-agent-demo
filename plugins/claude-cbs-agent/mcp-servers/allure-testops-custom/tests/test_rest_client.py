"""tests/test_rest_client.py"""
import httpx
import pytest

from allure_testops_custom.rest_client import RestClient, RestClientError


@pytest.mark.asyncio
async def test_get_returns_parsed_json(monkeypatch):
    async def fake_get(self, url, params=None, headers=None):
        request = httpx.Request("GET", url, params=params)
        return httpx.Response(200, json={"content": [{"id": 1, "name": "Regression"}]}, request=request)

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
    client = RestClient(base_url="http://fake", token="fake-token")
    result = await client.get("/project/2/category", params={"page": 0, "size": 100})
    assert result == {"content": [{"id": 1, "name": "Regression"}]}


@pytest.mark.asyncio
async def test_get_raises_on_error_status(monkeypatch):
    async def fake_get(self, url, params=None, headers=None):
        request = httpx.Request("GET", url, params=params)
        return httpx.Response(404, text="not found", request=request)

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
    client = RestClient(base_url="http://fake", token="fake-token")
    with pytest.raises(RestClientError, match="404"):
        await client.get("/launch", params={"projectId": 999})
