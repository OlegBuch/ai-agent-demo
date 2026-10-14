# `allure-testops-custom` — a self-built MCP server replacing the third-party `allure-testops` — design

- **Status:** Implemented (mcp-servers/allure-testops-custom/ exists and is wired in .mcp.json)
- **Date:** 2026-09-01
- **Owner:** AI Architect (framework meta-role)
- **Scope:** `proj-ai-agentic` only — new `plugins/claude-proj-agent/mcp-servers/allure-testops-custom/`
  Python package, `.mcp.json` (retire the third-party `allure-testops` entry, add
  `allure-testops-custom`), `rules/allure.md` (retire §8, add the new server's own reference
  section), `commands/execution/allure-commands/*.md` (point at the new tools where they solve a
  problem the old ones couldn't), `docs/ci-cd-secrets.md` (prerequisites), `docs/INDEX.md`,
  `README.md`. No change to `proj-test-automation` — tooling/process only.
- **Related, explicitly out of scope for this spec:** the model-routing enforcement subsystem
  (separate, already-implemented spec/plan) and the agent/skill execution-transparency subsystem
  (separate, upcoming spec) are not addressed here.

## 1. Problem

`allure-testops` (`.mcp.json`, `uvx --from allure-testops-mcp`) is a third-party package
([`mshegolev/allure-testops-mcp`](https://github.com/mshegolev/allure-testops-mcp)) providing 13
read-mostly tools. Its test-case-shaped tools (`allure_get_test_case`, `allure_list_test_cases`,
`allure_get_test_case_custom_fields`, `allure_list_custom_fields`) are explicitly documented in
`rules/allure.md` §8 as **not** to be used for anything the built-in `allure-testops-native`
server already covers — but neither server can filter test cases by a custom field (Feature/
Component/Story) server-side: `testops_find_testcases`'s AQL rejects `Feature = "..."`-shaped
predicates (confirmed failing, `rules/allure.md` §3's AQL note), so the only existing path —
`commands/execution/allure-commands/allure-list-test-cases.md`'s `feature:`/`suite:`/`story:`
filters — fetches the **entire project** (currently 3004 cases per this session's own live,
unfiltered probe of `testops_find_testcases` — up from `rules/allure.md`'s last-recorded
~1915/1827, both of which were themselves filtered subsets rather than the true project total;
confirm live rather than trusting any of these three figures going forward) and filters
client-side on every single invocation. This is slow,
burns tokens/context on every repeated group-search, and the user explicitly wants it fixed by
a purpose-built server rather than a smarter client-side cache dressed up as a slash command
(considered and rejected during brainstorming — see Decision D1).

Separately, the third-party server's 4 launch/results/statistics tools
(`allure_list_launches`/`allure_get_test_results`/`allure_search_failed_tests`/
`allure_get_project_statistics`) are the **only** path to that data (`rules/allure.md` §8: native
covers result-level via `testops_find_testresults`, never launch-level). Retiring the third-party
server wholesale — the user's explicit direction — means this capability must be re-homed, not
dropped, or the AQA Lead's Release Readiness Checklist loses its data source.

## 2. Verified facts (live probe, this session, 2026-09-01 — re-verify if this doc is >1 sprint old)

- `allure-testops-native`'s actual working endpoint is `http://allure.proj.local:8090/api/mcp`
  (plain HTTP) — confirmed live. The third-party `allure-testops` entry in `.mcp.json` was
  **still pointed at the broken `https://…:8443`** port (the same root cause already fixed for
  `allure-testops-native` per this session's own memory record) — fixed to `:8090` mid-session to
  unblock this probe; that fix stands regardless of this spec's outcome.
- **Decision D5's core assumption is empirically confirmed, not just plausible.** A raw
  `Invoke-RestMethod` HTTP POST (no Claude-Code-specific machinery) to
  `http://allure.proj.local:8090/api/mcp` with a JSON-RPC 2.0 body successfully completed
  `initialize`, `tools/list`, and `tools/call` (`testops_find_testcases`) — same response shape
  as calling it through Claude Code's own MCP client. The protocol is stateless (no session id
  returned or required across requests); auth is exactly the `Authorization: api-token <token>`
  header already used by `.mcp.json`'s existing entry. A Python `httpx` client can replicate this
  directly — confirmed live, 2026-09-01, not assumed.
- `testops_get_project(id: 2, expand: ["custom_fields"])` → project `"TB CBS"`, and
  `customFields` comes back as a **flat array of names only**
  (`["Suite","Component","Story","Feature","Epic"]`) — no ids, no types, no required flags. A
  field's numeric id (negative, per the third-party server's own tool docs) is **not** obtainable
  from this native endpoint; only from the third-party server's `allure_list_custom_fields` (not
  independently confirmed live this session — its connection was flaky, see below).
- `testops_find_testcases(projectId: 2, expand: ["scenario","tags","custom_fields","status",
  "layer"])` → paginated response (`content[]`, `pageable`, `totalPages`, `totalElements`, …).
  Each case's `customFields` is `[{"name": "<value>", "customField": "<field name>"}]` — e.g.
  `{"name":"System Core","customField":"Feature"}`. **This is the inverse key convention from
  `rules/allure.md` §4's documented *write* shape** (`customFields:[{"name":"Feature",
  "value":"..."}]`, where `name` = field name and `value` = the value) — reading and writing use
  different key semantics for the same concept. Any code built against this data must not assume
  the read and write shapes share a convention.
- `scenario.steps[]` shape confirmed: `{type, body, bodyJson (ProseMirror doc), expectedResultSteps[]}`,
  matching the shape already documented in `rules/allure.md` §3a.
- AQL tag search reconfirmed working live: `aql: 'tag = "Regression"'` against project 2 returned
  `totalElements: 1827`, all matching cases genuinely tagged `Regression`.
- The third-party `allure-testops` server's own tools (`allure_list_projects`,
  `allure_list_custom_fields`, `allure_get_test_case_custom_fields`) **could not be reached this
  session** even after the URL fix and a manual `/mcp` reconnect (native reconnected fine, the
  third-party server did not) — connectivity to it is flaky/unreliable independent of the URL
  fix. This is itself a data point in favor of retiring it (Decision D2), not just the missing
  group-search capability.
- **Security incident, corrected mid-session:** an early data-gathering subagent printed the raw
  `ALLURE_TOKEN` value in its report because its dispatch prompt didn't forbid it. The token
  should be treated as exposed and rotated — flagged to the user; not this spec's action item to
  track further, but recorded here so the implementation plan's dispatches all carry an explicit
  "never print any token/credential value" instruction (see Global Constraints in the plan).

## 3. Architecture

```
plugins/claude-proj-agent/mcp-servers/allure-testops-custom/
  pyproject.toml              — uv-managed package, entry point `allure-testops-custom`
  src/allure_testops_custom/
    __init__.py
    server.py                 — MCP server entry point (stdio transport, official `mcp` SDK)
    native_client.py          — thin HTTP JSON-RPC client calling allure-testops-native's own
                                 /api/mcp endpoint (reuses ALLURE_URL/ALLURE_TOKEN)
    rest_client.py             — direct Allure REST client for launch/results/statistics only
                                 (endpoints confirmed during implementation by reading the
                                 third-party package's own source — see Decision D5)
    index.py                  — the two-tier in-memory cache (lightweight per-project index +
                                 on-demand full-detail fetch)
    tools/
      test_cases.py           — allure_search_test_cases, allure_get_test_case,
                                 allure_list_field_values, allure_refresh_index
      launches.py             — allure_list_launches, allure_get_test_results,
                                 allure_search_failed_tests, allure_get_project_statistics
      metadata.py              — allure_list_projects, allure_get_project_statistics (shared),
                                 allure_list_categories, allure_list_category_matchers,
                                 allure_list_layers, allure_list_statuses
  tests/
    test_index.py              — cache-layer unit tests (fixture data, no live Allure calls)
    test_tools.py              — tool-handler unit tests against mocked native_client/rest_client
```

Ships **inside this plugin**, versioned with the commands/docs that depend on it (Decision D3) —
no external package registry, no separate git repository to keep in sync.

### 3.1 Two-tier cache (`index.py`)

Per-`project_id`, in-memory, built lazily on first use, lives for the Python process's lifetime
(one process per Claude Code session, since `.mcp.json` spawns it fresh per session — Decision
D4):

1. **Lightweight index** — one paginated sweep of `testops_find_testcases(projectId,
   expand:["tags","custom_fields"])` (no `scenario` — the heavy field), storing per case only
   `id`, `name`, `status`, `layer`, `automated`, `tags[]`, and the `customFields[]` array as-is.
   For ~3000 cases (confirmed project size, §2) this is roughly 2-3MB of process memory — a non-issue; the point of this
   tier is never memory size, it's avoiding a full-project re-fetch on every query within the
   same session.
2. **On-demand full detail** — `allure_get_test_case` and any result set that needs full content
   fetches `testops_find_testcases(aql:"id = <id>", expand:["scenario", …])` per matched id, not
   for the whole project. Only what actually gets returned to the caller is ever fetched at full
   size — the index never holds `scenario`/`description` for cases nobody asked about.

`allure_search_test_cases` filters entirely against the lightweight index (Feature/Component/
Story/Suite via `customFields[].customField`+`.name`, case-insensitive; `tag` via `tags[]`;
`status`/`automated` via their own fields) — every filter combination is one in-memory pass, no
further Allure round-trip once the index is built. `allure_refresh_index(project_id)` drops and
rebuilds that project's index on demand, for the rare mid-session "cases changed, I need fresh
data" case.

### 3.2 Tool surface (13 tools — matches the retired server's own count, not by design, just where
the real capability landed)

| Tool | Backed by | Replaces / new |
|---|---|---|
| `allure_search_test_cases(project_id, feature?, component?, story?, suite?, tag?, status?, automated?, page?, size?)` | lightweight index | **New** — the actual missing capability |
| `allure_get_test_case(project_id, test_case_id, include_scenario=true)` | native, on-demand full fetch | Replaces third-party's `allure_get_test_case` |
| `allure_list_field_values(project_id, field)` | lightweight index (distinct values) | **New** — closes `rules/allure.md` §7 item 4's manual near-duplicate scan |
| `allure_refresh_index(project_id)` | index rebuild | **New** — cache control |
| `allure_list_projects()` | native `testops_get_project`/REST | Replaces third-party |
| `allure_get_project_statistics(project_id)` | REST (§3's `rest_client.py`) | Replaces third-party |
| `allure_list_categories(project_id)` | REST | Replaces third-party |
| `allure_list_category_matchers(project_id, category_id)` | REST | Replaces third-party |
| `allure_list_layers(project_id)` | REST | Replaces third-party |
| `allure_list_statuses(project_id)` | REST | Replaces third-party |
| `allure_list_launches(project_id, page?, size?)` | REST | Replaces third-party |
| `allure_get_test_results(launch_id, status?, page?, size?)` | REST | Replaces third-party |
| `allure_search_failed_tests(project_id, page?, size?)` | REST | Replaces third-party |

`allure_get_test_case_custom_fields`/`allure_list_custom_fields`/`allure_list_test_cases`/
`allure_create/update/delete_test_case` (the third-party's other tools) are **not** ported
individually — their capability is subsumed by `allure_search_test_cases`/`allure_get_test_case`
(read side) or was never legitimately this server's job to begin with (write side stays on
`allure-testops-native` per `rules/allure.md` §3, unchanged by this spec).

### 3.3 Data source split

- **Test-case tools** (`allure_search_test_cases`, `allure_get_test_case`,
  `allure_list_field_values`, `allure_refresh_index`) call `native_client.py`, which is a thin
  HTTP JSON-RPC client speaking MCP's own wire protocol directly to
  `allure-testops-native`'s already-working `http://allure.proj.local:8090/api/mcp` endpoint
  (`tools/call` → `testops_find_testcases`/`testops_get_project`). This reuses proven,
  already-authenticated, already-shape-confirmed machinery instead of reverse-engineering a
  parallel raw-REST path for data we already know how to get correctly (Decision D5).
- **Launch/results/statistics/metadata tools** call `rest_client.py`, a direct Allure REST client
  — necessary because native's MCP tools don't cover launch-level data at all
  (`testops_find_testresults` is result-level only, `rules/allure.md` §3). Exact endpoint
  paths/params are **not yet confirmed** by this spec — Task 1 of the implementation plan reads
  the retired third-party package's own (open source, MIT-or-similar per its GitHub listing)
  source to extract the working endpoint shapes it already relies on, rather than guessing or
  probing blind (Decision D5).

### 3.4 Auth/config

Reuses the exact `ALLURE_URL`/`ALLURE_TOKEN` env-var convention already established for both
existing servers — no new secret, no new config surface. `.mcp.json`'s new entry:

```json
"allure-testops-custom": {
  "command": "uv",
  "args": ["run", "--directory", "${CLAUDE_PLUGIN_ROOT}/mcp-servers/allure-testops-custom",
            "allure-testops-custom"],
  "env": {
    "ALLURE_URL": "http://allure.proj.local:8090",
    "ALLURE_TOKEN": "${ALLURE_TOKEN}"
  }
}
```

The third-party `allure-testops` entry is deleted outright (Decision D2) — not commented out, not
left as a disabled fallback.

## 4. Decisions

- **D1 — Build a real MCP server, not a client-side cache dressed up as a slash command.**
  Raised as the AI Architect's own initial recommendation (a lighter, no-new-runtime cache file
  driven by markdown commands) and explicitly overridden by the user, who wants full parity with
  what a real server can do (proper tool schema, reusable across every command, not re-derived
  per markdown file) and was already burned once by an under-scoped fix (the `:8443`/`:8090` port
  incident this exact session re-discovered on the *third-party* server, having only been fixed
  on `allure-testops-native` previously). Approved 2026-09-01.
- **D2 — Fully retire the third-party server, no fallback period.** The third-party server's own
  connectivity proved flaky independent of the port fix during this session's own probing — a
  second, concrete reason beyond the user's stated preference to not keep two overlapping Allure
  MCP servers alive.
- **D3 — Source lives inside this repo** (`plugins/claude-proj-agent/mcp-servers/`), not a
  separate git repository — ships and versions with the commands/docs that depend on it, no
  external package registry to publish to or keep in sync.
- **D4 — In-memory, per-session, two-tier cache** (lightweight index + on-demand full detail),
  not a persisted-to-disk cache. Chosen specifically to answer the user's own concern about
  memory/context cost: the *lightweight* index (id/name/tags/customFields only, no
  scenario/description) keeps the one unavoidable full-project sweep (Allure has no server-side
  custom-field filter — confirmed, see §1) cheap in the server process's own memory (~2-3MB),
  while what actually reaches the LLM/conversation is always just the matched subset at full
  detail — the two costs (process memory vs. conversation tokens) are independent, and this
  design keeps both small. No cross-session staleness risk since nothing persists past the
  process's lifetime.
- **D5 — Test-case tools proxy `allure-testops-native` over its own MCP endpoint; only launch/
  results/statistics call raw REST, and only after reading the retired third-party package's own
  source for the exact endpoint shapes.** Avoids two separate risks: reverse-engineering
  test-case REST endpoints we already have a proven path to (native), and guessing launch/stats
  REST endpoints blind when a working, open-source reference implementation already exists and is
  being retired anyway. The proxy-to-native half of this is not a plausibility argument — it was
  empirically verified live in this session (§2): a plain HTTP JSON-RPC client, no Claude-Code
  machinery, successfully drove `initialize`/`tools/list`/`tools/call` against
  `allure-testops-native`'s own endpoint and got back the exact data shape already confirmed
  elsewhere in this doc.
- **D6 — Full feature-parity port, not a narrower "test-case tools only" cut.** The user
  explicitly wants launch/results/statistics tools carried over too, since the third-party server
  is being fully removed and the AQA Lead's Release Readiness Checklist depends on that data.
  Approved 2026-09-01.

## 5. Non-goals

- Does not change `allure-testops-native`'s own role (write path stays there, unchanged,
  `rules/allure.md` §3-§7 untouched in substance).
- Does not add write/mutating capability to `allure-testops-custom` — it is read-only, same as
  the server it replaces (`rules/allure.md` §8's `ALLURE_ENABLE_WRITE` note doesn't carry over
  since this isn't that package, but the read-only *posture* is deliberately kept).
- Does not touch the model-routing subsystem or the (upcoming) transparency subsystem — separate
  specs.
- Does not resolve the exact REST endpoint paths for launch/results/statistics in this document —
  that is Task 1 of the implementation plan, a scoped spike reading the third-party package's own
  source, not guesswork baked into this design.

## 6. Testing plan

- Unit tests (`tests/test_index.py`, `tests/test_tools.py`) against fixture data / mocked
  `native_client`/`rest_client` — no live Allure dependency, runnable in CI-less local dev via
  `uv run pytest`.
- One live smoke pass per tool against the real instance during implementation (mirroring how
  `allure-testops-native`'s own tools were smoke-tested during its migration, per
  `docs/architecture/2026-08-14-allure-testops-mcp-migration-design.md` §7) — write tools are not
  in scope (read-only server), so this is exclusively read-path verification.
- A final live comparison: run `allure_search_test_cases(project_id=2, feature="System Core")`
  and manually cross-check its result set against the same filter applied by hand to a
  `testops_find_testcases` full-project dump — confirms the index-based filtering produces
  identical results to the (slow, existing) client-side-scan method it replaces, before that
  older method is removed from `allure-commands/allure-list-test-cases.md`.
