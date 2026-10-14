"""tests/test_tools_launches.py"""
import pytest

from allure_testops_custom.tools.launches import build_launch_tools


class _FakeRestClient:
    def __init__(self, responses: dict):
        self._responses = responses  # path -> response dict (or list of dicts, popped in order)
        self.calls: list[tuple[str, dict]] = []

    async def get(self, path, params=None):
        self.calls.append((path, params or {}))
        entry = self._responses[path]
        return entry.pop(0) if isinstance(entry, list) else entry


@pytest.mark.asyncio
async def test_allure_list_launches():
    client = _FakeRestClient({"/launch": {"content": [{"id": 1, "name": "L1"}], "totalPages": 1}})
    tools = build_launch_tools(client)
    result = await tools["allure_list_launches"](project_id=2)
    assert result == {"launches": [{"id": 1, "name": "L1"}], "total_pages": 1}


@pytest.mark.asyncio
async def test_allure_search_failed_tests_no_launches():
    client = _FakeRestClient({"/launch": {"content": []}})
    tools = build_launch_tools(client)
    result = await tools["allure_search_failed_tests"](project_id=2)
    assert result == {"launch_id": None, "failed": [], "broken": []}


@pytest.mark.asyncio
async def test_allure_search_failed_tests_with_launch():
    client = _FakeRestClient({
        "/launch": {"content": [{"id": 42}]},
        "/testresult": [
            {"content": [{"id": 1, "status": "FAILED"}]},
            {"content": [{"id": 2, "status": "BROKEN"}]},
        ],
    })
    tools = build_launch_tools(client)
    result = await tools["allure_search_failed_tests"](project_id=2)
    assert result["launch_id"] == 42
    assert result["failed"] == [{"id": 1, "status": "FAILED"}]
    assert result["broken"] == [{"id": 2, "status": "BROKEN"}]


@pytest.mark.asyncio
async def test_allure_get_project_statistics():
    client = _FakeRestClient({
        "/testcase": [{"totalElements": 100}, {"totalElements": 40}],
        "/launch": {"content": [{"id": 7, "closed": True}]},
        "/launch/7/statistic": [[{"status": "passed", "count": 30}, {"status": "failed", "count": 10}]],
    })
    tools = build_launch_tools(client)
    result = await tools["allure_get_project_statistics"](project_id=2)
    assert result["total_test_cases"] == 100
    assert result["automated_test_cases"] == 40
    assert result["last_closed_launch_id"] == 7
    assert result["last_closed_launch_breakdown"] == [
        {"status": "passed", "count": 30}, {"status": "failed", "count": 10}
    ]
