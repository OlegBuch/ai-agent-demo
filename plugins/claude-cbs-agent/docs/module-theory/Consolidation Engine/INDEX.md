Module: Consolidation Engine (EP-07.01) / Virtual General Ledger
Test suite: `proj-test-automation/api/consolidation_engine/tests/consolidation-engine-regression.spec.ts`
Helper: `proj-test-automation/api/consolidation_engine/helpers/consolidation-engine-helper.ts`
Last updated: 2026-09-22

This file is the entry point for anything touching the Consolidation Engine module. Read it first,
before re-deriving facts from the test file or the backend directly.

## What this module does

Posted AL journal entries get aggregated by the consolidation engine into `FR.CONSOLIDATE.LEDGER.ENTRY`
/ `FR.CONSOLIDATE.ACCOUNT.ENTRY` rows, keyed by a `SYNTHETIC_KEY` derived from
`REPORTING_VIEW` + resolved dimension value(s) (e.g. a customer's `SECTOR` resolved through a
`FR.CONSOLIDATE.PARAMETERS` (`CONSOLIDATE_PARAMETERS`) record's `DIMENSIONS[].DIMENSION_TYPE` /
`DIMENSION_SOURCE`, optionally banded into a `COMBINED_CODE` via a `DIMENSION.BANDING.RULE`
record). `ensureConsolidateParameters`/`ensureConsolidationParametersRecord` in the helper seed a
`CONSOLIDATE.PARAMETERS` record and then hard-wait `CONSOLIDATE_PARAMETERS_CACHE_REFRESH_WAIT_MS`
(330s, hardcoded on the backend, no bypass) for the engine's cache to pick up a newly-(re)created
record.

## Patterns & Predictive Rules (use these to predict, then verify — don't just cite the facts above)

- **Aggregation is by resolved dimension VALUE, not by which test/record created the entry — a
  shared dimension value is a shared mutable fixture, even with zero record-ID collision.** Two
  tests that both resolve to the same `SECTOR`/`COMBINED_CODE` (e.g. both use the literal
  `CUSTOMER_SECTOR = '1003'`, or both read the same pre-seeded `CONSOLIDATE.PARAMETERS` record like
  `CONSOLIDATION_ENGINE_SEEDED.LOCAL_GAAP_RET_LOANS` / `DIMENSION_NAME = 'CUST_SECTOR'`) post their
  AL entries into the **same `SYNTHETIC_KEY` row**, regardless of each test's own unique
  `CUSTOMER_ID`/`CONTRACT_ID`/`ACCOUNT_ID`. **2026-09-21 confirmed incident**: an attempt to run 21
  tests in `US-07.01.02` under `test.describe.configure({ mode: 'parallel' })` (to overlap several
  tests' 330s `ensureConsolidateParameters` waits across Playwright workers) produced 6 new
  failures that did not occur serially — every one was a balance/synthetic-key delta assertion
  (`Expected: -135 Received: -185`, `Expected: 1 new key Received: 3`, etc.) polluted by a sibling
  test's concurrently-posted entries landing in the same aggregate. **Predict**: before
  parallelizing (or otherwise concurrently running) any two Consolidation Engine tests, check every
  dimension value/`CONSOLIDATE.PARAMETERS` record each one resolves through, not just their record
  IDs — record-ID uniqueness (the usual "tests are independent" check) does **not** imply
  aggregation isolation in this module. A test using `generateUniqueSuffix()` for its own
  `DIMENSION_NAME`/`SECTOR`/`PARAMETERS_ID` end-to-end (nothing shared with any sibling) is safe to
  run concurrently with another such test; a test using any shared/pre-seeded/repeated literal
  dimension value is not, and mixing the two kinds in one parallel group silently corrupts only the
  ones that share state — the failures look like flakiness, not a structural incompatibility, unless
  you already know this rule.
- **`SWITCH_DAY` mutates the environment's shared business date and must never run concurrently with
  anything that reads "the current business date"** (`getBookingContext(dbClient)` /
  `DateTimeHelper.getOperationalBusinessDateOrThrow`). Verified via full-file static analysis
  (2026-09-21): only 2 live-mutating `switchDay` calls exist in the suite (`TC-59`, `TC-60`), both
  deliberately kept outside any parallel-mode group.
- **A shared *banding bucket* (`COMBINED_CODE`) is still shared even after randomizing the raw
  literal — randomization only fixes a dimension that has NO `BANDING_RULE`.** Checked directly
  against Allure TestOps (`curl` + `ALLURE_TOKEN`, not the MCP tools — see
  [[reference_allure-testops-rest-access-from-proj-test-automation]]) after a first-pass subagent
  report admitted it couldn't actually reach Allure yet still asserted specific (unverifiable)
  content — always re-fetch directly when a subagent admits a partial failure, don't average its
  guess in with its verified parts. Confirmed live: `SECTOR_BANDS` has exactly 4 bands
  (`1000-1999=RETAIL_INDIVIDUALS`, `2000-2999=CORPORATE_SME`, `3000-3999=FINANCIAL_INST`,
  `4000-4999=GOVERNMENT`); TC-38/TC-39's Allure text genuinely requires the literal boundary
  (`RANGE_START`/`RANGE_END` exactly) so those two must stay hardcoded — the literal identity IS
  the assertion there. TC-40/TC-41/TC-45's Allure case text never mentions `SECTOR` or `1003` at
  all (confirmed via the real API response, not inferred) — for TC-40/TC-45 (own dedicated,
  *unbanded* `CONSOLIDATE.PARAMETERS`) the literal was pure copy-paste residue, safe to randomize.
  TC-41/TC-56 do use `SECTOR_BANDS` for real, both resolving into the same
  `RETAIL_INDIVIDUALS` bucket as TC-38/TC-39 — randomizing their raw `SECTOR` value does **not**
  decouple them from each other or from TC-38/TC-39, since they'd still land in the same bucket;
  true isolation there needs a different band (`CORPORATE_SME`/etc.) or a dedicated
  `DIMENSION.BANDING.RULE`, which is a test-data-design call, not made here.
- **`test.describe.configure({ mode: 'parallel' })` only groups tests that are textually contiguous
  in the same describe body — Playwright cannot parallelize non-adjacent tests without physically
  relocating them in the file.** This constrained which confirmed-safe tests could actually be
  grouped without a large, risk-adding reorder of the suite.
- **A THIRD failure category, found only on a follow-up widening attempt: a "prove nothing
  unexpected happened" test is vulnerable to ANY concurrently-running test that creates a
  matching-shaped row anywhere in the system — not just one sharing its specific dimension/bucket.**
  `assertNoChangeDuringWindow`/absence-check tests (e.g. `TC-44` — "no row with an unresolved
  CUST_SECTOR appears", `TC-55` — "no extra new SYNTHETIC_KEY appears") watch a wide window (60s+,
  even ~400s) for a GLOBAL negative claim. `TC-53`/`TC-54` exist specifically to post events that
  **deliberately** don't match any known schema ("zero schemas matched" / "schema newly created") —
  exactly the shape `TC-44`'s "no unresolved row" check is watching for. Even though `TC-44`/`TC-55`
  are themselves serial (not inside any `mode: 'parallel'` group), Playwright's `mode: 'parallel'`
  dispatches ITS OWN tests onto other worker processes that run at the same real wall-clock time as
  wherever the file's serial thread currently is — so a parallel group's tests can still pollute a
  serial absence-check test's window. This is broader than, and independent of, the "Aggregation is
  by resolved dimension VALUE" pattern above (that one is about two tests sharing a bucket; this one
  is about any test creating any qualifying row while another test's window is open, buckets aside).
  **2026-09-21, confirmed on a follow-up VM run** (after `TC-51..TC-54` was added to a parallel
  group): `TC-44` and `TC-55` both failed with the exact pre-existing pollution signature
  (`Expected: 0 Received: 32`, `Expected: 2 Received: 3`), and `TC-47`'s stale-balance race (Allure
  3297, `422 Hook execution failed ... AM.ACCOUNT.BALANCE`) recurred even after wiring in
  `postEntryWithVersionRetry` for it — the retry's fixed attempt count may not be enough once
  overall concurrent load rises, or general backend-capacity flakiness under 3 workers (see below)
  was the real cause that run, not this pattern; not yet disambiguated.
- **Result, as of 2026-09-21 (FINAL, after pulling back from the above)**: only **`US-07.01.03`**
  (`TC-66–69`) is parallelized — the one group that stayed clean across every VM run this session,
  including the run that broke `TC-44`/`TC-55`/`TC-47` elsewhere. `TC-36, TC-40, TC-45, TC-46` and
  `TC-51..TC-54` were pulled back to fully serial (relocated `TC-36`/`TC-40` moved back to their
  original TC-N position too — the file is back to strict ascending TC-N order in `US-07.01.02`).
  **Kept** despite the pullback, since both are correct independent of parallelization: `TC-40`,
  `TC-45`, `TC-46`'s hardcoded `SECTOR` literals stay replaced with `generateUniqueSuffix()`
  (confirmed via Allure their specs never required a specific value — harmless either way), and
  `TC-47`'s `postEntry` stays wired through `postEntryWithVersionRetry` (a real gap regardless of
  concurrency level — it was just more likely to fire under load). **Left serial**:
  `TC-36/40/45/46/51/52/53/54` (pulled back, not proven safe against the global-absence-check
  pattern above) plus the original `TC-37/38/39/41/44/47/50/55/56/70` (bucket collision) and
  `TC-57–60` (`SWITCH_DAY`, global business-date mutation).
- **General backend-capacity flakiness under higher overall concurrent load is a distinct, separate
  risk from both patterns above, and was never fully disambiguated from them this session** — a
  2026-09-21 run also showed `TC-37` (Allure 3287, generic `ACCOUNT-CREATE-CONTRACT ...
  ERROR_ID=INTERNAL-SERVER-ERROR` 500 during contract creation) failing while not in any parallel
  group and not sharing a bucket with anything active — consistent with the shared `bankstg` backend
  occasionally not keeping up at 3 workers, independent of test grouping. Not re-investigated after
  the pullback to a smaller scope. **Predict**: before ever re-attempting to widen the parallel
  scope beyond `US-07.01.03`, (1) audit every candidate test for the global-absence-check pattern
  above, not just its own dimension bucket, and (2) rerun the same scope at least twice — a single
  clean or single failing run cannot distinguish a deterministic bug from transient backend-capacity
  flakiness, and each needs a completely different fix.
- **A FOURTH failure category — the most severe one found this session — hit even the one group
  proven clean on every prior run: `test.beforeAll`/`afterAll` hooks that don't explicitly
  destructure a worker-scoped fixture can run before that fixture has finished initializing,
  silently falling back to shared/global state under concurrency.** `api-fixtures.ts` provisions a
  **worker-scoped, `auto: true`** `workerSuperAdmin` fixture specifically so each Playwright worker
  process gets its own dedicated admin identity (via `createSuperAdminTestUser` +
  `setWorkerSuperAdmin`, a module-level variable in `token-service.ts` that
  `resolveKeycloakCredentials` falls back to when no explicit username/password is given). This
  file's own top-level `test.beforeAll` (seeds `PF.BALANCE.TYPE CUR_PRINCIPAL` for the whole
  `EP-07.01` describe) called `createAuthenticatedApiContext(request, {...})` **without
  destructuring `workerSuperAdmin`** in its callback signature — so nothing guaranteed that
  fixture had already run before this hook fired, and it could fall through to the single shared
  `process.env.KEYCLOAK_USERNAME` instead. Harmless at 1 worker; with `US-07.01.03` under
  `mode: 'parallel'`, up to 3 worker processes each run this SAME file's own `beforeAll`
  concurrently — if all 3 fell through to the same shared identity at once, concurrent writes under
  one identity plausibly tripped a backend session/authorization check (CBS's session model, not
  Keycloak itself — the existing `token-service.ts` stagger/retry/circuit-breaker already covers
  Keycloak-login-level flakiness under load, this is a layer below that). **2026-09-21, confirmed
  correlated**: a run with `US-07.01.03` parallel produced 403s in `TC-69` (inside
  `ensureBalanceTypeExists`, called from THIS exact `beforeAll`), `TC-70` (a plain `SEE` that should
  never 403), `TC-67`/`TC-68` (`ensureSectorRecordExists`/customer creation) — i.e. even the
  previously-clean `US-07.01.03` group started failing, for a reason unrelated to either the
  bucket-collision or global-absence-check patterns above. **Fix applied 2026-09-21**: added
  `{ workerSuperAdmin }` to the `beforeAll`'s callback signature (with `void workerSuperAdmin;` to
  satisfy the linter — the value itself is unused, only the fixture's side effect of running first
  matters). **Verified 2026-09-22**: two fresh VM runs (`vm-results-api-20260922-011032`, a full
  regression run at 4 API workers; `vm-results-api-20260922-104532`, a dedicated run of just this
  spec file at 3 API workers) both show `TC-66–69` passing cleanly with zero 403s in either run —
  the fix holds. **Predict**: any `beforeAll`/`afterAll` in this codebase that manually builds an
  admin/authenticated context instead of going through a test-scoped fixture chain (like
  `authenticatedApiContext`, which already destructures `workerSuperAdmin` itself) is a candidate
  for this same bug — audit for `test.beforeAll(async () => {` / `test.afterAll(async () => {` (no
  destructured params) followed by a `createAuthenticatedApiContext` call with no explicit
  `username`/`password`, anywhere a `mode: 'parallel'` describe might dispatch that hook onto
  multiple workers.
- **2026-09-22 re-check, in response to a request to widen `US-07.01.02` parallelization further
  (to overlap more of its 330s `ensureConsolidateParameters` waits and cut the ~330s-per-wait
  serial cost): no new attempt was made — the two dated bullets above already answer it.** The
  pulled-back, fully-serial state of `US-07.01.02` (git-confirmed current on `group-3/TB-3922`) held
  clean across both 2026-09-22 VM runs: 0 failures in `US-07.01.02`/`.03` in the dedicated run
  (`104532`), and exactly 1 (`TC-47`, in 6.8s — the known stale-balance race, not a timeout) in the
  full-suite run (`011032`) where 4 API workers were running ~1378 tests total, not just this file.
  **New evidence on the open "general backend-capacity flakiness" question**: `TC-47` passed
  (1.1m) in the dedicated single-file run (`104532`, 3 workers, nothing else competing for backend
  capacity) but failed fast (6.8s) in the full-suite run (`011032`, 4 workers, ~1378 tests
  competing) — consistent with that flakiness correlating to *overall* concurrent backend load
  across the whole suite, not to anything `US-07.01.02`-specific; still not fully disambiguated,
  same predict as above still applies. **`US-07.01.01`'s 10 failures in both runs are unrelated
  to any of this** — `TC-5/6/7/17/18/19`'s "spaces only"/"empty string" validation-message
  assertions and `TC-10` fail identically in both runs, and `US-07.01.01` carries no parallel
  config at all — a pre-existing validation-message/assertion defect outside this section's scope,
  not yet investigated here.
- **2026-09-22, third VM run (`vm-results-api-20260922-114944`, dedicated single-file, 3 workers,
  started ~26min after `104532` finished) — confirms `US-07.01.01`'s 10 failures are a deterministic
  defect, not flakiness, and adds a new confirmed instance of the still-undisambiguated
  general-backend-capacity pattern inside the "proven clean" parallel group.** Matched all 78 tests
  across all three 2026-09-22 runs by `titlePath + name` (not `fullName`, whose embedded line:col
  shifts whenever the spec file is edited between runs — comparing by `fullName` alone falsely
  makes ~all 78 tests look "different" between runs and must not be used for this kind of
  cross-run diff again). Result: **exactly the same 10 `US-07.01.01` tests
  (`TC-5/6/7` spaces-only+empty-string, `TC-10`, `TC-17/18/19` spaces-only) fail in all three runs,
  byte-identical `Expected: 400 / Received: 200`** — three-for-three is strong enough to stop
  calling this "not yet investigated": it is a real backend gap where blank/whitespace-only values
  bypass mandatory-field validation on `FR.CONSOLIDATE.PARAMETERS.DIMENSIONS[]` fields (both
  spaces-only AND empty-string slip through — only "omitted entirely" is caught) and on
  `FR.DIMENSION.BANDING.RULE.RANGES[]` fields (spaces-only slips through; empty-string and omitted
  are both caught correctly there — a narrower, trim-only gap). `TC-10`'s failure is a third,
  related gap: `DIMENSION_SOURCE` isn't validated against the table `DIMENSION_TYPE` points at,
  either. **Not yet filed as a ticket — do that before further automation work assumes it's fixed.**
  Separately, `TC-47` (Allure 3297) passed clean in this run too (2nd clean run in a row with
  `postEntryWithVersionRetry` in place) — consistent with the existing "correlates with overall
  concurrent load, not with this fix's correctness" read. **New finding: `TC-69`, inside
  `US-07.01.03` — the one group this file previously called "proven clean across every VM run
  this session" — failed in this run** with the exact same generic signature already tracked above
  for `TC-37`: `ACCOUNT-CREATE-CONTRACT "OP-..." must reach DONE (not ERROR, OVERRIDE, or timeout)
  ... ERROR_ID=INTERNAL-SERVER-ERROR`. `TC-37` (not in any parallel group) failed with the identical
  signature in the same run. This is **not** the previously-fixed worker-fixture 403 bug (different
  error entirely — a contract-creation workflow returning `INTERNAL-SERVER-ERROR` instead of
  reaching `DONE`, not an auth rejection) — it matches the "general backend-capacity flakiness"
  pattern from 2026-09-21 above. Practical effect: **the "proven clean" claim for `US-07.01.03` no
  longer holds as stated** — it should now read "clean with respect to the bucket-collision,
  global-absence-check, and worker-fixture-403 patterns specifically; still exposed, like every
  other test in this file, to the undisambiguated backend-capacity pattern." **Predict, refined**:
  the backend-capacity pattern is not confined to non-parallel tests — a parallel group adds its own
  concurrent load on top of whatever the rest of the suite/environment is doing, so it should be
  expected to surface there too, not treated as a surprise each time it does. Still not
  disambiguated from a deterministic bug; the existing "rerun at least twice before concluding
  either way" guidance stands.
- **2026-09-22, fourth VM run (`vm-results-api-20260922-123739`, dedicated single-file, 3 workers)
  — the "general backend-capacity flakiness" pattern above is now split into two distinct,
  independently-fixed root causes; both fixed same day.** Comparing all four 2026-09-22 runs
  (`011032`/`104532`/`114944`/`123739`) by `titlePath + name` gives a clean pairwise diff instead of
  one aggregate "N failures" number: **10 tests are always-failing (the `US-07.01.01`
  validation-defect set above, 4-for-4, still not filed as a ticket)**, and exactly **one extra
  test fails in three of the four runs, never two at once, and it's a different test each time**
  (`011032`→`TC-47`; `104532`→none; `114944`→`TC-37`+`TC-69` together; `123739`→`TC-50`). Root-caused
  both:
  1. **`TC-47`/`TC-50` share one mechanism**: an un-retried `finAccClient.postEntries(payload)` call
     racing another concurrent posting on the same `AM.ACCOUNT.BALANCE` optimistic-lock version,
     surfacing as `422 Hook execution failed for operation INPUT in PRE phase for projection
     AM.ACCOUNT.BALANCE`. `postEntryWithVersionRetry` (this file, `postEntryWithVersionRetry`) was
     the known fix — but as of `114944` it was only wired into **7 of 23** `postEntries` call sites
     in the regression spec (applied ad hoc to `TC-40/45/46/47` on 2026-09-21). `TC-50` failing in
     `123739` with the byte-identical marker, at a call site that had never been touched, is the
     smoking gun that this was a coverage gap, not a `TC-47`-specific fix. **Fixed 2026-09-22**: all
     remaining 16 unwrapped `finAccClient.postEntries(payload)` calls in
     `consolidation-engine-regression.spec.ts` now go through `postEntryWithVersionRetry` too (23/23
     total) — a uniform `replace_all` on the exact call shape, verified no other call site reuses
     `payload` after the call (safe to leave the object as-is inside the retry closure rather than
     rebuilding it per attempt, since a `422` from this specific PRE-phase hook means nothing was
     persisted — resending the identical `transactionReference` is safe). `npx tsc --noEmit` and
     `npx eslint` both clean on the changed files after `prettier --write`.
  2. **`TC-37`/`TC-69` share a completely different mechanism**, confirmed by their error text:
     `createRealContractViaBusinessFlow` (this file) submits an async `ACCOUNT-CREATE-CONTRACT`
     workflow and polls until it reaches a terminal status, asserting that status is `DONE`; the
     backend occasionally lands it on terminal `ERROR` with the generic `ERROR_ID=INTERNAL-SERVER-ERROR`
     instead, for no reproducible business reason (both `TC-37` and `TC-69` call this exact helper;
     no other regression-spec test does that reaches this failure mode). This is **not** a
     client-side optimistic-lock race — the operation genuinely reached a terminal `ERROR`, so a
     `postEntryWithVersionRetry`-style "just retry the same call" fix does not apply; the only
     correct retry is resubmitting a brand-new `ACCOUNT-CREATE-CONTRACT` operation. **User's explicit
     call (asked, not assumed, since a retry here can mask a real backend defect): add the retry.**
     **Fixed 2026-09-22**: the create+poll sequence inside `createRealContractViaBusinessFlow` now
     loops up to 3 attempts, resubmitting a fresh operation only when `finalStatus === 'ERROR' &&
     errorId === 'INTERNAL-SERVER-ERROR'` exactly — any other terminal state (a real business-rule
     `ERROR` with a different `ERROR_ID`, `OVERRIDE`, or a poll timeout) still fails immediately on
     attempt 1, so a genuine defect is not masked. **Deliberately left untouched**: the sibling
     `createDedicatedContract` helper (same file, ~line 1209) has the identical create+poll shape and
     the identical potential exposure, but no test that hit this failure mode this session calls it
     — out of scope for this fix, flagged here so a future session doesn't have to rediscover the
     duplication if `createDedicatedContract`-based tests start showing the same signature.
  **Predict, refined again**: what looked like one undifferentiated "backend-capacity flakiness"
  bucket across 2026-09-21/22 was actually two unrelated, independently-triggered failure
  mechanisms that happened to both scale with concurrent load and both surface as "one extra test,
  different each time" — a symptom shared by cause does not imply one root cause; always trace each
  flaky test's own error text to its own call site before bucketing it with a same-shaped prior
  incident. **Not yet re-verified on a fresh VM run** — the next `regression-m2`/dedicated run
  against this spec file is the actual verification that both fixes hold; until then, treat
  `US-07.01.01`'s 10 as the only failures a clean run should show.
- **2026-09-22, fifth VM run (`vm-results-api-20260922-154500`, 13:04-13:45 UTC, the busiest time of
  day - 5th VM run against this file today), verifies both fixes above and surfaces a THIRD,
  unrelated failure cluster.** `TC-47`/`TC-50` (fix #1) and `TC-37`/`TC-69` (fix #2) all passed
  clean - no retry fired for either fix (no `[createRealContractViaBusinessFlow] ... resubmitting`
  log line appears in `run.log`), consistent with both root causes being genuinely fixed rather than
  just not triggered this run. New failures: **`TC-53`, `TC-54`, `TC-55`, `TC-70`** (14 total = the
  same 10 `US-07.01.01` + these 4), all in `US-07.01.02`, all serial on one worker
  (`pid-2285201-worker-0`, back-to-back, zero concurrent overlap with any other test in this file
  this run - ruled out as the direct cause). **This is not new** - it is the already-documented
  "THIRD failure category" / global-absence-check pattern higher up in this file (`TC-44`/`TC-55`
  pollution, 2026-09-21), now also confirmed hitting `TC-53` and `TC-70`, which hadn't shown it
  before. All 4 fail identically: `findTransactionInDlqTopics` (this file, ~line 1204) reads
  `KafkaService.readLatestMessages(topic, 200)` - the **latest 200 messages of the whole
  environment-wide DLQ topic**, not scoped to this run - and does a raw
  `JSON.stringify(message.value).includes(transactionReference)` substring match; a match on a
  test's own uniquely-generated `transactionReference` is for all practical purposes proof the
  event really is present in that DLQ message, so this isn't a false-positive-prone check - the
  event genuinely landed in `batch-dlq`. **`TC-55` is the sharpest evidence**: its own premise is
  "a malformed event's batch-DLQ record must not also implicate the batch's other, normal events" -
  and it failed exactly that assertion (`Expected: false, Received: true`), meaning batch-DLQ
  cross-contamination between unrelated events sharing a physical processing batch is not just a
  suspected mechanism, it's the one this run directly disproved test-side. **Not investigated
  further or fixed this session** - unlike fixes #1/#2, there's no simple "add a retry" answer here
  (the event already landed in the DLQ; retrying the read doesn't help), and it isn't yet clear
  whether this is a genuine backend batch-isolation defect or a test-side assumption that no two
  concurrently-processing schema-mismatch events can ever share a physical batch window. **Next
  step, not yet done**: read an actual `batch-dlq` message live (Kafka UI or `readLatestMessages`
  directly) to see whether its schema legitimately lists multiple `transactionReference`s per batch
  entry - that would confirm the cross-contamination theory directly rather than inferring it from
  test failures. **Predict**: this failure cluster should correlate with time-of-day / cumulative
  daily load on bankstg (this was the 5th and latest run of the day) more than with any specific test
  change - worth checking whether an early-morning rerun stays clean while a same-day 5th rerun
  doesn't, before assuming any code-level fix is even the right kind of fix.
- **Triage rule for a run where *all* data-dependent Consolidation tests fail and only config-CRUD tests pass
  (2026-10-07, `vm-results-api-20261007-110406`, bankuat) — suspect the ingestion pipeline, not the tests.**
  10 of 14 smoke tests failed with the same shape: the Posting Engine `POST /eg-posting-engine/api/v1/entries`
  returned 201, ClickHouse (`consolidation_engine_bankuat`) was reachable (baseline reads worked), but no
  `ACCOUNT.ENTRY` / `LEDGER.ENTRY` / `SYNTHETIC_KEY` row ever appeared within the 75s–240s poll windows — including
  for fresh customers, the seeded `CUSTOMER_SEED_001`, and the IFRS view. The 4 passing tests (TC-1..) never touch the
  aggregation path. Contract creation (`ACCOUNT-CREATE-CONTRACT`) finished normally in ~1.5s, so Product Factory /
  Account Management were fine. One transient `422 Sub-ledger update failed ... AM.ACCOUNT.BALANCE PRE hook` on a
  posting was absorbed by the retry.
  **Live diagnosis, same day (read-only, via Kafka UI `http://kafka.bankuat.local/api/clusters/proj-kafka` — the same
  host `.env.bankuat-local` already carries as `KAFKA_UI_URL`; ClickHouse's host does not resolve from a workstation,
  but works via `curl --resolve clickhouse.bankuat.local:80:10.191.0.100`):** consumer group
  `bankuat.proj.consolidation-engine.journal-entry-consumer` was frozen at offset **265353** of `bankuat.EG.JOURNAL.ENTRY`
  (end 265560, i.e. ~207 unconsumed entries, including every posting of this run) for hours, never advancing across
  repeated samples; both consolidation groups (`journal-entry-consumer`, `virtual-wash-consumer`) flapped
  `STABLE`→`EMPTY (0 members)`→`STABLE` within minutes — the engine pod restarts/rejoins but never commits past 265353.
  Control: `bankuat.proj-balance-management-engine-journal-entry` on the same topic was healthy (lag 1), so Posting
  Engine and the topic are fine. The last thing the engine did was write a `batch-dlq` batch (`265275-265352`,
  08:12:08Z) of the suite's own deliberate negative cases (`Missing CM.CUSTOMER records`, `no valid CONTRACT_ID`); the
  first unconsumed record (offset 265354, 08:08:35Z) is an ordinary-looking `AL`/`PL` entry, so no poison message is
  evident. Also: `bankuat.proj.consolidation-engine.financial-report-request-consumer` exists for env `two` but not for
  `bankuat`. **Still unconfirmed: why the engine doesn't progress** — needs the pod's logs/`describe` in namespace
  `proj-bankuat` (crash loop/OOM vs. hang). Check first next time: `consumer-groups/<group>` state + offset sampled
  twice ~30s apart (kafka UI `/api/clusters/proj-kafka/consumer-groups/<id>`), before blaming tests.
