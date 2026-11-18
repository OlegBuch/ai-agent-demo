"""tests/test_tools_test_cases.py"""
import pytest

from allure_testops_custom.index import ProjectIndex
from allure_testops_custom.tools.test_cases import build_test_case_tools


class _FakeNativeClient:
    def __init__(self, pages):
        self._pages = pages

    async def call_tool(self, name, arguments):
        page = arguments.get("page", 0)
        return self._pages[page]


@pytest.mark.asyncio
async def test_allure_search_test_cases_returns_count_and_matches():
    case = {"id": 1, "name": "X", "status": "Draft", "layer": "API", "automated": False,
            "tags": [], "customFields": [{"name": "System Core", "customField": "Feature"}]}
    client = _FakeNativeClient([{"content": [case], "last": True}])
    tools = build_test_case_tools(ProjectIndex(client))
    result = await tools["allure_search_test_cases"](project_id=2, feature="System Core")
    assert result == {"count": 1, "test_cases": [case]}


@pytest.mark.asyncio
async def test_allure_refresh_index_returns_status():
    client = _FakeNativeClient([{"content": [], "last": True}])
    tools = build_test_case_tools(ProjectIndex(client))
    result = await tools["allure_refresh_index"](project_id=2)
    assert result == {"project_id": 2, "status": "refreshed"}
