# Parallelization Readiness (2-4 workers)

Audit run 2026-09-16 against the actual `api/`/`ui/` code (10 targeted Gather passes + direct reads
of `playwright.config.ts`, `architecture.md`, `testing-standards.md`), **followed by implementation
the same day** — see "What Changed" below for exactly what shipped. Treat the implementation section
as current as of that date; re-verify file lists before trusting them if this doc is read much later
(new specs added after 2026-09-16 that mutate `SYSTEM.PARAMETER`/`COMPANY` need adding to
`SINGLETON_RECORD_SPECS` in `playwright.config.ts` too — that's now a standing convention, not a
one-time list).

## TL;DR

This file is the single definition of the parallelism state; `architecture.md`, `build-and-run.md`
and `common-issues/playwright-execution/global-workers-pool-vs-per-project-cap.md` only link here.

**Current state (verified 2026-10-07 against `playwright.config.ts`, `api/utils/constants/api-client.constants.ts`,
`ui/base/constants/ui-workers.ts`, `scripts/test-scripts/shell-scripts/run-suite.sh` on the
working-tree branch `group-3/TB-4295`, not `origin/main`):**

| Setting | Actual value |
|---|---|
| `API_TESTS_PARALLEL_WORKERS` | env-driven, **default 1** (unset, empty or non-positive falls back to 1) |
| `UI_TESTS_PARALLEL_WORKERS` | env-driven, **default 1**, same guard (`ui/base/constants/ui-workers.ts`) |
| `API_TESTS_SINGLETON_WORKERS` | constant `1`; the singleton project's workers are `Math.min(API_TESTS_PARALLEL_WORKERS, API_TESTS_SINGLETON_WORKERS)` |
| Top-level `workers` | `API_TESTS_PARALLEL_WORKERS + UI_TESTS_PARALLEL_WORKERS` (no `CI` gate) |
| Singleton specs | `SINGLETON_RECORD_SPECS` in `api/utils/constants/singleton-record-specs.ts`, 13 files today (the list is the source of truth, not the "9"/"11" numbers quoted in the history below) |
| Runtime warning for `API_TESTS_PARALLEL_WORKERS > 1` | none: the `console.warn` in `base-api-client.ts` was removed |
| `run-suite.sh` | two legs: `API-tests` first (`CBS_SUITE_LEG=first`), then `API-tests-singleton` (`CBS_SUITE_LEG=followup`), blob reports merged afterwards; `ui` and `full` suites per `run-suite.sh` |
| `npm run test:api*` scripts | pass `--project=API-tests --project=API-tests-singleton` in one invocation (no two-leg ordering) |
| Per-project timeouts | `API-tests` and `API-tests-singleton` 900000 ms; `UI-Chromium` `UI_TEST_TIMEOUT_MS` (120000 ms) |

The sections below are the dated audit history; where they quote a different default (2), a 9-file
singleton list or a `console.warn`, the table above wins.

- **Status: implemented, not just analyzed.** `API-tests` is split into two Playwright projects —
  `API-tests` (most files, `workers: API_TESTS_PARALLEL_WORKERS`, env-overridable, default **1**)
  and `API-tests-singleton` (the files that mutate a genuine system-wide singleton record, pinned to
  `workers: 1`). Both run automatically from every existing `npm run test:api*` script (updated to
  pass both `--project` flags). The old hard `API_TESTS_MAX_WORKERS` guard is gone.
- **Key insight that made this a Small/Medium job instead of a rewrite**: raising `workers` did NOT
  require flipping `fullyParallel` to `true`. Both projects keep `fullyParallel: false`, so Playwright
  still runs every test *file*'s tests sequentially in one worker — every existing `beforeAll`/
  shared-fixture-per-file assumption stays valid unchanged. The only axis that mattered was
  **cross-file contention on shared external resources**, not intra-file test ordering.
- **Most in-process JS caches were already safe** across workers — each Playwright worker is a
  separate OS process, so a module-level `Map`/`WeakMap` is automatically per-worker, not a
  shared-across-workers hazard. `base-api-client.ts`'s old guard comment claiming otherwise was
  imprecise; the guard was first replaced by a `console.warn` describing the real, narrower tradeoff
  (see item #5), and that warning was later removed too (see "Current Rollout State").
- **The one architecturally-real blocker**: `SYSTEM.PARAMETER` (recordId `'SYSTEM'`) and `COMPANY`
  (keyed by `process.env.COMPANY_CODE`) are true system-wide singletons — not something a test can
  get its own copy of — and 9 spec files across 5 different modules independently
  capture→mutate→restore them. Two of those files running concurrently would race on the restore,
  permanently corrupting the record. Fixed by giving them their own single-worker Playwright
  project (`API-tests-singleton`) rather than trying to isolate each one individually. (The list has
  since grown to 13 files.)

## What's Actually Safe Already (no action needed)

| Area | Evidence | Why it's fine |
|---|---|---|
| `token-service.ts` context caches | `contextCredentials`/`contextOverrideTokens`/`contextInFlightRefreshes`/`contextRefreshTokens` — all `WeakMap<APIRequestContext, ...>` | Keyed per API context object, never shared, safe by construction regardless of worker count |
| `db-helper.ts#createDbClient()` | Returns a fresh `Client` per call, no pool | Most callers (40+ files) create one per test/operation — no shared-connection hazard |
| Kafka fixture | `api/utils/fixtures/api-fixtures.ts`'s `kafkaService` fixture constructs a fresh `KafkaService` per test, disconnects in `finally` | No shared client/topic state; topic names are parameter-driven per call |
| `test-user-service.ts` user provisioning | IDs via `generateCustomId()`, tracked via file-append (not a module-level array) | No shared counter; safe generation path |
| UI `dashboardUser`/`temporaryKeycloakUser` fixtures | `ui/base/fixtures/auth-ui-test.ts` — both test-scoped, provision a fresh user per test via `createTestUser` | No shared/singleton company or group state |
| `dynamic-name-generator.ts` | `generateCustomId`/`generateDynamicGroup`/etc. = `Date.now()` + `randomBytes(2)` hex suffix | ~2^12 entropy cushion per millisecond — collision-safe even with concurrent callers |
| `resource-tracker.ts` create-tracking | `trackCreatedGroup/Table/User` use `fs.appendFileSync` | Atomic append at the OS level — safe under concurrent writers |
| `error-format-helper.ts` | `describeError`/`redactBearerToken` | Pure functions, no state |
| Global setup/teardown "runs once" model | `architecture.md`: globalSetup/globalTeardown run **once per whole Playwright invocation**, not once per worker | A Gather pass raised "what if two workers enter global-setup concurrently" — that can't happen; Playwright's orchestrator runs these once in the main process before/after spawning any worker. No locking needed there. |

## What Changed (implemented 2026-09-16)

| # | Item | Fix shipped |
|---|---|---|
| 1 | `API_TESTS_MAX_WORKERS` hard guard | Replaced by two constants in `api/utils/constants/api-client.constants.ts`: `API_TESTS_SINGLETON_WORKERS = 1` and `API_TESTS_PARALLEL_WORKERS` read from the env (initially `?? 2`, changed the same day to a guarded default of 1, see "Current Rollout State"). `base-api-client.ts`'s old `throw` became a `console.warn` for `API_TESTS_PARALLEL_WORKERS > 1`, later removed entirely — the real (load, not correctness) tradeoff is item #5. |
| 2 | `resource-tracker.ts` untrack race | `untrackUser`/`untrackTables` now append an `untrack-user`/`untrack-table` tombstone line instead of `readFileSync`→filter→`writeFileSync`; `getTrackedResources()` reconciles tombstones against creates at read time (still only ever called once, from global-teardown, single process — no race there). |
| 3 | Hardcoded shared reference identities (`OFFICER_*`, `CUSTOMER_1/2`, `COMPANY_CODES_MOCK*`) | **Verified read-only** across every usage site found (product_factory condition payloads, user-profile `ALLOWED_CUSTOMERS` grants, all 14 `COMPANY_CODES_MOCK` sites) — no fix needed, no test mutates the record identified by these constants. |
| 4 | Singleton-record SEE-mutate-restore races (`SYSTEM.PARAMETER`, `COMPANY`) | New `API-tests-singleton` Playwright project (`playwright.config.ts`) pins these files (9 when shipped, 13 now) to `workers: 1`, so Playwright never schedules two of them concurrently — see `SINGLETON_RECORD_SPECS` in the config for the exact list. Every existing `npm run test:api*` script now passes both `--project=API-tests --project=API-tests-singleton` so none of the singleton files silently stopped running. |

**The singleton files at ship time (9; the live list is `api/utils/constants/singleton-record-specs.ts`, 13 files today, now also including `fin_accounting/tests/parametrisation-regression.spec.ts`, `transfer/tests/ddi-{smoke,regression}.spec.ts` and `limit/tests/limit-hierarchy-smoke.spec.ts`)** — this is a
living list, add to it whenever a new spec captures/mutates/restores `SYSTEM.PARAMETER`/`COMPANY`):
`fin_accounting/tests/parametrisation-smoke.spec.ts`, `integration_chapter/tests/sys-params.spec.ts`,
`security_management/tests/access-administration-{regression,smoke}.spec.ts`,
`system_core/tests/currency-{regression,smoke}.spec.ts`,
`system_core/tests/system-param-regression.spec.ts`,
`system_core/tests/system-parameterization-smoke.spec.ts`,
`consolidation_engine/tests/consolidation-engine-smoke.spec.ts` (routed here for a different but
related reason: 3 of its tests post journal entries against the same real, pre-existing customer
record inside a ~75s ClickHouse batch-aggregation window — delta-based assertions reduce but don't
eliminate the collision risk, and putting the whole file in the single-worker project removes it
entirely rather than trying to isolate just those 3 tests).

**Coverage caveat, stated plainly**: the 8 SYSTEM.PARAMETER/COMPANY files were found by a Gather
pass that explicitly searched `fin_accounting`, `integration_chapter`, `security_management`, and
`system_core`; a lighter first pass had also flagged `account`, `customer`, and `product_factory` as
worth checking for the same capture/mutate/restore idiom on some *other* shared record, and
`audit-fields-smoke.spec.ts` was specifically checked and confirmed clean (no `SYSTEM.PARAMETER`/
`COMPANY` reference at all). Treat the 9-file list as verified-correct, not provably exhaustive —
if a new cross-test flake pattern shows up after enabling `workers: 2` that looks like a corrupted
shared record rather than a load issue (items #5/#7 below), check first whether an unfound singleton
mutator is the cause before assuming it's noise.

## Should-Fix / Hardening (not hard blockers, but real risk under real concurrency)

| # | Issue | Evidence | Risk | Fix direction |
|---|---|---|---|---|
| 5 | `upstreamCircuitByService` / Keycloak credential-failure circuit breakers | `base-api-client.ts` module-level `Map`; `token-service.ts` `credentialFailureCounts`/`knownInvalidCredentials` | Each worker's breaker is independent — N workers hitting a genuinely bad credential or an unhealthy backend collectively send up to N× the failed-attempt volume before any one breaker opens, worsening exactly the Keycloak-under-load 401 pattern already documented | **Accepted as a documented tradeoff** — nothing blocks or warns at `API_TESTS_PARALLEL_WORKERS > 1` (the interim `console.warn` was removed); revisit only if the owner's canary run (below) shows this amplification actually causing failures |
| 6 | `BalanceManagementSuite` shared `Client` | `balance-management-helper.ts` — one `ledgerDb` client created once in `beforeAll`, reused by every test in the file | Safe *only* as long as `fullyParallel: false` keeps one file's tests confined to one worker, sequential — but it's a landmine if anyone later flips `fullyParallel: true` for speed without re-auditing this file | Still open — low priority. Document the dependency explicitly at the top of the file, or refactor to a fresh client per test |
| 7 | Shared `DYNAMIC_GROUP_ID` under concurrent load | `global-setup.ts` creates ONE table group for the whole run; `workerGroupId` fixture resolves the same ID for every worker (`architecture.md`, confirmed by Gather) | All N workers now create/drop tables inside the same K8s-backed group concurrently — possible Postgres DDL/catalog lock contention, pod resource pressure, or per-group rate limits not previously exercised | Still open — this is exactly what the owner's canary run below is for; watch `information_schema.tables` polling timeouts and DDL contention before raising `API_TESTS_PARALLEL_WORKERS` past 2 |
| 8 | `Date.now()`-only uniqueness (no random suffix) | 415 occurrences of bare `Date.now()` vs. only 9 of `crypto.randomUUID()`/uuid across `api/`; `testing-standards.md` already flags this as legacy debt | Two workers computing an ID in the same millisecond without the `dynamic-name-generator.ts` random suffix can collide; low probability per-call but now has N× more concurrent callers | Still open — opportunistic cleanup per `testing-standards.md`'s existing rule, no dedicated sweep needed |
| 9 | Schedule spec UTC-hour collision | `company-timezone-enforcement.spec.ts` (under `ui/`, formerly `ui/schedule/tests/`) derives its test window from `new Date().getUTCHours()` | Only matters if this UI spec is ever split across workers — UI stays at `workers: 1` (see below), so currently moot | Still open, low priority, not touched by this round |

## Current Rollout State & Next Steps

**2026-09-16, later same day**: default changed from 2 to **1** (fully conservative — behavior is
unchanged from before this whole audit unless someone explicitly sets the env var), and
`allureReporterConfig.environmentInfo` in `playwright.config.ts` now carries
`apiTestsParallelWorkers`/`apiTestsSingletonWorkers`, so a run's actual worker counts are visible in
the Allure report itself, not just Playwright's own transient `Running N tests using W workers`
console line (confirmed that line exists — `playwright/lib/runner/index.js` — but it's a single
combined number across all projects in one invocation, not broken out per project, and isn't
persisted anywhere once the console scrolls past it).

**2026-09-16, the ACTUAL root cause of "still shows 1 worker" — found via a live VM diagnostic,
not guessed** — every earlier "fix" this same day (removing the `CI` gate on the top-level
`workers`) was real but insufficient, because `API_TESTS_PARALLEL_WORKERS` itself was silently
always `1` regardless of `.env`. Root cause: `playwright.config.ts` called
`import dotenv from 'dotenv'; ...; dotenv.config();` **after** its own
`import { API_TESTS_PARALLEL_WORKERS, ... } from './api/utils/constants/api-client.constants'`.
This project compiles to CommonJS (`"type": "commonjs"` in `package.json`), where TS/Babel turns
`import` into `require()` calls that execute in **literal source order** (unlike native ESM's
hoisting) — confirmed by reading the actual compiled output in Playwright's own transform cache on
the VM (`/tmp/playwright-transform-cache-<uid>/`). So `api-client.constants.ts`'s
`Number(process.env.API_TESTS_PARALLEL_WORKERS ?? 1)` ran, and froze its result, **before**
`dotenv.config()` had loaded `.env` into `process.env` — always seeing `undefined` and falling back
to `1`, no matter what `.env` said. Verified directly with a temporary debug `console.error` in the
deployed config (`--list` only, no real test execution) before touching anything: raw
`process.env.API_TESTS_PARALLEL_WORKERS` was correctly `"2"`, but the imported constant had already
locked in `1`. **Fixed**: `import 'dotenv/config';` is now the literal first line of
`playwright.config.ts` (before every other import), so its config-loading side effect always runs
first regardless of import order elsewhere in the file; the old separate `import dotenv from
'dotenv'` + `dotenv.config()` call is gone. Re-verified locally with the same temporary-debug-print
technique, `API_TESTS_PARALLEL_WORKERS=2` in the environment: the constant now correctly resolves
to `2`. **This is the fix that actually matters for the constant reading correctly at all** — the
earlier `CI`-gate removal was still correct and necessary, just not sufficient on its own.

**2026-09-16, a fourth thing found from a live VM run** — `scripts/test-scripts/shell-scripts/run-on-vm.sh`'s `watch_run()`
live-tails the VM's log through a hardcoded `grep -E '<pattern list>'` filter, so anything not
matching one of those patterns is silently invisible in the terminal even though it's really being
written to the log on the VM. Playwright's own `Running N tests using W workers` startup line, and
the new `workers : ...` header line just added to `run-suite.sh`, both failed to match any pattern
in that filter — invisible live, even though both were confirmed present in the fetched `run.log`
afterward. **Fixed**: added `workers` to the label alternation and `^Running [0-9]+ tests? using` as
its own pattern. Verified against synthetic sample lines (noise line still dropped, both new lines
now pass, existing checkmark/passed/failed patterns unaffected).

**2026-09-16, feedback after seeing it in a real run's log** — `base-api-client.ts`'s
`console.warn` about `API_TESTS_PARALLEL_WORKERS > 1` (the Keycloak/upstream circuit-breaker
dilution tradeoff, item #5) read as alarming in a plain run log — long, mentions "bad credential"/
"unhealthy backend"/"2x retry volume" out of context, easy to mistake for an actual problem.
**Removed entirely** (and its now-unused import) — the tradeoff itself is unchanged and still fully
explained in this doc (item #5) for anyone who wants to understand it; it just no longer prints at
runtime. In its place, `scripts/test-scripts/shell-scripts/run-suite.sh` now prints a plain, calm `workers : ...` line in its
own startup summary (right under `suite :`), computed via the exact same
`Number(process.env.API_TESTS_PARALLEL_WORKERS ?? 1)` expression as the real TS constant — e.g.
`workers     : API-tests=2, API-tests-singleton=1` — so the actual worker count is visible
immediately at the top of any VM/local run, without digging through Playwright's own later
`Running N tests using W workers` line or a scary per-worker-process warning.

**2026-09-16, caught from the SAME live VM run's own report** — `playwright.config.ts`'s top-level
`workers` was still gated on `process.env.CI` (`process.env.CI ? sum : undefined`), a leftover from
when every worker count was hardcoded to 1 anyway. On a manual `run-on-vm.sh`/SSH invocation `CI`
isn't set, so this fell back to `undefined` and Playwright auto-detected from the VM's own CPU count
— landing on 1. Result: the run's own Allure `environment.properties` recorded
`apiTestsParallelWorkers=1` and `run.log` showed `Running 17 tests using 1 worker`, even though
`base-api-client.ts`'s warning (read inside worker processes) correctly showed
`API_TESTS_PARALLEL_WORKERS is 2` — the env var itself was right, but the top-level ceiling silently
overrode it down to 1. **Fixed**: removed the `CI` gate entirely — `workers` is now unconditionally
`API_TESTS_PARALLEL_WORKERS + API_TESTS_SINGLETON_WORKERS`, so a manual VM/local run and a CI job
behave identically, driven only by the env var. `retries`/`forbidOnly` stay CI-gated (that's a
genuine CI-vs-local policy difference, unrelated to this bug). **This run is not evidence about
2-worker behavior** — it only ever ran 1 worker; re-run after this fix for a real canary read.

**2026-09-16, a third place found the same way** — `scripts/test-scripts/npm-scripts/find-test.ts` (the interactive
file/test picker that builds and copies a `npx playwright test ...` command, never executes it
itself) had its own `projectFor(relFile)` hardcoded to `ui/` → `UI-Chromium` else → `API-tests` —
picking one of the 9 singleton files locally would have copied a command doomed to find 0 matching
tests (that file is in `API-tests`'s `testIgnore`). **Fixed properly instead of patching a third
copy of the file list**: extracted `SINGLETON_RECORD_SPECS` into its own module,
`api/utils/constants/singleton-record-specs.ts`, imported by both `playwright.config.ts` (project
routing) and `find-test.ts` (`projectFor` now returns `API-tests-singleton` for those 9 files).
Single source of truth going forward — add a new singleton-mutating spec there once, not in
multiple places.

**2026-09-16, caught from a live VM run's own log** — `scripts/test-scripts/shell-scripts/run-suite.sh` is a *second*,
independent place (besides `package.json`) that hardcoded a single `PROJECT="API-tests"` for every
API suite name (`health-check`/`smoke-m1`/`smoke-m2`/`regression-m1`/`regression-m2`/`integration`/
`e2e`/`api`) — missed when `API-tests-singleton` was introduced, so every suite run through this
script (which is what `scripts/test-scripts/shell-scripts/run-on-vm.sh` actually calls on the VM) silently excluded all 9
singleton files with **no error, no warning** — the run's own summary line
(`suite : e2e (project=API-tests grep=@e2e)`) was accurately reporting the gap, just easy to miss.
**Fixed**: `run-suite.sh` now builds a `PROJECTS` array and passes `--project=API-tests
--project=API-tests-singleton` together for every API suite name (mirroring the `package.json` fix);
`ui` and `full` are unaffected. If a third invocation path is ever added (or if `run-suite.ps1` gets
created to mirror the `.sh`), it needs the same two-project pairing — this is now the standing rule
whenever a new spec is added to `SINGLETON_RECORD_SPECS`, not just a one-time fix.

**Shipped**: `API_TESTS_PARALLEL_WORKERS` defaults to **1**, so `npm run test:api` (or any
`test:api:*` script) behaves exactly as before this whole audit until someone deliberately sets
`API_TESTS_PARALLEL_WORKERS` (in `.env` — see `.env.example`) to try 2-4. The 9 singleton files
always run at 1 worker in `API-tests-singleton` regardless of that setting. Adjusting the value is
env-only, no code change needed.

1. **Canary (run only after the owner names the environment)**: the owner sets
   `API_TESTS_PARALLEL_WORKERS=2` in `.env`, runs against a real environment and watches specifically for: `information_schema.tables` polling timeouts (item #7),
   any new orphaned-schema/orphaned-user report (would mean item #2's fix has a gap), and Keycloak
   401 bursts (item #5).
2. **If clean**, the owner raises `API_TESTS_PARALLEL_WORKERS` to 3, then 4, one step at a time, each with at
   least one full run, re-checking the same three signals — this is exactly what makes the value
   env-driven instead of hardcoded.
3. **UI** (`workers: 1` / `fullyParallel: false` on `UI-Chromium`) was left untouched — the Gather
   pass found UI fixtures already clean (fresh-per-test users, no shared state except item #9), but
   the actual constraint driving today's `workers: 1` there is Playwright's own
   beforeAll-duplication concern (already independently solved by `fullyParallel: false`), not
   anything UI-specific and unsafe. Raising it is a separate, lower-risk follow-up, not bundled here.

## Independent Opus Audit (2026-09-16, same day)

Requested explicitly by the user after the implementation above shipped — a fresh Opus-model agent
(no memory of the implementing session) audited every file touched, with instructions to remove
every comment the implementing session had added (violated this repo's zero-comments convention
throughout) and do a rigorous correctness/simplicity pass. Verified independently afterward
(`tsc`/`eslint`/`prettier`/`bash -n` all clean; spot-checked the DDI finding below personally).

**Bugs found and fixed by the audit:**
- **Real blocker**: `Number(process.env.API_TESTS_PARALLEL_WORKERS ?? 1)` does not catch an empty
  string — `.env.example` ships the var *empty*, so `Number('' ?? 1)` was `0`, and Playwright
  rejected the config outright (`workers must be a positive number`). Anyone copying
  `.env.example` to `.env` as shipped could not start the suite at all. Fixed to
  `Number.isInteger(n) && n > 0 ? n : 1`, mirrored in `run-suite.sh`'s node snippet so the two can't
  drift.
- **`SINGLETON_RECORD_SPECS` was incomplete**: `transfer/tests/ddi-{smoke,regression}.spec.ts` both
  reach `ddi-helper.ts`'s `snapshotGlobalSettings`/`restoreGlobalSettings` on a fixed-key record
  (`DDI_CONSTS.GLOBAL_SETTINGS_ID`) — the exact same capture-mutate-restore singleton shape as
  `SYSTEM.PARAMETER`/`COMPANY`, just a different table. Added to the list (project split grows from
  9 to 11 files, 289→353 tests in `API-tests-singleton`).
- `README.md` had a stale claim about a warning that had since been deleted — corrected.

**Verified (not re-asserted from the earlier passes — independently re-derived):**
- The project split is exactly lossless: original single project was 1922 tests/90 files; split is
  1569/79 + 353/11 = 1922/90. No file matches neither project or both.
- Per-project `workers` is real in this Playwright version — traced to `_workerLimitPerProjectId`
  in `runner/index.js`; the singleton project genuinely cannot run two files at once regardless of
  the other project's worker count, and there's no starvation/deadlock between the two.
- The dotenv-order fix is correct at the compiled-output level (`require("dotenv/config")` before
  the constants require, confirmed in Playwright's own transform cache) and its transitive closure
  is clean — swept all 15 module-scope `process.env` reads repo-wide; nothing else shares the bug.

**Found, deliberately NOT fixed at the time — open decisions (item 1 was implemented 2026-09-17, see "Keycloak Fix Implemented"):**
1. **Keycloak 401 on the super-admin bootstrap login (high severity)** — independently reached the
   same root cause as manual investigation the same day: `auth-service.ts`'s `isRetryable` treats
   *every* 401/403 as a deterministic "don't retry" (to avoid compounding a real brute-force lock on
   long-lived shared credentials) — reasonable for an established credential, wrong for a
   just-created, single-run-scoped one with zero failure history. The bootstrap
   (`global-setup.ts` → `createSuperAdminTestUser`) declares the identity "ready" right after
   creation with no probe login and only a blind fixed delay, so a second worker can now reach an
   admin-context login sooner (in real wall-clock terms) than was ever possible under 1 worker,
   landing inside a real Keycloak eventual-consistency window. The audit also flagged that the
   *other* Keycloak login path (`token-service.ts`) retries the identical error class 3× — the
   framework classifies the same error two different ways depending which path is used.
   **Recommended fix** (not yet applied): add a bounded probe-login retry in
   `createSuperAdminTestUser` before `writeSuperAdminSentinel`/declaring ready — safe specifically
   because it's a brand-new identity with no failure history — and reconcile the two divergent
   classifiers. Needs a decision before applying since it touches the shared auth hot path.
2. **More singleton candidates, not verified to the same depth as DDI** — `card-management-smoke.spec.ts`
   overwrites a fixed card type (`'STANDARD-CARD'`) that `transfer-integration.spec.ts` reads as its
   seeded type; `transfer-integration.spec.ts` itself mutates env-seeded/first-eligible-row shared
   accounts; `account-maintenance-smoke.spec.ts` stages an `UPDATE_ACCOUNT` on a live contract picked
   by `ORDER BY c.id DESC LIMIT 1` (a TOCTOU pattern) with **no restore at all**. None added to
   `SINGLETON_RECORD_SPECS` without deeper per-case verification first.
3. **Architectural gap**: the singleton project serializes *mutators* of `SYSTEM.PARAMETER`/`COMPANY`
   against each other, but does **not** serialize them against the parallel project's *readers* of
   those same records, since both projects run concurrently — e.g. `enquiry-regression.spec.ts`
   reads `SYSTEM.PARAMETER.REPORT_RETENTION` and asserts on it, `soft-accounting-smoke.spec.ts` reads
   `COMPANY MOCK.LOCAL_CURRENCY` — a singleton-project write landing in that window could flip either
   assertion. Making `API-tests-singleton` a Playwright `dependencies`-ordered phase (run after, not
   alongside, the parallel project) would close this at the cost of wall-clock time — a real tradeoff
   to make deliberately, not fixed here.
4. **Circuit-breaker dilution confirmed correct-to-remove, but thresholds not scaled**: independently
   agreed the old `base-api-client.ts` guard's own justification was inverted (a per-process,
   per-context cache is fine *because* each worker is its own process — never a real correctness
   issue) — but `NO_HEALTHY_UPSTREAM_CIRCUIT_THRESHOLD = 20` and the Keycloak 3-strike trip are still
   per-process and therefore N× weaker at N workers. Not scaled by worker count; noted as a
   should-fix if this ever causes a real incident.
5. Minor: `run-suite.sh`'s `workers :` line reads the env var directly and doesn't account for a
   `--workers=N` CLI override reaching the same invocation (its own usage text advertises exactly
   that pattern) — low severity, diagnostic-only. `run-on-vm.sh`'s `set -x` line
   (`+ exec npx playwright test --project=...`) — arguably the single most useful confirmation line
   of which projects actually ran — still isn't in the live-tail filter.
6. Tombstone model (item #2 from the original audit) confirmed NOT a real problem at realistic run
   sizes; two latent (not currently reachable) caveats noted: a tombstone is keyed only by id with no
   TTL, so a create→untrack→recreate-same-id sequence would wrongly suppress the recreated resource
   from cleanup (no such path found — Keycloak userIds are UUIDs); and `untrackTables` batches all
   tombstones into one `appendFileSync`, atomic only up to typical pipe-buffer size (~4KiB).

**Simplification recommended, not applied**: the `import 'dotenv/config'` positional constraint that
makes item's #5 dotenv fix work is invisible to a future editor — an import-sorting tool or a
careless future edit could silently reorder it back into the bug. No test currently guards this.
Consider reading `process.env` at call-time (a function) instead of module-load-time in
`api-client.constants.ts`, or add an explicit lint rule/test asserting import order, rather than
relying on a comment (which was itself removed as part of this same audit).

## Keycloak Fix Implemented (2026-09-17)

Both manual investigation and the independent Opus audit converged on the same root cause and fix
direction; implemented surgically without touching the shared `auth-service.ts`/`token-service.ts`
retry classifier (which correctly refuses to retry `AUTH_INVALID_CREDENTIALS` for already-established,
long-lived shared credentials, to avoid compounding a real Keycloak brute-force lockout — that
protection stays exactly as-is).

- **`api/utils/services/test-user-service.ts`** — `createSuperAdminTestUser`'s blind
  `await delay(10_000)` (a guess that Keycloak would have propagated the brand-new user's password by
  then) replaced with `waitUntilLoginSucceeds`: a real probe login via the existing
  `getKeycloakAccessToken`, retried up to 5× / 2s apart specifically because this identity is
  guaranteed brand-new with zero prior failure history — safe to retry here even though the general
  policy elsewhere refuses to. `createTestUserSession`'s identical blind delay before
  `createUserAuthenticatedApiContextWithRetry` was removed outright (redundant now — see next fix).
- **`api/utils/helpers/test-polling-helper.ts`** — found a second, independent instance of the same
  bug class while implementing the above: `retryContextCreation`'s own doc comment claims it retries
  "while Keycloak/SMS is syncing", but its code had `if (e instanceof KeycloakAuthError) throw e;` —
  unconditionally re-throwing immediately on exactly the error class that syncing produces, defeating
  its own stated purpose for all 17 call sites of `createAuthenticatedApiContextWithRetry`/
  `createUserAuthenticatedApiContextWithRetry` (every one of them is a "just created a user, log in
  as them" pattern — same "brand new identity" safety argument applies). Removed the guard so
  `KeycloakAuthError` now falls through to the function's existing bounded retry (default 10×/1s,
  same total budget as the blind delay it replaces, but adaptive instead of a fixed guess).

Not changed: `auth-service.ts`'s `isRetryable` classifier itself, `classifyKeycloakAuthError`, and the
general Keycloak login/token-refresh hot path — the fix is confined to the two call sites that are
*always* about a freshly-created identity, exactly where the existing "never retry a 401" policy was
wrong to apply.

## Consult Before Raising Past the Canary Default

Per this role's Decision Boundaries, raising `API_TESTS_PARALLEL_WORKERS` past the 2-worker
canary is a change to test *execution* infrastructure load (K8s group/pod sizing,
Postgres connection count, Keycloak login volume) — confirm the target group's K8s sizing and DB
connection limits with whoever owns that infra before step 2 above, not just with the AQA Lead.

## Follow-up Fix (2026-09-21) — `find-test.ts` Azure branch ignored `ui/` vs `api/`

A second, independent bug from the same file, found while diagnosing a live "`Error: No tests
found`" on a `run-on-vm.sh api ui/auth/tests/*.spec.ts` invocation. Unlike the 2026-09-16 fix above
(which corrected the *local*-target branch's `projectFor()` routing for singleton specs), the
*Azure*-target branch (`target !== 'local'`) hardcoded suite `api` for every selected file
regardless of whether it lived under `ui/` or `api/` — so picking a `ui/` file always produced a
copied command doomed to find 0 tests (`api` suite's projects have `testDir: './api'`).

**Fixed**: the Azure branch now picks `ui` vs `api` per file the same way the local branch already
picks a project (`relFile.startsWith('ui/') ? 'ui' : 'api'`), grouping into separate
`run-on-vm.sh` commands when a selection mixes both. No env/config change — pure `find-test.ts`
logic fix.

## UI Parallelization Implemented (2026-09-21)

The lower-risk follow-up flagged at the end of "Current Rollout State & Next Steps" (item 3) is now
done. `UI-Chromium`'s `workers: 1` was hardcoded and unrelated to `API_TESTS_PARALLEL_WORKERS`;
raising it needed its own env-driven constant, mirroring the API pattern exactly.

**Safety audit before shipping** (a Haiku Gather pass read all 9 UI spec files + their fixtures,
independently re-verified by direct reads of the two flagged files): no UI spec captures/mutates/
restores a system-wide singleton the way the 11 API `SINGLETON_RECORD_SPECS` files do.
`company-selection.spec.ts` and `company-timezone-enforcement.spec.ts` reference the shared MOCK/
MOCK_1 company records, but only ever **read** them (asserting `timezone: 'UTC'` stays unchanged,
confirmed at `ui/schedule/tests/company-timezone-enforcement.spec.ts:81-86`) — no test writes to a
company record. `field-registry.spec.ts`'s `fieldRegistryPreconditions` fixture is `scope: 'worker'`
(`ui/field-registry/fixtures/field-registry-ui-test.ts:20`), which is inherently parallel-safe, not a
hazard: each worker process gets its own instance, and `field-registry-setup.ts` generates its
table/field IDs via `generateDynamicTable`/`generateDynamicField` (same collision-safe
`Date.now()` + random-suffix generator already vetted safe for API) — no fixed/shared identifier
between workers. The one pre-existing open risk this shares with API item #7
(`requireDynamicGroupId()` resolving the same K8s table group for every worker) already applies
today at `API_TESTS_PARALLEL_WORKERS > 1` and isn't newly introduced by this change.

**Shipped**:
- New `ui/base/constants/ui-workers.ts` — `UI_TESTS_PARALLEL_WORKERS = Number.isInteger(n) && n > 0
  ? n : 1` from `process.env.UI_TESTS_PARALLEL_WORKERS`, same empty-string/invalid guard as the
  Opus-audit fix for `API_TESTS_PARALLEL_WORKERS` (item 5 of that audit) — an unset or empty env var
  can't zero out `workers` and crash the config.
- `playwright.config.ts`: `UI-Chromium` project's `workers` now reads that constant instead of a
  literal `1`; `fullyParallel: false` is unchanged (this is what keeps every existing
  `beforeEach`/fixture-per-file assumption valid — only different *files* get spread across
  workers, exactly the same axis the API rollout relied on). Top-level `workers` changed from
  `API_TESTS_PARALLEL_WORKERS` alone to
  `API_TESTS_PARALLEL_WORKERS + UI_TESTS_PARALLEL_WORKERS` (the singleton project's workers are capped by `Math.min` against the API value, so it never exceeds that pool) — this is
  the total worker-pool ceiling Playwright applies across the whole invocation (including `full`,
  which runs the API and UI projects together); leaving it at just the API value would have silently
  capped a UI-only run back down to whatever `API_TESTS_PARALLEL_WORKERS` happened to be, the same
  class of bug the CI-gate fix above already had to catch once. `uiTestsParallelWorkers` added to
  the Allure `environmentInfo`, mirroring the two existing API worker-count fields.
- `scripts/test-scripts/shell-scripts/run-suite.sh`: added the same guarded `UI_PARALLEL_WORKERS` node read as the existing
  `API_PARALLEL_WORKERS` one; `ui`/`full` suite labels now report the real count instead of a
  hardcoded `1`.
- `.env.example`, `.env.bankstg-local.example`, `.env.bankuat-local.example` (tracked) and this
  engineer's own `.env`/`.env.bankstg-local`/`.env.bankuat-local` (git-ignored) all got the new
  `UI_TESTS_PARALLEL_WORKERS` line, default `1` everywhere — no behavior changes until someone
  deliberately raises it, same rollout posture as the original API default.

**Not done**: no UI equivalent of `API-tests-singleton` was created, because the audit found no
mutate/restore singleton pattern in `ui/` to isolate. If a future UI spec starts capturing/mutating
a shared company/system config (the same shape as the API singleton files), it needs the same
treatment — a dedicated single-worker UI project, or add it to this doc's watch list first.

**Canary** (run by the owner): same posture as the API rollout — raise `UI_TESTS_PARALLEL_WORKERS` past 1 gradually,
watching for the same three classes of signal (shared-table-group DDL contention per item #7,
Keycloak load per item #5, and any flake at the `company-timezone-enforcement.spec.ts` UTC-hour
boundary, which is a pre-existing per-test timing concern unrelated to worker count, not something
this change makes worse). Same "Consult Before Raising Past the Canary Default" applies — confirm
infra sizing before pushing past 1-2 workers.

## Open Finding (2026-09-21) — `field-registry.spec.ts` has an unwired dependency on the API fixture chain

**Status check 2026-10-07 (static, branch `group-3/TB-4295`): likely addressed, not run-verified.** `ui/field-registry/` no longer exists (its fixtures now live in `ui/system_core/fixtures/`), and the UI precondition fixtures built by `ui/base/fixtures/worker-preconditions.ts` (`provisionedFixture`/`provisionedWorkerFixture`) take `workerGroupId` as an argument, which is the API `apiTest` worker fixture that provisions the group. The analysis below describes the 2026-09-21 state; paths in it use the superseded `ui/field-registry/` layout.

Found while answering a direct question about whether UI tests share API's `global-setup`/group
creation. They share `globalSetup`/`globalTeardown` (config-level, runs once per invocation
regardless of `--project`), but **not** the table-group creation itself.

- `api/utils/fixtures/global-setup.ts` does NOT create the dynamic table group — it only clears
  stale sentinels/reconciler flags (including deleting any leftover
  `test-results/dynamic-group-id.txt`), restores `SYSTEM.PARAMETER`, and runs orphan/stale cleanup.
- The actual group creation is `api/utils/fixtures/api-fixtures.ts:28-75`'s `workerGroupId` fixture
  (`scope: 'worker', auto: true` on the `apiTest` object) — it calls `createGroup` and sets
  `process.env.DYNAMIC_GROUP_ID` in that worker process's memory only (no file write on the normal
  creation path).
- UI's own fixture chain (`ui/base/fixtures/base-ui-test.ts` → `ui/base/fixtures/auth-ui-test.ts` →
  `ui/field-registry/fixtures/field-registry-ui-test.ts`) is built on raw Playwright `test`, never on
  `apiTest` — so `workerGroupId`'s `auto: true` fixture never fires for a worker that only ever runs
  UI files.
- `ui/field-registry/fixtures/field-registry-setup.ts` calls `requireDynamicGroupId()`
  (`api/utils/helpers/group-helper.ts:21-27`), which reads `process.env.DYNAMIC_GROUP_ID` or falls
  back to `test-results/dynamic-group-id.txt` — a file only ever written by
  `table-registry-helper.ts`'s `persistHealedGroupId()` (a *heal* event replacing a dead group, not
  the normal creation path), and one `global-setup.ts` actively deletes at the start of every run.

**Conclusion (derived from code, not yet confirmed by a real run — a run needs the owner's environment choice first)**: running the `ui` suite in isolation
(`--project=UI-Chromium` only, exactly what `run-suite.sh ui` does) with `field-registry.spec.ts`
in scope should throw `Dynamic runGroupId not found. Run global setup first.` — nothing in a
UI-only invocation ever populates `DYNAMIC_GROUP_ID`. This is a **pre-existing gap, independent of
the UI worker-count change above** — it likely only ever "worked" by accident, when a shared single
worker process happened to run an API-tests file (which triggers `workerGroupId`) before the
UI file in the same process (e.g. under `full`, or the old low-worker-count config). Not fixed here
— needs a user decision on the fix direction (give UI's own fixture chain a way to provision/reuse
a group without depending on `apiTest`) before touching code again.
