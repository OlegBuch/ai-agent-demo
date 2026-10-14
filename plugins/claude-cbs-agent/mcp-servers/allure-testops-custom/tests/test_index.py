"""tests/test_index.py"""
import pytest

from allure_testops_custom.index import ProjectIndex


class _FakeNativeClient:
    def __init__(self, pages: list[dict]):
        self._pages = pages
        self.calls: list[dict] = []

    async def call_tool(self, name, arguments):
        self.calls.append(arguments)
        page = arguments.get("page", 0)
        return self._pages[page]


_CASE_1 = {
    "id": 1, "name": "Case A", "status": "Draft", "layer": "API", "automated": False,
    "tags": ["Regression", "API"],
    "customFields": [{"name": "System Core", "customField": "Feature"},
                      {"name": "Idempotency", "customField": "Component"}],
}
_CASE_2 = {
    "id": 2, "name": "Case B", "status": "Active", "layer": "UI", "automated": True,
    "tags": ["Smoke"],
    "customFields": [{"name": "Accounts", "customField": "Feature"},
                      {"name": "Login", "customField": "Component"}],
}


@pytest.mark.asyncio
async def test_search_filters_by_feature():
    client = _FakeNativeClient([{"content": [_CASE_1, _CASE_2], "last": True}])
    index = ProjectIndex(client)
    results = await index.search(2, feature="system core")  # case-insensitive
    assert [c["id"] for c in results] == [1]


@pytest.mark.asyncio
async def test_search_filters_by_tag_and_automated():
    client = _FakeNativeClient([{"content": [_CASE_1, _CASE_2], "last": True}])
    index = ProjectIndex(client)
    results = await index.search(2, tag="Smoke", automated=True)
    assert [c["id"] for c in results] == [2]


@pytest.mark.asyncio
async def test_index_builds_once_per_project():
    client = _FakeNativeClient([{"content": [_CASE_1], "last": True}])
    index = ProjectIndex(client)
    await index.search(2, feature="System Core")
    await index.search(2, feature="System Core")
    assert len(client.calls) == 1  # second search reused the cached index


@pytest.mark.asyncio
async def test_refresh_rebuilds():
    client = _FakeNativeClient([{"content": [_CASE_1], "last": True}])
    index = ProjectIndex(client)
    await index.search(2, feature="System Core")
    await index.refresh(2)
    assert len(client.calls) == 2


@pytest.mark.asyncio
async def test_list_field_values_distinct_sorted():
    client = _FakeNativeClient([{"content": [_CASE_1, _CASE_2], "last": True}])
    index = ProjectIndex(client)
    values = await index.list_field_values(2, "Feature")
    assert values == ["Accounts", "System Core"]


@pytest.mark.asyncio
async def test_get_full_case_not_found_raises():
    client = _FakeNativeClient([{"content": []}])
    index = ProjectIndex(client)
    with pytest.raises(LookupError):
        await index.get_full_case(2, 9999)
