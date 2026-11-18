"""Test-case tool handlers: allure_search_test_cases, allure_get_test_case,
allure_list_field_values, allure_refresh_index. Thin wrappers around ProjectIndex - see index.py.
"""

from __future__ import annotations

from allure_testops_custom.index import ProjectIndex


def build_test_case_tools(index: ProjectIndex) -> dict:
    """Returns a name -> async handler mapping; server.py registers each with @mcp.tool()."""

    async def allure_search_test_cases(
        project_id: int,
        feature: str | None = None,
        component: str | None = None,
        story: str | None = None,
        suite: str | None = None,
        tag: str | None = None,
        status: str | None = None,
        automated: bool | None = None,
    ) -> dict:
        """Search test cases by any combination of Feature/Component/Story/Suite/tag/status/
        automated - filters the in-memory project index, no per-query Allure round-trip after
        the first call for this project_id in this session."""
        matches = await index.search(
            project_id,
            feature=feature,
            component=component,
            story=story,
            suite=suite,
            tag=tag,
            status=status,
            automated=automated,
        )
        return {"count": len(matches), "test_cases": matches}

    async def allure_get_test_case(project_id: int, test_case_id: int) -> dict:
        """Fetch one test case's full detail (description, precondition, scenario/steps,
        customFields) - always a live on-demand fetch, never served from the lightweight index."""
        return await index.get_full_case(project_id, test_case_id)

    async def allure_list_field_values(project_id: int, field: str) -> dict:
        """List the distinct values currently used for one custom field (Feature/Component/
        Story/Suite) in a project - use before creating a new value, to catch near-duplicates
        (see rules/allure.md Section 7 item 4)."""
        values = await index.list_field_values(project_id, field)
        return {"field": field, "values": values}

    async def allure_refresh_index(project_id: int) -> dict:
        """Force a fresh rebuild of the lightweight index for one project - use if you know
        cases changed mid-session and need up-to-date search results."""
        await index.refresh(project_id)
        return {"project_id": project_id, "status": "refreshed"}

    return {
        "allure_search_test_cases": allure_search_test_cases,
        "allure_get_test_case": allure_get_test_case,
        "allure_list_field_values": allure_list_field_values,
        "allure_refresh_index": allure_refresh_index,
    }
