"""Direct Allure TestOps REST client, used only for launch/results/statistics/metadata
capabilities that allure-testops-native's own MCP tools don't cover (testops_find_testresults is
result-level only, per rules/allure.md Section 3). Endpoint paths are documented per-call in
tools/launches.py and tools/metadata.py, sourced from the retired third-party package
(mshegolev/allure-testops-mcp) - see docs/architecture/2026-09-01-allure-testops-custom-design.md
Section 3.3/D5.
"""

from __future__ import annotations

import os

import httpx


class RestClientError(RuntimeError):
    """Raised when the Allure REST API returns a non-2xx response."""


class RestClient:
    def __init__(self, base_url: str | None = None, token: str | None = None) -> None:
        raw_base = base_url or os.environ["ALLURE_URL"]
        self.base_url = raw_base.rstrip("/") + "/api/rs"
        self.token = token or os.environ["ALLURE_TOKEN"]

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"api-token {self.token}"}

    async def get(self, path: str, params: dict | None = None) -> dict:
        url = self.base_url + path
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, params=params, headers=self._headers())
        if response.status_code >= 400:
            raise RestClientError(
                f"GET {path} failed: {response.status_code} {response.text[:300]}"
            )
        return response.json()
