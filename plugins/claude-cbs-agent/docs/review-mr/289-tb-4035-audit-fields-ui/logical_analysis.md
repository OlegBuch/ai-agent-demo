# Logical Analysis — MR !289 (TB-4035, Audit Fields UI implementation)

Repo: `proj-test-automation`. Diff: `origin/main` (merge-base `8538fe335fd7bf473644f3e7dcf698cd289f4a44`) vs. MR head `3fa74926` (branch `_mr-289-review`, 2 commits: `31e6ebeb` "TB-4035, Audit fields UI implementation", `3fa74926` "audit fields UI - stabilization"). 11 files changed, ~1751 insertions / 2 deletions.

## Summary

TB-4035 ("Audit fields UI implementation", component System Core, assignee Zoya Rabtsava) carries no description or Acceptance Criteria of its own in Jira — it only links, via a "Discovery - Connected" relationship, to the Story **TB-3395** ("UI testing: Audit Fields", Done), which is likewise description-less. TB-3395's own linked children give the real spec: **TB-3484** ("Multi-value audit fields rendered incorrectly", fixed 2026-09-08, links a Figma design) is the authoritative source for how the Audit Fields block must render — Record Status at the top (single value); an **Authorize block** shown above the Input blocks, at most one (`Authorizer` = `ST_AUTHORISER`, `Date/Time` = `ST_DATE_TIME[last]`, `Projection` = `ST_PROJECTION[last]`, empty when UNAU); **Input blocks**, one per element of `ST_INPUTTER`, index-aligned; and `Company` at the bottom (single value). **TB-3529** ("Company not returned by backend on HOLD record", fixed 2026-09-08) is a related, already-resolved backend bug. Both fixes predate this MR's commits (2026-09-24/25), so neither is an open blocker. The MR itself implements this design as a brand-new UI test module `ui/system_core/audit_fields/` (page object, fixtures, helpers, two spec files covering US-01.03.01/02/03/04/06) plus three small supporting edits (`eslint.config.mjs`'s `expect-expect` allowlist, one new `ALLOWED_DUPLICATE_IDS` entry, one new shared timeout constant, and a backward-compatible signature addition on the pre-existing `ProjectionRuntimePage.assertCurrentSpace`).

## Known-Issue Cross-Check (topic-scoped, per Step 1's prior-knowledge bundle)

- **Reintroduced**: `docs/common-issues/playwright-execution/unwrapped-requests-outside-test-step.md`'s Cause 4 (a resource created before `try` for safe `finally`-disposal must still get its own `test.step` wrapping for both creation and disposal) is reintroduced 15 times across both new spec files — see Confirmed Issue C3 below.
- **Correctly followed**:
  - `docs/common-issues/test-data-and-assertions/table-create-auditable-field-removed.md` ("never send `auditable` on table create — it's derived from `type`") — the new fixture (`fixtures/audit-fields-provisioning.ts`) never sends this field; positive evidence for the Necessity Citations section below.
  - `unwrapped-requests-outside-test-step.md`'s own Cause 6 ("fix the shared helper once, not every call site") — `deleteDashboardUser`/`provisionDashboardUser` (`ui/auth/helpers/dashboard-user.ts`) delegate to `test-user-service.ts`'s `createTestUser`/`deleteTestUser`, already fixed under this exact rule during the 2026-09-18 framework-wide sweep; the new spec files' bare `test.afterEach` calls to `deleteDashboardUser` are therefore **not** a violation (the step-wrapping already lives inside the shared function).
  - `[[feedback_tc-prefix-must-equal-allurecaseid]]` / `[[feedback_nest-tests-in-story-scoped-describe]]` — every `TC-N` title's `N` matches its `allureCaseId(N)`, and every test sits under a `test.describe('US-XX.YY.ZZ | ...', ...)` block.
- No `docs/module-theory/` folder exists yet for System Core / Audit Fields, and `docs/review-mr/_pattern-log.md` does not exist yet — both checks ran and found nothing to apply, not skipped.

## Whole-Repo Blast-Radius Bundle (Step 1.5) & Architect Lens

`api/utils/**` is not touched, so Step 1.6's mandatory Architect trigger does not apply. The Architect lens (`architect-agent.md`) was engaged anyway, independently, because this diff meets that persona's own trigger twice over: it creates a **new UI module boundary** (`ui/system_core/audit_fields/`) and it establishes a **cross-module contract** by reusing `basic-customization`'s `ProjectionRuntimePage` class from a different module. Its Whole-Project Impact Analysis findings are folded into C1/C2 below (module-naming inconsistency, duplicated route template) rather than reported separately, per this command's "one merged report" rule.

Blast radius per changed/new exported symbol (`git grep` across the whole working tree):

| Symbol | External callers (outside this diff) | Verdict |
|---|---|---|
| `ProjectionRuntimePage.assertCurrentSpace` (signature gains an optional `options: { timeout? }`, default `{}`) | `ui/basic-customization/tests/basic-customization-regression.spec.ts:543,562` (1-arg calls) | Unaffected — TypeScript default parameter, behavior identical for existing callers. |
| `UI_RECORD_OPERATION_TIMEOUT_MS` (new) | none | New symbol, only consumed twice within this diff (`helpers/audit-fields-setup.ts`, `pages/audit-fields-record-page.ts`). |
| `eslint.config.mjs`'s `expect-expect` `assertFunctionNames` list (9 new entries) | whole repo (lint rule scope is `ui/**/*.ts`) | Purely additive/permissive — can only suppress false "no assertion" lint errors, never introduce new ones. No behavior change for any existing file. |
| `scripts/verify-allure-ids.ts`'s `ALLOWED_DUPLICATE_IDS` (adds `3266`) | the verify script itself | Self-contained; matches the diff's own two `allureCaseId(3266)` uses. |
| `AUDIT_FIELDS_RECORD_SCHEMA`, `AUDIT_FIELDS_UI_PATHS`, all fixture/helper functions, `AuditFieldsRecordPage` | none | All brand-new, module-local; no consumers outside this diff (confirmed via repo-wide grep — the `ui/system_core/` directory did not exist before this MR). |

## Confirmed Issues

**[Confirmed] New UI module breaks the established kebab-case module-naming convention**
`ui/system_core/audit_fields/` (all 6 new files under it) — every existing `ui/` module folder (`auth`, `base`, `basic-customization`, `customization`, `field-registry`, `health-check`, `override-dispo`, `plugin-manager`, `schedule`, `shell`, `table-registry`, `utils`) is kebab-case. This diff introduces `system_core`/`audit_fields` in snake_case, mirroring `api/`'s own module-naming convention (`system_core`, `action_processing`, etc.) instead of `ui/`'s. This is exactly the kind of drift that's hardest to notice and costliest to fix once a second consumer copies it, since it's happening at the moment a brand-new module boundary is created.
Fix: rename the folder to `ui/system-core/audit-fields/` (or, following the flat-feature-folder pattern already used by `basic-customization`/`override-dispo`, simply `ui/audit-fields/`) to match every other UI module.

**[Confirmed] `audit-fields-ui-paths.ts` duplicates `basic-customization-ui-paths.ts`'s `PROJECTION_RUNTIME` route**
`ui/system_core/audit_fields/audit-fields-ui-paths.ts:4-8` defines an independent URL template for `/proj-web/en/tableRegistry/{tableId}/projections/{projectionId}/runtime` — the exact same route `ui/basic-customization/basic-customization-ui-paths.ts:18-23`'s `PROJECTION_RUNTIME.URL_PATTERN` already owns. The new module doesn't just duplicate the route string; it directly imports and drives the same `ProjectionRuntimePage` class that `basic-customization` owns (`helpers/audit-fields-setup.ts:3`), so two files now separately encode knowledge of one page's route. `docs/frame-specs/architecture.md`'s "one `<module>-ui-paths.ts` per module" rule is about each module owning the paths **to its own pages** — it doesn't license re-deriving another module's existing route from scratch. If the real route ever changes, updating only one of the two files is an easy miss.
Fix: add a `.URL()` builder to `BASIC_CUSTOMIZATION_UI_PATHS.PROJECTION_RUNTIME` (alongside its existing `.URL_PATTERN()`) and import that from `audit-fields-setup.ts`, instead of introducing a second, parallel path file for the same page.

**[Confirmed] 15 un-stepped `createUiAdminAuthContext`/`apiContext.dispose()` calls reintroduce a documented anti-pattern**
Every `beforeEach` in both new spec files creates the admin API context and disposes it in a bare `try { ... } finally { await apiContext.dispose(); }`, with neither call wrapped in `test.step(...)`:
- `tests/audit-fields-smoke.spec.ts` — lines 51/55, 134/149, 178/182, 235/239, 292/296, 358/362 (6 occurrences).
- `tests/audit-fields-regression.spec.ts` — lines 46/58, 171/175, 217/221, 268/272, 369/379, 515/519, 596/600, 686/690, 787/791 (9 occurrences).

This matches Cause 4 of `docs/common-issues/playwright-execution/unwrapped-requests-outside-test-step.md` verbatim — that doc's own worked example is this exact shape (a resource that must be created before `try` for safe `finally`-disposal still needs its creation and disposal each wrapped in their own step). Rated `Confirmed` rather than `Critical`: the doc's own triage note treats setup/cleanup-position bare calls as a report-readability defect, not the higher-priority "hides why the test failed" variant (that's reserved for a bare call on the test's *critical* path).
Fix: per the doc's own example, hoist `apiContext` to a `let` above `try` and wrap creation in a leading `PRECONDITION` step and disposal in a `CLEANUP` step:
```
let apiContext!: Awaited<ReturnType<typeof createUiAdminAuthContext>>;
await test.step('PRECONDITION (API): obtain an admin API context', async () => {
  apiContext = await createUiAdminAuthContext(playwright.request);
});
try { ... } finally {
  await test.step('CLEANUP: dispose the admin API context', () => apiContext.dispose());
}
```

## Possible Risks

**[Risk] Fixture relies on an implicit default for the load-bearing USR/auditable table type**
`fixtures/audit-fields-provisioning.ts`'s `createTableWithProjection` calls `buildCreateTablePayload(groupId, { id: tableId, name: tableId, classification: options.classification })` without ever passing `type`. It inherits `test-data/payload-builder.ts:93`'s default (`type: TEST_CONSTS.NEW_TABLE_TYPE`, which is `'USR'` per `api/utils/constants/constants-keeper.ts:175`) — confirmed correct today, since every test in this module depends on these tables being USR/auditable (the whole premise of TC-3263/3266/3267/etc.). But that dependency is invisible at the call site; if the shared default ever changes for an unrelated reason, this entire module fails for a cause nothing in `audit_fields/` itself would suggest.
Fix: pass `type: TEST_CONSTS.NEW_TABLE_TYPE` explicitly in the override object so the auditable precondition is visible where it's actually load-bearing.

**[Risk] No UI-level test for multiple un-authorized INPUT operations stacking as separate indexed Input blocks**
TB-3484's fix (the authoritative design source, see Summary) specifies one Input block *per element* of `ST_INPUTTER`, index-aligned, and `AuditFieldsRecordPage.inputUser/inputDateTime/inputProjection` (`pages/audit-fields-record-page.ts:73-84`) already expose an `index` parameter for exactly this — but no test in this diff ever calls them with `index=1`. TC-3271/TC-3272 (`tests/audit-fields-regression.spec.ts`) exercise the *compare-form* path (re-inputting an **already-authorised** record produces a pending-vs-LIVE column pair, each independently asserted at `index=0`), which is a different code path from re-inputting an **UNAU** record a second time *before* it's ever authorised — the scenario that actually produces two stacked Input blocks in one view, and that the existing API-level suite already proves at the DB layer (`api/system_core/tests/audit-fields-regression.spec.ts:452`, `TC-18`). The index-aware page-object API exists but is only ever exercised at `index=0`.
Fix: add a case that re-INPUTs an UNAU record before authorisation and asserts `inputUser(1)`/`inputDateTime(1)`/`inputProjection(1)`, or note explicitly (in the MR description or a follow-up ticket) why this is intentionally out of scope.

**[Risk] No citation found for `showAuditFields` or for the new timeout constant's `20_000` value**
- `fixtures/audit-fields-provisioning.ts:75` sets `layout: { view: 'form', showAuditFields: true, ... }`. A repo-wide grep found zero other occurrences of `showAuditFields` anywhere in `proj-test-automation` — no prior UI or API usage, and no Bruno/doc citation was reachable from this review's gathered bundle. It's plausible this diff is simply the first consumer of a real, already-shipped backend flag, but nothing available to this review confirms the contract.
- `UI_RECORD_OPERATION_TIMEOUT_MS = 20_000` (`ui/base/constants/ui-timeouts.ts:7`) is new; the same file already has `UI_MODAL_VISIBLE_TIMEOUT_MS = 15_000` and `UI_API_RESPONSE_TIMEOUT_MS = 10_000` for comparable waits, and nothing in the diff explains why AUTH/record-load operations specifically need a longer, dedicated constant rather than reusing one of those.
Fix: none required if the author can point to the real contract/measured timing (the value itself is plausible for a backend-heavy AUTH operation) — otherwise, state the reasoning in the MR description so it isn't reverse-engineered by the next reader.

## Nice-to-Have Improvements

**[Nit] ESLint `assertFunctionNames` allowlist misses 5 of the 13 new `AuditFieldsRecordPage` assertion methods**
`eslint.config.mjs:126-134` adds 9 of the page object's new `assert*` methods to `playwright/expect-expect`'s allowlist (`assertFieldValue`, `assertAuthorizer`, `assertAuthorizeDateTime`, `assertAuthorizeProjection`, `assertInputter`, `assertInputDateTime`, `assertInputProjection`, `assertCompany`, `assertRecordStatus`) but omits `assertCompareDisplayed`, `assertAuthorizerEmpty`, `assertAuthorizeDateTimeEmpty`, `assertAuthorizeProjectionEmpty`, `assertAuthorizerEqualsInputter` (`pages/audit-fields-record-page.ts`). Every current call site happens to co-occur with an already-listed assertion in the same test body, so nothing fails lint today — but a future test using only one of these five as its sole assertion would trip a false "no assertion" error.
Fix: add the remaining 5 method names to the same list for consistency.

## Necessity Citations

| Addition | Citation |
|---|---|
| `AUDIT_FIELDS_RECORD_SCHEMA` (`ID`/`TEST` fields) | Matches the exact `ID`-field shape already used by `api/system_core/tests/audit-fields-regression.spec.ts`'s own inline schema (~lines 113-121) and `SystemCoreProjectionHelper.updateTableDefinition`'s contract — direct precedent. |
| `AUDIT_FIELDS_UI_PATHS.PROJECTION_RUNTIME.URL` | The underlying route matches `BASIC_CUSTOMIZATION_UI_PATHS.PROJECTION_RUNTIME.URL_PATTERN`'s own template, but no existing "goto" (absolute-URL) builder for this route was found anywhere in the repo to reuse — the route itself is citable, the decision to re-derive it in a second file is not; see Confirmed Issue C2. |
| `UI_RECORD_OPERATION_TIMEOUT_MS = 20_000` | No citation found — see Risk. |
| `showAuditFields: true` layout flag | No citation found in-repo (zero other occurrences) — see Risk. |
| `createFinTableSelfAuthorized`/`createCusTableSelfAuthorized`/`createFinTableRequiringAuth`/`createCusTableRequiringAuth`/`createAuditableUsrTable` | Each is a thin, named parameterization of the same in-file `createTableWithProjection` helper, along the `classification`/`authOperationRequired` axes `TableRegistryApiClient.inputProjectionDefinition`'s real payload already supports (confirmed against `api/system_core/client/table-registry-api-client.ts`) — justified. |
| `ALLOWED_DUPLICATE_IDS` entry `3266` (`scripts/verify-allure-ids.ts`) | Justified directly by the diff's own two `allureCaseId(3266)` uses (FIN and CUS describe blocks, `tests/audit-fields-smoke.spec.ts`) — self-consistent. |
| `eslint.config.mjs` `assertFunctionNames` additions | Justified by the corresponding new `AuditFieldsRecordPage` methods — see the Nice-to-Have finding for the incomplete subset. |
| `ProjectionRuntimePage.assertCurrentSpace(space, options = {})` signature change | Default-valued optional param, confirmed backward-compatible with both existing external callers (blast-radius table above); needed because `authoriseRecordAsDifferentUser` must wait longer than the assertion's default timeout for the AUTH operation's backend processing to land in the UI. |
| Reliance on `buildCreateTablePayload`'s default `type: 'USR'` rather than an explicit value | Value is correct but not explicitly cited at the call site — see Risk. |

## Orphaned Code

None found. Every new export (`AUDIT_FIELDS_RECORD_SCHEMA`, `AUDIT_FIELDS_UI_PATHS`, all five fixture functions, all four helper functions, `AuditFieldsRecordPage` and its methods) is consumed by at least one test within this same diff, and `UI_RECORD_OPERATION_TIMEOUT_MS` is used twice within it.

## Changelog

- 2026-10-02 — Re-run requested. MR head is still `3fa74926` (no commits after the 2026-10-01 analysis). Spot-re-verified against that head: kebab-case module naming in `ui/` (C1), `showAuditFields` having no other consumer (Risk), the bare `createUiAdminAuthContext`/`dispose()` try/finally shape (C3), and the `assertFunctionNames` allowlist omissions (Nit). No findings added, removed or re-rated.
