# TB-3888: Override-Dispo UI regression/smoke hardening

**Date/time:** 2026-09-21 08:57 · **Branch:** group-1/TB-3888 · **Ticket(s):** TB-3888

## Discussed

- Scope was explicitly narrowed by the user to `proj-test-automation`'s override-dispo UI smoke
  and regression suites only — "смотрим только override dispo смоки и регрессию. чужие файлы не
  трогаем!" — governing every change made this session.
- Recapped the full backlog of previously-identified code-improvement ideas for this suite (no
  code touched during the recap itself), then worked through it item by item with the user
  picking what to tackle now vs. defer.
- Investigated consolidating the 5 independent officer-hierarchy/table-provisioning fixtures
  (`ensureTopLevelDispoOfficersProvisioned` and siblings) into one shared "stand" fixture; designed
  a two-part approach (Part A: shared major officer, Part B: shared source table) but the user
  said "пропустим пока" — deferred, no code changed.
- Investigated storageState/session-reuse for UI login as a performance optimization (biggest
  potential win, ~1/3 of run time), including live inspection of the staging app
  (`http://bankstg.local/proj-web/en/tableRegistry`) via the in-app browser. Found a hard blocker:
  NextAuth.js + Keycloak OAuth (Authorization Code flow) is the only configured provider (no
  Credentials provider), and the session is a server-side encrypted cookie requiring
  `NEXTAUTH_SECRET` to forge — not something this suite has or should acquire. Identified one
  narrower, secret-free sub-optimization (skipping the company-selection step via seeding the
  `user-company-store` Zustand localStorage key) but the user said "пропустим эту задачу" before
  it was implemented.
- User explicitly declined touching `README.md` for now ("Не трогать README сейчас") despite two
  gaps identified: "Table Groups & Cleanup" attributes group creation to `global-setup.ts` when it
  actually happens in `workerGroupId`/per-worker fixtures, and "UI Test Architecture" doesn't
  mention `worker-preconditions.ts`.
- Confirmed `customization-smoke.spec.ts` was unaffected by the `DYNAMIC_GROUP_ID` bug fixed this
  session (it doesn't rely on the same worker-scoped group provisioning path).

## Implemented

All changes confined to `proj-test-automation`; nothing touched in `proj-ai-agentic` itself this
session besides this log.

**DYNAMIC_GROUP_ID for UI-only runs** (fixes `[global-setup] Dynamic runGroupId not found` when
running UI suites without the API suite priming `process.env.DYNAMIC_GROUP_ID` first):
- `ui/base/fixtures/dynamic-group-fixture.ts` (new) — worker-scoped `workerGroupIdFixture`,
  mirrors `workerGroupId` in `api/utils/fixtures/api-fixtures.ts`.
- `ui/base/fixtures/worker-preconditions.ts` — `provisionedWorkerFixture` now takes `workerGroupId`
  as an explicit dependency so Playwright initializes it first.
- `ui/override-dispo/fixtures/override-dispo-ui-test.ts`,
  `ui/field-registry/fixtures/field-registry-ui-test.ts` — registered `workerGroupIdFixture`.
- Verified: `tsc --noEmit`, `eslint --max-warnings=0`, `prettier --check`, `playwright --list`,
  plus three real full-suite runs — `override-dispo-regression.spec.ts` 15/15,
  `override-dispo-smoke.spec.ts` 8/8, `field-registry` suite 15/15, all green.

**Scenario-table refactor** for near-duplicate DISPO.ITEM~REVIEW rejection tests in
`ui/override-dispo/tests/override-dispo-regression.spec.ts` (byte-for-byte title preservation
required for Allure mapping):
- `ui/override-dispo/test-data/review-rejection.scenarios.ts` (new) —
  `REVIEW_REJECTION_SCENARIOS` (TC-3943, TC-3945) and `FORWARD_ROUTING_REJECTION_SCENARIOS`
  (TC-3947, TC-3949, TC-3950).
- `ui/override-dispo/helpers/review-rejection-flow.ts` (new) —
  `runReviewActionRejectionScenario()` shared flow.
- TC-3944 deliberately kept as an individual `test()` (only 1 case, no dedup value), relocated to
  sit between the two scenario loops.
- `eslint.config.mjs` — added `'runReviewActionRejectionScenario'` to the
  `playwright/expect-expect` rule's `assertFunctionNames` allowlist (same precedented pattern as
  the existing `assertDispoOfficerInputRejected` entry).
- Verified: `tsc`/`eslint`/`prettier`/`playwright --list`/`verify-allure-ids`, plus a real run of
  all 6 affected tests — 6/6 passed.

**Save-race elimination** — converted all 7 remaining fire-and-forget `.saveRecord()` calls in
`override-dispo-regression.spec.ts` (TC-3926/3927/3928/3951) to response-awaiting equivalents:
- `ui/override-dispo/pages/override-catalogue-page.ts` — added
  `saveOverrideBasicAndWaitForInputResponse()`, `saveOverrideDispoAndWaitForInputResponse()`,
  `saveOverrideClassDetailsAndWaitForInputResponse()`, all built on the existing
  `waitForProjectionInputResponse()` helper.
- `ui/override-dispo/constants/override-catalogue.values.ts` — added
  `INPUT_OPERATION_URL_FRAGMENT` (OVERRIDE_BASIC / OVERRIDE_DISPO / OVERRIDE_CLASS_DETAILS_BASIC).
- Verified: `tsc`/`eslint`/`prettier`, plus a real run of the 4 relevant tests — 4/4 passed.

**Move UI "record not persisted" checks to API-level** — replaced browser navigation to a
record's SEE screen + waiting for a "not found" UI notification with a direct backend SEE call
asserting `404`, matching the established `expectRecordNotFound` pattern in
`api/consolidation_engine/helpers/consolidation-engine-helper.ts`:
- `ui/override-dispo/helpers/record-persistence-assertions.ts` (new) —
  `assertRecordNotPersistedViaApi(apiRequest, projectionId, recordId)`.
- `override-dispo-regression.spec.ts` — converted 4 call sites (TC-3928, TC-3940, TC-3941,
  TC-3951), each requiring `playwright` added to the test's destructured fixture args.
- `override-dispo-smoke.spec.ts` — converted 8 call sites across TC-3931, TC-3932 (Case A and
  Case B), TC-3933, TC-3934, TC-3935, TC-3936, TC-3937, same `playwright` args change, using
  `OverrideDispoValues.DISPO_OFFICER_BASIC_PROJECTION_ID`.
- The old UI-based assertion methods (`OverrideCataloguePage.assertOverrideNotPersisted`,
  `assertOverrideClassDetailsNotPersisted`, `DispoItemSystemPage.assertTicketNotCreated`,
  `OverrideDispoPage.assertRecordNotPersisted`) were left in place, unused, rather than deleted —
  consistent with how this session handled superseded helpers elsewhere.
- Verified: `tsc --noEmit`, `eslint --max-warnings=0`, `prettier --check`, `playwright --list`
  (title preservation — 15 titles in regression, 8 in smoke, all unchanged), plus real runs:
  `override-dispo-regression.spec.ts -g "TC-3928|TC-3940|TC-3941|TC-3951"` → 4 passed (9.0m);
  `override-dispo-smoke.spec.ts` full → 8 passed (7.4m).

## Learned

- CBS/PKF business invariant (backend-enforced, not previously documented in this session's
  working memory): only one `DISPO.OFFICER` may have an empty `REPORTING_TO` at a time. This is
  why `ensureTopLevelDispoOfficersProvisioned` defensively retries/reparents against whichever
  officer currently holds that slot on the shared, persistent `bankstg` staging environment — this
  is a durable fact that belongs in `docs/project-spec/` if not already captured there, not just
  this log.
- The staging app's login is NextAuth.js + Keycloak (Authorization Code flow), `keycloak` is the
  sole provider (confirmed via `/api/auth/providers`), no Credentials provider exists, and the
  session is a server-side encrypted httpOnly cookie — `NEXTAUTH_SECRET` would be required to
  forge a `storageState` for session reuse. `/api/auth/session` does expose the underlying
  Keycloak `accessToken` JWT to an authenticated client, and company selection is driven by a
  Zustand-persisted localStorage key `user-company-store`
  (`{"state":{"activeUserCompany":{"code","timezone"},"userId"},"version":1}`) — both potentially
  useful if this optimization is revisited later.
- `eslint-plugin-playwright`'s `playwright/expect-expect` rule can't see into a helper function's
  body, so any new shared assertion/flow helper that wraps `expect()` calls needs its name added
  to `eslint.config.mjs`'s `assertFunctionNames` allowlist or CI lint fails with "Test has no
  assertions" — this is an established, repeatable pattern in this codebase (this session added
  `runReviewActionRejectionScenario` as the second entry).
- `scripts/verify-allure-ids.ts`'s static AST scan only recognizes `allureCaseId(N)` with a
  numeric literal; `allureCaseId(scenario.caseId)` (property access, used by the new scenario-loop
  tests) is invisible to it. This is a known, pre-existing, already-flagged gap — not something
  this session introduced or fixed.
- Two categories of noise observed in real runs are environmental/pre-existing, not caused by any
  change this session made: `[FAIL] Delete Table Group (id=...) -> 401 — Jwt is expired` during
  teardown of long (~7-9 minute) runs (token expires before cleanup finishes; self-heals via
  `cleanupStaleGroups` on the next `global-setup`), and
  `[antd-virtualized-dropdown] no search response observed within the retry window, continuing
  scroll-search` (an already-handled fallback path in `AntdVirtualizedDropdown`).

## Open Items / Follow-ups

- Deferred by explicit user decision, not started: consolidating the 5 officer-hierarchy/
  table-provisioning fixtures into one shared "stand" fixture (Part A: shared major officer,
  Part B: shared source table — design only exists in this session's transcript, not persisted
  anywhere else; would need to be re-derived if picked up later).
- Deferred by explicit user decision, not started: storageState/session-reuse for UI login,
  blocked without `NEXTAUTH_SECRET`; the narrower, secret-free company-selection-skip
  sub-optimization (seeding `user-company-store` in localStorage) is technically viable but also
  not implemented.
- Deferred by explicit user decision: documenting the `DYNAMIC_GROUP_ID` fix in `README.md`
  ("Table Groups & Cleanup" and "UI Test Architecture" sections both have gaps — see Discussed).
- Not yet scoped with the user (raised only as a possible next step, not confirmed): the same
  UI-navigation-based "not persisted" pattern may exist elsewhere outside override-dispo, but per
  this session's scope constraint nothing outside `ui/override-dispo/**` was surveyed.
- Still-pending minor nits from the original backlog, not picked up this session: AntD dropdown
  `waitForTimeout`-based polling improvement; AntD date-picker → payload-level check; a
  non-deterministic query in TC-015; import-ordering consistency.
- Explicitly out of scope this session (foreign files, per "чужие файлы не трогаем"):
  customization suite's 7 redundant per-test group creations; customization's broken Allure
  linking.
- Non-code items flagged earlier, still open: TB-3888 commit-message prefix convention, a Jira
  comment owed on TC-019.

## References

TB-3888 (Jira ticket key; working branch `group-1/TB-3888`).
