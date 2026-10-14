# Allure TestOps Rules
## Integration Guidelines

This file is specific to this engagement's Allure instance (`proj-test-automation` / PKF-CBS). The
concrete IDs/values quoted in "Current known configuration" were observed on 2026-08-14 —
re-confirm them live per the method below rather than trusting them blindly.

Owned by the Senior Manual QA persona (`${CLAUDE_PLUGIN_ROOT}/commands/team/manual-qa-agent.md`); used by
`commands/execution/allure-commands/allure-*.md` and, for automation status,
`commands/execution/aqa-commands/aqa-*.md`. This file covers the MCP *mechanics* only — for what a
well-formed case's Tags/Title/Description/Steps/Comments/Custom Fields should actually contain,
with real examples and the recurring mistakes to avoid, see
`docs/allure-test-case-design-standard.md`. Allure TestOps is this project's default test-case
store for the standard pipeline — there is no parallel Excel/Markdown/CSV pipeline that mirrors
the *same* ticket's Allure cases, and nothing in this file should be reconciled against a local
spreadsheet.

**The one explicit exception:** `commands/execution/mqa-commands/mqa-create-local-test-case.md`
is a separately-invoked, fully local path (`.xlsx` + `.csv`, never Allure) for a ticket that
intentionally skips Allure altogether (offline review, client handoff, no Allure project
configured for this engagement). It is mutually exclusive with this file's pipeline per ticket —
never run `allure-native-create-test-case` and `mqa-create-local-test-case` for the same `<TICKET-KEY>`,
and never treat a local xlsx/csv file as something this file's MCP flow needs to sync with.

---

## 1. Instance & Authentication

- On-prem instance for this engagement: `http://allure.proj.local:8090` — the officially documented
  MCP/CI endpoint, plain HTTP, token-authenticated (confirmed with the server operator on
  2026-08-21; see the port note below).
- Two MCP servers are configured in `.mcp.json`, with distinct roles — never conflate them:
  - **`allure-testops-native`** — Allure's own built-in MCP server (available from release
    26.1.1; this instance runs `26.1.1`, confirmed 2026-08-14). This is what §3 below documents;
    it's the tool for every test case / shared step / mute create/update/find/delete.
  - **`allure-testops-custom`** — a self-owned MCP server (ships with this plugin, replacing the
    retired third-party `allure-testops`), read-only, covering Feature/Component/Story/Suite/tag
    group search plus launch/results/statistics/metadata. See §8. Do not reach for its
    test-case-shaped tools for anything §3 already covers.
- **Never hardcode or print the token value in this file, in any command file, or in any output
  you produce.** The token is read from your own `ALLURE_TOKEN` environment variable — `.mcp.json`
  itself only ever holds a `${ALLURE_TOKEN}` placeholder and is a tracked, secret-free file (see
  `docs/ci-cd-secrets.md`). Never read or print `.mcp.json`'s contents in any command's output; if
  you need to confirm a server is reachable, check connectivity/tool listing, not the file's
  contents. In CI, no token is needed for this file's flows — these are Claude Code session-time
  MCP tools, not part of the Playwright suite run in CI.
- **Port note:** `:8443` is nginx's browser-facing HTTPS front (login only, secure-cookie-based) —
  it is **not** meant for MCP/token traffic, even though `/api/mcp` happens to answer through it
  too (nginx proxies the same backend). Its certificate is self-signed with `Basic Constraints:
  CA:FALSE`, which Node/OpenSSL structurally cannot trust as a root no matter how it's re-pinned —
  don't chase `UNABLE_TO_VERIFY_LEAF_SIGNATURE` by re-extracting that cert; point the client at
  `:8090` instead. Use `:8090` everywhere in new work.
- If you're unsure a tool below still matches the live server (version drift, a differently
  configured instance), re-run `tools/list` against `allure-testops-native` and re-check the
  argument shape there before writing a mutating call from stale memory.

---

## 2. Resolving the project id

Unlike the old REST flow, MCP tools take **names**, not numeric IDs, for tags/custom
fields/status/workflow/test layer — there is no more "resolve tree/custom-field IDs" step.
The one thing still worth confirming per session is the numeric `projectId` itself (every MCP
tool requires it as a plain number):

- `allure-testops-native` has no "list projects" tool, but `allure-testops-custom` does
  (`allure_list_projects`, §8). Use the documented `projectId=2` below (already given in
  "Current known configuration" just below). If it's ever wrong, discover the right one via
  `allure_list_projects` or confirm a candidate with `testops_get_project(projectId)` (check the
  returned `name` matches) — neither needs the token handled outside the MCP servers, unlike a
  direct REST call to `GET .../api/rs/project` (which would need the token as a bare
  `Authorization` header, something §1/§7 item 2 forbid ever handling outside `.mcp.json`).
- Feature/Component/Story/Suite **values** (not IDs — these are looked up by name directly in
  MCP calls) are listed by `allure_list_field_values(project_id, field)` on
  `allure-testops-custom` (§8). Before creating a new value, list the existing ones there and
  check for near-duplicates — see §7 item 4. `testops_find_testcases(projectId,
  expand:["custom_fields"], size:<page>)` paging is only the fallback if that server is
  unavailable.

### Current known configuration (TB CBS project — confirm live, don't assume it's unchanged)

| Concept | Value |
|---|---|
| Project | `TB CBS`, `projectId=2` |
| Existing Feature values | Accounts, Customer (Party), Document Management, Financial Accounting, Financial Reporting, Interest and Charges, Limits, Product Factory Core, Security Management, System Core, Teller, Transfers |
| Workflow `Default Manual` statuses (by name, no ID needed anymore) | Draft → Review → Active → Outdated |

---

## 3. MCP Tool Reference

All 13 tools live on the `allure-testops-native` MCP server (`.mcp.json`). Every write tool below
requires the confirmation gate in §7 item 3 before calling it — show the user the exact arguments,
get an explicit go-ahead, every time.

| Purpose | Tool | Notes |
|---|---|---|
| Search/list/get test cases | `testops_find_testcases` | `projectId` required; `aql` optional (see AQL note below); `expand` — use `["scenario","tags","custom_fields","status","layer"]` as needed; paginate via `page`/`size` |
| Create test case | `testops_create_testcase` | `projectId`, `name` required; also `description`, `precondition`, `expectedResult`, `status`, `workflow`, `testLayer` (all by **name**), `tags[]`, `customFields[]` (`{name,value}`, by name), `links[]`, `issues[]`, `testKeys[]`, `members[]`, `parameters[]`, `scenario` |
| Update test case | `testops_update_testcase` | `id` required, everything else optional/partial — **except** `scenario`, which fully replaces the step tree if sent (see §3a), and `tags[]`, treated as full-replace (see §3b) |
| Delete test case | `testops_delete_testcase` | `{id}` only — soft-delete, **no `force`/permanent option exists on this tool** |
| Restore test case | `testops_restore_testcase` | `{id}` only |
| Create shared step | `testops_create_sharedstep` | `projectId`, `name` required; `scenario` optional (same tree shape, `body`/`attachment` steps only — no `shared` nesting inside a shared step) |
| Update shared step | `testops_update_sharedstep` | `id` required, same optional fields as create |
| Find shared steps | `testops_find_sharedsteps` | `projectId` required, `aql`/`page`/`size`/`sort`/`expand` (`["scenario","project","all"]`) |
| Search test results | `testops_find_testresults` | Result-level, not launch-level — see §8 for launch/statistics needs instead |
| Mute a test case | `testops_create_mute` | `testCaseId`, `name` required; `reason` optional (markdown) |
| Unmute | `testops_delete_mute` | `{id}` (the mute's own id, not the test case id) |
| Project details | `testops_get_project` | Optional `expand` (`customFieldDefinitions`, `workflows`, `testLayers`, `integrations`, ...) — returns field **definitions**, not each field's already-used values (see §2/§7 item 4 for the value-level anti-duplicate check) |
| Issue tracker lookup | `testops_get_issue_details` | Fetch linked Jira/etc. issue data by key |

**AQL note:** confirmed-working predicates on `testops_find_testcases`/`testops_find_sharedsteps`:
`tag = "value"`, `status = "value"`, `id = <n>` (confirmed live during the migration's Task
8/11 validation), combinable with `and` (`tag = "TB-1306" and status = "Draft"`). `name = "value"`
is also confirmed-working **for test cases** (confirmed live) — but this was **not** separately
confirmed for shared steps (`testops_find_sharedsteps`); `allure-native-create-shared-step.md` and
`allure-native-find-shared-steps.md` both rely on `name =` working there too, and that specific case was
never live-tested, so treat it as unconfirmed until it is. Direct custom-field equality (e.g.
`Feature = "Accounts"`, and the `"Feature"`/`customField.Feature`/`cf.Feature` variants) and
`automated = false` all failed (`Tool execution failed: null`) when tried against this instance on
2026-08-14. **Never guess a custom-field or `automated` AQL predicate** — fetch a broader result
with `expand:["custom_fields"]` and filter client-side on the returned `customFields[]`/
`automated` values instead.

### 3a. Reading and editing the step tree

There is **no single-step MCP tool** (no equivalent of the old REST `POST/PATCH/DELETE
/api/testcase/step`). Every step-level change is a read-modify-write on the whole tree:

1. `testops_find_testcases(projectId, aql:"id = <id>", expand:["scenario"])` — the response's
   `scenario.steps[]` is the *exact same shape* `testops_update_testcase`'s `scenario` argument
   expects: `{"type":"body","body":"...","expectedResultSteps":[{"type":"expected_body",
   "body":"..."}]}`, flat array with nested `steps`/`expectedResultSteps` for grouped/multi-part
   steps. Confirmed live against case id 89 on 2026-08-14.
2. Edit the target step's `body`/`expectedResultSteps` (or add/remove/reorder an entry) in that
   array, in memory.
3. `testops_update_testcase({id, scenario: {steps: <the whole edited array>}})` — this **replaces
   the entire step tree**, so the array you send must be complete, not just the changed step.
4. Re-fetch (`expand:["scenario"]` again) and diff against what you intended to confirm nothing
   else moved/dropped.

A same-case concurrent edit between steps 1 and 3 would be silently overwritten by whichever write
lands last — accepted, since this is a single-operator-per-ticket, chat-driven workflow, not a
multi-user concurrent editor.

### 3b. Tags are full-replace

Treat `tags[]` on both `testops_create_testcase` and `testops_update_testcase` as a **full
replace** of the case's tag set — confirmed live on 2026-08-14 during this migration's
validation: a two-part test on a disposable case (sending old+new tags together was inconclusive,
but sending only a new tag caused the old tags to be dropped) confirmed full-replace behavior.
Before any tag-adding
update, fetch current tags (`testops_find_testcases(aql:"id = <id>", expand:["tags"])`) and send
the union, never just the tags being added — the ticket-traceability tag (§6) and Test
level/Test type tags (§4) must never be silently dropped by an unrelated tag update.

---

## 4. Column → Allure Field Mapping

Maps `manual-qa-agent.md`'s "Required Test Case Table Format" columns onto this Allure project's
actual model. That file is the single definition of the format (12 columns: No., Story, Test
level, Test type, Short Description, Preconditions, Steps to reproduce, Test Data, Expected
Results, Rule&AC, State, Modules / Sub-Modules); this table only maps them. Field mechanics (which MCP param, tag casing) live here; the content bar for what
each field should actually contain lives in `docs/allure-test-case-design-standard.md` — read that
file for the worked examples behind every row below.

| xlsx column | Allure field |
|---|---|
| No. | Allure's own `id` / test key — don't invent parallel numbering |
| Story | `customFields: [{"name":"Story","value":"<bare Story title, no US-XX.YY.ZZ prefix>"}]` — see `docs/common-issues/allure-testops/allure-story-field-no-id-prefix.md` |
| Test level (`Component`/`Integration`) | **Tag** (e.g. `component`, `integration`) — no dedicated custom field exists for this |
| Test type (`API`/`UI`/...) and content category (`Positive`/`Negative`/`Edge`/`Regression`/`Smoke`/`E2E`) | **Tags** — plus, for Smoke/Regression, an additional milestone-scoped tag (`smoke_m1`/`smoke_m2`/`regression_m1`/`regression_m2`) alongside the Title Case content tag, never replacing it — see `docs/allure-test-case-design-standard.md` §1 |
| Short Description | `name` — short, plain, human-readable statement of the behavior under test (see `docs/allure-test-case-design-standard.md` §2) |
| Preconditions | `description`, as a `Preconditions:` block — confirmed as the field this project's own cases actually use for this content (2026-08-27); see `docs/allure-test-case-design-standard.md` §3. The `precondition` MCP param documented in §3's tool table exists but is not what's populated for this content per current confirmed practice — re-verify against the live UI before relying on it for anything else |
| Steps to reproduce | `scenario.steps[]` — see §3a for read/edit mechanics, and `docs/allure-test-case-design-standard.md` §4 for the one-action-per-step-node content rule |
| Expected Results | Per-step `expectedResultSteps` entries within `scenario.steps[]`, one per step node — never one shared Expected Result covering more than one action (see `docs/allure-test-case-design-standard.md` §4) |
| Rule&AC | No native traceability field — embed as a `**Rule&AC:** ...` block in `description`, physically **after** the Preconditions block (never interleaved), plus a `links: [{"name":"Jira","url":"<ticket URL>"}]` entry when the ticket URL is known |
| Test Data | No separate field — it is already part of each `{"type":"body","body":"..."}` scenario step body (§3a) |
| Modules / Sub-Modules | A dedicated custom field (confirm/create it per §7 item 4's near-duplicate check before first use) — never folded into `description` or the `Story` field |
| State | **Out of scope for these commands.** This is an execution-result concept (Launch/TestResult), not a Test Case field |
| (not an xlsx column, but required by Allure) Feature/Component | `customFields: [{"name":"Feature","value":"..."}, {"name":"Component","value":"..."}]` — Feature is the case's top-level tree module (match a sibling case's value, don't infer from the ticket alone); Component is **always** populated with the specific module the Story lives under, never left empty — see `docs/allure-test-case-design-standard.md` §6 |

**Legacy data note (confirmed by sampling pre-existing cases via the API):** many of the
pre-existing cases (e.g. the original 98 under "System Core") don't populate
`scenario.steps`/`expectedResultSteps` at all — the entire case (preconditions, steps, and
expected results together) is crammed into one `description` blob, most likely an artifact of a
bulk CSV-style import. This is different from, and should not be confused with, the current
confirmed convention above of deliberately using `description` for the Preconditions block only,
with Steps/Expected Results still going into the real `scenario.steps`/`expectedResultSteps` tree.
Some later-imported cases (e.g. id 89, `TC-021`) *do* have real, correctly populated
`scenario`/`customFields` (confirmed live, 2026-08-14) — don't assume every existing case is
legacy-shaped; check before rendering.

**New cases created by `allure-native-create-test-case`/`allure-native-update-test-case` always use `description`
for Preconditions (+ trailing Rule&AC block) and the dedicated `scenario.steps`/
`expectedResultSteps` tree for Steps/Expected Results, never the legacy all-in-`description` blob
that also swallows Steps** — do not "match" the legacy style when creating new cases.

---

## 5. Versioning — use Allure's native history, don't invent a parallel scheme

A live Allure test case already has version history — every `testops_update_testcase` call is
itself a new version. **Do not create a parallel `vN` naming/tagging scheme for Allure test
cases** — updating a case via `testops_update_testcase` *is* the correct "next version." The only
thing versioned outside Allure is `docs/test-cases/<TICKET-KEY>/analysis.md`, and even that is a
single evolving file with its own `## Changelog` section, never a `vN` file series.

---

## 6. Ticket traceability — the tag convention

Every case created for a ticket must carry a **tag equal to the literal ticket key** (e.g.
`TB-1306`) — this is how `allure-native-list-test-cases`/`allure-native-update-test-case`/`aqa-automate` find
"every case belonging to this ticket" later (`testops_find_testcases(aql:"tag = \"TB-1306\"")`).
Always set it on create, never rename it, and always filter by it before assuming a ticket has (or
hasn't) already been covered.

---

## 7. What Claude must check before mutating anything here

1. Resolve `projectId` live per §2 — never carry a numeric id over from a previous session or
   another project without re-confirming it.
2. Never read or print `.mcp.json`'s contents (which now holds the literal token) in any output.
3. Before any write tool call (`testops_create/update/delete/restore_testcase`,
   `testops_create/update_sharedstep`, `testops_create/delete_mute`), show the user the exact tool
   name and arguments and get explicit confirmation — this is live, shared team infrastructure
   with no throwaway-file safety net the way a mistaken xlsx write would have.
4. Before creating a new Feature/Component/Story/Suite custom-field value, list the existing
   values via `allure_list_field_values(project_id, field)` (`allure-testops-custom`, §8) and
   check for near-duplicates — don't create `"Login"` next to an existing `"login"` or
   `"Log In"`. Fallback only when that server is unavailable: scan
   `testops_find_testcases(projectId, expand:["custom_fields"])` (paged) and check the returned
   `customFields[].value` values.
5. Never delete a test case to reflect a requirement change — that's what the `Outdated` workflow
   status is for (see `allure-native-update-test-case.md`). `testops_delete_testcase` is reserved for
   genuine duplicates/mistakes, and even then is always a soft-delete (no permanent-delete option
   exists on this tool at all).

---

## 8. `allure-testops-custom` MCP — group search, launch/results/statistics, and metadata

`.mcp.json`'s `allure-testops-custom` entry (a self-owned package under
`mcp-servers/allure-testops-custom/`, replacing the retired third-party `allure-testops` —
see `docs/architecture/allure-testops-custom-migration/2026-09-01-allure-testops-custom-design.md`) provides 13 read-only tools
in three groups:

**Test-case group search/lookup** (backed by `allure-testops-native`'s own MCP tools, via an
in-memory per-session cache — never a per-query full-project fetch):
- `allure_search_test_cases(project_id, feature?, component?, story?, suite?, tag?, status?,
  automated?)` — wrapped by `/claude-proj-agent:execution:allure-commands:allure-custom-search-test-cases`, the
  command every Feature/Component/Story/Suite group-search now goes through (§3's
  `testops_find_testcases` is still the right tool for everything AQL-capable —
  `/claude-proj-agent:execution:allure-commands:allure-native-list-test-cases`'s `tag:`/`status:`/`ticket:` filters).
- `allure_get_test_case(project_id, test_case_id)` — single test case full detail; no dedicated
  custom command wraps this (redundant with
  `/claude-proj-agent:execution:allure-commands:allure-native-get-test-case`, which already calls native directly
  for the same result) — call the native command for single lookups.
- `allure_list_field_values(project_id, field)` — wrapped by
  `/claude-proj-agent:execution:allure-commands:allure-custom-list-field-values` — use before creating a new
  Feature/Component/Story/Suite value, replacing the old "scan `testops_find_testcases` for
  near-duplicates" manual workaround (now only a fallback, §7 item 4).
- `allure_refresh_index(project_id)` — wrapped by
  `/claude-proj-agent:execution:allure-commands:allure-custom-refresh-index` — force a fresh rebuild if cases
  changed mid-session.

**Launch/results/statistics** (direct REST, no native MCP equivalent exists) — back
release-readiness and coverage-trend questions (the AQA Lead persona's "Release Readiness
Checklist"):
- `allure_list_launches` → `/claude-proj-agent:execution:allure-commands:allure-custom-list-launches`
- `allure_get_test_results` → `/claude-proj-agent:execution:allure-commands:allure-custom-get-test-results`
- `allure_search_failed_tests` → `/claude-proj-agent:execution:allure-commands:allure-custom-search-failed-tests`
- `allure_get_project_statistics` → `/claude-proj-agent:execution:allure-commands:allure-custom-get-project-statistics`

**Project metadata** — `allure_list_projects`/`allure_list_categories`/
`allure_list_category_matchers`/`allure_list_layers`/`allure_list_statuses`, all wrapped by one
combined command, `/claude-proj-agent:execution:allure-commands:allure-custom-project-metadata what:<kind>`.

Read-only by design, same posture as the server it replaces — every write path this project
needs still goes through `allure-testops-native` (§3, its commands now all prefixed
`allure-native-`), unchanged.

### Configuration

- `.mcp.json`'s entry runs the package under `mcp-servers/allure-testops-custom/` via `uv run`
  (no `uvx`/PyPI dependency — ships with this plugin). Auth reuses the same
  `ALLURE_URL`/`ALLURE_TOKEN` as `allure-testops-native`.
- Requires `uv` (Python 3.10+) installed locally — see `docs/ci-cd-secrets.md`'s "Prerequisites
  beyond Node/npm". Not needed in CI.

---

## 9. `playwright` MCP — visual UI inspection, not a third data path

`.mcp.json`'s `playwright` entry (`npx @playwright/mcp@latest`, no auth/secret) gives Claude a
real, driveable browser. It is **not** a third way to read or write Allure data — it never
touches the tools §3/§8 already cover, and it must never be used to work around AQL/field
limitations those sections document. Its only purpose here is visual/UX inspection of a
**rendered** Allure report, in either of two forms:

- **The live TestOps instance's UI** (`http://allure.proj.local:8443` — the browser-facing,
  login-based front; unlike §1's port note, this *is* the right port here, since a real browser
  handles the self-signed cert/login the way MCP/token traffic can't) — for an ad-hoc visual
  check of a specific case/launch already in TestOps.
- **A local, generated HTML report** (`allure-results/` → `npx allure-commandline generate` →
  `npx allure-commandline open`, from a real `proj-test-automation` Playwright run) — the primary
  use case, wrapped by `/claude-proj-agent:execution:allure-commands:allure-review-report`
  (`commands/execution/allure-commands/allure-review-report.md`, owned by the Senior Full Stack
  AQA Engineer per `fullstack-aqa-agent.md`'s "Test report structure and readability" — it owns
  the `allure.step()`/`allure.attachment()` automation code this review is actually about, unlike
  the QA Test Automation Lead's separate reporting-*strategy* boundary): walks every tab, a sample
  of tests, and their step tree/attachments, and reports Usability/Structure/Architecture findings
  cited to what was actually seen on screen.

Either way, this checks how a step tree actually nests, how an attachment is presented next to
its step, or whether a report reads clearly — as input to a reporting/traceability design
recommendation (test structure, step granularity, attachment placement). It reports back what a
human reviewer would see; it does not replace `testops_find_testcases`/`allure_get_test_results`
for anything data-shaped, and never mutates a test case — every write still goes through §3's
`allure-testops-native` tools with the same confirmation gate (§7 item 3). A finding that implies
a `proj-test-automation` code change (e.g. how `allure.step()`/`allure.attachment()` is called) is
reported as a recommendation first; `allure-review-report` implements it directly (it's run as
Full Stack AQA, who owns that code) only once the user explicitly asks for that specific fix.

Not Allure-specific: this is a generic browser tool, usable for any other web UI a task needs
inspected visually. This section only documents the two recurring uses for this project.
