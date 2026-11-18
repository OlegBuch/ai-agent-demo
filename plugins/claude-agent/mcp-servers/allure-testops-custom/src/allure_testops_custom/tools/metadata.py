"""Project/metadata tool handlers - all REST-backed. Endpoint paths per this plan's Task 4
reference table. list_layers/list_statuses paginate through every page since the third-party
package's own reference implementation did (small result sets, size=100 per page)."""

from __future__ import annotations

from allure_testops_custom.rest_client import RestClient


async def _fetch_all_pages(client: RestClient, path: str, params: dict) -> list:
    items: list = []
    page = 0
    while True:
        result = await client.get(path, params={**params, "page": page})
        content = result.get("content", [])
        items.extend(content)
        if page + 1 >= result.get("totalPages", 1) or not content:
            break
        page += 1
    return items


def build_metadata_tools(client: RestClient) -> dict:
    async def allure_list_projects(page: int = 0, size: int = 50) -> dict:
        """List all Allure TestOps projects."""
        result = await client.get("/project", params={"page": page, "size": size})
        return {"projects": result.get("content", []), "total_pages": result.get("totalPages", 0)}

    async def allure_list_categories(project_id: int, page: int = 0, size: int = 50) -> dict:
        """List defect categories configured for a project."""
        result = await client.get(f"/project/{project_id}/category", params={"page": page, "size": size})
        return {"categories": result.get("content", []), "total_pages": result.get("totalPages", 0)}

    async def allure_list_category_matchers(project_id: int, page: int = 0, size: int = 50) -> dict:
        """List category matchers (regex rules that auto-assign failures to a category)."""
        result = await client.get(
            f"/project/{project_id}/categorymatcher", params={"page": page, "size": size}
        )
        return {"matchers": result.get("content", []), "total_pages": result.get("totalPages", 0)}

    async def allure_list_layers(project_id: int) -> dict:
        """List all test layers (e.g. API/UI/Unit) defined for a project."""
        layers = await _fetch_all_pages(client, "/testlayer", {"projectId": project_id, "size": 100})
        return {"layers": layers}

    async def allure_list_statuses(project_id: int) -> dict:
        """List all workflow statuses (e.g. Draft/Review/Active) defined for a project."""
        statuses = await _fetch_all_pages(client, "/status", {"projectId": project_id, "size": 100})
        return {"statuses": statuses}

    return {
        "allure_list_projects": allure_list_projects,
        "allure_list_categories": allure_list_categories,
        "allure_list_category_matchers": allure_list_category_matchers,
        "allure_list_layers": allure_list_layers,
        "allure_list_statuses": allure_list_statuses,
    }
