# Allure TestOps built-in MCP migration — design

> **Superseded 2026-09-01** by `2026-09-01-allure-testops-custom-design.md` — the built-in
> `/api/mcp` approach proposed here was abandoned in favor of a self-built
> `allure-testops-custom` MCP server; kept for historical record of why, not as a current plan.

- **Status:** Superseded — see note above
- **Date:** 2026-08-14
- **Owner:** AI Architect (framework meta-role)
- **Scope:** `proj-ai-agentic` only — `commands/execution/allure-commands/`,
  `commands/execution/aqa-commands/`, `commands/execution/mqa-commands/`, `rules/allure.md`,
  `.mcp.json`/`.mcp.json.example`, `README.md`, `docs/INDEX.md`, `rules/INDEX.md`. No change to
  `proj-test-automation` (the consuming repo) — this is tooling/process only.

## 1. Problem

`allure-commands/` currently talks to Allure TestOps via direct REST calls (`curl`), because
Allure's own bundled MCP server (`/api/mcp`) was tested on 2026-07-20/21 and returned 404 on this
on-prem instance. As of today, the instance has been upgraded (confirmed: `26.1.1`,
`commit 810cc4fadddcb...`) and `/api/mcp` is fully functional. This makes the original
REST-based design's core premise stale, and the earlier "third-party read-only MCP
(`allure-testops-mcp`) supplements REST" split (rules/allure.md §8) obsolete for CRUD.

## 2. Verified facts (do not re-derive, re-verify if this doc is >1 sprint old)

- Working endpoint: `https://allure.proj.local:8443/api/mcp` (see §3 for the port change).
- `POST /api/mcp` `initialize` → `200`, `serverInfo.name: testops-mcp-server`,
  `serverInfo.version: 1.0.0`, protocol `2024-11-05`.
- `tools/list` returns exactly 13 tools, matching Allure's public MCP docs 1:1:
  `testops_create_testcase`, `testops_update_testcase`, `testops_find_testcases`,
  `testops_delete_testcase`, `testops_restore_testcase`, `testops_create_sharedstep`,
  `testops_update_sharedstep`, `testops_find_sharedsteps`, `testops_find_testresults`,
  `testops_create_mute`, `testops_delete_mute`, `testops_get_project`,
  `testops_get_issue_details`.
- `testops_create_testcase`/`testops_update_testcase` accept `tags[]` (by name),
  `customFields[]` (`{name, value}` — **by name, not numeric ID**), `links`, `issues`,
  `testKeys`, `members`, `parameters`, `scenario`, and `status`/`workflow`/`testLayer` (by name).
  This is a strict superset, ergonomically, of what REST required — REST needed a separate
  "resolve tree/custom-field IDs" step (`rules/allure.md`'s current §2, "Resolving
  project-specific IDs") that MCP does not need.
- `testops_create_sharedstep` (`projectId`, `name` required; `scenario` — same nested step tree
  shape as test cases, minus `shared`-type steps and `expectedResultSteps` nesting one level
  shallower) and `testops_create_mute`/`testops_delete_mute` (`testCaseId`+`name`(+`reason`) /
  `id`) schemas are both simple and require no ID-resolution step either — same ergonomic win as
  test cases.
- Smoke-tested `testops_find_testcases` (read-only) against `projectId=2` (`TB CBS`) — returned
  real data (1875 cases). Confirms end-to-end reachability with the current
  `ALLURE_TESTOPS_TOKEN`, not just a protocol handshake.
- Write tools (`create/update/delete/restore_testcase`, mute/sharedstep tools) were **not**
  smoke-tested — their presence in the schema is confirmed, their live behavior is not. First use
  in the real implementation doubles as that first real-world validation; see §7 (testing plan).
- **No single-step-level MCP tool exists** (no equivalent of REST's
  `POST/PATCH/DELETE /api/testcase/step`). `testops_update_testcase`'s `scenario` argument is a
  **full-tree replace**, same as REST's `PATCH .../{id}`/`POST .../scenario` bulk path — there is
  no MCP-native surgical single-step edit. Confirmed this is still fully workable: smoke-tested
  `testops_find_testcases` with `expand:["scenario"]` against a real case (id 89, `TC-021`) and
  it returns the scenario tree in the **exact same shape** `testops_update_testcase`'s `scenario`
  argument expects (`{"type":"body","body":"...","expectedResultSteps":[{"type":"expected_body",
  "body":"..."}]}`, flat array with nested `steps`/`expectedResultSteps`, no `bodyJson` needed as
  input — that field is server-generated on read). See D7.
- `testops_update_testcase`'s `tags[]`/`testops_create_testcase`'s `tags[]` semantics (full
  replace vs. merge) were **not** empirically confirmed. REST's tag endpoint
  (`POST /api/testcase/{id}/tag`) is known to fully replace the tag set. Treat MCP's `tags[]` as
  full-replace until proven otherwise — see D8.
- Minor, unrelated drift caught while probing case 89: `rules/allure.md` §2's "Tree 'Suites' ...
  currently **empty**, no case has a Suite yet" is already stale — case 89 has a populated `Suite`
  custom field (`api/system_core/tests/audit-fields-smoke.spec.ts`). Fix while rewriting §2 (§5.2).
- `hooks/classify-http-readonly.ps1` (the PreToolUse auto-approve hook) only inspects
  `tool_input.command` for Bash/PowerShell invocations — it has no visibility into native MCP
  `tool_use` calls. It will neither auto-allow nor flag a `testops_create_testcase` call; that
  call falls through to Claude Code's own generic tool-permission prompt instead. This is a gap
  relative to REST's fine-grained read/write classification, addressed in §6, not by extending
  the hook (see decision D2).

## 3. Port/URL correction

`http://allure.proj.local:8090` (documented in `rules/allure.md` and `.mcp.json.example`) is a
legacy plain-HTTP listener on the same backend. `https://allure.proj.local:8443` is the same
instance (identical version/commit) over TLS with a **valid, trusted certificate** (verified
without `-k`). Every reference to the instance URL moves to the `8443` HTTPS form:

- `plugins/claude-proj-agent/.mcp.json.example` — `ALLURE_URL`
- `plugins/claude-proj-agent/rules/allure.md` — "On-prem instance for this engagement" line, and
  every REST example URL in the file (being removed per §5 anyway, but any that survive as
  illustrative history must use `8443`, never `8090`)

`8090` is not being actively decommissioned by this change — if it later stops responding, that's
expected, not a regression to chase.

## 3a. Correction — the port call above was backwards (2026-08-21)

§3's decision is **reversed**. The engineer who administers `allure.proj.local` confirmed the
officially documented MCP endpoint is `http://allure.proj.local:8090/api/mcp` — plain HTTP,
token-authenticated, the same port CI/`allurectl` already uses. `:8443` is nginx's browser-facing
HTTPS front (browser login only, because of secure-cookie constraints) and was never intended to
carry MCP traffic. That `/api/mcp` answered `200` on `8443` during §2's smoke test doesn't make it
the intended path — nginx proxies the same backend through either port, so both "work" in the
sense of returning data; only `8090` is the one the server operator documents and commits to for
programmatic (CI/MCP) access.

This also explains the `UNABLE_TO_VERIFY_LEAF_SIGNATURE`/`NODE_EXTRA_CA_CERTS` trouble this
migration caused afterward: `allure.proj.local`'s certificate is self-signed with `Basic
Constraints: critical, CA:FALSE`, which OpenSSL/Node can never accept as a trust anchor no matter
how it's re-pinned — a structural property of the certificate, not a per-machine config mistake.
§2's "valid, trusted certificate (verified without `-k`)" claim was a false positive from a
curl/browser-based check, which reads the OS trust store (accepts the leaf by exact match)
instead of Node's OpenSSL-based store (requires `CA:TRUE` on any trust anchor).

**Reversing §3/§5.1/§5.2 accordingly:**

- `plugins/claude-proj-agent/.mcp.json.example` — `allure-testops-native.url` moves back to
  `http://allure.proj.local:8090/api/mcp`. Plain HTTP needs no `NODE_EXTRA_CA_CERTS`, no per-machine
  cert extraction, nothing to trust.
- `plugins/claude-proj-agent/rules/allure.md` §1 — the "On-prem instance"/port-note lines swap back
  to `8090` as canonical, `8443` demoted to "browser-only front, not for MCP."
- `README.md` Step 10 — the TLS-trust subsection (extract the `.pem`, set `NODE_EXTRA_CA_CERTS`,
  the matching troubleshooting bullet) is removed; it was solving a problem that only existed
  because of the wrong port.
- `allure-testops` (third-party, still configured against `https://allure.proj.local:8443` via its
  own `ALLURE_URL`) is **not** changed by this correction — it's a different client (`uvx`/Python,
  its own TLS stack) hitting Allure's general REST API, not the `/api/mcp` endpoint the operator
  confirmed, and there's no report of it failing. Revisit only if it starts failing too.
- Re-issuing the certificate with a proper root CA + leaf (the operator offered, ~15 minutes of
  admin work) is **not required** for MCP and is not blocking — worth doing only if/when some
  other Node client needs an HTTPS front. Not tracked as follow-up work by this document.

## 4. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Scope of MCP replacement: **test cases + shared steps + mutes** (all CRUD-shaped tools), not test cases alone. | Shared steps/mutes have no REST-based command today; MCP gives them for the same integration effort. Accepted trade-off: larger surface to review in one pass. |
| D2 | Confirmation gate for write MCP tools = **protocol step written into each command file** (show the exact call's arguments, get an explicit yes before invoking), not a hook change. | Keeps the change scoped to `allure-commands/`/`aqa-commands/` prose; a hook change affects every persona/command in the framework and needs its own, separately-justified review (`base-agent.md` changes require explicit consultation regardless). |
| D3 | Token handling: **no `.env`, no OS environment variable.** `.mcp.json.example` keeps a placeholder; each engineer's own gitignored `.mcp.json` has the real token pasted in as a literal string. | `.mcp.json` is already gitignored per-clone (confirmed in its own header comment). A literal value in a file that's never committed is simpler than `${VAR}` indirection, and sidesteps the documented Claude Code quirk (an MCP server's `args` cannot expand `${VAR}` from that same server's own `env` block — only from the real OS environment) entirely, rather than working around it. |
| D4 | Both MCP servers stay configured: the **built-in native MCP** (new) for test case/shared step/mute CRUD, and the **existing third-party `allure-testops-mcp`** for launches/results/statistics. | The built-in MCP has no launch-list-shaped tool (`testops_find_testresults` is test-result-level, not launch-level); replacing the third-party server would regress the AQA Lead's Release Readiness / coverage-trend questions that `rules/allure.md` §8 documents it for. |
| D5 | Local `.xlsx`/`.csv` path (`mqa-create-local-test-case.md`) is **unchanged**. No new "local delete" command. | Local suites are already immutable, version-numbered (`v1`, `v2`, ...) by design — "delete a case" already means "edit `analysis.md`, rerun the command, get `v<N+1>` without it." A literal file-delete command would contradict the existing never-overwrite/never-delete-a-revision rule. Only a doc clarification is needed (see §5). |
| D6 | `aqa-automate` gains two new invocation modes (module/story search, and an explicit inline-pasted-case mode) **in addition to** the existing `<id>`/`tag:` modes — see §5.4. | Closes the "AQA can't find a case" gap without inventing a silent local-file fallback, which would blur which store (Allure vs local) is authoritative for a given ticket. |
| D7 | Surgical single-step reconciliation edits become **read-modify-write**: `testops_find_testcases` (`aql: "id = <id>"`, `expand:["scenario", ...]`) to fetch the current tree, edit the target step's `body`/`expectedResultSteps` in the returned array, then `testops_update_testcase` with the complete revised `scenario`. | No MCP tool does a single-step patch; the whole-tree read/write round-trip is confirmed schema-compatible (§2) and is the only MCP-native path. Accepted trade-off vs. REST's atomic single-step call: a same-case concurrent edit between the read and the write would be silently overwritten — acceptable given this is a single-operator-per-ticket, chat-driven workflow, not a multi-user concurrent editor. |
| D8 | Every `tags[]` write via MCP (`testops_create_testcase`/`testops_update_testcase`) first fetches the case's current tags (`testops_find_testcases` with `expand:["tags"]`) and sends the **union**, never just the tags being added. | `tags[]`'s replace-vs-merge semantics aren't confirmed empirically; REST's equivalent (`POST /api/testcase/{id}/tag`) is known to fully replace. Assuming full-replace and always merging by hand is the safe default — the ticket-traceability tag (§6 of `rules/allure.md`) and Test level/Test type tags must never be silently dropped by an unrelated tag update. |

## 4a. Correction — D3 reversed (2026-08-25)

D3's "no OS environment variable" choice is **reversed**. `.mcp.json` is now a tracked,
secret-free file — `ALLURE_TOKEN` is read via `${ALLURE_TOKEN}` in `allure-testops-native.headers.
Authorization` and `allure-testops.env.ALLURE_TOKEN`, exactly the mechanism `github.env.
GITHUB_TOKEN` already used successfully throughout this migration. `.mcp.json.example` is removed
— the tracked `.mcp.json` is now its own template, since it holds no secret to protect.

**Why D3's premise didn't hold up:** D3 cited "sidesteps the documented Claude Code quirk (an MCP
server's `args` cannot expand `${VAR}` from that same server's own `env` block — only from the
real OS environment)" as a reason to avoid `${VAR}` entirely. That quirk is real but narrower than
D3 treated it: it only blocks a server's `args` from referencing a *sibling* `env` entry in the
same server's own config. It never blocked `headers` or `env` values from expanding `${VAR}`
against the real OS environment directly — `github.env.GITHUB_TOKEN` was proof of that the whole
time, sitting in the same file D3 was deciding about. Confirmed against current Claude Code docs
(`https://code.claude.com/docs/en/mcp.md`, "Environment variable expansion in `.mcp.json`") that
`headers` and `url` support the same expansion as `command`/`args`/`env`, so both Allure entries
can use it too.

**The actual cost D3 didn't anticipate:** a gitignored `.mcp.json` never travels into a new
version's installed-plugin cache directory (`~/.claude/plugins/cache/proj-ai-agentic/
claude-proj-agent/<version>/`) on a marketplace update, because that copy is git-tracked-content
only. Every `claude-proj-agent` version bump silently dropped all four of this plugin's own MCP
servers (`github`, `filesystem`, both Allure entries) until someone manually re-copied the file
into the new version directory — a step `README.md` had to document at length (removed by this
correction) and that still failed silently when skipped. Making `.mcp.json` trackable and
secret-free removes the manual step entirely: a version bump now carries it forward like any other
plugin file (`commands/`, `docs/`, `rules/`, `hooks/`).

**Files changed by this correction:** `plugins/claude-proj-agent/.mcp.json` (literal token →
`${ALLURE_TOKEN}`, now tracked), `.gitignore` (drop the `.mcp.json` secrets rule),
`plugins/claude-proj-agent/.mcp.json.example` (deleted — redundant once `.mcp.json` itself is
secret-free), `docs/ci-cd-secrets.md` (`ALLURE_TOKEN` joins `GITHUB_TOKEN`/`FIGMA_API_KEY` as a
normal exported env var, "Local setup"/"Rotation" sections drop the literal-paste carve-out),
`rules/allure.md` §1, `rules/INDEX.md`'s `allure.md` row, `README.md` Step 10 (drops the
copy-to-cache instructions and their troubleshooting entry).

## 5. Changes by file

### 5.1 `.mcp.json` / `.mcp.json.example`

Add a second Allure server entry (native, built-in). Example shape for `.mcp.json.example`
(placeholder token, template only):

```json
{
  "mcpServers": {
    "allure-testops-native": {
      "type": "http",
      "url": "https://allure.proj.local:8443/api/mcp",
      "headers": { "Authorization": "api-token PASTE-YOUR-TOKEN-HERE" }
    },
    "allure-testops": {
      "_comment": "Third-party, launches/results/statistics only — see rules/allure.md §8. Unchanged by this migration except the URL below.",
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

The exact `mcpServers` entry shape for an HTTP-transport MCP server (as opposed to the
stdio/`command`+`args` shape used by the third-party server) needs confirming against Claude
Code's current MCP config schema during implementation — this is a config-format detail, not a
design decision, and belongs in the implementation plan, not this spec.

`README.md` Step 10 rewrites to: copy `.mcp.json.example` → `.mcp.json`, open the local file, and
paste your own token in place of each placeholder — no environment variable, no shell profile
edit.

### 5.2 `rules/allure.md`

Restructures from "REST reference + supplementary read-only MCP" to "MCP tool reference (primary)
+ third-party MCP (unchanged, launches/statistics only)":

- Auth section: drop the `${ALLURE_TESTOPS_TOKEN}` OS-env-var instructions; replace with "token
  lives only in your local, gitignored `.mcp.json` — never read or print that file's contents."
- Replace the REST endpoint table (create/update/find/delete/restore test case, tree/group
  browsing, custom-field-value listing) with a tool reference table: tool name, purpose, key
  arguments, and the confirmation-gate note (§6 below) for every write tool.
- New "Reading and editing the step tree via MCP" subsection replaces the old "Reading the step
  tree from `GET /api/testcase/{id}/step`" section: document the read-modify-write pattern from
  D7 (`testops_find_testcases` with `expand:["scenario"]` → edit the returned array → full
  `scenario` replace via `testops_update_testcase`) as the only way to change one step, explicitly
  noting there is no MCP-native single-step patch.
- New "Tag writes are full-replace, always merge" subsection documents D8 — carries over the
  exact same discipline the current REST section already requires (`POST .../tag` "replaces the
  full tag set... fetch existing tags first and merge"), just re-pointed at
  `testops_find_testcases`(`expand:tags`)/`testops_update_testcase` instead of the REST endpoints.
- Tree/group browsing and custom-field-**value**-listing (`GET /api/testcasetree/group`/`leaf`,
  `GET /api/project/{id}/cfv`) have no direct MCP equivalent among the 13 tools.
  `testops_get_project`'s `customFieldDefinitions` expansion returns field **definitions**
  (names/types), not each field's already-used **values** — it does not by itself answer "does a
  'Login'/'login' near-duplicate value already exist?" The anti-duplicate check (§7.4 of the
  current file) instead becomes: `testops_find_testcases` with `expand:["custom_fields"]` scoped
  to the project, scanning the returned `customFields[].name` values already in use for the field
  in question. Heavier than a dedicated lookup endpoint (whole-project scan vs. one filtered
  call), but avoids reintroducing a REST-only code path for one check. Note this cost explicitly
  in the rewritten section rather than silently accepting a slower check. (This replaces item 4 of
  the current file's §7, "What Claude must check before mutating anything here.")
- §2's "Suite tree currently empty" line gets corrected (see stale-fact note in §2 above).
- §8 ("Allure TestOps MCP — supplementary, read-only") is renamed/reframed to describe the
  third-party server's now-narrower, still-legitimate role (launches/results/statistics only) now
  that the built-in MCP owns CRUD — not deleted, since D4 keeps it.
- Update the on-prem instance URL to `8443` (§3 above) throughout.

### 5.3 `allure-commands/`

Existing five commands (`allure-create-test-case`, `allure-update-test-case`,
`allure-delete-test-case`, `allure-get-test-case`, `allure-list-test-cases`) keep their names,
argument formats, and Mission/Output/Constraints exactly as documented — only their internal
"how" (REST call → MCP tool call) changes, plus the ID-resolution step drops out per §2.

New commands (native MCP capability with no prior REST equivalent):

- `allure-create-shared-step.md`, `allure-update-shared-step.md`, `allure-find-shared-steps.md`
- `allure-create-mute.md`, `allure-delete-mute.md`

`allure-commands/INDEX.md` gets rows for all five new files, following its existing table format.

### 5.4 `aqa-commands/aqa-automate.md`

Two new argument forms alongside the existing `<allure-case-id>` / `tag:<TICKET-KEY>`:

```
/execution:aqa-commands:aqa-automate module:<name>
/execution:aqa-commands:aqa-automate story:<name>
```

Searches `testops_find_testcases` (AQL) for un-automated cases (`Automation Status != Automated`)
matching that module/story, batches them exactly like `tag:` does today. **If zero matches**: stop
and explicitly ask the user to paste the case in the terminal — never silently fall back to
checking `docs/test-cases/` (that would blur which store is authoritative for a ticket that may
not even be using the local path).

Fourth mode — **inline-pasted case**: the user pastes a case's content directly in chat and asks
for automation against it. `aqa-automate` skips Step 1 (fetch from Allure) and uses the pasted
text as the spec for Steps 2–4 as documented today. Output/Definition of Done both gain an
explicit carve-out: there is no Allure `Automation Status` to update and no local suite entry, so
the PR description must state plainly that this test was automated from a manually-supplied case
not yet tracked in Allure or the local suite, and recommend the user formalize it via
`allure-create-test-case`/`mqa-create-local-test-case` afterward.

### 5.5 `mqa-commands/mqa-create-local-test-case.md` / `manual-qa-agent.md`

Doc-only clarification, no new command: add a line stating that "deleting" a local case means
editing `analysis.md` to drop the requirement/case and rerunning this command to produce
`v<N+1>` without it — consistent with the existing immutable-revision model.

### 5.6 Index/reference sync

- `rules/INDEX.md`'s one-line description of `allure.md` updates (currently says "REST API
  integration... (§8) the supplementary read-only MCP" — no longer accurate).
- `docs/INDEX.md` gains a new row for `architecture/` (this file's own folder).
- `allure-commands/INDEX.md` gains the five new-command rows (§5.3).

## 6. Confirmation gate for write MCP tools (D2, detail)

Every `allure-commands`/`aqa-automate` write path (`testops_create/update/delete/restore_*`,
`testops_create/delete_mute`) states, in its own Preconditions or a dedicated step: *before
calling this tool, show the user the exact arguments you are about to send (name, project,
fields, tags, etc.) and wait for an explicit go-ahead — do not proceed on an implicit "looks
good" or by inferring approval from earlier conversation.* This mirrors what REST's §7.3
confirmation gate already required for `curl -X POST/PATCH/DELETE`; the mechanism changes (prose
step instead of a hook that can see the shell command), the requirement does not.

## 7. Testing / validation plan (for the implementation plan to schedule, not to execute here)

1. Re-run the read-only smoke tests from §2 at implementation time if this spec is more than a
   few days old (endpoint/version drift check).
2. Before wiring `allure-create-test-case` to `testops_create_testcase` for real use, do one
   manual, explicitly-approved create + restore/delete cycle against a disposable/clearly-marked
   test case in project `2` (`TB CBS`) to confirm write behavior end-to-end (permission errors,
   field validation messages, whether `tags`/`customFields` resolve by name as the schema
   suggests) — this is the first real validation of the write tools noted as unverified in §2.
3. Confirm `testops_create_sharedstep`/`testops_create_mute` similarly before shipping the new
   shared-step/mute commands.
4. Confirm the "zero matches → ask for terminal case" path in `aqa-automate module:<name>` against
   a module with no existing cases (or a deliberately misspelled module name) before relying on it.
5. Empirically confirm `tags[]` replace-vs-merge behavior (D8) on the same disposable case from
   step 2: set two tags, then call `testops_update_testcase` with a `tags: [thirdTag]` and check
   whether the first two survive. If it turns out to merge rather than replace, D8's
   fetch-then-union step becomes unnecessary overhead and should be dropped from the rewritten
   `rules/allure.md` — don't leave defensive code/prose for a risk proven not to exist.
6. Confirm the read-modify-write step-edit pattern (D7) end-to-end once on the same disposable
   case: fetch via `expand:["scenario"]`, change one step's text, write back, re-fetch and confirm
   only that step changed and no sibling step/expected-result was dropped or reordered.

## 8. Out of scope

- Any change to `proj-test-automation` (test code, CI).
- Migrating already-existing Allure test cases' data (nothing about existing case content
  changes — only how future commands read/write it).
- Deprecating the `8090` HTTP listener (not this framework's call to make).
- Extending `hooks/classify-http-readonly.ps1` to understand MCP tool calls (D2).
