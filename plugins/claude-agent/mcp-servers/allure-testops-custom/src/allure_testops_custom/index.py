"""Two-tier in-memory cache for test-case group search.

Tier 1 (lightweight index): one paginated sweep per project of testops_find_testcases with
expand=["tags","custom_fields"] (no "scenario" - the heavy field). Built lazily on first use,
kept for the lifetime of this server process (one process per Claude Code session - see
docs/architecture/2026-09-01-allure-testops-custom-design.md Decision D4). For ~3000 cases this
is a few MB of process memory, never re-fetched within a session unless refresh() is called.

Tier 2 (on-demand full detail): get_full_case() fetches one case's full scenario/description via
a targeted aql="id = <id>" call - only for cases actually requested, never for the whole project.

customFields on a read response is [{"name": "<value>", "customField": "<field name>"}] - the
INVERSE key convention from rules/allure.md Section 4's documented *write* shape - confirmed live
2026-09-01, see the design doc Section 2. Every filter below reads customField/name in that order.
"""

from __future__ import annotations

from allure_testops_custom.native_client import NativeClient

_PAGE_SIZE = 200


class ProjectIndex:
    def __init__(self, client: NativeClient) -> None:
        self._client = client
        self._cache: dict[int, list[dict]] = {}

    async def _ensure_built(self, project_id: int) -> list[dict]:
        if project_id not in self._cache:
            await self.refresh(project_id)
        return self._cache[project_id]

    async def refresh(self, project_id: int) -> None:
        cases: list[dict] = []
        page = 0
        while True:
            result = await self._client.call_tool(
                "testops_find_testcases",
                {
                    "projectId": project_id,
                    "expand": ["tags", "custom_fields"],
                    "page": page,
                    "size": _PAGE_SIZE,
                },
            )
            content = result.get("content", [])
            cases.extend(
                {
                    "id": c["id"],
                    "name": c.get("name"),
                    "status": c.get("status"),
                    "layer": c.get("layer"),
                    "automated": c.get("automated"),
                    "tags": c.get("tags", []),
                    "customFields": c.get("customFields", []),
                }
                for c in content
            )
            if result.get("last", True) or not content:
                break
            page += 1
        self._cache[project_id] = cases

    @staticmethod
    def _field_value(case: dict, field: str) -> str | None:
        for cf in case.get("customFields", []):
            if cf.get("customField") == field:
                return cf.get("name")
        return None

    async def search(
        self,
        project_id: int,
        feature: str | None = None,
        component: str | None = None,
        story: str | None = None,
        suite: str | None = None,
        tag: str | None = None,
        status: str | None = None,
        automated: bool | None = None,
    ) -> list[dict]:
        cases = await self._ensure_built(project_id)

        def matches(case: dict) -> bool:
            for field, wanted in (
                ("Feature", feature),
                ("Component", component),
                ("Story", story),
                ("Suite", suite),
            ):
                if wanted is None:
                    continue
                actual = self._field_value(case, field)
                if not actual or actual.strip().lower() != wanted.strip().lower():
                    return False
            if tag is not None:
                tags_lower = {t.lower() for t in case.get("tags", [])}
                if tag.strip().lower() not in tags_lower:
                    return False
            if status is not None and case.get("status") != status:
                return False
            if automated is not None and case.get("automated") != automated:
                return False
            return True

        return [c for c in cases if matches(c)]

    async def list_field_values(self, project_id: int, field: str) -> list[str]:
        cases = await self._ensure_built(project_id)
        values = {v for c in cases if (v := self._field_value(c, field)) is not None}
        return sorted(values)

    async def get_full_case(self, project_id: int, test_case_id: int) -> dict:
        result = await self._client.call_tool(
            "testops_find_testcases",
            {
                "projectId": project_id,
                "aql": f"id = {test_case_id}",
                "expand": ["scenario", "tags", "custom_fields", "status", "layer"],
            },
        )
        content = result.get("content", [])
        if not content:
            raise LookupError(f"test case {test_case_id} not found in project {project_id}")
        return content[0]
