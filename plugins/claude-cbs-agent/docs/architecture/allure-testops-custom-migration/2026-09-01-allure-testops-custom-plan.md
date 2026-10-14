# `allure-testops-custom` MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-owned Python MCP server (`allure-testops-custom`) that replaces the
third-party `allure-testops` (`mshegolev/allure-testops-mcp`) with full feature parity plus the
missing Feature/Component/Story/tag group-search capability, then retire the third-party server
entirely.

**Architecture:** A `uv`-managed Python package under
`plugins/claude-proj-agent/mcp-servers/allure-testops-custom/`. Test-case tools proxy
`allure-testops-native`'s own MCP endpoint over raw HTTP JSON-RPC (`native_client.py`); launch/
results/statistics/metadata tools call Allure's REST API directly (`rest_client.py`, endpoints
confirmed from the retired third-party package's own source, see §2 of the design doc). A
two-tier in-memory cache (`index.py`) makes group search fast without re-scanning the whole
project per query. 13 tools total, registered via the official `mcp` Python SDK's `MCPServer`
decorator API.

**Tech Stack:** Python ≥3.10, `mcp` (official Python MCP SDK), `httpx` (async HTTP), `uv` (package/
dependency management, already a prerequisite per `docs/ci-cd-secrets.md`), `pytest`+
`pytest-asyncio` for tests.

**Spec:** `plugins/claude-proj-agent/docs/architecture/2026-09-01-allure-testops-custom-design.md`
— read it alongside this plan; this plan does not restate the "why," only the "how."

## Global Constraints

- Package root: `plugins/claude-proj-agent/mcp-servers/allure-testops-custom/`. Python package
  name: `allure_testops_custom` under `src/`.
- Auth/config: `ALLURE_URL` (`http://allure.proj.local:8090`, no trailing `/api/...` — each client
  appends its own path) and `ALLURE_TOKEN`, read from environment variables exactly like the two
  existing `.mcp.json` entries — no new secret, no new config file.
- **Never print, log, or include the raw `ALLURE_TOKEN` value in any file, test output, commit
  message, or subagent report** — a real security lapse already happened once this session
  (a gather subagent printed it) and must not repeat. Every dispatch in this plan carries this
  instruction explicitly.
- Auth header format: `Authorization: api-token <token>` (lowercase `api-token`, matching
  `.mcp.json`'s existing, already-proven-working `allure-testops-native` entry) — the retired
  third-party package used `Api-Token` (capitalized) per its own source; if a live call ever
  fails with `401`/`403` using the lowercase form, retry with the third-party's capitalized form
  before treating it as a real error — HTTP header *values* are occasionally
  implementation-sensitive even though header *names* never are.
- `MCPServer` (not `FastMCP`) is the confirmed, live-verified class from `mcp.server` for this
  SDK version — verified 2026-09-01 via two independent fetches of the official SDK's own docs.
  Do not "correct" this to `FastMCP` from prior training-data memory; the live docs are the
  authority. If a task's own `import` fails at implementation time, that is real, new evidence to
  re-verify against — not a reason to silently substitute a remembered class name.
- Every tool function is `async def`, takes plain keyword arguments (the SDK derives the JSON
  schema from type hints), and returns a plain JSON-serializable `dict`/`list` — never a manually
  constructed `TextContent`/`Tool` object (not part of this SDK's high-level API, see design doc
  §3.2 note and the plan's own live verification above).
- No git commits during implementation, per this repo's `base-agent.md` — every task ends with
  "leave the change uncommitted and state what changed." (If this plan is executed via
  `subagent-driven-development`, that skill's own tooling needs real commits for its diff-review
  mechanism — same controller-level exception already used and documented for the model-routing
  plan: commit for the SDD loop's own tooling, `git reset --soft` back to the pre-work HEAD once
  the final review is clean. Restate this ruling in the SDD ledger if that skill is used here.)
- REST endpoint paths/params for launches/results/statistics/categories/matchers/layers/statuses
  are given in full in Task 4 below, extracted from the retired third-party package's own source
  (`mshegolev/allure-testops-mcp`, `src/allure_testops_mcp/tools.py`, confirmed 2026-09-01) — use
  them verbatim, do not re-derive.
- `GET /api/rs/project` (paginated, `content[]`) is the project-listing endpoint — already
  documented in this repo's own `rules/allure.md` §2 as the REST alternative to the (nonexistent)
  "list projects" MCP tool; reuse it for `allure_list_projects` rather than treating it as a new
  unknown.

---

### Task 1: Package scaffolding

**Files:**
- Create: `plugins/claude-proj-agent/mcp-servers/allure-testops-custom/pyproject.toml`
- Create: `plugins/claude-proj-agent/mcp-servers/allure-testops-custom/README.md`
- Create: `plugins/claude-proj-agent/mcp-servers/allure-testops-custom/src/allure_testops_custom/__init__.py`
- Create: `plugins/claude-proj-agent/mcp-servers/allure-testops-custom/src/allure_testops_custom/tools/__init__.py`
- Create: `plugins/claude-proj-agent/mcp-servers/allure-testops-custom/tests/__init__.py`
- Create: `plugins/claude-proj-agent/mcp-servers/allure-testops-custom/.gitignore`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: the package skeleton every later task writes into; the `uv sync`/`uv run` commands
  every later task's verification step uses.

- [ ] **Step 1: Write `pyproject.toml`**

```toml
[project]
name = "allure-testops-custom"
version = "0.1.0"
description = "Custom Allure TestOps MCP server for proj-ai-agentic - test-case group search plus launch/results/statistics tools"
requires-python = ">=3.10"
dependencies = [
    "mcp>=1.0.0",
    "httpx>=0.27.0",
]

[project.scripts]
allure-testops-custom = "allure_testops_custom.server:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/allure_testops_custom"]

[dependency-groups]
dev = ["pytest>=8.0.0", "pytest-asyncio>=0.24.0"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
```

- [ ] **Step 2: Write `README.md`**

```markdown
# allure-testops-custom

Self-owned MCP server for this plugin, replacing the third-party `allure-testops`
(`mshegolev/allure-testops-mcp`). See
`../../docs/architecture/2026-09-01-allure-testops-custom-design.md` for the full design.

## Dev setup

    uv sync

## Run tests

    uv run pytest

## Run the server directly (for manual smoke testing, not how Claude Code invokes it)

    ALLURE_URL=http://allure.proj.local:8090 ALLURE_TOKEN=<token> uv run allure-testops-custom
```

- [ ] **Step 3: Write the empty package `__init__.py` files**

`src/allure_testops_custom/__init__.py`:
```python
"""allure-testops-custom - self-owned MCP server for Allure TestOps test-case group search and
launch/results/statistics tools. See ../../docs/architecture/2026-09-01-allure-testops-custom-design.md."""
```

`src/allure_testops_custom/tools/__init__.py`:
```python
"""Tool handler modules, one per capability group: test_cases, launches, metadata."""
```

`tests/__init__.py`:
```python
```

- [ ] **Step 4: Write `.gitignore`**

```
.venv/
__pycache__/
*.pyc
.pytest_cache/
uv.lock
```

- [ ] **Step 5: Verify the package installs**

Run:

```bash
cd plugins/claude-proj-agent/mcp-servers/allure-testops-custom
uv sync
```

Expected: completes without error, creates `.venv/` and installs `mcp`/`httpx`. (`uv.lock` is
gitignored per Step 4 — this is a plugin-bundled dev tool, not a published package with a
committed lockfile.)

- [ ] **Step 6: Leave uncommitted**

State in your response that the package scaffolding was created under
`plugins/claude-proj-agent/mcp-servers/allure-testops-custom/` and is sitting as an uncommitted
change.

---

### Task 2: `native_client.py` — HTTP JSON-RPC proxy to `allure-testops-native`

**Files:**
- Create: `plugins/claude-proj-agent/mcp-servers/allure-testops-custom/src/allure_testops_custom/native_client.py`
- Test: `plugins/claude-proj-agent/mcp-servers/allure-testops-custom/tests/test_native_client.py`

**Interfaces:**
- Consumes: `ALLURE_URL`/`ALLURE_TOKEN` env vars (Task 1's `pyproject.toml` deps: `httpx`).
- Produces (consumed by Task 5's `tools/test_cases.py` and Task 5's `index.py`):
  - `NativeClient(base_url: str | None = None, token: str | None = None)` — constructor.
  - `async NativeClient.call_tool(name: str, arguments: dict) -> dict` — calls one
    `allure-testops-native` tool (e.g. `testops_find_testcases`), returns its parsed result as a
    plain dict/list (already unwrapped from the JSON-RPC/MCP envelope).
  - `NativeClientError(RuntimeError)` — raised on a JSON-RPC error or unparseable response.

- [ ] **Step 1: Write the file**

```python
"""Thin HTTP JSON-RPC client for allure-testops-native's own MCP endpoint.

Confirmed live (2026-09-01, see docs/architecture/2026-09-01-allure-testops-custom-design.md
Section 2): a plain HTTP POST with a JSON-RPC 2.0 body works against this endpoint with no
session state and no Claude-Code-specific machinery - initialize does not create a session that
must be reused, so each call_tool() is fully self-contained.

The exact shape of tools/call's result envelope (content blocks vs. structuredContent) was NOT
independently re-confirmed byte-for-byte during this file's own design - _unwrap_result() below
is deliberately defensive (tries the documented MCP content-block shape first, falls back to a
raw structured result) and this file's own test/verification step (Step 3) calls it live against
the real endpoint to confirm or correct this.
"""

from __future__ import annotations

import itertools
import json
import os

import httpx

_id_counter = itertools.count(1)


class NativeClientError(RuntimeError):
    """Raised when allure-testops-native returns a JSON-RPC error or an unparseable response."""


def _unwrap_result(body: dict, tool_name: str) -> dict:
    if "error" in body:
        raise NativeClientError(f"{tool_name} failed: {body['error']}")
    result = body.get("result")
    if result is None:
        raise NativeClientError(f"{tool_name} returned no result: {body}")
    # Documented MCP shape: result.content is a list of content blocks; a text block's `text`
    # is the tool's actual JSON-stringified return value.
    content = result.get("content")
    if content:
        first = content[0]
        if first.get("type") == "text":
            try:
                return json.loads(first["text"])
            except json.JSONDecodeError:
                return {"text": first["text"]}
    # Fallback: some servers put structured data directly under result.structuredContent or
    # return it as `result` itself.
    if "structuredContent" in result:
        return result["structuredContent"]
    if isinstance(result, dict) and "content" not in result:
        return result
    raise NativeClientError(f"{tool_name} returned an unrecognized result shape: {result}")


class NativeClient:
    def __init__(self, base_url: str | None = None, token: str | None = None) -> None:
        raw_base = base_url or os.environ["ALLURE_URL"]
        self.base_url = raw_base.rstrip("/") + "/api/mcp"
        self.token = token or os.environ["ALLURE_TOKEN"]

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"api-token {self.token}",
            "Content-Type": "application/json",
        }

    async def call_tool(self, name: str, arguments: dict) -> dict:
        payload = {
            "jsonrpc": "2.0",
            "id": next(_id_counter),
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments},
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(self.base_url, json=payload, headers=self._headers())
        response.raise_for_status()
        return _unwrap_result(response.json(), name)
```

- [ ] **Step 2: Write a mocked unit test**

```python
"""tests/test_native_client.py"""
import json

import httpx
import pytest

from allure_testops_custom.native_client import NativeClient, NativeClientError


@pytest.mark.asyncio
async def test_call_tool_unwraps_text_content(monkeypatch):
    async def fake_post(self, url, json=None, headers=None):
        body = {
            "jsonrpc": "2.0",
            "id": json["id"],
            "result": {"content": [{"type": "text", "text": '{"id": 3426, "name": "Example"}'}]},
        }
        request = httpx.Request("POST", url)
        return httpx.Response(200, json=body, request=request)

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    client = NativeClient(base_url="http://fake", token="fake-token")
    result = await client.call_tool("testops_find_testcases", {"projectId": 2})
    assert result == {"id": 3426, "name": "Example"}


@pytest.mark.asyncio
async def test_call_tool_raises_on_jsonrpc_error(monkeypatch):
    async def fake_post(self, url, json=None, headers=None):
        body = {"jsonrpc": "2.0", "id": json["id"], "error": {"code": -32000, "message": "boom"}}
        request = httpx.Request("POST", url)
        return httpx.Response(200, json=body, request=request)

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    client = NativeClient(base_url="http://fake", token="fake-token")
    with pytest.raises(NativeClientError, match="boom"):
        await client.call_tool("testops_find_testcases", {"projectId": 2})
```

Run: `uv run pytest tests/test_native_client.py -v` (from the package root). Expected: 2 passed.

- [ ] **Step 3: Live verification against the real endpoint — confirm or correct `_unwrap_result`**

Run this from the package root, with `ALLURE_URL`/`ALLURE_TOKEN` set in your environment (read
them from your shell environment - **never hardcode or print the token value**, and redact it in
your report if it ever appears in an error message):

```bash
uv run python -c "
import asyncio
from allure_testops_custom.native_client import NativeClient

async def main():
    client = NativeClient()
    result = await client.call_tool('testops_find_testcases', {'projectId': 2, 'size': 1})
    print(type(result), list(result.keys()) if isinstance(result, dict) else result)

asyncio.run(main())
"
```

Expected: prints a dict with keys matching the pagination shape confirmed in the design doc
(`content`, `pageable`, `totalPages`, `totalElements`, ...). **If this fails or the shape doesn't
match**, read the raw JSON-RPC response yourself (add a temporary `print(response.json())` before
`_unwrap_result` is called, run again, inspect, then fix `_unwrap_result` to match reality) —
this is exactly what Step 3 exists to catch; do not guess a fix without seeing the real response.
Remove any temporary debug print before moving on.

- [ ] **Step 4: Leave uncommitted**

State in your response that `native_client.py` (and its test) were created, whether Step 3's live
check passed as-written or required a fix to `_unwrap_result`, and that the change is sitting
uncommitted.

---

### Task 3: `rest_client.py` — direct Allure REST client for launch/results/statistics/metadata

**Files:**
- Create: `plugins/claude-proj-agent/mcp-servers/allure-testops-custom/src/allure_testops_custom/rest_client.py`
- Test: `plugins/claude-proj-agent/mcp-servers/allure-testops-custom/tests/test_rest_client.py`

**Interfaces:**
- Consumes: `ALLURE_URL`/`ALLURE_TOKEN` env vars, `httpx`.
- Produces (consumed by Task 6's `tools/launches.py` and `tools/metadata.py`):
  - `RestClient(base_url: str | None = None, token: str | None = None)` — constructor.
  - `async RestClient.get(path: str, params: dict | None = None) -> dict` — a single generic GET
    helper (every endpoint in this task's scope is a GET) returning the parsed JSON body.
  - `RestClientError(RuntimeError)` — raised on a non-2xx response.

- [ ] **Step 1: Write the file**

Endpoint paths below are extracted verbatim from the retired third-party package's own source
(`mshegolev/allure-testops-mcp`, `src/allure_testops_mcp/tools.py`, confirmed 2026-09-01 — see
this plan's Global Constraints). This file only provides the generic GET helper; each endpoint's
specific call lives in Task 6's tool modules, which know the exact path/params per capability.

```python
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
```

- [ ] **Step 2: Write a mocked unit test**

```python
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
```

Run: `uv run pytest tests/test_rest_client.py -v`. Expected: 2 passed.

- [ ] **Step 3: Live verification against the real endpoint**

```bash
uv run python -c "
import asyncio
from allure_testops_custom.rest_client import RestClient

async def main():
    client = RestClient()
    result = await client.get('/project', params={'page': 0, 'size': 5})
    print(list(result.keys()))

asyncio.run(main())
"
```

Expected: prints a key list including `content` (a list of project dicts) — confirms the REST
base path (`/api/rs`) and auth header work end-to-end before any tool module is built on top of
it. If this 401/403s, retry with `Authorization: Api-Token <token>` (capitalized, matching the
Global Constraints' documented fallback) by temporarily editing `_headers()`, and if THAT works,
change `_headers()` permanently and note the correction in your report.

- [ ] **Step 4: Leave uncommitted**

State in your response that `rest_client.py` (and its test) were created, which auth header
casing actually worked, and that the change is sitting uncommitted.

---

### Task 4: REST endpoint reference (no code — this task's output is consumed by Task 6)

This task has no files of its own. It exists only to carry forward, in one place, the exact
endpoint facts Task 6 needs — extracted from the retired third-party package's source
(`mshegolev/allure-testops-mcp`, `src/allure_testops_mcp/tools.py`), confirmed 2026-09-01.
Skip actually "implementing" anything here; this is reference material for Task 6's dispatch.

| Capability | Method + Path | Params | Response fields used |
|---|---|---|---|
| List launches | `GET /launch` | `projectId`, `page`, `size`, `sort="createdDate,desc"` | `content[]` (`id`,`name`,`status`,`createdDate`,`statistic{passed,failed,broken,skipped}`), `totalPages` |
| Get test results | `GET /testresult` | `launchId`, `status?` (`PASSED`\|`FAILED`\|`BROKEN`\|`SKIPPED`), `page`, `size` | `content[]` (`id`,`name`,`status`,`duration`,`message`/`statusMessage`/`trace`), `totalPages` |
| Search failed tests | `GET /launch` (find latest, `page=0,size=1,sort=createdDate,desc`) then `GET /testresult` twice (`status=FAILED`, `status=BROKEN`) | see above two rows | same as test results |
| Project statistics | `GET /testcase?projectId&page=0&size=1` (total count via `totalElements`), same with `automated=true` (automated count), `GET /launch?projectId&page=0&size=20&sort=createdDate,desc` (find last closed launch via `closed:true`), `GET /launch/{id}/statistic` (pass/fail breakdown, array of `{status,count}`) | see above | `totalElements`, `content[].closed`, `content[].id`, array of `{status,count}` |
| List categories | `GET /project/{project_id}/category` | `page`, `size` | `content[]` (`id`,`name`,`color`,`description`), `totalPages` |
| List category matchers | `GET /project/{project_id}/categorymatcher` | `page`, `size` | `content[]` (`id`,`name`,`messageRegex`,`traceRegex`,`category{id,name}`), `totalPages` |
| List layers | `GET /testlayer` | `projectId`, `page`, `size=100`, paginate through all pages | `content[]` (`id`,`name`), `totalPages` |
| List statuses | `GET /status` | `projectId`, `page`, `size=100`, paginate through all pages | `content[]` (`id`,`name`,`color`), `totalPages` |
| List projects | `GET /project` | `page`, `size` | `content[]` (`id`,`name`,`abbr`), `totalPages` — already documented in `rules/allure.md` Section 2, not newly discovered |

`createdDate` is epoch-milliseconds; convert via
`datetime.fromtimestamp(value / 1000, tz=timezone.utc).isoformat()` if surfacing it as a string
(matches the retired package's own handling).

- [ ] **Step 1: No action — reference only.** State in your response that you've read this table
  and will use it verbatim in Task 6, changing nothing here.

---

### Task 5: `index.py` (two-tier cache) + `tools/test_cases.py`

**Files:**
- Create: `plugins/claude-proj-agent/mcp-servers/allure-testops-custom/src/allure_testops_custom/index.py`
- Create: `plugins/claude-proj-agent/mcp-servers/allure-testops-custom/src/allure_testops_custom/tools/test_cases.py`
- Test: `plugins/claude-proj-agent/mcp-servers/allure-testops-custom/tests/test_index.py`
- Test: `plugins/claude-proj-agent/mcp-servers/allure-testops-custom/tests/test_tools_test_cases.py`

**Interfaces:**
- Consumes: `NativeClient.call_tool` (Task 2).
- Produces (consumed by Task 7's `server.py`):
  - `ProjectIndex(client: NativeClient)` — one instance shared across the server process.
  - `async ProjectIndex.search(project_id: int, feature=None, component=None, story=None, suite=None, tag=None, status=None, automated=None) -> list[dict]` — filtered, lightweight case summaries.
  - `async ProjectIndex.list_field_values(project_id: int, field: str) -> list[str]` — distinct values for one custom field name.
  - `async ProjectIndex.get_full_case(project_id: int, test_case_id: int) -> dict` — on-demand full detail fetch (not cached).
  - `async ProjectIndex.refresh(project_id: int) -> None` — drops and rebuilds one project's index.
  - Tool functions: `async allure_search_test_cases(...)`, `async allure_get_test_case(...)`,
    `async allure_list_field_values(...)`, `async allure_refresh_index(...)` — thin wrappers
    around `ProjectIndex`, each takes/returns plain JSON-serializable data (Global Constraints).

- [ ] **Step 1: Write `index.py`**

```python
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
```

- [ ] **Step 2: Write `tools/test_cases.py`**

```python
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
```

- [ ] **Step 3: Write `tests/test_index.py`**

```python
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
```

Run: `uv run pytest tests/test_index.py -v`. Expected: 6 passed.

- [ ] **Step 4: Write `tests/test_tools_test_cases.py`**

```python
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
```

Run: `uv run pytest tests/test_tools_test_cases.py -v`. Expected: 2 passed.

- [ ] **Step 5: Leave uncommitted**

State in your response that `index.py`, `tools/test_cases.py`, and their tests were created and
are sitting as uncommitted changes.

---

### Task 6: `tools/launches.py` + `tools/metadata.py`

**Files:**
- Create: `plugins/claude-proj-agent/mcp-servers/allure-testops-custom/src/allure_testops_custom/tools/launches.py`
- Create: `plugins/claude-proj-agent/mcp-servers/allure-testops-custom/src/allure_testops_custom/tools/metadata.py`
- Test: `plugins/claude-proj-agent/mcp-servers/allure-testops-custom/tests/test_tools_launches.py`
- Test: `plugins/claude-proj-agent/mcp-servers/allure-testops-custom/tests/test_tools_metadata.py`

**Interfaces:**
- Consumes: `RestClient.get` (Task 3), the endpoint table (Task 4).
- Produces (consumed by Task 7's `server.py`):
  - `build_launch_tools(client: RestClient) -> dict` — `allure_list_launches`,
    `allure_get_test_results`, `allure_search_failed_tests`, `allure_get_project_statistics`.
  - `build_metadata_tools(client: RestClient) -> dict` — `allure_list_projects`,
    `allure_list_categories`, `allure_list_category_matchers`, `allure_list_layers`,
    `allure_list_statuses`.

- [ ] **Step 1: Write `tools/launches.py`**

```python
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
```

- [ ] **Step 2: Write `tools/metadata.py`**

```python
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
```

- [ ] **Step 3: Write `tests/test_tools_launches.py`**

```python
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
        "/launch/7/statistic": [{"status": "passed", "count": 30}, {"status": "failed", "count": 10}],
    })
    tools = build_launch_tools(client)
    result = await tools["allure_get_project_statistics"](project_id=2)
    assert result["total_test_cases"] == 100
    assert result["automated_test_cases"] == 40
    assert result["last_closed_launch_id"] == 7
    assert result["last_closed_launch_breakdown"] == [
        {"status": "passed", "count": 30}, {"status": "failed", "count": 10}
    ]
```

Run: `uv run pytest tests/test_tools_launches.py -v`. Expected: 4 passed.

- [ ] **Step 4: Write `tests/test_tools_metadata.py`**

```python
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
```

Run: `uv run pytest tests/test_tools_metadata.py -v`. Expected: 2 passed.

- [ ] **Step 5: Live verification for at least the read-only, side-effect-free metadata calls**

```bash
uv run python -c "
import asyncio
from allure_testops_custom.rest_client import RestClient
from allure_testops_custom.tools.metadata import build_metadata_tools
from allure_testops_custom.tools.launches import build_launch_tools

async def main():
    rc = RestClient()
    meta = build_metadata_tools(rc)
    launches = build_launch_tools(rc)
    print('projects:', await meta['allure_list_projects']())
    print('layers:', await meta['allure_list_layers'](project_id=2))
    print('statuses:', await meta['allure_list_statuses'](project_id=2))
    print('categories:', await meta['allure_list_categories'](project_id=2))
    print('launches:', await launches['allure_list_launches'](project_id=2, size=3))

asyncio.run(main())
"
```

Expected: each line prints real data with no exception. If any single call fails with a 404/400,
that specific endpoint's path/params (Task 4's table) needs correcting against the real API's
actual current behavior — fix it in the relevant tool function, re-run, and note the correction
in your report. Do not silently skip a failing endpoint.

- [ ] **Step 6: Leave uncommitted**

State in your response that `tools/launches.py`, `tools/metadata.py`, and their tests were
created, which (if any) endpoint corrections Step 5 required, and that the change is sitting
uncommitted.

---

### Task 7: `server.py` — MCP server entry point

**Files:**
- Create: `plugins/claude-proj-agent/mcp-servers/allure-testops-custom/src/allure_testops_custom/server.py`

**Interfaces:**
- Consumes: `NativeClient` (Task 2), `RestClient` (Task 3), `ProjectIndex` +
  `build_test_case_tools` (Task 5), `build_launch_tools` + `build_metadata_tools` (Task 6).
- Produces: the `allure-testops-custom` console script entry point (`pyproject.toml`'s
  `[project.scripts]`, Task 1) — this is what `.mcp.json` (Task 8) actually invokes.

- [ ] **Step 1: Write the file**

```python
"""MCP server entry point. Registers all 13 tools (4 test-case, 4 launch/results/statistics,
5 metadata) with the official mcp SDK's MCPServer, run over stdio - see
docs/architecture/2026-09-01-allure-testops-custom-design.md Section 3.2 for the full tool table.
"""

from __future__ import annotations

from mcp.server import MCPServer

from allure_testops_custom.index import ProjectIndex
from allure_testops_custom.native_client import NativeClient
from allure_testops_custom.rest_client import RestClient
from allure_testops_custom.tools.launches import build_launch_tools
from allure_testops_custom.tools.metadata import build_metadata_tools
from allure_testops_custom.tools.test_cases import build_test_case_tools

mcp = MCPServer("allure-testops-custom")

_native_client = NativeClient()
_rest_client = RestClient()
_index = ProjectIndex(_native_client)

_all_tools = {
    **build_test_case_tools(_index),
    **build_launch_tools(_rest_client),
    **build_metadata_tools(_rest_client),
}

for _name, _handler in _all_tools.items():
    mcp.tool()(_handler)


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verify all 13 tools are registered**

```bash
uv run python -c "
from allure_testops_custom.server import _all_tools
names = sorted(_all_tools.keys())
print(len(names), names)
expected = sorted([
    'allure_search_test_cases', 'allure_get_test_case', 'allure_list_field_values',
    'allure_refresh_index', 'allure_list_launches', 'allure_get_test_results',
    'allure_search_failed_tests', 'allure_get_project_statistics', 'allure_list_projects',
    'allure_list_categories', 'allure_list_category_matchers', 'allure_list_layers',
    'allure_list_statuses',
])
assert names == expected, f'mismatch: {set(names) ^ set(expected)}'
print('PASS: all 13 tools present')
"
```

Expected: `13 [...]` then `PASS: all 13 tools present`. If `mcp.tool()(_handler)` doesn't accept
being called this way (i.e. if the decorator only works as `@mcp.tool()` syntax, not as a plain
function call on an existing function) — this is plausible given the decorator API's design —
adjust the registration loop to whatever calling convention actually works (e.g. check if
`mcp.tool()` needs to be called with the function as a `name=` keyword, or if there's a
`mcp.add_tool()` method instead) and note the correction in your report. This is exactly the kind
of SDK-shape detail this plan's own Global Constraints flagged as needing live confirmation.

- [ ] **Step 3: Verify the server starts and blocks on stdio (manual, time-boxed)**

```bash
timeout 5 uv run allure-testops-custom < /dev/null
echo "exit code: $?"
```

Expected: the process starts, waits on stdin (per this plan's earlier SDK verification: "waiting
on stdin for a host to speak first"), and the `timeout 5` kills it after 5 seconds (exit code
124) rather than it crashing immediately with an import/registration error. A quick crash
(exit code other than 124, with a traceback) means something in `server.py`'s module-level setup
is broken — fix it before moving on, don't treat a crash as acceptable.

- [ ] **Step 4: Leave uncommitted**

State in your response that `server.py` was created, whether tool registration needed any
correction from the exact code shown above, that the server starts and blocks correctly, and
that the change is sitting uncommitted.

---

### Task 8: Wire into `.mcp.json`

**Files:**
- Modify: `plugins/claude-proj-agent/.mcp.json`

**Interfaces:**
- Consumes: Task 1's `pyproject.toml` entry point (`allure-testops-custom`).
- Produces: nothing further downstream — this is the actual cutover point.

- [ ] **Step 1: Replace the file's full contents**

Current content (for reference — reflects this session's earlier `:8090` URL fix to the
third-party entry, which this task now removes entirely rather than keeping):

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    },
    "allure-testops-native": {
      "type": "http",
      "url": "http://allure.proj.local:8090/api/mcp",
      "headers": {
        "Authorization": "api-token ${ALLURE_TOKEN}"
      }
    },
    "allure-testops": {
      "command": "uvx",
      "args": ["--from", "allure-testops-mcp", "allure-testops-mcp"],
      "env": {
        "ALLURE_URL": "http://allure.proj.local:8090",
        "ALLURE_TOKEN": "${ALLURE_TOKEN}"
      }
    }
  }
}
```

New content (the `allure-testops` entry is **deleted outright**, not disabled/commented — per
design doc Decision D2; a new `allure-testops-custom` entry replaces it; every other entry is
unchanged):

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    },
    "allure-testops-native": {
      "type": "http",
      "url": "http://allure.proj.local:8090/api/mcp",
      "headers": {
        "Authorization": "api-token ${ALLURE_TOKEN}"
      }
    },
    "allure-testops-custom": {
      "command": "uv",
      "args": ["run", "--directory", "${CLAUDE_PLUGIN_ROOT}/mcp-servers/allure-testops-custom",
                "allure-testops-custom"],
      "env": {
        "ALLURE_URL": "http://allure.proj.local:8090",
        "ALLURE_TOKEN": "${ALLURE_TOKEN}"
      }
    }
  }
}
```

- [ ] **Step 2: Verify the JSON is well-formed and the cutover is complete**

```powershell
$j = Get-Content plugins/claude-proj-agent/.mcp.json -Raw | ConvertFrom-Json
if ($j.mcpServers.'allure-testops') { throw 'FAIL: third-party allure-testops entry still present' }
if (-not $j.mcpServers.'allure-testops-custom') { throw 'FAIL: allure-testops-custom entry missing' }
if (-not $j.mcpServers.'allure-testops-native') { throw 'FAIL: allure-testops-native entry lost' }
if (-not $j.mcpServers.github -or -not $j.mcpServers.filesystem) { throw 'FAIL: unrelated entries lost' }
Write-Host 'PASS: .mcp.json cutover complete'
```

Expected: `PASS: .mcp.json cutover complete`.

- [ ] **Step 3: Leave uncommitted**

State in your response that `.mcp.json` was updated (third-party `allure-testops` removed,
`allure-testops-custom` added, everything else unchanged) and is sitting as an uncommitted
change. Note in your report that the user must run `/mcp` (or restart their session) to actually
connect the new server — this task cannot do that itself.

---

### Task 9: Update `rules/allure.md`

**Files:**
- Modify: `plugins/claude-proj-agent/rules/allure.md`

**Interfaces:**
- Consumes: the final tool list from Task 7 (13 tools) and their signatures from Tasks 5-6.
- Produces: nothing further downstream — documentation only, but this is the file every
  `allure-commands/*.md` persona actually reads before touching Allure, so it must be accurate.

- [ ] **Step 1: Replace §8 in full**

Find this exact heading and read to the end of the file from there (the whole of the current §8,
titled "## 8. Third-party `allure-testops` MCP — launches/results/statistics only" — the full
text was read into this plan's own design-phase context; locate it by this heading in the live
file since reproducing the full ~40-line current section here would risk a stale copy — read the
file fresh before editing).

Replace that entire section with:

```markdown
## 8. `allure-testops-custom` MCP — group search, launch/results/statistics, and metadata

`.mcp.json`'s `allure-testops-custom` entry (a self-owned package under
`mcp-servers/allure-testops-custom/`, replacing the retired third-party `allure-testops` —
see `docs/architecture/2026-09-01-allure-testops-custom-design.md`) provides 13 read-only tools
in three groups:

**Test-case group search/lookup** (backed by `allure-testops-native`'s own MCP tools, via an
in-memory per-session cache — never a per-query full-project fetch):
- `allure_search_test_cases(project_id, feature?, component?, story?, suite?, tag?, status?,
  automated?)` — wrapped by `/execution:allure-commands:allure-custom-search-test-cases`, the
  command every Feature/Component/Story/Suite group-search now goes through (§3's
  `testops_find_testcases` is still the right tool for everything AQL-capable —
  `/execution:allure-commands:allure-native-list-test-cases`'s `tag:`/`status:`/`ticket:` filters).
- `allure_get_test_case(project_id, test_case_id)` — single test case full detail; no dedicated
  custom command wraps this (redundant with
  `/execution:allure-commands:allure-native-get-test-case`, which already calls native directly
  for the same result) — call the native command for single lookups.
- `allure_list_field_values(project_id, field)` — wrapped by
  `/execution:allure-commands:allure-custom-list-field-values` — use before creating a new
  Feature/Component/Story/Suite value, replacing the old "scan `testops_find_testcases` for
  near-duplicates" manual workaround (§7 item 4, superseded).
- `allure_refresh_index(project_id)` — wrapped by
  `/execution:allure-commands:allure-custom-refresh-index` — force a fresh rebuild if cases
  changed mid-session.

**Launch/results/statistics** (direct REST, no native MCP equivalent exists) — back
release-readiness and coverage-trend questions (the AQA Lead persona's "Release Readiness
Checklist"):
- `allure_list_launches` → `/execution:allure-commands:allure-custom-list-launches`
- `allure_get_test_results` → `/execution:allure-commands:allure-custom-get-test-results`
- `allure_search_failed_tests` → `/execution:allure-commands:allure-custom-search-failed-tests`
- `allure_get_project_statistics` → `/execution:allure-commands:allure-custom-get-project-statistics`

**Project metadata** — `allure_list_projects`/`allure_list_categories`/
`allure_list_category_matchers`/`allure_list_layers`/`allure_list_statuses`, all wrapped by one
combined command, `/execution:allure-commands:allure-custom-project-metadata what:<kind>`.

Read-only by design, same posture as the server it replaces — every write path this project
needs still goes through `allure-testops-native` (§3, its commands now all prefixed
`allure-native-`), unchanged.

### Configuration

- `.mcp.json`'s entry runs the package under `mcp-servers/allure-testops-custom/` via `uv run`
  (no `uvx`/PyPI dependency — ships with this plugin). Auth reuses the same
  `ALLURE_URL`/`ALLURE_TOKEN` as `allure-testops-native`.
- Requires `uv` (Python 3.10+) installed locally — see `docs/ci-cd-secrets.md`'s "Prerequisites
  beyond Node/npm". Not needed in CI.
```

- [ ] **Step 2: Verify the old third-party section is gone and the new one is present**

```powershell
$content = Get-Content plugins/claude-proj-agent/rules/allure.md -Raw
if ($content -match 'mshegolev/allure-testops-mcp') { throw 'FAIL: third-party reference still present' }
if ($content -notmatch 'allure_search_test_cases') { throw 'FAIL: new tool reference missing' }
if ($content -notmatch [regex]::Escape('allure-testops-custom')) { throw 'FAIL: new server name missing' }
Write-Host 'PASS: rules/allure.md updated'
```

Expected: `PASS: rules/allure.md updated`.

- [ ] **Step 3: Leave uncommitted**

State in your response that `rules/allure.md` §8 was replaced and the change is sitting
uncommitted.

---

### Task 10: Rename the 10 existing `allure-commands/*.md` files with an `allure-native-` prefix

User-directed mid-plan addition (2026-09-02): every command backed by `allure-testops-native`
gets an `allure-native-` prefix, and every command backed by the new `allure-testops-custom`
server gets an `allure-custom-` prefix (Tasks 11-13), so which server backs which command is
visible directly in the command name — chosen over a `native/`/`custom/` subfolder split because
nested-command-folder invocation depth beyond the existing 3 levels was not confirmed to work in
this Claude Code version (tested live this session: a throwaway 4-level-deep probe file could not
be verified because this session resolves commands from the installed plugin cache, not this git
working tree — same limitation already documented for the model-routing hook's own live-session
test gap).

**Files:**
- Rename (via `git mv`, preserving history):
  `allure-create-mute.md` → `allure-native-create-mute.md`
  `allure-create-shared-step.md` → `allure-native-create-shared-step.md`
  `allure-create-test-case.md` → `allure-native-create-test-case.md`
  `allure-delete-mute.md` → `allure-native-delete-mute.md`
  `allure-delete-test-case.md` → `allure-native-delete-test-case.md`
  `allure-find-shared-steps.md` → `allure-native-find-shared-steps.md`
  `allure-get-test-case.md` → `allure-native-get-test-case.md`
  `allure-list-test-cases.md` → `allure-native-list-test-cases.md`
  `allure-update-shared-step.md` → `allure-native-update-shared-step.md`
  `allure-update-test-case.md` → `allure-native-update-test-case.md`
  (all under `plugins/claude-proj-agent/commands/execution/allure-commands/`)
- Modify: each renamed file's own `# /execution:allure-commands:...` header line (must match its
  new filename) and any place it cross-references another Allure command by its old name.
- Modify: `plugins/claude-proj-agent/commands/execution/allure-commands/INDEX.md`.
- Modify: `plugins/claude-proj-agent/commands/execution/allure-commands/allure-native-list-test-cases.md`'s
  `feature:`/`suite:`/`story:` handling specifically (Step 3 below) — these filters move to Task
  11's new `allure-custom-search-test-cases.md`, so the native command no longer owns them.

**Interfaces:**
- Consumes: nothing new (pure rename/edit of existing files).
- Produces: the `allure-native-*` command names Task 14 (`rules/allure.md`) and Tasks 11-13
  (their own commands' "see also" pointers) reference.

- [ ] **Step 1: Rename all 10 files**

```bash
cd plugins/claude-proj-agent/commands/execution/allure-commands
git mv allure-create-mute.md allure-native-create-mute.md
git mv allure-create-shared-step.md allure-native-create-shared-step.md
git mv allure-create-test-case.md allure-native-create-test-case.md
git mv allure-delete-mute.md allure-native-delete-mute.md
git mv allure-delete-test-case.md allure-native-delete-test-case.md
git mv allure-find-shared-steps.md allure-native-find-shared-steps.md
git mv allure-get-test-case.md allure-native-get-test-case.md
git mv allure-list-test-cases.md allure-native-list-test-cases.md
git mv allure-update-shared-step.md allure-native-update-shared-step.md
git mv allure-update-test-case.md allure-native-update-test-case.md
cd -
```

- [ ] **Step 2: Fix each renamed file's own header and internal cross-references**

For each of the 10 renamed files: open it, find its first line (`# /execution:allure-commands:<old-name>`),
and update it to `# /execution:allure-commands:<new-name>` (e.g.
`# /execution:allure-commands:allure-native-get-test-case`). Then, across all 10 files, search for
any place one of these commands names ANOTHER one of the 10 by its OLD name (e.g.
`allure-update-test-case.md` mentioning "see `allure-create-test-case.md`" or
"`/execution:allure-commands:allure-delete-test-case`") and update that reference to the new
`allure-native-` name. Use this to find every cross-reference systematically rather than
eyeballing each file:

```bash
cd plugins/claude-proj-agent/commands/execution/allure-commands
grep -rn 'allure-create-mute\|allure-create-shared-step\|allure-create-test-case\|allure-delete-mute\|allure-delete-test-case\|allure-find-shared-steps\|allure-get-test-case\|allure-list-test-cases\|allure-update-shared-step\|allure-update-test-case' *.md | grep -v 'allure-native-'
cd -
```

Every line this prints (other than a file's own now-already-fixed header, if the grep pattern
happens to still partially match it) names an old-style reference still needing a fix — fix each
one, then re-run the grep and confirm it prints nothing.

- [ ] **Step 3: Strip `feature:`/`suite:`/`story:` from `allure-native-list-test-cases.md`**

Read the file. In its `## Argument Format` section, remove the three lines:
```
/execution:allure-commands:allure-list-test-cases feature:<name>
/execution:allure-commands:allure-list-test-cases suite:<name>
/execution:allure-commands:allure-list-test-cases story:<name>
```
(replacing the command name prefix with the new `allure-native-list-test-cases` on the lines that
remain: the bare form, `status:<...>`, and `ticket:<TICKET-KEY>`). In its `## Examples` section,
remove any example using `feature:`/`suite:`/`story:` and add one line pointing elsewhere:

```markdown
For Feature/Component/Story/Suite group search, use
`/execution:allure-commands:allure-custom-search-test-cases` instead — this command only handles
what `allure-testops-native`'s own AQL can filter server-side (`tag:`/`status:`/`ticket:`).
```

In its `## Protocol` → `### Step 1` section, find the paragraph beginning "`feature:<name>` /
`suite:<name>` / `story:<name>`: **no confirmed AQL predicate exists for these**..." and delete it
entirely (that capability no longer lives in this command). Also delete the sentence in the
"Filters may combine" paragraph that references combining with a `feature:`/`suite:`/`story:`
filter, if present.

- [ ] **Step 4: Update `INDEX.md`**

Read the current file. Update every row's `File` and `Invocation` columns to the new
`allure-native-` names (e.g. `allure-native-create-test-case.md` /
`/execution:allure-commands:allure-native-create-test-case ...`). Update
`allure-native-list-test-cases.md`'s row description to remove the `feature:`/`suite:`/`story:`
mention (now `[status:|ticket:...]` only). Update the file's intro paragraph (currently: "All CRUD
below runs through the `allure-testops-native` MCP server... the third-party `allure-testops` MCP
server is unrelated to this table") to instead say something like: "All commands below run
through `allure-testops-native` and are prefixed `allure-native-`; group-search, launch/results/
statistics, and metadata commands run through the self-owned `allure-testops-custom` server and
are prefixed `allure-custom-` (Tasks 11-13 of this plan) — see `rules/allure.md` §8." Add a new
table row (or a short note) pointing at where the `allure-custom-*` commands are documented, since
this INDEX.md's own table currently only lists the 10 native ones.

- [ ] **Step 5: Verify**

```powershell
cd plugins/claude-proj-agent/commands/execution/allure-commands
Get-ChildItem -Filter 'allure-*.md' | ForEach-Object {
    if ($_.Name -notmatch '^allure-native-') { throw "FAIL: $($_.Name) was not renamed" }
}
$content = Get-Content * -Raw
if (($content -join "`n") -match 'allure-testops-custom' ) { } else { throw 'FAIL: no allure-testops-custom reference found anywhere' }
$listCmd = Get-Content allure-native-list-test-cases.md -Raw
if ($listCmd -match 'feature:<name>') { throw 'FAIL: feature: filter still present in native command' }
if ($listCmd -notmatch 'allure-custom-search-test-cases') { throw 'FAIL: no pointer to the new custom search command' }
cd -
Write-Host 'PASS: rename batch complete'
```

Expected: `PASS: rename batch complete`.

- [ ] **Step 6: Leave uncommitted**

State in your response: which files were renamed (all 10), which needed a cross-reference fix
beyond their own header (name them), and that `allure-native-list-test-cases.md` and `INDEX.md`
were updated as specified. All sitting uncommitted.

---

### Task 11: Create the custom test-case commands (search, list-field-values, refresh-index)

**Files:**
- Create: `plugins/claude-proj-agent/commands/execution/allure-commands/allure-custom-search-test-cases.md`
- Create: `plugins/claude-proj-agent/commands/execution/allure-commands/allure-custom-list-field-values.md`
- Create: `plugins/claude-proj-agent/commands/execution/allure-commands/allure-custom-refresh-index.md`

**Interfaces:**
- Consumes: `allure_search_test_cases`/`allure_list_field_values`/`allure_refresh_index` (the
  running `allure-testops-custom` server, Tasks 5+7-8).
- Produces: nothing further downstream — these are leaf commands.

- [ ] **Step 1: Write `allure-custom-search-test-cases.md`**

```markdown
# /execution:allure-commands:allure-custom-search-test-cases

## Role

You are the Senior Manual QA Engineer (`${CLAUDE_PLUGIN_ROOT}/commands/team/manual-qa-agent.md`).

Your responsibility here is narrow: find every test case matching a Feature/Component/Story/
Suite/tag/status/automation-status combination, using the `allure-testops-custom` MCP server's
in-memory per-session index — never a full-project client-side scan. You never write to Allure
from this command.

This is the command that replaces `allure-native-list-test-cases.md`'s old, retired
`feature:`/`suite:`/`story:` filters (`allure-testops-native` has no server-side custom-field
predicate — see `rules/allure.md` §8).

---

## Mission

Given any combination of Feature/Component/Story/Suite/tag/status/automated filters, return every
matching test case as a compact summary (id/name/status/layer/tags/customFields) — never full
scenario/description content, which stays a separate, explicit `allure-native-get-test-case` call
per matched id.

---

## Argument Format

```
/execution:allure-commands:allure-custom-search-test-cases feature:<name>
/execution:allure-commands:allure-custom-search-test-cases component:<name>
/execution:allure-commands:allure-custom-search-test-cases story:<name>
/execution:allure-commands:allure-custom-search-test-cases suite:<name>
/execution:allure-commands:allure-custom-search-test-cases tag:<name>
/execution:allure-commands:allure-custom-search-test-cases status:<Draft|Review|Active|Outdated>
/execution:allure-commands:allure-custom-search-test-cases automated:<true|false>
```

Filters combine (AND semantics) — e.g. `feature:"System Core" component:Idempotency tag:Regression`.
At least one filter is required; if none is given, ask which filter was meant rather than
returning the entire project.

## Examples

```
/execution:allure-commands:allure-custom-search-test-cases feature:"System Core" component:"Idempotency & Duplicate Prevention"
```
→ Every case under that Feature/Component pair, rendered as a compact table.

```
/execution:allure-commands:allure-custom-search-test-cases story:"US-01.12.03 | Functional Duplicate Detection (ERROR + OVERRIDE)"
```
→ Every case for that exact Story value.

---

## Preconditions

- The `allure-testops-custom` MCP server must be connected this session (confirm via a tool
  listing if unsure) — if it isn't, say so and stop rather than falling back to a slow
  full-project native scan.
- Resolve `project_id` per `rules/allure.md` §2 if not already known this session.

---

## Protocol

### Step 1 — Call the search tool

Call `allure_search_test_cases(project_id, feature=?, component=?, story=?, suite=?, tag=?,
status=?, automated=?)` with exactly the filters given as arguments — omit any not provided
(never pass an empty string as a "no filter" signal).

### Step 2 — Zero matches

If `count` is `0`, call `allure_list_field_values(project_id, field="Feature")` (or whichever
field was actually filtered on) and show the closest existing values, so the user can tell if the
filter name was a near-miss (casing/typo) rather than a genuine "nothing exists" result — never
report zero silently.

### Step 3 — Render

A table: `id | name | status | layer | tags`. State the total count and the exact filters applied.

---

## Output

A rendered table (and total count) in chat. No file is written — this command is read-only.

---

## Constraints

Never mutate anything — this command has no access to any mutating tool. Never guess a
Feature/Component/Story/Suite value when zero results come back — use
`allure_list_field_values` to check for a near-miss first. Never fetch full case detail here —
that's `allure-native-get-test-case`'s job, one id at a time.

---

## Definition of Done (for this command's own output)

- Every filter given was actually passed to `allure_search_test_cases`, none silently dropped
- The reported count matches what the tool actually returned
- A zero-result search checked `allure_list_field_values` before being reported as empty
- No mutating call was made
```

- [ ] **Step 2: Write `allure-custom-list-field-values.md`**

```markdown
# /execution:allure-commands:allure-custom-list-field-values

## Role

You are the Senior Manual QA Engineer (`${CLAUDE_PLUGIN_ROOT}/commands/team/manual-qa-agent.md`).

Your responsibility here is narrow: list every distinct value currently used for one custom field
(Feature/Component/Story/Suite) in the project, via `allure-testops-custom`'s in-memory index.
Use this before creating a new value with `allure-native-create-test-case`/
`allure-native-update-test-case`, to catch a near-duplicate (`rules/allure.md` §7 item 4).

---

## Mission

Given a field name, return every distinct value currently assigned to it across the project, so a
new value isn't created next to an existing near-duplicate (`"Login"` vs `"login"` vs `"Log In"`).

---

## Argument Format

```
/execution:allure-commands:allure-custom-list-field-values field:<Feature|Component|Story|Suite>
```

## Examples

```
/execution:allure-commands:allure-custom-list-field-values field:Component
```
→ Every distinct Component value currently used in the project, sorted.

---

## Preconditions

- The `allure-testops-custom` MCP server must be connected this session.
- Resolve `project_id` per `rules/allure.md` §2 if not already known this session.

---

## Protocol

### Step 1 — Call the tool

Call `allure_list_field_values(project_id, field=<field>)`.

### Step 2 — Render

A plain sorted list of values, with the total count. If the list is long (>30), still show all of
it — this command exists specifically to catch near-duplicates, and truncating defeats that.

---

## Output

A rendered list in chat. No file is written — this command is read-only.

---

## Constraints

Never mutate anything. Never invent a value not actually returned by the tool.

---

## Definition of Done (for this command's own output)

- The exact requested field's values are shown, not truncated
- No mutating call was made
```

- [ ] **Step 3: Write `allure-custom-refresh-index.md`**

```markdown
# /execution:allure-commands:allure-custom-refresh-index

## Role

You are the Senior Manual QA Engineer (`${CLAUDE_PLUGIN_ROOT}/commands/team/manual-qa-agent.md`).

Your responsibility here is narrow: force `allure-testops-custom`'s in-memory per-project index to
rebuild, for the rare case where test cases changed mid-session (created/updated/deleted via
`allure-native-*` commands) and a subsequent `allure-custom-search-test-cases`/
`allure-custom-list-field-values` call needs to see that change immediately, rather than the
stale cached view from earlier in the session.

---

## Mission

Given a project, drop and rebuild its lightweight search index.

---

## Argument Format

```
/execution:allure-commands:allure-custom-refresh-index
```

Uses the project id already resolved this session (`rules/allure.md` §2) — no argument needed
beyond that.

---

## Preconditions

- The `allure-testops-custom` MCP server must be connected this session.

---

## Protocol

### Step 1 — Call the tool

Call `allure_refresh_index(project_id)`.

### Step 2 — Confirm

State that the index was refreshed for this project — no further rendering needed.

---

## Output

A one-line confirmation in chat. No file is written.

---

## Constraints

Never call this reflexively before every search — it re-fetches the whole project's lightweight
index, which is the exact cost `allure-custom-search-test-cases` exists to avoid paying per
query. Use it only when you know cases actually changed mid-session.

---

## Definition of Done (for this command's own output)

- The refresh was actually performed for the correct project id, not assumed
```

- [ ] **Step 4: Verify all three files exist and cross-reference correctly**

```powershell
cd plugins/claude-proj-agent/commands/execution/allure-commands
foreach ($f in @('allure-custom-search-test-cases.md','allure-custom-list-field-values.md','allure-custom-refresh-index.md')) {
    if (-not (Test-Path $f)) { throw "FAIL: $f missing" }
}
$search = Get-Content allure-custom-search-test-cases.md -Raw
if ($search -notmatch 'allure_search_test_cases') { throw 'FAIL: search command missing tool reference' }
cd -
Write-Host 'PASS: custom test-case commands created'
```

Expected: `PASS: custom test-case commands created`.

- [ ] **Step 5: Leave uncommitted**

State in your response that all 3 files were created and are sitting as uncommitted changes.

---

### Task 12: Create the custom launch/results/statistics commands

**Files:**
- Create: `plugins/claude-proj-agent/commands/execution/allure-commands/allure-custom-list-launches.md`
- Create: `plugins/claude-proj-agent/commands/execution/allure-commands/allure-custom-get-test-results.md`
- Create: `plugins/claude-proj-agent/commands/execution/allure-commands/allure-custom-search-failed-tests.md`
- Create: `plugins/claude-proj-agent/commands/execution/allure-commands/allure-custom-get-project-statistics.md`

**Interfaces:**
- Consumes: the matching 4 tools on the running `allure-testops-custom` server (Tasks 6+7-8).
- Produces: nothing further downstream — leaf commands, primarily for the AQA Lead persona's
  Release Readiness Checklist.

- [ ] **Step 1: Write `allure-custom-list-launches.md`**

```markdown
# /execution:allure-commands:allure-custom-list-launches

## Role

You are the Senior QA Test Automation Lead Engineer
(`${CLAUDE_PLUGIN_ROOT}/commands/team/aqa-lead-agent.md`).

Your responsibility here is narrow: list recent Allure TestOps launches for a project, newest
first, via `allure-testops-custom`'s direct REST call (no `allure-testops-native` equivalent
exists for launch-level data — `rules/allure.md` §3).

---

## Mission

Given a project, return its recent launches (id, name, status, created date, pass/fail/broken/
skipped counts) as a release-readiness overview.

---

## Argument Format

```
/execution:allure-commands:allure-custom-list-launches [size:<n>]
```

`size:` defaults to 20 if omitted.

---

## Preconditions

- The `allure-testops-custom` MCP server must be connected this session.
- Resolve `project_id` per `rules/allure.md` §2 if not already known this session.

---

## Protocol

### Step 1 — Call the tool

Call `allure_list_launches(project_id, size=<size or 20>)`.

### Step 2 — Render

A table: `id | name | status | createdDate | passed | failed | broken | skipped`, newest first.

---

## Output

A rendered table in chat. No file is written — this command is read-only.

---

## Constraints

Never mutate anything. Never invent a launch not actually returned by the tool.

---

## Definition of Done (for this command's own output)

- The reported launches match exactly what the tool returned, in the order returned
```

- [ ] **Step 2: Write `allure-custom-get-test-results.md`**

```markdown
# /execution:allure-commands:allure-custom-get-test-results

## Role

You are the Senior QA Test Automation Lead Engineer
(`${CLAUDE_PLUGIN_ROOT}/commands/team/aqa-lead-agent.md`).

Your responsibility here is narrow: fetch test results within one launch, optionally filtered by
status, via `allure-testops-custom`'s direct REST call.

---

## Mission

Given a launch id (and optionally a status), return the matching test results.

---

## Argument Format

```
/execution:allure-commands:allure-custom-get-test-results <launch-id> [status:<PASSED|FAILED|BROKEN|SKIPPED>]
```

---

## Preconditions

- The `allure-testops-custom` MCP server must be connected this session.
- The launch id should come from a prior `allure-custom-list-launches` call, or be supplied
  directly if already known — never guessed.

---

## Protocol

### Step 1 — Call the tool

Call `allure_get_test_results(launch_id, status=<status or omitted>)`.

### Step 2 — Render

A table: `id | name | status | duration | message` (truncate `message`/error text to a readable
length, never silently drop it entirely).

---

## Output

A rendered table in chat. No file is written — this command is read-only.

---

## Constraints

Never mutate anything. Never invent a result not actually returned by the tool.

---

## Definition of Done (for this command's own output)

- The reported results match exactly what the tool returned for the given launch/status filter
```

- [ ] **Step 3: Write `allure-custom-search-failed-tests.md`**

```markdown
# /execution:allure-commands:allure-custom-search-failed-tests

## Role

You are the Senior QA Test Automation Lead Engineer
(`${CLAUDE_PLUGIN_ROOT}/commands/team/aqa-lead-agent.md`).

Your responsibility here is narrow: find failed/broken tests in the most recent launch for a
project, via `allure-testops-custom`'s direct REST call.

---

## Mission

Given a project, surface every failed and broken test result in its most recent launch, as a
quick "what's currently broken" check.

---

## Argument Format

```
/execution:allure-commands:allure-custom-search-failed-tests [size:<n>]
```

`size:` defaults to 50 per status if omitted.

---

## Preconditions

- The `allure-testops-custom` MCP server must be connected this session.
- Resolve `project_id` per `rules/allure.md` §2 if not already known this session.

---

## Protocol

### Step 1 — Call the tool

Call `allure_search_failed_tests(project_id, size=<size or 50>)`.

### Step 2 — No launches exist

If `launch_id` comes back `null` (no launches for this project), say so plainly rather than
reporting an empty failed/broken list as if a launch was actually checked.

### Step 3 — Render

Two tables, `Failed` and `Broken`, each `id | name | duration | message`, plus the launch id they
came from.

---

## Output

Two rendered tables (or an explicit "no launches exist" message) in chat. No file is written.

---

## Constraints

Never mutate anything. Never invent a result not actually returned by the tool.

---

## Definition of Done (for this command's own output)

- Both Failed and Broken sets match exactly what the tool returned
- A "no launches" case is reported explicitly, never silently shown as "0 failed, 0 broken"
```

- [ ] **Step 4: Write `allure-custom-get-project-statistics.md`**

```markdown
# /execution:allure-commands:allure-custom-get-project-statistics

## Role

You are the Senior QA Test Automation Lead Engineer
(`${CLAUDE_PLUGIN_ROOT}/commands/team/aqa-lead-agent.md`).

Your responsibility here is narrow: report a project's automation rate, total/automated test-case
counts, and the last closed launch's pass/fail breakdown, via `allure-testops-custom`'s direct
REST calls — the data source for the "Release Readiness Checklist."

---

## Mission

Given a project, return its total test-case count, automated count (and rate), and the last
closed launch's status breakdown.

---

## Argument Format

```
/execution:allure-commands:allure-custom-get-project-statistics
```

Uses the project id already resolved this session (`rules/allure.md` §2).

---

## Preconditions

- The `allure-testops-custom` MCP server must be connected this session.

---

## Protocol

### Step 1 — Call the tool

Call `allure_get_project_statistics(project_id)`.

### Step 2 — Render

State: total test cases, automated test cases, automation rate (`automated / total`, computed
here — the tool itself doesn't compute a ratio), the last closed launch id (or "no closed launch
found" if `null`), and its pass/fail/broken/skipped breakdown as a short table.

---

## Output

A short summary plus a breakdown table in chat. No file is written.

---

## Constraints

Never mutate anything. Compute the automation rate from the two counts the tool returns — never
invent a rate the tool didn't provide the inputs for.

---

## Definition of Done (for this command's own output)

- Total/automated counts and the launch breakdown match exactly what the tool returned
- The automation rate is correctly computed from those two counts (automated/total, as a
  percentage), not fabricated
```

- [ ] **Step 5: Verify all four files exist**

```powershell
cd plugins/claude-proj-agent/commands/execution/allure-commands
foreach ($f in @('allure-custom-list-launches.md','allure-custom-get-test-results.md','allure-custom-search-failed-tests.md','allure-custom-get-project-statistics.md')) {
    if (-not (Test-Path $f)) { throw "FAIL: $f missing" }
}
cd -
Write-Host 'PASS: custom launch/stats commands created'
```

Expected: `PASS: custom launch/stats commands created`.

- [ ] **Step 6: Leave uncommitted**

State in your response that all 4 files were created and are sitting as uncommitted changes.

---

### Task 13: Create the custom metadata command

**Files:**
- Create: `plugins/claude-proj-agent/commands/execution/allure-commands/allure-custom-project-metadata.md`

**Interfaces:**
- Consumes: `allure_list_projects`/`allure_list_categories`/`allure_list_category_matchers`/
  `allure_list_layers`/`allure_list_statuses` (Tasks 6+7-8).
- Produces: nothing further downstream — a leaf command.

- [ ] **Step 1: Write the file**

One combined command rather than 5 near-identical ones (each of these 5 tools is a simple
read-only project-metadata lookup with no distinct workflow of its own — see this plan's own
design-time note on avoiding unnecessary command proliferation).

```markdown
# /execution:allure-commands:allure-custom-project-metadata

## Role

You are the Senior QA Test Automation Lead Engineer
(`${CLAUDE_PLUGIN_ROOT}/commands/team/aqa-lead-agent.md`).

Your responsibility here is narrow: look up one kind of Allure TestOps project metadata
(projects/categories/category matchers/layers/statuses), via `allure-testops-custom`'s direct
REST calls. One combined command instead of five near-identical ones, since each is a single,
simple lookup with no distinct workflow.

---

## Mission

Given a `what:` argument, call the matching metadata tool and render its result.

---

## Argument Format

```
/execution:allure-commands:allure-custom-project-metadata what:projects
/execution:allure-commands:allure-custom-project-metadata what:categories
/execution:allure-commands:allure-custom-project-metadata what:category-matchers
/execution:allure-commands:allure-custom-project-metadata what:layers
/execution:allure-commands:allure-custom-project-metadata what:statuses
```

`what:projects` needs no project id (it lists every project in the instance). The other four use
the project id already resolved this session (`rules/allure.md` §2).

---

## Preconditions

- The `allure-testops-custom` MCP server must be connected this session.

---

## Protocol

### Step 1 — Resolve `what:` to a tool call

- `what:projects` → `allure_list_projects()`
- `what:categories` → `allure_list_categories(project_id)`
- `what:category-matchers` → `allure_list_category_matchers(project_id)`
- `what:layers` → `allure_list_layers(project_id)`
- `what:statuses` → `allure_list_statuses(project_id)`

If `what:` is missing or doesn't match one of these five, list the five valid values and ask
rather than guessing.

### Step 2 — Render

A table of whatever the tool returned (fields vary by kind — `id`/`name` at minimum for every
kind, plus `color`/`description` for categories, `messageRegex`/`traceRegex`/`category` for
category matchers).

---

## Output

A rendered table in chat. No file is written — this command is read-only.

---

## Constraints

Never mutate anything. Never invent a row not actually returned by the tool.

---

## Definition of Done (for this command's own output)

- The correct tool was called for the given `what:` value
- The rendered rows match exactly what the tool returned
```

- [ ] **Step 2: Verify**

```powershell
cd plugins/claude-proj-agent/commands/execution/allure-commands
if (-not (Test-Path 'allure-custom-project-metadata.md')) { throw 'FAIL: file missing' }
$content = Get-Content allure-custom-project-metadata.md -Raw
foreach ($tool in @('allure_list_projects','allure_list_categories','allure_list_category_matchers','allure_list_layers','allure_list_statuses')) {
    if ($content -notmatch $tool) { throw "FAIL: $tool not referenced" }
}
cd -
Write-Host 'PASS: custom metadata command created'
```

Expected: `PASS: custom metadata command created`.

- [ ] **Step 3: Leave uncommitted**

State in your response that the file was created and is sitting as an uncommitted change.

---

### Task 14: Sync remaining docs (`rules/allure.md` §1, `docs/ci-cd-secrets.md`, `docs/INDEX.md`, root `README.md`)

**Files:**
- Modify: `plugins/claude-proj-agent/rules/allure.md` (§1 only — Task 9's own review surfaced this
  as a real, verifiable gap left between Task 8's `.mcp.json` cutover and Task 9's own §8
  rewrite: neither task's brief owned §1, so it's still stale)
- Modify: `plugins/claude-proj-agent/docs/ci-cd-secrets.md`
- Modify: `plugins/claude-proj-agent/docs/INDEX.md` (only if it references the third-party server
  by name — check before editing; do not add a row if none exists to correct)
- Modify: `README.md` (repo root, only if it references `allure-testops`/the third-party package
  by name in its `bank-proj-marketplace`/dependency catalog table — check before editing)

**Interfaces:**
- Consumes: `rules/allure.md`'s new §8 (Task 9), the final command names (Tasks 10-13).
- Produces: nothing further downstream — documentation sync only.

- [ ] **Step 1: Fix `rules/allure.md` §1's stale third-party server description**

Find this exact text (currently lines 38-40 of the live file — confirm before editing since a
prior task in this same plan already touched this file):

```markdown
  - **`allure-testops`** — a different, third-party MCP server, read-only, scoped to
    launches/results/statistics only. See §8. Do not reach for its test-case-shaped tools for
    anything §3 already covers.
```

Replace with:

```markdown
  - **`allure-testops-custom`** — a self-owned MCP server (ships with this plugin, replacing the
    retired third-party `allure-testops`), read-only, covering Feature/Component/Story/Suite/tag
    group search plus launch/results/statistics/metadata. See §8. Do not reach for its
    test-case-shaped tools for anything §3 already covers.
```

- [ ] **Step 3: Check and update `docs/ci-cd-secrets.md`**

Search for any mention of `allure-testops-mcp`, `uvx`, or the third-party package by name. If
found, update the prerequisite note to describe `uv` (not `uvx`) as the requirement for running
`allure-testops-custom`, removing any third-party-package-specific wording. If no such mention
exists, state that in your report and make no edit.

- [ ] **Step 4: Check and update `docs/INDEX.md` and root `README.md`**

Search both files for `allure-testops` (the third-party name) or `mshegolev`. If either
references it by name (e.g. in a dependency/tool catalog table), update that row to describe
`allure-testops-custom` instead. If neither file mentions it by name, state that in your report
and make no edit — do not invent a row that wasn't there before.

- [ ] **Step 5: Verify**

```powershell
$rulesFile = Get-Content plugins/claude-proj-agent/rules/allure.md -Raw
if ($rulesFile -match 'a different, third-party MCP server') { throw 'FAIL: rules/allure.md Section 1 still describes the retired third-party server' }
if ($rulesFile -notmatch [regex]::Escape('**`allure-testops-custom`**')) { throw 'FAIL: Section 1 not updated to describe allure-testops-custom' }
$secrets = Get-Content plugins/claude-proj-agent/docs/ci-cd-secrets.md -Raw
if ($secrets -match 'allure-testops-mcp') { throw 'FAIL: third-party package still referenced in ci-cd-secrets.md' }
Write-Host 'PASS: rules/allure.md Section 1 and ci-cd-secrets.md both clean of third-party reference'
```

Expected: `PASS: rules/allure.md Section 1 and ci-cd-secrets.md both clean of third-party reference`.

- [ ] **Step 6: Leave uncommitted**

State in your response exactly which of the 4 files in this task's scope were actually changed
(vs. checked-and-left-alone because no third-party reference existed), and that all real changes
are sitting uncommitted.

---

### Task 15: End-to-end live verification

**Files:**
- None created or modified — pure verification, run directly by the controller (no diff for a
  task reviewer to review), mirroring how the model-routing plan's own final task was handled.

**Interfaces:**
- Consumes: everything from Tasks 1-14 (the running server via `.mcp.json`, and the renamed/new
  command files).
- Produces: nothing — this is the plan's final correctness gate.

- [ ] **Step 1: Reconnect and confirm the new server is live**

After Task 8's `.mcp.json` change, the user must run `/mcp` (or restart their session) to connect
`allure-testops-custom` and disconnect the retired `allure-testops`. Confirm via whatever
mechanism surfaces newly available `mcp__plugin_claude-proj-agent_allure-testops-custom__*` tools
in the current session (e.g. a `ToolSearch` query) before proceeding — do not assume it connected
without checking.

- [ ] **Step 2: Compare `allure_search_test_cases` against the method it replaces**

Call `allure_search_test_cases(project_id=2, feature="System Core")` via the new server. Compare
its result set (by id) against a manual full-project scan using
`testops_find_testcases(projectId=2, expand=["custom_fields"])`, paginated through fully,
filtered client-side for `customFields` containing `{"customField":"Feature","name":"System
Core"}` (case-insensitive) — the exact old method `allure-native-list-test-cases.md` used before
Task 10. The two id sets must match exactly. This is the design doc's own §6 testing-plan
requirement — do not skip it.

- [ ] **Step 3: Spot-check the remaining 11 tools once each against real data**

For each of `allure_get_test_case`, `allure_list_field_values`, `allure_refresh_index`,
`allure_list_launches`, `allure_get_test_results`, `allure_search_failed_tests`,
`allure_get_project_statistics`, `allure_list_projects`, `allure_list_categories`,
`allure_list_category_matchers`, `allure_list_layers`, `allure_list_statuses`: call it once with
real/plausible arguments and confirm it returns real data with no exception. Report any tool that
fails — do not silently omit it from the report.

- [ ] **Step 4: Note the command-file verification gap**

The 8 new `allure-custom-*` command files and 10 renamed `allure-native-*` command files cannot
be invoked as live slash commands from within this same session — this session resolves commands
from the installed plugin cache (`${CLAUDE_PLUGIN_ROOT}`), not this git working tree, so a file
renamed/created here is invisible to command resolution until the user reinstalls/refreshes the
plugin (same gap already documented for the model-routing hook's own live-session test). Report
this explicitly as a required manual step for the user after `/create-pr` merges — do not claim
the command files were "verified working" when only their prose content and the underlying tools
were actually checked.

- [ ] **Step 5: Report**

Summarize: which tools were spot-checked and passed, whether the Step 2 comparison matched
exactly, confirm the retired third-party server (`allure-testops`) no longer appears in any tool
listing for this session, and restate Step 4's command-file verification gap for the user.

## Plan self-review notes

- **Spec coverage:** design doc §3.1 (two-tier cache) → Task 5. §3.2 (13-tool table) → Tasks 5-6
  (all 13 named, matched one-to-one). §3.3 (data source split) → Tasks 2-3 (native proxy vs.
  REST). §3.4 (auth/config, `.mcp.json` cutover) → Task 8. Decision D1 (build a real server) →
  the whole plan. D2 (fully retire third-party) → Task 8 Step 1's outright deletion. D3 (source
  lives in this repo) → Task 1's package location. D4 (in-memory per-session two-tier cache) →
  Task 5. D5 (native-proxy + REST-from-reference-source split) → Tasks 2-4, empirically validated
  live during this plan's own writing (not just asserted). D6 (full feature parity) → Task 6's
  launch/results/statistics port. §6 testing plan → Task 15.
  **Mid-plan addition (2026-09-02, user-directed):** full command-file coverage for every
  `allure-testops-custom` tool, plus an `allure-native-`/`allure-custom-` naming split across
  ALL 18 Allure commands (10 renamed, 8 new) → Tasks 10-13. Not part of the original design doc —
  a legitimate scope addition surfaced by the user asking "where do the command wrappers get
  created," confirmed as a real gap (the original plan only edited one existing command file).
- **Placeholder scan:** none found — every step has real, runnable code/content, or (Task 9/14) an
  exact find/replace instruction with an explicit fallback ("if not found, state so and don't
  edit") rather than a vague "update as needed." Task 10's cross-reference fix uses a grep-driven
  systematic search rather than asking the implementer to "find and fix references" blind.
- **Type/name consistency:** tool function names match exactly across `tools/*.py`, `server.py`'s
  registration, `rules/allure.md`'s new §8, the 8 new `allure-custom-*` command files, and Task
  15's verification list — cross-checked at plan-writing time. `ProjectIndex`/`NativeClient`/
  `RestClient` constructor and method signatures are identical everywhere they're consumed across
  Tasks 5-7. Every `allure-custom-*`/`allure-native-*` command name referenced from `rules/allure.md`
  §8 (Task 9) matches exactly what Tasks 10-13 actually create/rename.
- **Known residual, not closeable within this plan:** Task 15 Step 4 documents that the new/
  renamed command files cannot be live-invoked from within the SDD session that builds them (same
  plugin-cache-vs-working-tree gap already hit once for the model-routing hooks) — this is stated
  explicitly rather than glossed over, and surfaces to the user as a required manual post-merge
  check, matching how the model-routing plan's own equivalent gap was handled.
