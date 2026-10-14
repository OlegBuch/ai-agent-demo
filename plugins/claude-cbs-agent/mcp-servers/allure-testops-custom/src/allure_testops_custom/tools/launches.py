"""Launch/results/statistics tool handlers - all REST-backed (allure-testops-native's MCP tools
don't cover launch-level data, see rules/allure.md Section 3). Endpoint paths per this plan's
Task 4 reference table.
"""

from __future__ import annotations

from allure_testops_custom.rest_client import RestClient


def build_launch_tools(client: RestClient) -> dict:
    async def allure_list_launches(project_id: int, page: int = 0, size: int = 20) -> dict:
        """List recent launches for a project, newest first."""
        result = await client.get(
            "/launch",
            params={"projectId": project_id, "page": page, "size": size, "sort": "createdDate,desc"},
        )
        return {"launches": result.get("content", []), "total_pages": result.get("totalPages", 0)}

    async def allure_get_test_results(
        launch_id: int, status: str | None = None, page: int = 0, size: int = 50
    ) -> dict:
        """Get test results within one launch, optionally filtered by status
        (PASSED/FAILED/BROKEN/SKIPPED)."""
        params: dict = {"launchId": launch_id, "page": page, "size": size}
        if status is not None:
            params["status"] = status
        result = await client.get("/testresult", params=params)
        return {"results": result.get("content", []), "total_pages": result.get("totalPages", 0)}

    async def allure_search_failed_tests(project_id: int, size: int = 50) -> dict:
        """Find failed/broken tests in the most recent launch for a project."""
        latest = await client.get(
            "/launch",
            params={"projectId": project_id, "page": 0, "size": 1, "sort": "createdDate,desc"},
        )
        launches = latest.get("content", [])
        if not launches:
            return {"launch_id": None, "failed": [], "broken": []}
        launch_id = launches[0]["id"]
        failed = await client.get(
            "/testresult", params={"launchId": launch_id, "status": "FAILED", "page": 0, "size": size}
        )
        broken = await client.get(
            "/testresult", params={"launchId": launch_id, "status": "BROKEN", "page": 0, "size": size}
        )
        return {
            "launch_id": launch_id,
            "failed": failed.get("content", []),
            "broken": broken.get("content", []),
        }

    async def allure_get_project_statistics(project_id: int) -> dict:
        """Automation rate and test-count summary for a project, plus the last closed launch's
        pass/fail breakdown."""
        total = await client.get("/testcase", params={"projectId": project_id, "page": 0, "size": 1})
        automated = await client.get(
            "/testcase", params={"projectId": project_id, "page": 0, "size": 1, "automated": "true"}
        )
        launches = await client.get(
            "/launch",
            params={"projectId": project_id, "page": 0, "size": 20, "sort": "createdDate,desc"},
        )
        last_closed = next((l for l in launches.get("content", []) if l.get("closed")), None)
        breakdown: list = []
        if last_closed is not None:
            stat = await client.get(f"/launch/{last_closed['id']}/statistic")
            breakdown = stat if isinstance(stat, list) else stat.get("content", [])
        return {
            "total_test_cases": total.get("totalElements", 0),
            "automated_test_cases": automated.get("totalElements", 0),
            "last_closed_launch_id": last_closed["id"] if last_closed else None,
            "last_closed_launch_breakdown": breakdown,
        }

    return {
        "allure_list_launches": allure_list_launches,
        "allure_get_test_results": allure_get_test_results,
        "allure_search_failed_tests": allure_search_failed_tests,
        "allure_get_project_statistics": allure_get_project_statistics,
    }
