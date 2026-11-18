"""tests/test_tools_metadata.py"""
import pytest

from allure_testops_custom.tools.metadata import build_metadata_tools


class _FakeRestClient:
    def __init__(self, pages_by_path: dict):
        self._pages_by_path = pages_by_path  # path -> list of page dicts, consumed in order

    async def get(self, path, params=None):
        return self._pages_by_path[path].pop(0)


@pytest.mark.asyncio
async def test_allure_list_projects():
    client = _FakeRestClient({"/project": [{"content": [{"id": 2, "name": "TB CBS"}], "totalPages": 1}]})
    tools = build_metadata_tools(client)
    result = await tools["allure_list_projects"]()
    assert result == {"projects": [{"id": 2, "name": "TB CBS"}], "total_pages": 1}


@pytest.mark.asyncio
async def test_allure_list_layers_paginates_all_pages():
    client = _FakeRestClient({
        "/testlayer": [
            {"content": [{"id": 1, "name": "API"}], "totalPages": 2},
            {"content": [{"id": 2, "name": "UI"}], "totalPages": 2},
        ]
    })
    tools = build_metadata_tools(client)
    result = await tools["allure_list_layers"](project_id=2)
    assert result == {"layers": [{"id": 1, "name": "API"}, {"id": 2, "name": "UI"}]}
