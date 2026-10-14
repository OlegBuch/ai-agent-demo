# TB-2225 Self-Heal Performance Complaint — Root-Causing, Fixes, and Orchestrator Review

**Date/time:** 2026-07-24 14:29 · **Branch:** group-3/TB-2225-FixTableHelper (started as group-3/TB-2225-Fix; renamed/committed outside this session at some point — see Open Items) · **Ticket(s):** TB-2225 (references TB-2034's prior self-heal work)

## Discussed

- User reported that despite yesterday's TB-2225/TB-2034 self-heal fixes, running the suite
  locally was "very long, very slow, and often fails" — pasted real terminal logs multiple times
  over the session as the primary evidence, not a description of symptoms.
- Root-caused two NEW bugs in the self-heal design (not caught by yesterday's own 4-round
  orchestrator review), purely from direct code reading against the pasted logs:
  1. `waitForTableApiReady`'s poll ceiling (300s) was shorter than the pod cold-start it could
     itself trigger (`COLD_START_WAIT_MS` = 450s) — guaranteed false "group is dead" diagnoses on
     any escalation.
  2. `healGroupIfDead`'s retry was a no-op for already-registered tables: retrying `createTable`
     against the replacement group 409'd (table already owned by the dead group), and
     `waitForTableApiReady`'s underlying `GET .../definitions` probe isn't group-scoped at all —
     so the "healed" retry kept polling the same dead group's pod regardless.
- Confirmed via the `proj-bruno-api` Bruno collection (`Table Registry/Tables/Update table.yml`)
  that `PUT .../tables/:tableId` with `{"group":{"id":N}}` is a real, documented way to reassign
  an existing table's owning group (200, returns updated `group.id`) — used this to fix bug #2.
- User asked directly "how do we check readiness" and suspected a false-negative — root-caused a
  third bug: `base-api-client.ts`'s `requestWithRetry` let a 401-triggered Keycloak token refresh
  silently consume the caller's entire retry budget (a `for` loop `continue` after refresh still
  incremented `i`), so a `retries:1` probe client (used by every polling loop in this subsystem)
  that hit a 401 mid-poll never actually retried with the fresh token — it just threw, and the
  poll loop read that as "not ready" when the table may have been ready all along.
- User asked "did our cleanup/afterEach delete the SYSTEM parameter?" — verified NO (schema-drop
  path is gated by `isTestOwnedName`, which `system_parameter` never matches) and instead
  root-caused the real mechanism: `clearSystemParameterInDb`'s `duringClear()` can legitimately
  take minutes (default 80-retry API budget), during which its own long-lived `dbClient` sits
  idle long enough to be killed by Postgres `idle_session_timeout` — so when `duringClear` then
  throws, the restore-on-failure path (meant to protect this global singleton row) fails too,
  permanently losing custom `SYSTEM` parameter state until `global-setup.ts` silently reinserts a
  hardcoded default on a later run.
- User asked to extend HTTP traceability (status code + response body) across the polling loops,
  then asked to also label *which* call/endpoint was being made in each log line (matching Bruno's
  own request names, e.g. "Get Table Definition", "Update Table Group").
- User asked to roll the DB-reconnect fix out to the ~18 other spec files sharing the same
  long-lived-`dbClient`-in-`beforeAll` pattern — this was split across 3 parallel background
  agents; all 3 (plus 2 more spawned for individual files) hit the org's **monthly spend limit**
  mid-run and failed. Only partial progress had landed (4 spec files) before the limit was hit.
- User then said they didn't like the explicit `ensureDbClientAlive(dbClient)` call sites and
  asked for the reconnect-on-dead-connection behavior to be hidden/automatic instead — this
  redesign (see Implemented) made the stalled 18-file rollout unnecessary: centralizing the fix
  inside `createDbClient()` itself covers every one of the ~30 call sites project-wide with zero
  changes needed at any call site.
- User asked to run a 4-round orchestrator review (`architect`, `aqa-lead`, `manual-qa`,
  `ai-architect`) specifically on whether the *whole* group-reuse/self-heal architecture is right
  for a fast+reliable suite, or whether continuing to patch it is the wrong call — explicit
  opt-in to multi-agent orchestration, run via the `Workflow` tool. Completed (20 agents, no
  errors); the architect's Round 1 proposal alone concluded the architecture is "fundamentally
  wrong... recommend structural change, not further patching," citing a worst-case ~17.5 minute
  chained escalation path as evidence the design is slow *by construction*, not just when broken.
  A separate fork was launched to read the full journal and synthesize the Round 4 final report
  (Executive Summary / Consensus / Disagreements / Final Recommendation / Risks / Open Questions)
  — **not yet returned as of this summary; see Open Items.**

## Implemented

All changes verified with `npx tsc --noEmit` and `npx eslint <file> --max-warnings=0` after each
step (both clean at every checkpoint).

- **`api/system_core/helpers/table-registry-helper.ts`**
  - `waitForTableApiReady`: poll deadline now extends to `COLD_START_WAIT_MS` from the moment of
    escalation instead of racing the original 300s ceiling against a 450s restart.
  - `createTableAndWait`: heal-retry (`attempt > 1`) now calls `client.updateTable(payload.id,
    {group: payload.group})` to actually reassign an already-registered table to the healed group
    before re-polling, instead of relying on a no-op `createTable` retry.
  - Added status-code/response-body + call-name (`Get Table Definition`, `Update Table Group`,
    `Update Table`) traceability to `waitForTableApiReady`'s heartbeat/escalation/throw messages
    and to `isGroupAlive` (previously entirely silent).
- **`api/utils/global-setup.ts`** — same traceability treatment for `waitForTableReady` and
  `refreshGroupEnv`.
- **`api/utils/base-api-client.ts`** — `requestWithRetry`: a successful 401 token refresh no
  longer consumes the caller's retry budget (`i--` before `continue`), capped at
  `MAX_TOKEN_REFRESHES = 3` to avoid an infinite loop if the token is genuinely never valid.
- **`api/utils/db-helper.ts`** — `createDbClient()` redesigned: now returns a `Proxy`-wrapped
  `Client` whose `.query()` transparently detects a dead connection (idle-session timeout,
  `ECONNRESET`, `08*` codes, "Connection terminated") on failure, reconnects, and retries the
  same call once, logging when a reconnect actually happens. The previously-added standalone
  `ensureDbClientAlive()` export (and every explicit call site added earlier this session in
  `customization-regression.spec.ts`, `customization-smoke.spec.ts`,
  `system-parameterization-smoke.spec.ts`, `ddd-regression.spec.ts`, and
  `clearSystemParameterInDb`) was removed/reverted — the fix is now fully implicit, and the
  stalled "roll it out to 18 more files" task is moot since every `createDbClient()` caller gets
  it automatically.
- **Ran, then abandoned, a 3-agent (+2 individual) background rollout** of the (now-obsolete)
  explicit `ensureDbClientAlive` pattern across the remaining spec files — all failed on the
  org's monthly spend limit before finishing; superseded by the `createDbClient()` redesign above,
  no further action needed on this front.
- **Ran a 4-round orchestrator review** (`Workflow`, run id `wf_1dfb3805-1f6`, 20 agents, all
  completed) on the TB-2225/2034 self-heal architecture. Full transcript at
  `.../subagents/workflows/wf_1dfb3805-1f6/journal.jsonl`. A synthesis fork was still running as
  of this summary.

## Learned

- **`GET tables/api/v1/tables/{tableId}/definitions` is not group-scoped** — confirmed via
  `table-registry-api-client.ts`/Bruno's `Get Table Definition.yml`. This is *why* healing to a
  replacement group can never rescue an already-registered table without an explicit `PUT
  .../tables/:tableId` reassignment first — retrying `createTable` against the new group ID is a
  409 no-op, and the readiness probe keeps hitting whatever pod the table-registry server still
  thinks owns that table id.
- **`PUT tables/api/v1/tables/:tableId` with `{"group":{"id":N}}` really does move a table between
  groups** (200, confirmed via Bruno example) — this was assumed-but-unverified in the codebase
  before today; now backed by a citation.
- **`requestWithRetry`'s `retries:1` probe-client pattern (used by every polling loop in this
  subsystem) silently ate one real attempt on every 401** — a systemic, not probe-specific, bug:
  any client with any retry budget effectively lost one real attempt per token refresh, this just
  happened to be most visible/damaging on single-attempt probes.
- **`clearSystemParameterInDb`'s restore-on-failure safety net was never actually safe against a
  long-running `duringClear`** — the exact "global singleton row, protect it at all costs" case
  the function's own comment describes was undermined by the same idle-connection class of bug
  found earlier in spec files, just in a different function.
- **Centralizing a cross-cutting fix at the resource-factory level (`createDbClient()`) beats
  threading it through every call site** — the user's own instinct ("hide `ensureDbClientAlive`,
  don't call it explicitly everywhere") turned out to also be the practical fix for the stalled,
  spend-limit-blocked 18-file rollout: one `Proxy`-based change covers all ~30 callers with zero
  per-file changes, no agent fan-out needed at all.
- **Background multi-agent fan-outs are subject to the org's monthly Claude spend limit** and fail
  hard (not gracefully degrade) when it's hit mid-run — worth keeping in mind before launching
  another large parallel batch this billing period.

## Open Items / Follow-ups

- **Orchestrator Round 4 final synthesis not yet delivered** — a fork was launched to read
  `wf_1dfb3805-1f6/journal.jsonl` and produce the Executive Summary/Consensus/Disagreements/Final
  Recommendation/Risks/Open Questions report; pending as of this summary. The architect's Round 1
  position alone ("fundamentally wrong architecture, recommend structural change, not further
  patching," citing a ~17.5 min worst-case chained-escalation path) is a strong early signal but
  is not the full 4-round outcome — don't treat it as final without the synthesis.
- **Branch/commit state changed outside this session**: the working tree is now on
  `group-3/TB-2225-FixTableHelper` (not the `group-3/TB-2225-Fix` this session started on) and
  shows "nothing to commit, working tree clean" / "up to date with origin" partway through the
  session, meaning all edits up to that point were committed and pushed by some means other than
  this session's own tool calls (never ran `git commit`/`git push` here). Not investigated further
  this session — flagged for whoever picks this up next.
- **None of today's fixes have been confirmed by a full live test run yet** — verification so far
  is `tsc`/`eslint` only, plus the user's own live runs pasted mid-session (which did show much
  faster, mostly-passing runs — e.g. two tests at 2.6m/2.3m instead of 12.8m — after the first
  round of fixes, before the DB-client redesign).
- Backend's "≤5-10 tables per group" constraint (from the prior TB-2034 session) is still not
  written into `docs/frame-specs/infrastructure.md` — still only recorded in chat history.
- `test-polling-helper.ts`'s `waitForTableField` and `createTablesAndWait`'s unconditional epoch
  bump — both flagged again this session (via the orchestrator review) as the same class of
  nested-retry/forced-restart issue, still untouched.

## References

None (no Jira/Allure/Confluence fetched via MCP this session). Technical grounding came from
direct reading of `proj-test-automation`'s own code/logs and the `proj-bruno-api` Bruno collection
(`C:\Users\user\BrunoApi\proj-bruno-api`, `Table Registry/Tables/Update table.yml` and `Table
Template/Table definition/Get Table Definition.yml`).
