# Allure TestOps Built-in MCP Migration Implementation Plan

> **Superseded 2026-09-01** by `2026-09-01-allure-testops-custom-plan.md` — the built-in
> `/api/mcp` approach planned here was abandoned in favor of a self-built `allure-testops-custom`
> MCP server; kept for historical record, not as a current plan. Do not execute this plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `allure-commands/`'s REST-based Allure TestOps integration with the now-working
built-in MCP server for test-case/shared-step/mute CRUD, add the two new coverage gaps
(module/story-search + inline-pasted-case automation in `aqa-automate`), and keep every doc/index
in this plugin honest about the new shape.

**Architecture:** `.mcp.json` gains a second Allure server (`allure-testops-native`, the built-in
`/api/mcp`) alongside the existing third-party `allure-testops` (kept, narrowed to
launches/statistics). `rules/allure.md` becomes the MCP tool reference. The five existing
`allure-commands/*.md` files keep their names/arguments/Mission/Output/Constraints and swap only
their internal REST calls for MCP tool calls. Five new `allure-commands/*.md` files cover shared
steps/mutes. `aqa-automate.md` gains two new invocation modes.

**Tech Stack:** Markdown command/persona files (prompt engineering, no application code). "Tests"
in this plan are (a) re-reading a file to confirm it's internally consistent and free of stale
REST references, and (b) explicit, user-approved **live** MCP tool calls against the real Allure
TestOps instance — never simulated.

**Spec:** `plugins/claude-proj-agent/docs/architecture/2026-08-14-allure-testops-mcp-migration-design.md`
(D1–D8, §1–§8) — this plan implements it task-by-task; read both together.

## Global Constraints

- Scope is `proj-ai-agentic` (this plugin) only. Never touch `proj-test-automation`.
- Work only inside the resolved `proj-ai-agentic` git working tree
  (`C:\Users\user\proj-ai-agentic`), never `${CLAUDE_PLUGIN_ROOT}` (the read-only plugin cache).
- After each task, leave the changed files as **uncommitted** changes and say so — do not `git
  add`/`git commit` per task. The whole session's work becomes one PR via `/create-pr`, run by the
  user explicitly at the end — not part of this plan's tasks.
- No AI/Claude/Anthropic self-attribution anywhere this plan's work could surface later
  (irrelevant to this plan's own file edits directly, but never introduce commit-message drafts
  or code comments that violate it if a task happens to suggest one).
- Every write MCP tool call (`testops_create/update/delete/restore_testcase`,
  `testops_create/update_sharedstep`, `testops_create/delete_mute`) shown to the user with its
  exact arguments, with explicit go-ahead required before the call — in both the command-file
  prose being written **and** in this plan's own live-validation tasks (D2).
- `.mcp.json` (real, local, gitignored) never has its contents printed in any command output;
  `.mcp.json.example` (committed) never contains a real token.
- Tags via MCP (`tags[]` on `testops_create_testcase`/`testops_update_testcase`) are treated as
  full-replace: always fetch current tags first (`testops_find_testcases` with
  `expand:["tags"]`) and send the union — until Task 8's live validation proves otherwise (D8).
- No MCP tool edits a single scenario step in place. Any step-level change is: fetch full
  scenario (`testops_find_testcases`, `expand:["scenario"]`) → edit the returned array in memory →
  send the complete revised array back via `testops_update_testcase`'s `scenario` (D7).
- Confirmed-working AQL predicates on `testops_find_testcases`: `tag = "value"`,
  `status = "value"`, combinable with `and` (e.g. `tag = "api" and status = "Active"`). **Not**
  confirmed working: direct custom-field equality (`Feature = "Accounts"` and variants all
  returned `Tool execution failed: null`) or `automated = false`. Any filter needing a custom
  field (Feature/Component/Story/Suite) or the `automated` flag is implemented as a client-side
  filter over `testops_find_testcases(expand:["custom_fields"])` results — never as a guessed AQL
  predicate.
- `testops_delete_testcase`/`testops_restore_testcase` take only `{id}` — there is no
  force/permanent-delete parameter on this MCP tool at all (confirmed via schema inspection).
  Every deletion through this MCP is inherently a soft-delete.
- The on-prem instance URL is `https://allure.proj.local:8443` everywhere (not `:8090`) — see
  spec §3.

---

## File Structure

| File | Change |
|---|---|
| `plugins/claude-proj-agent/.mcp.json.example` | Modify — add `allure-testops-native`, fix both servers' URL to `8443` |
| `plugins/claude-proj-agent/.mcp.json` (local, gitignored — not in git status) | Modify — same change, this machine only |
| `plugins/claude-proj-agent/rules/allure.md` | Modify — full rewrite (REST reference → MCP tool reference) |
| `plugins/claude-proj-agent/commands/execution/allure-commands/allure-get-test-case.md` | Modify — REST → MCP |
| `plugins/claude-proj-agent/commands/execution/allure-commands/allure-list-test-cases.md` | Modify — REST → MCP + client-side filters |
| `plugins/claude-proj-agent/commands/execution/allure-commands/allure-create-test-case.md` | Modify — REST → MCP |
| `plugins/claude-proj-agent/commands/execution/allure-commands/allure-update-test-case.md` | Modify — REST → MCP, D7/D8 |
| `plugins/claude-proj-agent/commands/execution/allure-commands/allure-delete-test-case.md` | Modify — REST → MCP |
| `plugins/claude-proj-agent/commands/execution/allure-commands/allure-create-mute.md` | Create |
| `plugins/claude-proj-agent/commands/execution/allure-commands/allure-delete-mute.md` | Create |
| `plugins/claude-proj-agent/commands/execution/allure-commands/allure-create-shared-step.md` | Create |
| `plugins/claude-proj-agent/commands/execution/allure-commands/allure-update-shared-step.md` | Create |
| `plugins/claude-proj-agent/commands/execution/allure-commands/allure-find-shared-steps.md` | Create |
| `plugins/claude-proj-agent/commands/execution/allure-commands/INDEX.md` | Modify — add 5 rows |
| `plugins/claude-proj-agent/commands/execution/aqa-commands/aqa-automate.md` | Modify — 2 new modes |
| `plugins/claude-proj-agent/commands/execution/mqa-commands/mqa-create-local-test-case.md` | Modify — 1 clarifying line |
| `plugins/claude-proj-agent/README.md` | Modify — Step 10 rewrite |
| `plugins/claude-proj-agent/docs/INDEX.md` | Modify — add `architecture/` row |
| `plugins/claude-proj-agent/rules/INDEX.md` | Modify — fix `allure.md` description |

---

## Task 1: `.mcp.json` / `.mcp.json.example` — add native MCP server, fix URLs

**Files:**
- Modify: `plugins/claude-proj-agent/.mcp.json.example`
- Modify: `plugins/claude-proj-agent/.mcp.json` (local file, not tracked by git — edit it too so the rest of this plan's live-validation tasks actually work against the right endpoint this session)

**Interfaces:**
- Produces: the MCP server key `allure-testops-native` that every later task's command files reference by name when they say "call the native Allure MCP".

- [ ] **Step 1: Read the current `.mcp.json.example`**

Confirm its exact current content matches what's already known (three servers: `github`,
`filesystem`, `allure-testops`) before editing — don't edit from memory.

- [ ] **Step 2: Edit `.mcp.json.example`**

Replace the `allure-testops` block's `env.ALLURE_URL` value and add a new
`allure-testops-native` entry. Resulting `mcpServers` object:

```json
{
  "_comment": "Copy this file to .mcp.json (already gitignored) and paste your own real values below directly (no ${VAR} placeholders) before starting Claude Code. See docs/ci-cd-secrets.md for the GITHUB_TOKEN variable and how it's supplied in CI (unaffected by this change).",
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
      "_comment": "Allure TestOps' own built-in MCP server (26.1.1+) — CRUD for test cases, shared steps, and mutes. See rules/allure.md §3.",
      "type": "http",
      "url": "https://allure.proj.local:8443/api/mcp",
      "headers": {
        "Authorization": "api-token PASTE-YOUR-TOKEN-HERE"
      }
    },
    "allure-testops": {
      "_comment": "Third-party (github.com/mshegolev/allure-testops-mcp), launches/results/statistics only — see rules/allure.md §8. Test-case CRUD goes through allure-testops-native above instead.",
      "command": "uvx",
      "args": ["--from", "allure-testops-mcp", "allure-testops-mcp"],
      "env": {
        "ALLURE_URL": "https://allure.proj.local:8443",
        "ALLURE_TOKEN": "PASTE-YOUR-TOKEN-HERE"
      }
    }
  }
}
```

Verify during implementation whether an HTTP-transport MCP server entry in this Claude Code
version actually uses the `{"type":"http","url":...,"headers":{...}}` shape shown above — this is
the standard shape for remote MCP servers, but confirm against Claude Code's current `.mcp.json`
schema (e.g. its own docs/schema, or by trying to connect) before treating this as final; adjust
the key names if the real schema differs, without changing the values (URL, header, token
placeholder).

- [ ] **Step 3: Apply the same edit to the local `.mcp.json`**

This file is gitignored and not shown in `git status` — read it first (it currently has the old
`${ALLURE_TESTOPS_TOKEN}`-based `allure-testops` entry and no `allure-testops-native` entry), then
apply the same structural change, pasting the real token (already known this session via
`$ALLURE_TESTOPS_TOKEN`) directly in place of both `PASTE-YOUR-TOKEN-HERE` placeholders. Never
print this file's contents in chat once the real token is in it.

- [ ] **Step 4: Verify the new server connects**

Restart/reconnect the MCP session (per whatever this Claude Code version requires after editing
`.mcp.json` — a session restart or a manual MCP reconnect) and confirm `allure-testops-native`'s
tools are reachable (e.g. list its tools, or re-run the `initialize` probe from the spec). Confirm
the pre-existing `allure-testops` (third-party) server still connects too — this task must not
break it.

- [ ] **Step 5: Leave as uncommitted change**

Do not commit. State plainly that `.mcp.json.example` is a real uncommitted change in
`proj-ai-agentic` and that `.mcp.json` was updated locally (untracked, never committed regardless).

---

## Task 2: Rewrite `rules/allure.md`

**Files:**
- Modify: `plugins/claude-proj-agent/rules/allure.md` (full rewrite, all ~277 lines)

**Interfaces:**
- Produces: the section names/numbers every later task's command files point back to —
  `§1` (Instance & Authentication), `§2` (Resolving the project id), `§3` (MCP Tool Reference),
  `§3a` (Reading/editing the step tree), `§3b` (Tags are full-replace), `§4` (Column → Field
  mapping), `§5` (Versioning), `§6` (Ticket tag convention), `§7` (What Claude must check before
  mutating), `§8` (Third-party MCP — launches/statistics only). Later tasks cite these exact
  labels — keep them stable once this task is done, since Tasks 3–8/14 reference them by number.

- [ ] **Step 1: Read the current file in full** (already done during planning — 277 lines, six
  numbered sections plus intro and §8) to have the exact current text in view before rewriting.

- [ ] **Step 2: Write the new file content**

Replace the entire file with:

```markdown
# Allure TestOps Rules
## Integration Guidelines

This file is project-agnostic in method, not in current facts: the MCP tool usage, auth pattern,
and field-mapping methodology below apply to any Allure TestOps project. The concrete IDs/values
quoted in "Current known configuration" describe *this* engagement's instance as observed on
2026-08-14 — resolve them live per the method below rather than trusting them blindly if this
skeleton is ever pointed at a different Allure project or instance.

Owned by the Senior Manual QA persona (`${CLAUDE_PLUGIN_ROOT}/commands/team/manual-qa-agent.md`); used by
`commands/execution/allure-commands/allure-*.md` and, for automation status,
`commands/execution/aqa-commands/aqa-*.md`. Allure TestOps is this project's default test-case
store for the standard pipeline — there is no parallel Excel/Markdown/CSV pipeline that mirrors
the *same* ticket's Allure cases, and nothing in this file should be reconciled against a local
spreadsheet.

**The one explicit exception:** `commands/execution/mqa-commands/mqa-create-local-test-case.md`
is a separately-invoked, fully local path (`.xlsx` + `.csv`, never Allure) for a ticket that
intentionally skips Allure altogether (offline review, client handoff, no Allure project
configured for this engagement). It is mutually exclusive with this file's pipeline per ticket —
never run `allure-create-test-case` and `mqa-create-local-test-case` for the same `<TICKET-KEY>`,
and never treat a local xlsx/csv file as something this file's MCP flow needs to sync with.

---

## 1. Instance & Authentication

- On-prem instance for this engagement: `https://allure.proj.local:8443` (the legacy plain-HTTP
  `:8090` listener is the same backend but is not this file's canonical URL — see the port note
  below).
- Two MCP servers are configured in `.mcp.json`, with distinct roles — never conflate them:
  - **`allure-testops-native`** — Allure's own built-in MCP server (available from release
    26.1.1; this instance runs `26.1.1`, confirmed 2026-08-14). This is what §3 below documents;
    it's the tool for every test case / shared step / mute create/update/find/delete.
  - **`allure-testops`** — a different, third-party MCP server, read-only, scoped to
    launches/results/statistics only. See §8. Do not reach for its test-case-shaped tools for
    anything §3 already covers.
- **Never hardcode or print the token value in this file, in any command file, or in any output
  you produce.** The token lives only in your local `.mcp.json` (already gitignored per its own
  header comment) — pasted there as a literal string, not via `${VAR}` substitution. Never read
  or print `.mcp.json`'s contents in any command's output; if you need to confirm a server is
  reachable, check connectivity/tool listing, not the file's contents. In CI, no token is needed
  for this file's flows — these are Claude Code session-time MCP tools, not part of the Playwright
  suite run in CI.
- **Port note:** `:8090` (plain HTTP) is a legacy listener on the same backend as `:8443` (HTTPS,
  valid trusted certificate) — confirmed identical version/commit on 2026-08-14. Use `:8443`
  everywhere in new work; `:8090` is not being actively decommissioned by this project, but is no
  longer this file's documented URL.
- If you're unsure a tool below still matches the live server (version drift, a differently
  configured instance), re-run `tools/list` against `allure-testops-native` and re-check the
  argument shape there before writing a mutating call from stale memory.

---

## 2. Resolving the project id

Unlike the old REST flow, MCP tools take **names**, not numeric IDs, for tags/custom
fields/status/workflow/test layer — there is no more "resolve tree/custom-field IDs" step.
The one thing still worth confirming per session is the numeric `projectId` itself (every MCP
tool requires it as a plain number):

- This MCP has no "list projects" tool. Resolve `projectId` once by name via a direct REST read
  (`GET https://allure.proj.local:8443/api/rs/project`, read-only, no auth-flow change from before)
  — this is the one narrow REST call this file still uses, purely for project discovery, and
  never for anything §3 already covers via MCP.
- Feature/Component/Story/Suite **values** (not IDs — these are looked up by name directly in
  MCP calls) have no "list existing values" MCP tool either. Before creating a new value, scan for
  near-duplicates via `testops_find_testcases(projectId, expand:["custom_fields"], size:<page>)`,
  paging through, and check the returned `customFields[].value` values for the field in question
  — see §7 item 4.

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
`tag = "value"`, `status = "value"`, combinable with `and`
(`tag = "TB-1306" and status = "Draft"`). Direct custom-field equality (e.g.
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
replace** of the case's tag set (this is how the equivalent legacy REST call worked; not yet
independently reconfirmed for MCP — see the spec's testing plan item 5). Before any tag-adding
update, fetch current tags (`testops_find_testcases(aql:"id = <id>", expand:["tags"])`) and send
the union, never just the tags being added — the ticket-traceability tag (§6) and Test
level/Test type tags (§4) must never be silently dropped by an unrelated tag update.

---

## 4. Column → Allure Field Mapping

Maps `manual-qa-agent.md`'s "Required Test Case Table Format" columns onto this Allure project's
actual model — unchanged in substance from the REST-era mapping, only the write mechanism moved to
MCP (names instead of IDs everywhere).

| xlsx column | Allure field |
|---|---|
| No. | Allure's own `id` / test key — don't invent parallel numbering |
| Story | `customFields: [{"name":"Story","value":"<Story title>"}]` |
| Test level (`Component`/`Integration`) | **Tag** (e.g. `component`, `integration`) — no dedicated custom field exists for this |
| Test type (`API`/`UI`/...) and content category (`Positive`/`Negative`/`Edge`/`Regression`/`Smoke`/`E2E`) | **Tags** — same mechanism already in ad-hoc use on existing cases (`api`, `Negative`, `Regression` tags observed) |
| Short Description | `name` |
| Preconditions | `precondition` |
| Steps to reproduce | `scenario.steps[]` — see §3a for read/edit mechanics |
| Expected Results | `expectedResult` (top-level field) and/or per-step `expectedResultSteps` entries within `scenario.steps[]` |
| Rule&AC | No native traceability field — embed as a `**Rule&AC:** ...` line in `description`, plus a `links: [{"name":"Jira","url":"<ticket URL>"}]` entry when the ticket URL is known |
| State | **Out of scope for these commands.** This is an execution-result concept (Launch/TestResult), not a Test Case field |
| (not an xlsx column, but required by Allure) Feature/Component | `customFields: [{"name":"Feature","value":"..."}, {"name":"Component","value":"..."}]` — pick the Feature the case's Story belongs to; leave Component empty unless the analysis names one |

**Legacy data note (confirmed by sampling pre-existing cases via the API):** many of the
pre-existing cases (e.g. the original 98 under "System Core") don't populate
`precondition`/`expectedResult`/`scenario.steps` — content is crammed into one `description` blob
instead, most likely an artifact of a bulk CSV-style import. Some later-imported cases (e.g. id 89,
`TC-021`) *do* have real, correctly populated `scenario`/`customFields` (confirmed live,
2026-08-14) — don't assume every existing case is legacy-shaped; check before rendering.

**New cases created by `allure-create-test-case`/`allure-update-test-case` always use the
dedicated fields (`precondition`, `scenario.steps`, `expectedResult`), never the legacy
all-in-`description` style** — do not "match" the legacy style when creating new cases.

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
`TB-1306`) — this is how `allure-list-test-cases`/`allure-update-test-case`/`aqa-automate` find
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
4. Before creating a new Feature/Component/Story/Suite custom-field value, scan for
   near-duplicates via `testops_find_testcases(projectId, expand:["custom_fields"])` (paged) and
   check the field's already-used values — don't create `"Login"` next to an existing `"login"`
   or `"Log In"`. This is heavier than a dedicated lookup (whole-project scan vs. one filtered
   call) since no such lookup tool exists on this MCP — accept the cost rather than reintroducing
   a REST-only code path for this one check.
5. Never delete a test case to reflect a requirement change — that's what the `Outdated` workflow
   status is for (see `allure-update-test-case.md`). `testops_delete_testcase` is reserved for
   genuine duplicates/mistakes, and even then is always a soft-delete (no permanent-delete option
   exists on this tool at all).

---

## 8. Third-party `allure-testops` MCP — launches/results/statistics only

`.mcp.json`'s `allure-testops` entry (distinct from `allure-testops-native` above) runs
[`allure-testops-mcp`](https://github.com/mshegolev/allure-testops-mcp) (third-party, PyPI,
`uvx --from allure-testops-mcp allure-testops-mcp`). It calls this instance's `/api/rs/...` REST
endpoints itself and is confirmed reachable with the current token.

### What it's for

This MCP exists purely to reach data the built-in MCP (§3) doesn't cover: launch/execution
results, not test case authoring — `testops_find_testresults` (§3) is result-level, not
launch-level. Reach for this server's tools only for:

- `allure_list_launches` — recent launch runs with pass/fail metrics
- `allure_get_test_results` — results within a launch, filtered by status
- `allure_search_failed_tests` — failed/broken tests across launches
- `allure_get_project_statistics` — automation rate / test-count summaries

These back release-readiness and coverage-trend questions (the AQA Lead persona's "Release
Readiness Checklist", `test-report`-style asks).

### What it is explicitly NOT for

**Never use this server's test-case-shaped tools** (`allure_list_test_cases`,
`allure_get_test_case`, `allure_create_test_case`, `allure_update_test_case`,
`allure_delete_test_case`, custom-field/category tools) for anything §3's `allure-testops-native`
tools already do — this server is read-only by design (`ALLURE_ENABLE_WRITE` is not set, so its 7
write tools are disabled entirely) and, even if write were enabled, its test-case tools lack
step-level CRUD, tag write, and custom-field-value write that this project's commands depend on.
Every `allure-commands/` file uses `allure-testops-native` for CRUD, full stop.

### Configuration

- Read-only by design: `.mcp.json`'s entry does not set `ALLURE_ENABLE_WRITE` — intentional, since
  every write path this project needs now goes through `allure-testops-native` (§3) instead. Do
  not flip this to `true`.
- Requires `uv`/`uvx` (Python 3.10+) installed locally — see `docs/ci-cd-secrets.md`'s
  "Prerequisites beyond Node/npm". Not needed in CI.
- Auth reuses the same token pasted into `.mcp.json`'s `allure-testops` entry — no separate token
  to provision.
```

- [ ] **Step 3: Re-read the written file and grep it for stale references**

Confirm zero remaining occurrences of: `8090`, `ALLURE_TESTOPS_TOKEN` (the old env-var name),
`GET /api/testcase`, `POST /api/testcase`, `PATCH /api/testcase`, `DELETE /api/testcase`, or any
other `/api/...` REST path. Every one of those strings existing in the old file must be gone or
deliberately replaced (the port-note paragraph is allowed to mention `:8090` once, by design).

- [ ] **Step 4: Leave as uncommitted change**

---

## Task 3: Re-platform `allure-get-test-case.md` (read-only)

**Files:**
- Modify: `plugins/claude-proj-agent/commands/execution/allure-commands/allure-get-test-case.md`

**Interfaces:**
- Consumes: `rules/allure.md` §3 (tool reference), §3a (step reading), §4 (field mapping) from
  Task 2.

- [ ] **Step 1: Replace the Preconditions bullet (current lines 61–63)**

Old:
```
- Read the current API token per `rules/allure.md`'s auth section (`${ALLURE_TESTOPS_TOKEN}` —
  never paste the literal value into output). Confirm `projectId` per `rules/allure.md` §2 if
  not already known this session.
```
New:
```
- The token lives in your local `.mcp.json` — never read or print it (`rules/allure.md` §1/§7).
  Confirm `projectId` per `rules/allure.md` §2 if not already known this session.
```

- [ ] **Step 2: Replace Step 1 ("Resolve the target", current lines 69–75)**

Old:
```
- Bare ID: skip to Step 2 with that `id`.
- `tag:<value>`: `GET /api/testcase?projectId=<id>` won't filter by tag directly — use
  `GET /api/testcasetree/leaf?projectId=<id>&search=<value>` or fetch each candidate and check
  its tags via `GET /api/testcase/{id}/tag`, per `rules/allure.md` §3. If the tag/search
  resolves to zero matches, say so plainly — do not fall back to a fuzzy guess.
```
New:
```
- Bare ID: skip to Step 2 with that `id`.
- `tag:<value>`: `testops_find_testcases(projectId, aql:"tag = \"<value>\"")` (per `rules/allure.md`
  §3's confirmed-working AQL). If zero matches, say so plainly — do not fall back to a fuzzy
  guess. If more than one matches, list every match's `id`/`name` and ask which one.
```

- [ ] **Step 3: Replace Step 2 ("Fetch full detail", current lines 77–90)**

Old (three separate REST calls plus the deprecated-endpoint warning):
```
`GET /api/testcase/{id}` for the core record, then `GET /api/testcase/{id}/tag` and
`GET /api/testcase/{testCaseId}/cfv?projectId=<id>` for tags and custom field values (Feature/
Component/Story/Suite).

For steps, use `GET /api/testcase/{id}/step` (`NormalizedScenarioDto`) — **never**
`GET /api/testcase/{id}/scenario`. That endpoint is `deprecated: true` in this instance's own
`GET /api-docs` and has been observed to return `{"steps": []}` even when the case has real,
visible steps (confirmed on TC-05/id 89 — 3 steps existed but the deprecated endpoint reported
none). Walk the `.../step` response per `rules/allure.md`'s "Reading the step tree": follow
`root.children` for top-level step order, look each id up in `scenarioSteps`, recurse into a
step's own `children` for nested/grouped steps, and render a step's `expectedResultId` target as
that specific step's Expected Result rather than as its own top-level step.
```
New (one call does everything):
```
`testops_find_testcases(projectId, aql:"id = <id>", expand:["scenario","tags","custom_fields",
"status","layer"])` — a single call returns the core record, tags, custom fields (Feature/
Component/Story/Suite), and the full step tree together. Read the step tree straight off the
returned `scenario.steps[]` array (flat, with nested `steps`/`expectedResultSteps` for grouped/
multi-part steps) — see `rules/allure.md` §3a. There is no separate deprecated-endpoint pitfall
to avoid anymore; this is the only read path.
```

- [ ] **Step 4: Update Step 3 ("Render") intro line**

The rendering table (lines 97–112) stays structurally the same — it already just describes field
labels, not API calls. No change needed there. Update only the sentence right before it (line 94,
"Present as the 10-column mental model...") — no textual change needed since it doesn't mention
REST.

- [ ] **Step 5: Update the "Legacy fallback" paragraph (current lines 118–126)**

Replace `` `GET .../step`'s `root.children` is empty (genuinely no steps — confirmed via the
correct endpoint, not the deprecated `.../scenario` one) `` with `` the response's
`scenario.steps` array is empty (genuinely no steps) ``. Leave the rest of the paragraph as-is —
the legacy-data reasoning is unchanged.

- [ ] **Step 6: Update Constraints (current line 138–140) and Definition of Done (current line
  148–149)**

Replace any remaining mention of `.../step`/`.../scenario` endpoint names with "the MCP tool
response" — grep the file after editing for `GET /api`/`.../step`/`.../scenario` and fix any
survivor.

- [ ] **Step 7: Live-verify against real data**

Run the new Step 2 call for a known id (e.g. `89`) and for a known tag (e.g. `tag:TB-1306`, or
whatever ticket tag actually exists — check via `allure-list-test-cases` logic first if unsure)
and confirm the rendered output matches what Step 3's table expects, including at least one case
that hits the "Legacy fallback" branch and one that doesn't. This is read-only — no confirmation
gate needed, just run it.

- [ ] **Step 8: Leave as uncommitted change**

---

## Task 4: Re-platform `allure-list-test-cases.md` (read-only, client-side filters)

**Files:**
- Modify: `plugins/claude-proj-agent/commands/execution/allure-commands/allure-list-test-cases.md`

**Interfaces:**
- Consumes: `rules/allure.md` §3's AQL note (Task 2) — `tag`/`status` are AQL-filterable,
  Feature/Suite/Story are not.

- [ ] **Step 1: Replace the Preconditions bullet (current lines 69–70)**

Same substitution as Task 3 Step 1 (token lives in `.mcp.json`, never read/printed).

- [ ] **Step 2: Replace Step 1 ("Resolve filter to an API call", current lines 76–94) in full**

Old content used `GET /api/testcase`, tree-browse (`GET /api/testcasetree/group`/`leaf`), and a
custom-field-value REST lookup. New content:

```
- No filter: `testops_find_testcases(projectId, expand:["custom_fields","tags","status"])`,
  paging through every page (`page`/`size`) rather than reporting only page 1 as if it were
  everything.
- `status:<name>`: `testops_find_testcases(projectId, aql:"status = \"<name>\"",
  expand:["custom_fields","tags"])` — confirmed AQL-filterable directly (`rules/allure.md` §3).
- `ticket:<TICKET-KEY>`: `testops_find_testcases(projectId, aql:"tag = \"<TICKET-KEY>\"",
  expand:["custom_fields","tags","status"])` — confirmed AQL-filterable directly.
- `feature:<name>` / `suite:<name>` / `story:<name>`: **no confirmed AQL predicate exists for
  these** (`Feature = "..."` and variants all failed — `rules/allure.md` §3's AQL note). Fetch the
  full project (or combine with a `status:`/`ticket:` AQL filter first if one was also given, to
  shrink the fetch) with `expand:["custom_fields"]`, page through, and filter client-side: keep
  only cases whose `customFields[]` array has an entry with `name` equal to `Feature`/`Suite`/
  `Story` (as appropriate) and `value` case-insensitively equal to `<name>`. If zero cases match
  after a full scan, list the closest `value`s actually seen for that field name and ask, rather
  than silently reporting zero when the name was likely a near-miss (casing/typo).
- Filters may combine: apply any AQL-capable filters (`status:`/`ticket:`) as one `aql` expression
  joined with `and`, then apply any `feature:`/`suite:`/`story:` filter as an additional
  client-side pass over the AQL-filtered result set (or the full set, if none of the AQL-capable
  filters were given).
```

- [ ] **Step 3: Step 2 ("Render") — no change needed**

The output table shape (`id | name | Feature | Story | status | tags`) is unaffected by the
mechanism change; `Feature`/`Story` now come from the same `customFields[]` array already fetched
above instead of a separate REST call.

- [ ] **Step 4: Update Constraints/Definition of Done**

Grep for `GET /api`/`testcasetree` and replace with the MCP-based description above; no
substantive requirement changes (still: never silently truncate, never guess an ambiguous
match, never mutate).

- [ ] **Step 5: Live-verify against real data**

Run: no-filter (confirm pagination reports the true total, currently ~1875+ per the earlier
smoke test, not the old REST-era "~98"), `ticket:TB-1306` (or another real ticket tag known to
exist), `status:Draft`, and one `feature:<real Feature name>` (e.g. `feature:Accounts`) to confirm
the client-side filter actually narrows results correctly. Read-only — no confirmation gate.

- [ ] **Step 6: Leave as uncommitted change**

---

## Task 5: Re-platform `allure-create-test-case.md`

**Files:**
- Modify: `plugins/claude-proj-agent/commands/execution/allure-commands/allure-create-test-case.md`

**Interfaces:**
- Produces: the single-call creation pattern Task 8's live validation exercises.

- [ ] **Step 1: Update the Role section's closing sentence (current line 14)**

Old: `"...and resolves Allure's own project/field IDs live per `rules/allure.md` §2."`
New: `"...and resolves Allure's own project id live per `rules/allure.md` §2 (field values are
passed by name directly to the MCP tools, no ID resolution needed)."`

- [ ] **Step 2: Replace the "Stop condition" Preconditions bullet (current lines 85–89)**

Old:
```
- **Stop condition:** search Allure for any existing test case tagged `<TICKET-KEY>`
  (`GET /api/testcasetree/leaf?projectId=&search=<TICKET-KEY>`, or fetch tags per candidate per
  `rules/allure.md` §3). If any exist, stop and point to
  `/execution:allure-commands:allure-update-test-case` instead — this command only ever creates
  the first suite for a ticket, and never overwrites/duplicates an existing one.
```
New:
```
- **Stop condition:** `testops_find_testcases(projectId, aql:"tag = \"<TICKET-KEY>\"")` (per
  `rules/allure.md` §3/§6). If any exist, stop and point to
  `/execution:allure-commands:allure-update-test-case` instead — this command only ever creates
  the first suite for a ticket, and never overwrites/duplicates an existing one.
```

- [ ] **Step 3: Replace the token/ID Preconditions bullet (current lines 90–92)**

Old:
```
- Read the current API token per `rules/allure.md`'s auth section (`${ALLURE_TESTOPS_TOKEN}` —
  never the literal value). Confirm `projectId` and the Feature/Component/Story/Suite field IDs
  per `rules/allure.md` §2.
```
New:
```
- The token lives in your local `.mcp.json` — never read or print it. Confirm `projectId` per
  `rules/allure.md` §2 (no field IDs to resolve — MCP takes Feature/Component/Story/Suite by
  name).
```

- [ ] **Step 4: Replace Step 4 ("Confirm, then create", current lines 238–253)**

Old (four sequential REST calls per case, plus a separate deprecated-endpoint-avoiding read-back):
```
Before issuing a single `POST`, show the user the full list of cases about to be created (name,
Story, Feature, tags, and the requirement item(s) each traces to) and get explicit confirmation.
This is a live, shared Allure project — a mistake here is a real record someone else will see,
not a throwaway file.

Once confirmed, for each case: `POST /api/testcase` → `POST /{id}/scenario` → `PATCH /{id}/cfv`
→ `POST /{id}/tag` (per `rules/allure.md` §3). If any call fails partway, report exactly which
cases succeeded and which didn't — never silently retry with different data, and never leave the
user unsure which cases actually exist now.

Verify each case's steps actually saved by reading them back via `GET /api/testcase/{id}/step`
(the `NormalizedScenarioDto` tree per `rules/allure.md`) — **not** the deprecated
`GET /api/testcase/{id}/scenario`, which can report an empty step list even when steps were
saved correctly, producing a false-negative "creation failed" read.
```
New:
```
Before calling `testops_create_testcase` even once, show the user the full list of cases about
to be created (name, Story, Feature, tags, and the requirement item(s) each traces to) and get
explicit confirmation. This is a live, shared Allure project — a mistake here is a real record
someone else will see, not a throwaway file.

Once confirmed, for each case, one `testops_create_testcase` call carries everything: `name`,
`description` (the `Rule&AC:` line), `precondition`, `expectedResult`, `status:"Draft"`,
`tags` (`<TICKET-KEY>` + Test level + Test type/content-category tags), `customFields`
(`Story`/`Feature`/`Component` by name), and `scenario` (the full step tree, per `rules/allure.md`
§3a's shape) — no separate follow-up calls needed, unlike the old multi-step REST flow. If a call
fails, report exactly which cases succeeded (with their new ids) and which didn't — never
silently retry with different data.

Verify each case's steps actually saved by re-fetching it
(`testops_find_testcases(aql:"id = <new id>", expand:["scenario","tags","custom_fields"])`) and
diffing the response against what was sent.
```

- [ ] **Step 5: Update Constraints (current line 297–301, "custom field value" clause)**

Change `"per rules/allure.md §3's 'list existing values'"` to
`"per rules/allure.md §7 item 4's near-duplicate scan"` (the check moved sections in Task 2's
rewrite).

- [ ] **Step 6: Grep the whole file for any remaining `GET /api`/`POST /api`/`PATCH /api` and fix**

- [ ] **Step 7: Leave as uncommitted change** — do not live-test this task alone; Task 8 covers
  the live create/verify/delete cycle for this and Task 6/7 together, under one explicit
  approval.

---

## Task 6: Re-platform `allure-update-test-case.md`

**Files:**
- Modify: `plugins/claude-proj-agent/commands/execution/allure-commands/allure-update-test-case.md`

**Interfaces:**
- Consumes: `rules/allure.md` §3a (read-modify-write steps, D7) and §3b (tags full-replace, D8)
  from Task 2.

- [ ] **Step 1: Replace Step 0 ("Load the current baseline", current lines 82–86)**

Old: `` `GET /api/testcasetree/leaf?projectId=&search=<TICKET-KEY>` (or per-case tag fetch, per
`rules/allure.md` §3) ``
New: `` `testops_find_testcases(projectId, aql:"tag = \"<TICKET-KEY>\"",
expand:["scenario","tags","custom_fields","status"])` — one call gets the full current baseline
for every case tagged `<TICKET-KEY>`, not just their ids. ``

- [ ] **Step 2: Replace the "Changed" bullet in Step 4 (current lines 120–131)**

Old:
```
- **Changed** requirement items: find the case(s) tracing to that item (via the `Rule&AC` line
  in `description`, per `rules/allure.md` §4). Before deciding how to patch, read the case's
  *current* steps via `GET /api/testcase/{id}/step` (never the deprecated
  `GET /api/testcase/{id}/scenario`, which can silently report zero steps even when real ones
  exist — see `rules/allure.md`'s "Reading the step tree"). Then `PATCH /api/testcase/{id}` with
  the updated `precondition`/`scenario`/`expectedResult` (a full `scenario` replaces the whole
  step tree) — or, if only one step actually needs to change, prefer the surgical
  `PATCH /api/testcase/step/{id}` endpoint instead of resending the entire scenario. Apply the
  same Atomicity/Step Explicitness/Verified Behavior bar as first authoring — a case touched
  during reconciliation must meet the current bar even if it didn't when first written. If the
  change is substantial enough that the case no longer represents a coherent scenario, set it
  `Outdated` (with reason) and create a new case instead of patching around an incoherent shape.
```
New:
```
- **Changed** requirement items: find the case(s) tracing to that item (via the `Rule&AC` line
  in `description`, per `rules/allure.md` §4) — already in hand from Step 0's baseline fetch.
  Follow `rules/allure.md` §3a's read-modify-write pattern: edit the already-fetched
  `scenario.steps[]` array for the affected step(s), then `testops_update_testcase({id,
  precondition, scenario: {steps: <complete edited array>}, expectedResult})` — there is no
  surgical single-step tool anymore, so the array sent must always be the complete, current tree,
  not just the changed step. Apply the same Atomicity/Step Explicitness/Verified Behavior bar as
  first authoring — a case touched during reconciliation must meet the current bar even if it
  didn't when first written. If the change is substantial enough that the case no longer
  represents a coherent scenario, set it `Outdated` (with reason) and create a new case instead of
  patching around an incoherent shape.
```

- [ ] **Step 3: Replace the "Removed" bullet in Step 4 (current lines 135–141)**

Old: `` `PATCH statusId` to `Outdated` (resolved by name, per `rules/allure.md` §2) on the linked
case(s), with the reason appended to `description` ``
New: `` `testops_update_testcase({id, status:"Outdated", description: <existing description +
"\n\n**Deprecated <date>:** <reason> — superseded by ticket update.">})` — `description` is a full
replace on this tool too, so fetch the case's current `description` first (already in hand from
Step 0) and append to it in memory before sending, never send just the new line. Never
`testops_delete_testcase` for this reason ``.

- [ ] **Step 4: Update the "Confirmation gate" paragraph (current lines 145–148)**

Old: `` before issuing any `PATCH`/`POST`... ``
New: `` before calling `testops_update_testcase`/`testops_create_testcase` for any case in this
reconciliation... `` — same requirement, updated verb.

- [ ] **Step 5: Update Step 5 ("Record what changed", current lines 158–160)**

`statusId` → `status` (already a name, no resolution step) in both sentences.

- [ ] **Step 6: Grep the whole file for remaining `GET /api`/`PATCH /api`/`statusId` and fix**

- [ ] **Step 7: Leave as uncommitted change** — live validation happens in Task 8.

---

## Task 7: Re-platform `allure-delete-test-case.md`

**Files:**
- Modify: `plugins/claude-proj-agent/commands/execution/allure-commands/allure-delete-test-case.md`

- [ ] **Step 1: Replace the Preconditions REST calls (current lines 54–58)**

Old:
```
- Read the current API token per `rules/allure.md`'s auth section (`${ALLURE_TESTOPS_TOKEN}` —
  never the literal value).
- `GET /api/testcase/{id}` first — confirm the case exists and show its full content (name,
  Feature/Story, tags, description) to the user before proceeding. If the id doesn't resolve,
  say so and stop.
```
New:
```
- The token lives in your local `.mcp.json` — never read or print it.
- `testops_find_testcases(projectId, aql:"id = <id>", expand:["scenario","tags",
  "custom_fields"])` first — confirm the case exists and show its full content (name,
  Feature/Story, tags, description) to the user before proceeding. If the id doesn't resolve
  (empty result), say so and stop.
```

- [ ] **Step 2: Replace Step 3 ("Delete", current lines 79–85)**

Old:
```
`DELETE /api/testcase/{id}` (per `rules/allure.md` §3 — this is a soft-delete, recoverable via
`POST /api/testcase/{id}/restore`). Confirm the response, and tell the user explicitly that the
case is recoverable via `/restore` if this turns out to be a mistake, and for how it's typically
retained before a hard purge (state this as "per your Allure instance's own retention policy" —
this skeleton doesn't assume one).
```
New:
```
`testops_delete_testcase({id})` (per `rules/allure.md` §3 — this tool has no `force`/
permanent-delete parameter at all, so every call through it is inherently a soft-delete).
Confirm the response, and tell the user explicitly that the case is recoverable via
`testops_restore_testcase({id})` if this turns out to be a mistake.
```

- [ ] **Step 3: Update Constraints (current lines 96–103) — drop the `force=true` clause**

Old: `` Never pass `force=true` on the delete call unless the user explicitly asks for a
permanent, unrecoverable removal and has been told plainly that `force` skips the soft-delete/
restore safety net. ``
New: `` This tool has no permanent-delete option — every deletion is a soft-delete, always
recoverable via `testops_restore_testcase`. `` (This is a simplification, not a loosened
constraint — the old REST path's danger no longer exists on this tool at all.)

- [ ] **Step 4: Grep the whole file for remaining `GET /api`/`DELETE /api`/`force=` and fix**

- [ ] **Step 5: Leave as uncommitted change** — live validation happens in Task 8.

---

## Task 8: Live validation — create/update/delete cycle for test cases (requires explicit user approval)

**This task calls live, mutating MCP tools against the real, shared `TB CBS` (`projectId=2`)
Allure project. Do not run any step here without the user's explicit go-ahead for each mutating
call — this is exactly the confirmation gate Tasks 5–7 just wrote into the command files,
exercised for real.**

**Files:** none (validation only; if it surfaces a bug, go back and fix the relevant Task 5–7
file, then re-run this task).

- [ ] **Step 1: Show the user the exact `testops_create_testcase` call and get approval**

Propose a disposable, clearly-marked case, e.g.:
```json
{
  "projectId": 2,
  "name": "ZZZ-MCP-MIGRATION-VALIDATION (delete me)",
  "description": "**Rule&AC:** validation-only, not a real requirement",
  "precondition": "N/A",
  "status": "Draft",
  "tags": ["mcp-migration-validation"],
  "scenario": {"steps": [
    {"type": "body", "body": "Step one", "expectedResultSteps": [{"type": "expected_body", "body": "Expected one"}]},
    {"type": "body", "body": "Step two"}
  ]}
}
```
Wait for the user's explicit yes before calling.

- [ ] **Step 2: Call `testops_create_testcase` and record the returned id**

- [ ] **Step 3: Re-fetch and verify**

`testops_find_testcases(aql:"id = <new id>", expand:["scenario","tags","custom_fields","status"])`
— confirm `name`, `tags`, `status`, and both scenario steps (with the one expected-result step)
match exactly what was sent.

- [ ] **Step 4: Validate the read-modify-write step-edit pattern (D7)**

Edit the in-memory `scenario.steps[]` array from Step 3's response: change "Step one" to "Step one
(edited)", leave "Step two" untouched. Show the user the exact `testops_update_testcase` call
(the complete two-step array) and get approval, then call it. Re-fetch and confirm: "Step one
(edited)" saved, "Step two" and the expected-result step are still present and unchanged (not
dropped or reordered).

- [ ] **Step 5: Validate tag full-replace vs. merge (D8)**

Show the user the exact call: `testops_update_testcase({id, tags: ["mcp-migration-validation",
"second-tag"]})` and get approval, then call it. Re-fetch and check the resulting `tags[]`:

- If it now reads `["mcp-migration-validation", "second-tag"]` (both present) → tags **merge**;
  update `rules/allure.md` §3b to say so and drop the "always fetch+merge" requirement as
  unnecessary overhead (note in the file's own text that this was empirically confirmed, with the
  date).
- If it now reads `["second-tag"]` only (first tag dropped) → tags **fully replace**, confirming
  D8 as-is; no doc change needed, §3b's fetch-then-union guidance stands.

- [ ] **Step 6: Delete and restore**

Show the user the exact `testops_delete_testcase({id})` call, get approval, call it. Confirm via
`testops_find_testcases(aql:"id = <id>")` that it no longer appears in a normal search. Then show
the user the exact `testops_restore_testcase({id})` call, get approval, call it, and confirm the
case reappears. Finally, ask the user whether to leave this validation case deleted (recommended —
it was never a real requirement) or restored; act on their answer.

- [ ] **Step 7: Report results**

State plainly which of D7/D8's assumptions were confirmed vs. corrected by this live run, and
whether Task 2's `rules/allure.md` needs a follow-up edit (per Step 5 above).

---

## Task 9: Create `allure-create-mute.md` and `allure-delete-mute.md`

**Files:**
- Create: `plugins/claude-proj-agent/commands/execution/allure-commands/allure-create-mute.md`
- Create: `plugins/claude-proj-agent/commands/execution/allure-commands/allure-delete-mute.md`

**Interfaces:**
- Produces: two new slash commands `/execution:allure-commands:allure-create-mute` and
  `/execution:allure-commands:allure-delete-mute`, following the same structural convention as
  the five existing `allure-commands/*.md` files (Role → Mission → Argument Format/Examples →
  Preconditions → Protocol → Output → Constraints → Definition of Done).

- [ ] **Step 1: Write `allure-create-mute.md`**

```markdown
# /execution:allure-commands:allure-create-mute

## Role

You are the Senior Manual QA Engineer (`${CLAUDE_PLUGIN_ROOT}/commands/team/manual-qa-agent.md`).

Your responsibility here is narrow: suppress a known-flaky or currently-broken-for-unrelated-
reasons automated test's failures in Allure TestOps, without touching the test case's own
content. A mute is a triage/tracking action, not a fix — it exists so a flaky test doesn't mask
other real failures in a launch while the actual fix is pending.

---

## Mission

Create a mute on exactly one test case, with a stated reason, using the `allure-testops-native`
MCP server (`testops_create_mute`, per `rules/allure.md` §3).

---

## Argument Format

```
/execution:allure-commands:allure-create-mute <test-case-id> <reason>
```

`<test-case-id>` is the Allure test case's numeric id (not the mute's own id — that's returned
after creation). `<reason>` is free text (markdown supported) explaining why this test is muted
right now — never a placeholder like "flaky", always specific enough that a future reader knows
whether the mute is still justified (e.g. "Fails intermittently under CI load — tracked in
TB-2201, ETA 2026-08-20").

## Examples

```
/execution:allure-commands:allure-create-mute 1985 Intermittent timeout waiting on the payment-hub mock — tracked in TB-2201
```
→ Shows case `1985`'s name/current automation status, confirms with the user, then calls
`testops_create_mute({testCaseId: 1985, name: "Muted per TB-2201", reason: "Intermittent timeout
waiting on the payment-hub mock — tracked in TB-2201"})`.

---

## Preconditions

- The token lives in your local `.mcp.json` — never read or print it.
- `testops_find_testcases(projectId, aql:"id = <test-case-id>")` first — confirm the case exists
  and show its `name`/`automated`/`status` to the user. If it doesn't resolve, say so and stop.
- The stated reason must name a concrete cause or a tracking ticket — if the user gives a vague
  reason ("it's flaky"), ask for the specific cause/ticket before proceeding rather than muting
  blind.

---

## Protocol

### Step 1 — Confirm

Show the user the exact case (id, name) and the exact `testops_create_mute` call (including the
`name`/`reason` fields as they'll be sent) and get explicit confirmation before calling — per
`rules/allure.md` §7 item 3, this is a live, shared Allure project.

### Step 2 — Create the mute

Call `testops_create_mute({testCaseId, name, reason})`. Report the new mute's returned id.

---

## Output

Confirmation that the mute was created, its id, and the test case it applies to. No file is
written.

---

## Constraints

Never mute a case without a concrete, specific reason (a vague "flaky" is not sufficient — ask
for the real cause or a tracking ticket). Never mute more than one case per invocation. Never
create a mute without explicit user confirmation naming the case by id and name. Never print the
API token.

---

## Definition of Done (for this command's own output)

- The exact case (by id) was shown before muting, not muted blind
- The reason recorded is specific (a cause or a tracking ticket), not a vague placeholder
- The user explicitly confirmed before the mute was created
- The new mute's id was reported back to the user
```

- [ ] **Step 2: Write `allure-delete-mute.md`**

```markdown
# /execution:allure-commands:allure-delete-mute

## Role

You are the Senior Manual QA Engineer (`${CLAUDE_PLUGIN_ROOT}/commands/team/manual-qa-agent.md`).

Your responsibility here is narrow: remove an existing mute from Allure TestOps once its
underlying cause is fixed (or the mute is found to be no longer justified) — this un-suppresses
that test case's failures in future launches.

---

## Mission

Delete exactly one mute, after explicit user confirmation, using the `allure-testops-native` MCP
server (`testops_delete_mute`, per `rules/allure.md` §3).

---

## Argument Format

```
/execution:allure-commands:allure-delete-mute <mute-id>
```

`<mute-id>` is the mute's own id (returned when it was created via `allure-create-mute`, or
found via `testops_find_testcases`'s test-case detail if the case's active mute id needs
recovering) — **not** the test case's id.

## Examples

```
/execution:allure-commands:allure-delete-mute 42
```
→ Confirms which test case mute `42` applies to and why it was muted, gets explicit confirmation,
then calls `testops_delete_mute({id: 42})`.

---

## Preconditions

- The token lives in your local `.mcp.json` — never read or print it.
- If the mute id isn't already known, ask the user for it or for the test case id so it can be
  looked up — this command does not guess which mute to remove.
- State plainly why the mute is being removed (fix landed / no longer justified) before
  proceeding.

---

## Protocol

### Step 1 — Confirm

Show the user the mute id and the reason for removal, and get explicit confirmation before
calling — per `rules/allure.md` §7 item 3.

### Step 2 — Delete

Call `testops_delete_mute({id})`.

---

## Output

Confirmation that the mute was removed and which test case is now un-suppressed. No file is
written.

---

## Constraints

Never delete a mute without explicit user confirmation. Never guess a mute id from a vague
description — ask for the specific id or test case if not already known. Never print the API
token.

---

## Definition of Done (for this command's own output)

- The exact mute (by id) and its target test case were confirmed before deletion
- The user explicitly confirmed the removal and its reason
- The mute no longer applies (the test case's failures are un-suppressed going forward)
```

- [ ] **Step 3: Leave both as uncommitted changes**

---

## Task 10: Create the three shared-step commands

**Files:**
- Create: `plugins/claude-proj-agent/commands/execution/allure-commands/allure-create-shared-step.md`
- Create: `plugins/claude-proj-agent/commands/execution/allure-commands/allure-update-shared-step.md`
- Create: `plugins/claude-proj-agent/commands/execution/allure-commands/allure-find-shared-steps.md`

**Interfaces:**
- Produces: three new slash commands, same structural convention as Task 9's pair.
- Consumes: `rules/allure.md` §3's `testops_create_sharedstep`/`update_sharedstep`/
  `find_sharedsteps` row (Task 2) — shared-step `scenario` only supports `body`/`attachment`
  steps, no `shared`-type nesting inside a shared step itself (confirmed via schema inspection
  during planning).

- [ ] **Step 1: Write `allure-create-shared-step.md`**

```markdown
# /execution:allure-commands:allure-create-shared-step

## Role

You are the Senior Manual QA Engineer (`${CLAUDE_PLUGIN_ROOT}/commands/team/manual-qa-agent.md`).

Your responsibility here is to extract a sequence of steps that's repeated across multiple test
cases into one reusable Shared Step in Allure TestOps — updating a shared step automatically
updates every test case that references it, so this is the tool for genuine repetition, not a
place to park a one-off sequence that happens to look reusable.

---

## Mission

Create one Shared Step in Allure TestOps from a named, reusable step sequence, using the
`allure-testops-native` MCP server (`testops_create_sharedstep`, per `rules/allure.md` §3).

---

## Argument Format

```
/execution:allure-commands:allure-create-shared-step <name>
```

`<name>` is the shared step's own name (e.g. "Log in as a Teller with valid credentials"). The
step content itself is gathered interactively in Step 1 of the Protocol below, not passed as a
command argument — a step sequence is too structured to fit on one line.

## Examples

```
/execution:allure-commands:allure-create-shared-step Authenticate as System Administrator
```
→ Asks for the concrete steps (and any per-step expected results), shows the assembled scenario
for confirmation, then creates it and reports the new shared step's id — ready to be referenced
from any test case's `scenario.steps[]` via a `{"type":"shared","sharedStepId":<id>}` entry.

---

## Preconditions

- The token lives in your local `.mcp.json` — never read or print it. Confirm `projectId` per
  `rules/allure.md` §2.
- Before creating, check whether an existing shared step with the same or near-identical purpose
  already exists — `testops_find_sharedsteps(projectId, aql:"name = \"<name>\"")` — if a name
  match or an obviously-equivalent existing shared step is found, point to it instead of creating
  a duplicate (use `allure-update-shared-step` if it needs changing).

---

## Protocol

### Step 1 — Gather the step sequence

Ask for (or derive from the test case(s) currently duplicating this sequence) the ordered list of
steps, each as a `body` step, with any inline expected results as `expectedResultSteps` entries
under the relevant step. This is the same `BodyStepDto`-equivalent shape as a regular test case's
scenario (`rules/allure.md` §3a), except a shared step's own scenario may only contain `body`/
`attachment` steps — it cannot reference another shared step inside itself.

### Step 2 — Confirm, then create

Show the user the assembled `name` + `scenario` and get explicit confirmation (per
`rules/allure.md` §7 item 3) before calling
`testops_create_sharedstep({projectId, name, scenario: {steps: [...]}})`. Report the new shared
step's id.

### Step 3 — Verify

`testops_find_sharedsteps(projectId, aql:"id = <new id>", expand:["scenario"])` and confirm the
returned scenario matches what was sent.

---

## Output

The new shared step's id and name. No file is written — this lives entirely in Allure.

---

## Constraints

Never create a shared step without first checking for an existing equivalent
(`testops_find_sharedsteps`). Never create a shared step without explicit user confirmation of
its full content. Never nest a `shared`-type step inside a shared step's own scenario (not
supported by this tool). Never print the API token.

---

## Definition of Done (for this command's own output)

- An existing-equivalent check was run before creating
- The user confirmed the full step sequence before creation
- The new shared step's id/name was reported and verified by re-fetch
```

- [ ] **Step 2: Write `allure-update-shared-step.md`**

```markdown
# /execution:allure-commands:allure-update-shared-step

## Role

You are the Senior Manual QA Engineer (`${CLAUDE_PLUGIN_ROOT}/commands/team/manual-qa-agent.md`).

Your responsibility here is to reconcile an existing Shared Step's content when the sequence it
represents changes — every test case referencing it picks up the change automatically, so a
mistake here has a wider blast radius than editing one test case.

---

## Mission

Update one Shared Step's `name`/`scenario` in place, using the `allure-testops-native` MCP server
(`testops_update_sharedstep`, per `rules/allure.md` §3), following the same read-modify-write
pattern as test case scenario edits (`rules/allure.md` §3a — no single-step tool exists for
shared steps either).

---

## Argument Format

```
/execution:allure-commands:allure-update-shared-step <shared-step-id>
```

---

## Examples

```
/execution:allure-commands:allure-update-shared-step 17
```
→ Fetches shared step `17`'s current scenario, asks what changed, shows the full revised scenario
for confirmation, then updates it — every test case referencing shared step `17` now shows the new
content on next view.

---

## Preconditions

- The token lives in your local `.mcp.json` — never read or print it.
- `testops_find_sharedsteps(projectId, aql:"id = <shared-step-id>", expand:["scenario"])` first —
  confirm it exists and show its current content. If it doesn't resolve, say so and stop.
- Before proceeding, tell the user how many/which test cases reference this shared step if that's
  discoverable (there is no direct "find test cases using shared step X" MCP tool — if asked,
  note this is not currently answerable via MCP and would need a manual check in the Allure UI),
  so the blast radius of the change is not a surprise.

---

## Protocol

### Step 1 — Read-modify-write the scenario

Take the current `scenario.steps[]` from the Preconditions fetch, apply the requested edit in
memory (same mechanics as `rules/allure.md` §3a for test cases — the array sent must be the
complete, current tree, not just the changed step).

### Step 2 — Confirm, then update

Show the user the full before/after scenario diff and get explicit confirmation (per
`rules/allure.md` §7 item 3) before calling
`testops_update_sharedstep({id, name, scenario: {steps: [...]}})`.

### Step 3 — Verify

Re-fetch and confirm the change landed and nothing else in the scenario moved/dropped.

---

## Output

Confirmation that the shared step was updated, with a before/after summary. No file is written.

---

## Constraints

Never update a shared step without showing the full before/after diff and getting explicit
confirmation. Never send a partial scenario array (always the complete, current tree). Never
print the API token.

---

## Definition of Done (for this command's own output)

- The current scenario was fetched and shown before any edit
- The user confirmed the full before/after diff
- A re-fetch confirmed the update landed correctly and completely
```

- [ ] **Step 3: Write `allure-find-shared-steps.md`**

```markdown
# /execution:allure-commands:allure-find-shared-steps

## Role

You are the Senior Manual QA Engineer (`${CLAUDE_PLUGIN_ROOT}/commands/team/manual-qa-agent.md`).

Your responsibility here is narrow: list/search existing Shared Steps, primarily so
`allure-create-test-case`/`allure-create-shared-step` can check for an existing equivalent before
authoring a new one. Read-only.

---

## Mission

Answer "does a shared step for X already exist" and "what shared steps exist", using
`testops_find_sharedsteps` (`rules/allure.md` §3).

---

## Argument Format

```
/execution:allure-commands:allure-find-shared-steps
/execution:allure-commands:allure-find-shared-steps name:<text>
```

No filter lists every shared step in the project (paged). `name:<text>` searches by name
(`aql:"name = \"<text>\""` for an exact match; if zero results, retry as a broader client-side
`contains` scan over a full, paged fetch rather than assuming no near-match exists — shared step
names may vary in phrasing).

## Examples

```
/execution:allure-commands:allure-find-shared-steps name:Authenticate as Teller
```
→ Exact AQL match found — returns `id`/`name`. If none, falls back to a full scan for anything
containing "Teller" or "Authenticate" and lists close candidates instead of reporting zero.

---

## Preconditions

- The token lives in your local `.mcp.json` — never read or print it. Confirm `projectId` per
  `rules/allure.md` §2.

---

## Protocol

### Step 1 — Query

`testops_find_sharedsteps(projectId, aql:<derived from name: filter, or omitted>, page, size)`,
paging through all results if unfiltered.

### Step 2 — Render

A table: `id | name`. State the total count. If a `name:` filter found zero exact matches, run the
broader client-side scan described above and present any close candidates found, or state plainly
that none exist.

---

## Output

A rendered table (and total count) in chat. No file is written — read-only.

---

## Constraints

Never mutate anything. Never report zero results without first trying the broader client-side
scan when a `name:` filter was given. Never print the API token.

---

## Definition of Done (for this command's own output)

- The requested filter (or lack of one) was applied against Allure, not approximated
- A `name:` filter that found zero exact AQL matches was followed by a broader scan before
  reporting empty
- No mutating call was made
```

- [ ] **Step 4: Leave all three as uncommitted changes**

---

## Task 11: Live validation — mute and shared-step tools (requires explicit user approval)

**Same live-call caution as Task 8.**

**Files:** none (validation only).

- [ ] **Step 1: Shared step round-trip**

Show the user an exact `testops_create_sharedstep` call for a small, obviously-throwaway shared
step (e.g. `name: "ZZZ-MCP-MIGRATION-VALIDATION shared step (delete me)"`, two simple `body`
steps), get approval, call it, then re-fetch via `testops_find_sharedsteps` and confirm the
content matches.

- [ ] **Step 2: Mute round-trip**

Reuse the disposable test case from Task 8 if it still exists (or create a fresh throwaway one,
with approval, if Task 8 already deleted/cleaned up its case). Show the user the exact
`testops_create_mute` call, get approval, call it, confirm the returned mute id, then show the
exact `testops_delete_mute({id})` call, get approval, and call it.

- [ ] **Step 3: Clean up**

If Task 8 left its validation case deleted, leave it deleted. If a fresh case was created for
Step 2 here, ask the user whether to delete it now (recommended) and act on their answer. There is
no delete tool for shared steps in this MCP (not in the 13-tool list) — note this to the user: the
throwaway shared step from Step 1 will remain in the project unless removed by hand in the Allure
UI, and say so plainly rather than silently leaving clutter unmentioned.

- [ ] **Step 4: Report results**

Confirm both tools behaved as documented in Task 9/10's command files, or note any discrepancy to
fix there.

---

## Task 12: Update `allure-commands/INDEX.md`

**Files:**
- Modify: `plugins/claude-proj-agent/commands/execution/allure-commands/INDEX.md`

- [ ] **Step 1: Replace the file's table**

Old (5 rows). New (10 rows, existing 5 unchanged in wording + 5 new):

```markdown
# commands/execution/allure-commands/ Index

Senior Manual QA Engineer persona (`../../team/manual-qa-agent.md`) driving Allure TestOps — the
default (non-local) test-case path, following `mqa-commands/mqa-review-story.md`. All CRUD below
runs through the `allure-testops-native` MCP server (`rules/allure.md` §3); the third-party
`allure-testops` MCP server is unrelated to this table — see `rules/allure.md` §8.

| File | Invocation | Read this when you need... |
|---|---|---|
| `allure-create-test-case.md` | `/execution:allure-commands:allure-create-test-case <TICKET-KEY> [types:...]` | Design and create the full test case suite in Allure TestOps from a completed `analysis.md`. |
| `allure-update-test-case.md` | `/execution:allure-commands:allure-update-test-case <TICKET-KEY> [types:+/-...]` | Reconcile existing Allure cases after the ticket/AC/Confluence changed — patch in place, mark `Outdated`, never delete for a requirement change. |
| `allure-get-test-case.md` | `/execution:allure-commands:allure-get-test-case <id>` or `tag:<TICKET-KEY>` | Fetch and render one Allure test case in the standard 10-column mental model. Read-only. |
| `allure-list-test-cases.md` | `/execution:allure-commands:allure-list-test-cases [feature:\|suite:\|story:\|status:\|ticket:...]` | List/filter Allure test cases as a coverage overview. Read-only. |
| `allure-delete-test-case.md` | `/execution:allure-commands:allure-delete-test-case <id>` | Remove a genuinely mistaken/duplicate Allure case (soft-delete) — never for a requirement change, that's `allure-update-test-case`'s `Outdated` path. |
| `allure-create-shared-step.md` | `/execution:allure-commands:allure-create-shared-step <name>` | Extract a repeated step sequence into a reusable Shared Step. |
| `allure-update-shared-step.md` | `/execution:allure-commands:allure-update-shared-step <shared-step-id>` | Reconcile an existing Shared Step's content — propagates to every referencing test case. |
| `allure-find-shared-steps.md` | `/execution:allure-commands:allure-find-shared-steps [name:...]` | Check for an existing Shared Step before creating a near-duplicate. Read-only. |
| `allure-create-mute.md` | `/execution:allure-commands:allure-create-mute <test-case-id> <reason>` | Suppress a known-flaky/broken-for-unrelated-reasons automated test's failures, with a stated reason. |
| `allure-delete-mute.md` | `/execution:allure-commands:allure-delete-mute <mute-id>` | Remove a mute once its cause is fixed or no longer justified. |

`aqa-commands/aqa-automate.md` consumes the test-case commands next (by Allure case ID, `tag:`,
`module:`/`story:`, or an inline-pasted case — see its own file).
```

- [ ] **Step 2: Leave as uncommitted change**

---

## Task 13: `aqa-automate.md` — add `module:`/`story:` search mode and inline-pasted-case mode

**Files:**
- Modify: `plugins/claude-proj-agent/commands/execution/aqa-commands/aqa-automate.md`

**Interfaces:**
- Consumes: `rules/allure.md` §3's AQL note (Task 2) — module/story matching needs the same
  client-side `custom_fields` scan as `allure-list-test-cases.md`'s `feature:`/`story:` filters
  (Task 4), not a guessed AQL predicate. Also needs the `automated` field filtered client-side
  (confirmed not AQL-filterable).

- [ ] **Step 1: Replace the Input section (current lines 24–32)**

Old:
```
/execution:aqa-commands:aqa-automate <allure-case-id>
/execution:aqa-commands:aqa-automate tag:<TICKET-KEY>
```

`tag:<TICKET-KEY>` batches every case tagged with that ticket key (the tag
`allure-create-test-case` applies when it creates cases).
```
New:
```
/execution:aqa-commands:aqa-automate <allure-case-id>
/execution:aqa-commands:aqa-automate tag:<TICKET-KEY>
/execution:aqa-commands:aqa-automate module:<name>
/execution:aqa-commands:aqa-automate story:<name>
```

`tag:<TICKET-KEY>` batches every case tagged with that ticket key (the tag
`allure-create-test-case` applies when it creates cases). `module:<name>`/`story:<name>` batch
every un-automated case whose `Modules / Sub-Modules`/`Story` custom field matches `<name>` — see
Step 1a below for how this is resolved (no direct AQL predicate exists for either field).

A fifth mode has no slash-command syntax: pasting a test case's content directly in this chat and
asking for it to be automated — see "Inline-pasted case" below.
```

- [ ] **Step 2: Insert a new "Step 1a — Resolve `module:`/`story:` to case ids" right after the
  existing "Step 1 — Fetch the case(s) from Allure TestOps" (current lines 58–63, kept as-is for
  the `<id>`/`tag:` modes)**

New section, inserted after current line 63:
```
### Step 1a — Resolve `module:<name>`/`story:<name>` to case ids (new mode)

No AQL predicate reliably filters by the `Modules / Sub-Modules`/`Story` custom fields or by the
`automated` flag on this instance (`rules/allure.md` §3's AQL note — direct equality on these
returned `Tool execution failed: null` when tried). Resolve this mode as a client-side filter
instead:

1. `testops_find_testcases(projectId, expand:["custom_fields","tags","status"])`, paging through
   every page.
2. Keep only cases where `automated` is `false` **and** the relevant custom field
   (`Modules / Sub-Modules` for `module:`, `Story` for `story:`) has a value matching `<name>`
   (case-insensitive; for `Modules / Sub-Modules`, match if `<name>` appears anywhere in the
   comma-separated value, since that field lists every module a case reaches, per
   `manual-qa-agent.md`'s Required Test Case Table Format).
3. Also drop any case whose `status` is not `Approved` — same precondition as the `<id>`/`tag:`
   modes below, applied here before batching rather than after.

**If this resolves to zero cases:** do not fall back to checking `docs/test-cases/` (the local
xlsx/csv path) — that would blur which store is authoritative for a ticket that may not even use
the local path. Stop and explicitly ask the user to paste the test case in this chat instead (see
"Inline-pasted case" below).
```

- [ ] **Step 3: Update the Preconditions section (current lines 104–114) to branch by mode**

Old:
```
The case's `Status` field must be `Approved` (set after the joint Manual QA / AQA / Business
Analyst review, `/review-board manual-qa,aqa,analyst: ...`, applied via
`allure-update-test-case`):

- If `Status` is `Approved` — proceed.
- If not — stop and recommend the joint review first. Automating against an unreviewed case
  risks encoding gaps into "passing" tests.
- If the case doesn't exist yet — stop and point to `/execution:allure-commands:allure-create-test-case`.
```
New:
```
For the `<id>`/`tag:`/`module:`/`story:` modes, the case's `Status` field must be `Approved` (set
after the joint Manual QA / AQA / Business Analyst review, `/review-board
manual-qa,aqa,analyst: ...`, applied via `allure-update-test-case`):

- If `Status` is `Approved` — proceed.
- If not — stop and recommend the joint review first. Automating against an unreviewed case
  risks encoding gaps into "passing" tests.
- If the case doesn't exist yet (`<id>` mode) — stop and point to
  `/execution:allure-commands:allure-create-test-case`.
- If `module:`/`story:` resolves to zero matches — see Step 1a above: ask for a pasted case,
  don't invent one and don't check the local xlsx/csv path.

For the inline-pasted-case mode, there is no `Status` field to check (the pasted text is not an
Allure entity) — proceed directly to automation, but see "Inline-pasted case" below for the
output/tracking carve-out this mode requires.
```

- [ ] **Step 4: Add a new "Inline-pasted case" section right before "## Output" (i.e. after the
  current Constraints-adjacent content, before line 178's `## Output` heading)**

New section:
```
## Inline-pasted case (fourth mode, no slash-command syntax)

When the user pastes a test case's content directly into this chat (rather than invoking one of
the three argument forms above) and asks for it to be automated: skip Step 1/Step 1a entirely and
use the pasted text as the spec for Steps 2–4 (business context, API contract, project context)
exactly as documented above. There is no Allure case id and no local suite entry backing this run
— carry that carve-out through to Output (below): no `Automation Status` field to update, and the
PR description must state plainly that this test was automated from a manually-supplied case not
yet tracked in Allure or the local suite, recommending the user formalize it afterward via
`allure-create-test-case` or `mqa-create-local-test-case`.
```

- [ ] **Step 5: Update the Output section (current lines 178–187) with the inline-mode carve-out**

Append, right after the existing Output paragraph:
```
For the inline-pasted-case mode, there is no Allure `Automation Status` field and no local suite
entry to update — instead, the PR description explicitly states the test was automated from a
manually-supplied case, not yet tracked in Allure or the local suite, and recommends formalizing
it via `allure-create-test-case`/`mqa-create-local-test-case`.
```

- [ ] **Step 6: Update Constraints (current lines 204–213) to reference the new modes**

Add one sentence: `` Never fall back to `docs/test-cases/` as an automatic source when
`module:`/`story:` resolves to zero cases — ask for a pasted case instead. Never claim an
`Automation Status` update happened for the inline-pasted-case mode — there is no case to update. ``

- [ ] **Step 7: Grep the whole file for `GET /api`/`PATCH /api` and fix — this file already used
  the allure-commands abstraction rather than raw REST, so this should be a small/no-op check.**

- [ ] **Step 8: Leave as uncommitted change** — live validation of the zero-match path happens in
  Task 14.

---

## Task 14: Live validation — `module:`/`story:` zero-match path (requires explicit user awareness, not necessarily approval since read-only)

**Files:** none (validation only). This task is read-only (`testops_find_testcases` calls only) —
no mutation, so no confirmation gate is strictly required, but tell the user what you're checking.

- [ ] **Step 1: Pick a real module name and confirm it has un-automated cases**

Run Task 13 Step 1a's resolution logic against a real `module:<name>` (e.g. one of the known
Feature values from `rules/allure.md` §2 — "Accounts", say) and confirm it returns at least one
un-automated, `Approved` case, proving the happy path works.

- [ ] **Step 2: Pick a deliberately-nonexistent module name and confirm the zero-match path**

Run the same resolution against `module:ZZZ-DOES-NOT-EXIST` and confirm it resolves to zero
matches, then confirm `aqa-automate.md`'s documented behavior (Task 13 Step 2's new "If this
resolves to zero cases" paragraph) is what would actually happen — i.e. state to the user that
this is where the command asks for a pasted case, per the file as written.

- [ ] **Step 3: Report results**

Confirm both paths behave as documented, or note any discrepancy to fix in Task 13's file.

---

## Task 15: `mqa-create-local-test-case.md` — clarify "delete" (D5)

**Files:**
- Modify: `plugins/claude-proj-agent/commands/execution/mqa-commands/mqa-create-local-test-case.md`

- [ ] **Step 1: Add one sentence to the "## Mission" section (current lines 28–36)**

After the existing Mission paragraph (ending "...even without Allure access."), append:
```

There is no separate "delete a local case" command: since revisions are immutable and
append-only, removing a case means editing `docs/test-cases/<TICKET-KEY>/analysis.md` to drop the
requirement/case it traced to, then re-running this command — the next revision (`v<N+1>`) is
produced without it, exactly like any other requirement-driven change (see the Preconditions
section's revision-numbering step and Example 3 above, which already demonstrates this via a
content change; dropping a case entirely follows the same mechanism).
```

- [ ] **Step 2: Leave as uncommitted change**

---

## Task 16: `README.md` — rewrite Step 10

**Files:**
- Modify: `plugins/claude-proj-agent/README.md`

- [ ] **Step 1: Read the current Step 10 section in full** (it was seen mid-conversation during
  planning, via a fork agent's `sed -n '250,300p' README.md` — re-read the live file directly
  before editing, don't trust the cached excerpt, since the exact surrounding line numbers may
  have shifted since).

- [ ] **Step 2: Replace the Step 10 section's body**

Old (paraphrased from the cached excerpt — re-verify exact current wording before replacing):
```
### Step 10 — MCP secrets for direct GitHub/Allure TestOps tools (only if you need them)

Skip this unless you specifically plan to use the bundled `github` or `allure-testops` MCP
tools directly (most day-to-day QA/AQA/analysis commands go through the `atlassian` connection
from Step 8 instead, and don't need this).

```bash
cd proj-ai-agentic
cp plugins/claude-proj-agent/.mcp.json.example plugins/claude-proj-agent/.mcp.json
```

Then set these two environment variables for your user account (...) before starting a new
Claude Code session:

- `GITHUB_TOKEN` — ...
- `ALLURE_TESTOPS_TOKEN` — from your Allure TestOps account settings.
```
New:
```
### Step 10 — MCP secrets for direct GitHub/Allure TestOps tools (only if you need them)

Skip this unless you specifically plan to use the bundled `github` or Allure TestOps MCP tools
directly (most day-to-day QA/AQA/analysis commands go through the `atlassian` connection from
Step 8 instead, and don't need this).

```bash
cd proj-ai-agentic
cp plugins/claude-proj-agent/.mcp.json.example plugins/claude-proj-agent/.mcp.json
```

Open your new local `plugins/claude-proj-agent/.mcp.json` (already gitignored — never committed)
and paste your own real values directly in place of the placeholders, as plain literal strings —
**no environment variable, no shell profile edit**:

- `github.env.GITHUB_TOKEN` — a GitHub personal access token (github.com → **Settings →
  Developer settings → Personal access tokens**), read access is enough.
- `allure-testops-native.headers.Authorization` and `allure-testops.env.ALLURE_TOKEN` — your
  Allure TestOps personal API token (from your Allure TestOps account settings). Both entries
  need the same token pasted in — one is for the native MCP (test case/shared step/mute CRUD),
  the other for the third-party MCP (launches/statistics only); see
  `plugins/claude-proj-agent/rules/allure.md` §1/§8 for what each is for.

Restart Claude Code after saving `.mcp.json` for the new/changed servers to connect.
```
```

- [ ] **Step 3: Grep the whole README for `ALLURE_TESTOPS_TOKEN` and `8090`, fix any other
  surviving mentions outside Step 10 (e.g. a troubleshooting note elsewhere that assumed the old
  env-var scheme).**

- [ ] **Step 4: Leave as uncommitted change**

---

## Task 17: Sync `docs/INDEX.md` and `rules/INDEX.md`

**Files:**
- Modify: `plugins/claude-proj-agent/docs/INDEX.md`
- Modify: `plugins/claude-proj-agent/rules/INDEX.md`

- [ ] **Step 1: Add a row to `docs/INDEX.md`'s table**

Insert, after the `hrm-logs/` row:
```
| `architecture/` | Architecture decision records for this plugin's own tooling (framework-level design docs, e.g. the Allure TestOps MCP migration) — owned by the AI Architect role. Not project-spec/frame-specs content. |
```

- [ ] **Step 2: Replace `rules/INDEX.md`'s `allure.md` row**

Old:
```
| `allure.md` | Allure TestOps REST API integration: auth/token sourcing (`${ALLURE_TESTOPS_TOKEN}`), endpoint reference, column→field mapping, ID-resolution method, ticket-tag convention, native versioning, and (§8) the supplementary read-only `allure-testops` MCP server for launches/results/statistics. Read before ANY `execution/allure-commands/allure-*.md` or `execution/aqa-commands/aqa-*.md` command runs. |
```
New:
```
| `allure.md` | Allure TestOps MCP integration: the `allure-testops-native` tool reference (§3), token sourcing (local `.mcp.json`, never an env var), column→field mapping, ticket-tag convention, native versioning, and (§8) the third-party `allure-testops` MCP server, narrowed to launches/results/statistics only. Read before ANY `execution/allure-commands/allure-*.md` or `execution/aqa-commands/aqa-*.md` command runs. |
```

- [ ] **Step 3: Leave both as uncommitted changes**

---

## Self-Review Notes (already applied above, recorded for the executor's awareness)

- Every task ends with "leave as uncommitted" rather than a `git commit` step, per this
  repository's own `base-agent.md` convention (overrides the generic writing-plans template).
- Tasks 8, 11, and 14 are the plan's explicit realization of the spec's §7 testing plan (items
  1–6) — none of them are skippable "nice to have" steps; they're where this plan's central
  technical bet (MCP fully replaces REST for CRUD) gets checked against the real system before
  the rewritten command files are considered done.
- Task 8 Step 5 has a **conditional doc follow-up** (fix `rules/allure.md` §3b if tags turn out to
  merge rather than replace) — whoever executes it must not skip that conditional edit if the
  live result says so.
