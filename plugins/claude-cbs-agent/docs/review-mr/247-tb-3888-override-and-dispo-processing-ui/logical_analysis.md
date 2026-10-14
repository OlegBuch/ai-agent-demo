# MR 247 — TB-3888: Test impl: Override and Dispo Processing - UI — Logical Analysis

## Summary

MR 247 (source `group-1/TB-3888` → `main`) implements the UI test suite for Override and Dispo
Processing (smoke + regression, ~40+ TCs against Google Sheet EP-02.05), adding a full new
`ui/override-dispo/` module (pages, fixtures, helpers, types, test data, two spec files) plus a
matching cleanup helper on the API side
(`api/security_management/helpers/override-dispo-cleanup.ts`). Along the way it also touches
shared `api/utils/**` infrastructure: it extracts a `provisionWorkerTableGroup` helper
(`api/utils/helpers/table-group-provisioning.ts`, new) used by **both**
`api/utils/fixtures/api-fixtures.ts` (every API test worker) and the also-new
`ui/base/fixtures/dynamic-group-fixture.ts` (every UI test worker), and adds a
`persistDynamicGroupId` function to `api/utils/helpers/group-helper.ts`. TB-3888 itself
(fetched from Jira, status "In Code Review") is scoped purely to UI test authoring against a
manual test sheet — it carries no linked tickets and no Acceptance Criteria referencing group
provisioning, so the `api/utils/**` changes are **not** citable to this ticket's own scope; they
exist to make the new UI suite bootstrap its own worker-scoped table group.

This is a re-review of the MR at its current HEAD (`44e4bc8`, "fix comment 1, 2"), after the
reviewer's three prior comments (dynamic-group reuse race / Critical, unsalted ID generator /
Risk, sequential cleanup queries / Nit) and two follow-up commits from the author
("fix comment 3" = `09a0c8d`, "fix comment 1, 2" = `44e4bc8`). All three prior comments were
re-verified line-by-line against the current diff; findings below state explicitly, per comment,
whether it was actually resolved.

⸻

## Confirmed Issues

> **RESOLVED as of commit `bfa4523` "fix comment 1" (2026-09-22 16:51) — see Changelog entry
> below for verification detail.** Kept here for the record of what was originally wrong.

**[Critical] Comment 1 (dynamic-group reuse race) is not resolved — and the fix commit widened its blast radius**
`ui/base/fixtures/dynamic-group-fixture.ts:16-20` still contains the `existingGroupId` reuse
branch verbatim (`const existingGroupId = getDynamicGroupId(); if (existingGroupId) { await
use(existingGroupId); return; }`) — untouched by commit `44e4bc8` ("fix comment 1, 2"), which only
refactored the group-**creation** call into a new shared helper,
`provisionWorkerTableGroup` (`api/utils/helpers/table-group-provisioning.ts:9-30`). That helper
now calls `persistDynamicGroupId` (`api/utils/helpers/group-helper.ts:30-41`)
**unconditionally on every group creation**, and is invoked from **both**
`api/utils/fixtures/api-fixtures.ts:31-39` (the `workerGroupId` fixture, `auto: true`, so every
single API test worker) and `ui/base/fixtures/dynamic-group-fixture.ts:23-26` (every UI test
worker). Per `playwright.config.ts:41`
(`workers: API_TESTS_PARALLEL_WORKERS + API_TESTS_SINGLETON_WORKERS + UI_TESTS_PARALLEL_WORKERS`)
and `docs/frame-specs/architecture.md`, API and UI projects run under **one shared root worker
pool**, not isolated runs. The net effect of this "fix" is that **every** worker across **both**
suites now writes its own group id to the single shared `test-results/dynamic-group-id.txt` file
on creation, while only the UI-side fixture still reads that file back before creating its own
group. A UI worker that races the read before its own creation call can now silently adopt **any**
other worker's group — UI or API — with the exact same zero-cleanup-coordination hazard
originally reported: `group-cleanup-helper.ts`'s `cleanupGroupById` has no lock and no
"is anyone else still using this" check, so the group's creating worker can drop it out from
under a worker that adopted it via the file. This is not a partial fix — it enlarges the reuse
surface from "another UI worker" to "any worker in the shared pool, including API workers whose
groups have no UI-specific setup at all."

*Known-Issue Cross-Check:* `docs/frame-specs/architecture.md` documents that the file-fallback in
`getDynamicGroupId()`/`test-results/dynamic-group-id.txt` was the **original, pre-TB-3911**
design — a single table group created **once per whole run** by `global-setup.ts`, with the file
existing purely as a cross-process read of that one sentinel value. TB-3911 (2026-09-17,
referenced in `docs/common-issues/playwright-execution/global-workers-pool-vs-per-project-cap.md`)
deliberately replaced that single-shared-group model with **per-worker** group provisioning,
specifically to remove cross-worker group sharing. This MR's reuse branch in
`dynamic-group-fixture.ts` reactivates exactly the legacy shared-group read path TB-3911 was built
to retire — this is a reintroduced architectural regression, not a first-time convention
violation. Separately, `docs/common-issues/db-and-concurrency/cleanup-failure-swallowed-by-caller.md`
documents a real prior incident (TB-3587, 2026-09-07) where `cleanupGroupById` needed an explicit
ownership guard added before it was safe to let one process drop schemas another process might
still be using — this MR's reuse path recreates precisely that hazard class for the override/dispo
domain. Per severity-taxonomy's own rule, a reintroduced documented-incident-class defect is
`Critical`, not merely `Confirmed`.

Fix: remove the `existingGroupId` reuse branch from `dynamic-group-fixture.ts` entirely — every
worker, UI or API, always provisions its own fresh group via `provisionWorkerTableGroup`. Stop
calling `persistDynamicGroupId` from `provisionWorkerTableGroup`'s normal creation path; that
function should only ever be called from the heal path, which
`api/system_core/helpers/table-registry-helper.ts`'s own `persistHealedGroupId` already owns.
Example:
```
// dynamic-group-fixture.ts — drop the existingGroupId branch entirely
async ({ playwright }, use) => {
  const { groupId, authContext } = await provisionWorkerTableGroup(
    createUiAdminAuthContext,
    playwright.request,
  );
  try {
    await use(groupId);
  } finally {
    await cleanupGroupById(Number(groupId), authContext).catch((cleanupError) => { ... });
    await authContext.dispose();
  }
}
// table-group-provisioning.ts — do not persist to disk on normal creation
const groupId = String((await response.json()).id);
process.env.DYNAMIC_GROUP_ID = groupId; // same-process reads via getDynamicGroupId()/requireDynamicGroupId() stay correct
trackCreatedGroup(groupId);
return { groupId, authContext };
```

> **RESOLVED as of commit `32e7732` "fix comment 2,3" (2026-09-22 17:01).**

**[Confirmed] Comment 3 (sequential cleanup queries) is unaddressed — the matching "fix comment 3" commit changed unrelated files**
`api/security_management/helpers/override-dispo-cleanup.ts:58-73` (`deleteRecordsOfKind`) is
byte-for-byte identical to the version the reviewer originally commented on: the triple-nested
`for (schema) { for (space) { for (recordId) { await dbClient.query(DELETE_BY_ID...) } } }` loop
still issues one sequential awaited round-trip per `(schema × space × recordId)` combination.
Commit `09a0c8d`, titled "fix comment 3", does not touch this file at all — its actual diff is
against five `ui/override-dispo/fixtures/*-setup.ts` files, reordering `dbClient.connect()` /
`createTestUser()` calls to run inside their own `try` blocks (a legitimate, different fix: it
prevents `cleanup()` from calling `deleteTestUser(apiRequest, undefined)` when a user was never
created because an earlier `createTestUser` call in the same setup failed). That's a real and
worthwhile fix, but it is not the batching change Comment 3 asked for — either the GitLab comment
numbering and this commit's target drifted, or the wrong finding got closed as "comment 3." Either
way, the code content of Comment 3 remains open.
Fix: batch each `(schema, space)` combination into one `DELETE ... WHERE id = ANY($1::text[])`
call instead of one query per id. This isn't a novel technique for this codebase: the exact
pattern already exists and is already in use at
`api/interest_and_charges/charges_calculation_engine/helpers/cce-regression-helper.ts:17,78,96,174`
(`REGRESSION_QUERIES.DELETE_BY_IDS(schema, space)` with an array parameter) — cite that as the
existing convention rather than introducing a new one.
Example:
```
async function deleteRecordsOfKind(dbClient, scopeLabel, kind, recordIds) {
  const schemas = await resolveProvisionedSchemas(dbClient, SCHEMA_BASE_BY_KIND[kind]);
  let removed = 0;
  for (const schema of schemas) {
    for (const space of CLEANUP_SPACES) {
      const res = await dbClient
        .query(DB_QUERIES.RECORD_SPACE.DELETE_BY_IDS(schema, space), [recordIds])
        .catch(() => null);
      removed += res?.rowCount ?? 0;
    }
  }
  // ... same logging as before
}
```

⸻

## Possible Risks

> **RESOLVED as of commit `32e7732` "fix comment 2,3" (2026-09-22 17:01).**

**[Risk] Comment 2 (unsalted `dynamic-name-generator.ts` ID collision) is still open, correctly out of this MR's own file scope, but its exposure keeps growing**
`api/utils/helpers/dynamic-name-generator.ts` is confirmed untouched by this MR (not present in
the 42-file changed-file list). `generateCustomId`/`generateDynamicTable`/`generateDynamicGroup`
still key off `Date.now()` (millisecond resolution) + 3 random hex chars, with no worker index or
PID salt. This MR adds `ui/override-dispo/fixtures/dispo-ticket-factory.ts` (generates several ids
per call inside a scenario loop) plus six new `*-setup.ts` precondition files, all new call sites
layered on top of the same collision-prone generator, now running under the shared worker pool
described in the Critical finding above. Since the generator itself isn't in this diff, this
correctly stays a Risk against this MR rather than a Confirmed Issue — but it's the same
underlying exposure the reviewer already flagged, now with materially more concurrent callers than
before. Still belongs to whoever owns `dynamic-name-generator.ts`, not to this MR's author.

**[Risk] Every consumer of `getDynamicGroupId()`/`requireDynamicGroupId()` across the whole suite inherits the Critical finding's blast radius**
Per the Step 1.5 whole-repo grep, `requireDynamicGroupId()`/`getDynamicGroupId()` are called far
beyond this MR's own files: `api/system_core/tests/{audit-fields-smoke,enquiry-regression,
enquiry-smoke,idempotency-regression,idempotency-smoke,table-registry-smoke}.spec.ts`,
`api/integration_chapter/tests/audit-fields-integration.spec.ts`,
`api/soft_accounting/helpers/soft-accounting-helper.ts`,
`api/system_core/helpers/validation-engine-fixtures.ts`,
`api/security_management/tests/override-dispo-regression.spec.ts`, and UI-side
`ui/basic-customization/helpers/{linked-table-field-setup,multi-drilldown-setup,
projection-menu-setup,workspace-menu-setup}.ts` and `ui/field-registry/fixtures/
field-registry-setup.ts`. In the normal case these all read their own worker's already-set
`process.env.DYNAMIC_GROUP_ID` and are unaffected. But if that worker's group id was silently
swapped for a foreign one via the Critical finding's race, every one of these call sites will
create/assert against a group that is not the one their own worker provisioned and does not own —
and that group can be torn down by its real owner mid-test. This isn't a separate defect from the
Critical finding, but it's the concrete reason the Critical finding isn't scoped to
`override-dispo` alone: once the shared file is corrupted, its effect surfaces anywhere in the
suite that trusts `requireDynamicGroupId()`.

> **RESOLVED as of commit `bfa4523` "fix comment 1"** — moot now that `dynamic-group-fixture.ts`
> and its file-persisted reuse path are deleted entirely; see Changelog.

**[Risk] `base-ui-test.ts` now silently gives every UI worker its own `workerSuperAdmin` (Keycloak super-admin user), with no UI consumer and no citation**
Commit `bfa4523` ("fix comment 1") fixed the Critical reuse finding by deleting
`ui/base/fixtures/dynamic-group-fixture.ts` outright and repointing `ui/base/fixtures/
base-ui-test.ts` to just re-export `api/utils/fixtures/api-fixtures.ts`'s own `test`
(`import { test as apiTest, expect } from '../../../api/utils/fixtures/api-fixtures'; export
const test = apiTest;`). This is the right fix for the reuse race — one single, already-correct
group-provisioning implementation for the whole suite instead of two. But `api-fixtures.ts`'s
`workerGroupId` isn't the only `{ scope: 'worker', auto: true }` fixture on that `test` object:
`workerSuperAdmin` (`api-fixtures.ts:56-71`) is too — it creates a Keycloak super-admin test user
per worker via `createSuperAdminTestUser` and calls `setWorkerSuperAdmin(admin)`, tearing it down
via `deleteSuperAdminTestUser` at worker end. Since `ui/auth/fixtures/auth-ui-test.ts` extends
`base-ui-test.ts`'s `test` (`import { test as base } from '../../base/fixtures/base-ui-test'`),
and every UI test file in this MR (and the rest of the suite) ultimately extends `auth-ui-test.ts`,
**every UI worker now also creates and tears down its own super-admin Keycloak account**, which
did not happen before this MR at all. A repo-wide grep for `setWorkerSuperAdmin`/
`getWorkerSuperAdmin` found **zero consumers outside `api-fixtures.ts` itself** — nothing in
`ui/` reads the worker super-admin anywhere, so this is pure added cost (extra Keycloak
account-creation traffic per UI worker, extra worker-teardown latency) with no present benefit.
It reuses the already-audited per-worker super-admin pattern (not the pre-TB-3911 shared-credential
anti-pattern discussed in `docs/common-issues/keycloak-and-auth/
keycloak-shared-credential-lockout-and-ci-log-masking.md`), so it is not unsafe the way the
original Critical finding was — but it is an uncited side effect of a fixture-consolidation
refactor, and TB-3888 (UI-test-scope only) doesn't ask for UI tests to hold super-admin
credentials at all.
Fix: either cite why UI workers now need their own super-admin (if some override-dispo scenario
in this MR or a near-term follow-up needs it), or split `api-fixtures.ts`'s worker fixtures so
`base-ui-test.ts` can pull in `workerGroupId` alone without also pulling in `workerSuperAdmin` —
e.g. move `workerGroupId` into its own fixture module both `api-fixtures.ts` and `base-ui-test.ts`
import, rather than having the UI base re-export the API base wholesale.

⸻

## Nice-to-Have Improvements

**[Nit] `describeError` import in `group-helper.ts` is now unused after `persistDynamicGroupId`'s removal**
`api/utils/helpers/group-helper.ts:4` still imports `describeError` from `./error-format-helper`,
added in an earlier fix commit specifically to format the warning message inside the now-deleted
`persistDynamicGroupId`. With that function removed (`bfa4523`), the import has no remaining
reference in the file. `tsc --noEmit` (the repo's `typecheck` script) will not fail on this by
itself, but it will trip an unused-import ESLint rule if one is enabled.
Fix: drop the unused `describeError` import from `group-helper.ts`.

⸻

## Necessity Citations

- **`provisionWorkerTableGroup` extraction** (`api/utils/helpers/table-group-provisioning.ts`,
  new): removes real duplication between `api-fixtures.ts` and `dynamic-group-fixture.ts`'s
  group-creation logic — a legitimate DRY citation on its own. However, the decision to call
  `persistDynamicGroupId` **unconditionally** from inside it, thereby changing
  `api-fixtures.ts`'s side effects for every API test worker in the suite, has **no citation**:
  TB-3888 (fetched from Jira) is UI-test-authoring scope only, carries no Acceptance Criteria or
  linked ticket touching group provisioning, and does not ask for any change to API-side fixture
  behavior. This is the concrete instance the Mandatory Deep-Impact Rule for `api/utils/**` exists
  to catch — an edit that "looks like an internal implementation detail" but changes shared
  cross-suite state with no product/ticket justification.
- **`worker-preconditions.ts`'s `provisionedWorkerFixture` generic wrapper** (new): a reasonable
  reuse extraction, consumed by this MR's own override-dispo fixtures and used to also refactor
  `ui/field-registry/fixtures/field-registry-ui-test.ts` (not itself a TB-3888 file). Low risk,
  net positive for suite architecture consistency — no objection, but note it as a second file
  outside the ticket's own stated scope touched by this MR.
- **`ensureSystemSmUserForDispoOfficer`** (`api/security_management/helpers/
  override-dispo-helper.ts:539-552`, new): directly consumed by this MR's own
  `override-dispo-setup.ts` for its SYSTEM-user precondition. Justified by the MR's own need.
- **`eslint.config.mjs` allowlist additions**: the new helper/assertion names added
  (`runReviewActionRejectionScenario`, `assertInputRejectedByHook`, `assertOverridePersisted`,
  etc.) all correspond 1:1 to new functions this MR itself introduces in
  `ui/override-dispo/helpers/` and test files — self-consistent, no unjustified addition found.

⸻

## Orphaned Code

None found. The pre-refactor duplicated group-creation logic in `api-fixtures.ts` and
`dynamic-group-fixture.ts` was fully replaced by calls into `provisionWorkerTableGroup`, with no
leftover unused imports or dead branches in either file from that consolidation.

⸻

## Whole-Repo Blast-Radius / Architect Lens (Step 1.5 / 1.6, `api/utils/**` touched)

Files changed under `api/utils/**`: `api-fixtures.ts`, `helpers/group-helper.ts`,
`helpers/table-group-provisioning.ts` (new), `constants/db-query-keeper.ts`,
`constants/override-dispo.values.ts`. Per-consumer verdicts:

| Calling context (outside `api/utils/`) | Behavior change? |
|---|---|
| `ui/base/fixtures/dynamic-group-fixture.ts` (every UI worker) | **Yes** — now races against a file that API workers also write; see Critical finding. |
| `api/security_management/tests/override-dispo-regression.spec.ts`, other `requireDynamicGroupId()` callers listed above | **Not directly, but conditionally** — unaffected only as long as no cross-worker group swap occurred; see Risk finding above. Not a confident "no." |
| `api/security_management/helpers/override-dispo-cleanup.ts` (this MR's own new cleanup helper) | Unaffected by the `api/utils/**` changes themselves; it resolves schemas by fixed name suffix, independent of which group is active. Its own defect (sequential queries) is tracked separately above. |
| `db-query-keeper.ts`'s new `SET_AUDIT_FIELD_BY_ID` | No consumers found in this diff's changed files or via grep — appears unused by this MR; flagged here for visibility rather than as Orphaned Code, since it wasn't introduced by a now-removed call site (it simply has no caller yet). Worth asking the author whether it's dead weight from this MR or intended for a near-term follow-up. |

⸻

## Changelog

- 2026-09-22 — Full re-review at MR HEAD `44e4bc8`. Verified all three prior reviewer comments
  against current code: Comment 1 (Critical) confirmed unresolved and widened; Comment 3 (Nit)
  confirmed unresolved (wrong files touched by the matching commit); Comment 2 (Risk) confirmed
  correctly out of this MR's scope, restated with growing exposure. Added Known-Issue Cross-Check
  against `docs/frame-specs/architecture.md` (TB-3911 per-worker-group design) and
  `docs/common-issues/db-and-concurrency/cleanup-failure-swallowed-by-caller.md` (TB-3587).

- 2026-09-22 (later same day) — Re-verified against three new commits pushed by the author:
  `bfa4523` "fix comment 1" (16:51), `32e7732` "fix comment 2,3" (17:01), `b149132` "fix idea"
  (17:07, current HEAD). All three originally-reported issues are now genuinely fixed, not just
  reshuffled:
  - **Comment 1 (Critical) — RESOLVED.** `ui/base/fixtures/dynamic-group-fixture.ts` deleted
    outright; `ui/base/fixtures/base-ui-test.ts` now re-exports `api/utils/fixtures/
    api-fixtures.ts`'s own `test`, so the whole suite (API and UI) shares exactly one
    group-provisioning implementation with no reuse branch. `persistDynamicGroupId` and the
    file-write it performed were deleted from `group-helper.ts` entirely;
    `table-group-provisioning.ts` now only sets `process.env.DYNAMIC_GROUP_ID` in-process. This
    matches the originally requested fix essentially verbatim.
  - **Comment 3 (Confirmed/Nit) — RESOLVED.** `deleteRecordsOfKind` in
    `override-dispo-cleanup.ts:58-73` now issues one `DELETE ... WHERE id = ANY($1::text[])` per
    `(schema, space)` via the new `DB_QUERIES.RECORD_SPACE.DELETE_BY_IDS` constant
    (`db-query-keeper.ts:67-68`), matching the cited `cce-regression-helper.ts` convention.
  - **Comment 2 (Risk) — RESOLVED.** `dynamic-name-generator.ts` now salts every generated id via
    a new `workerScopedPrefix` (`${prefix}_w${process.env.TEST_PARALLEL_INDEX ?? '0'}`), applied
    in both `generate` and `generateHyphenated`. No length-limit issue found in
    `constants-keeper.ts`'s `TABLE_GROUP_PREFIXES`/other prefix constants against this addition.
  - **New Risk surfaced by the fix itself:** collapsing `base-ui-test.ts` into `api-fixtures.ts`'s
    `test` also pulls in `workerSuperAdmin` (`auto: true`, worker-scoped) for every UI worker —
    a Keycloak super-admin account created/torn down per UI worker with zero UI-side consumers
    found repo-wide. Not unsafe (reuses the already-audited per-worker pattern, not the retired
    shared-credential one), but uncited against TB-3888's UI-only scope. See Possible Risks.
  - **Verdict update:** no remaining Critical or Confirmed finding. The MR is materially better
    than at the previous HEAD and the reuse hazard this review started from is gone. The one new
    Risk (`workerSuperAdmin` for UI workers) is a judgment call for the author/reviewer, not a
    blocker.

- 2026-09-23 — Breakage sweep requested by the reviewer ("did the fix commits break anything else
  in api or ui?"). Whole-repo grep at HEAD `b149132` confirmed: zero remaining imports of the
  deleted `dynamic-group-fixture.ts` or its exports (`workerGroupIdFixture`,
  `DynamicGroupWorkerFixtures`) anywhere in the repo; zero remaining calls to the deleted
  `persistDynamicGroupId`; no UI file double-declares `workerGroupId` (it's inherited once, via
  the `base-ui-test.ts` → `api-fixtures.ts` chain, with no collision); `package.json`'s
  `typecheck` (`tsc --noEmit`) is unaffected. The only finding from this sweep is the
  `describeError` unused-import Nit recorded above — everything else is clean. No new Critical/
  Confirmed issue found.
