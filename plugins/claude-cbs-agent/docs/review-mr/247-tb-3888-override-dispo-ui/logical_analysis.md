# MR 247 (branch `group-1/TB-3888`) — Logical Analysis

## Summary

MR 247 implements the UI automation for TB-3888 ("Test impl: Override and Dispo Processing —
UI", parent epic TB-22). **Status (see 2026-09-22 Changelog): the three original Confirmed Issues
are fixed and verified, but a new `Critical` issue was found once the author confirmed UI tests now
actually run at `UI_TESTS_PARALLEL_WORKERS=2-4` — a cross-worker table-group cleanup race that was
previously filed as a non-blocking Risk under a `workers: 1` assumption.** It now touches 42 files
(39 feature files plus 3 added by the fix commits), all under
`ui/override-dispo/*` plus a handful of shared `ui/base/`/`api/` files — it does not touch
`ui/customization/` at all. That directory already exists on `main` (added by a separate,
already-merged MR) with byte-identical content on both sides; it only appeared in an earlier pass
of this review because of a diff-scoping mistake, now corrected and confirmed against GitLab's own
merge-preview ref for this MR. Test-case detail for TB-3888 lives only in a Google Sheet
(`EP-02.05 | Override_Dispo_UI.xlsx`), not in the Jira ticket itself, so no Acceptance Criteria
text was available to check against.

Beyond the `ui/override-dispo/*` feature files, the diff touches the shared UI foundation: it adds
`ui/base/fixtures/dynamic-group-fixture.ts` (a worker-scoped "create one Table Registry group"
fixture) and `ui/base/fixtures/worker-preconditions.ts` (a generic factory that wraps a
`provision()` call in worker-scope + `workerGroupId` dependency + cleanup), rewires
`ui/field-registry/fixtures/field-registry-ui-test.ts` and the new
`ui/override-dispo/fixtures/override-dispo-ui-test.ts` onto that factory, adds an `allureCaseLink`
auto-fixture to `ui/base/fixtures/base-ui-test.ts`, and reworks dropdown-search waiting in
`ui/base/interactions/antd-virtualized-dropdown.ts`.

**Direct answer to the `global-setup` question:** No, the new UI group fixture does not inherit
from `api/utils/fixtures/global-setup.ts`. `global-setup.ts` is registered once in
`playwright.config.ts:34` (`globalSetup`) and runs in its own process **before any worker starts**,
regardless of project — it is not part of the Playwright fixture graph at all. Per
`docs/frame-specs/architecture.md:129-164`, the *documented* design is that `global-setup.ts`
creates **one shared table group per whole run** and persists `DYNAMIC_GROUP_ID` to both
`process.env` and `test-results/dynamic-group-id.txt`, so every worker/project reuses it. In the
actual current `global-setup.ts` (unchanged by this MR, already on `origin/main`), that group
creation code is gone — it now only probes `BASE_URL`, restores the `SYSTEM` parameter row,
deletes stale sentinel files, and cleans up orphaned schemas/stale groups. Group creation was
already moved into `api/utils/fixtures/api-fixtures.ts`'s own `auto:true` worker-scoped fixture
(one group **per worker**, not one per run) — a drift `architecture.md` doesn't reflect. This MR's
`dynamic-group-fixture.ts` copies that already-drifted `api-fixtures.ts` pattern for the UI layer
instead of reusing it, compounding the doc/code mismatch (see Confirmed Issues below).

⸻

## Confirmed Issues

**[Critical] Cross-worker group-reuse has no cleanup-ownership coordination — now live, not hypothetical, given confirmed `UI_TESTS_PARALLEL_WORKERS=2-4` usage**
`ui/base/fixtures/dynamic-group-fixture.ts:16-20`'s `existingGroupId` branch and
`api/utils/helpers/table-group-provisioning.ts`'s `persistDynamicGroupId` call (both from this MR's
own fix round, `44e4bc81`) combine with two pieces of pre-existing infrastructure confirmed via a
Gather pass on this diff's own call targets:
`api/utils/helpers/resource-tracker.ts`'s `trackCreatedGroup` and, more importantly,
`api/utils/helpers/group-cleanup-helper.ts#cleanupGroupById` — which has **no lock, no "is this group
still in use by another worker" check, and no double-cleanup guard** (confirmed by reading its full
body: it queries tables by group id, drops schemas, and calls the delete API with only 404-tolerance,
nothing else). Sequence that is now reachable with real multi-worker runs: Worker A's
`workerGroupIdFixture` creates group G and calls `persistDynamicGroupId(G)`, writing
`test-results/dynamic-group-id.txt`. If Worker B's own `workerGroupIdFixture` initializes afterward
(plausible — Playwright doesn't guarantee simultaneous worker startup, and this is a `scope: 'worker'`
fixture that runs once per worker at that worker's own startup), it reads `existingGroupId = G` and
reuses it **without ever registering an `authContext`/`cleanupGroupById` pair for G** — ownership of
G's teardown stays exclusively with Worker A. When Worker A's own tests finish (independent of
whether Worker B is still mid-run — different workers get different file batches, so their finish
times are unrelated), its `finally { cleanupGroupById(G) }` fires and drops G's schemas/tables while
Worker B's tests are still actively reading/writing against G. This surfaces as spurious,
hard-to-diagnose mid-run failures (table/schema not found, unexpected 404s) that look like flaky
individual tests but are actually cross-worker resource lifecycle corruption — exactly the shape of
"broken pipeline" this taxonomy's `Critical` tier is for, and it's live today per the user's own
confirmation that `UI_TESTS_PARALLEL_WORKERS` is already run at 2-4, not the `workers: 1` this
diff's own `playwright.config.ts` (unchanged by this MR) defaults to.
Fix: give the reuse branch a real ownership model — either a per-group refcount (e.g. a
`test-results/.group-refs/<groupId>/<workerIndex>.lock` marker; only the worker that decrements the
count to zero calls `cleanupGroupById`), or stop sharing table groups across workers entirely by
making `dynamic-group-id.txt` (and the `getDynamicGroupId()` read it feeds) per-worker-suffixed, so
`existingGroupId` can only ever resolve to a group *this same worker* already owns.

**[Risk] The whole override-dispo domain's cross-worker correctness rests entirely on an unsalted, millisecond-resolution ID generator, and this MR is by far its heaviest new consumer**
`api/security_management/helpers/override-dispo-cleanup.ts` (new, this MR) resolves DB schemas for
`DISPO_ITEM`/`OVERRIDE`/`OVERRIDE_CLASS`/`DISPO_OFFICER` purely by fixed schema-name suffix
(`SCHEMA_BASE_BY_KIND` + `COMPANY_SCHEMA_SUFFIXES_CORE`) — **not** scoped by dynamic table group at
all, confirmed by reading `resolveProvisionedSchemas`/`deleteRecordsOfKind` in full. That means these
four record kinds live in schemas **shared by every concurrent worker**, regardless of which dynamic
table group each worker owns — correctness for the entire feature depends solely on record IDs never
colliding across workers. Those IDs come from `dynamic-name-generator.ts`'s `generateCustomId`/
`generateDynamicTable`/`generateDynamicGroup`, confirmed (via a Gather pass reading that file in
full) to use `Date.now()` (millisecond resolution) + 3 random hex characters (4096 combinations) —
**no worker index, no PID, no counter**. This MR adds by far the largest set of new call sites for
that generator in the repo: `dispo-ticket-factory.ts#createRoutedPendingTicketFactory` alone
generates 3 IDs per invocation (source record, OVERRIDE, DISPO_ITEM), called in a scenario loop
(`FORWARD_ROUTING_REJECTION_SCENARIOS`), plus 6 more setup files and several regression tests
(TC-3927/3928/3940/3941/3942/3951) each generating their own IDs — all of it now running under 2-4
concurrent workers per the user's own confirmation. A same-millisecond, same-3-hex-suffix collision
between two workers is low-probability per pair but not negligible at this call volume run
repeatedly in CI, and a collision here wouldn't just fail one test — `deleteRecordsOfKind`'s
`DELETE ... WHERE id = $1` cleanup would delete the **other worker's** row sharing that ID.
Fix: salt `generateCustomId`/`generateDynamicTable`/`generateDynamicGroup` with the Playwright
worker index (`test.info().workerIndex`, or `process.env.TEST_PARALLEL_INDEX`) in addition to the
timestamp+random suffix — this is an existing-file change (`dynamic-name-generator.ts` is not part
of this diff), so out of this MR's own scope to fix, but this MR is the reason the exposure just grew
substantially and is worth raising to whoever owns that helper.

**[Nit] `deleteOverrideDispoRecords`'s cleanup does one sequential DB round-trip per (schema × space × recordId) combination — a real per-teardown bottleneck at 2-4 workers**
`api/security_management/helpers/override-dispo-cleanup.ts#deleteRecordsOfKind` — the triple loop
(`for schema of schemas { for space of CLEANUP_SPACES { for recordId of recordIds { await
dbClient.query(DELETE_BY_ID...) } } }`) issues one awaited query per combination, with no batching.
For a precondition like `dispo-forward-routing-setup.ts` (6 users, several OVERRIDE/DISPO_ITEM ids
tracked) that's schemas × 3 spaces × N ids sequential round-trips, run on **every** test-file
teardown, multiplied by however many UI workers are active concurrently, all against the same DB
server. Not incorrect, but a plausible contributor if CI teardown time becomes a complaint as worker
count rises.
Fix: batch each `(schema, space)` combination into one `DELETE ... WHERE id = ANY($1::text[])` call
with the full `recordIds` array, cutting N sequential round-trips down to one per schema/space pair.

⸻

## Possible Risks

**[Risk] The now-live cross-worker group-reuse path (`persistDynamicGroupId`) has no cleanup-ownership coordination between the worker that creates a group and a worker that later reuses it via the file**
`api/utils/helpers/table-group-provisioning.ts` (new, from `44e4bc81`) now calls
`persistDynamicGroupId(groupId)` on every successful group creation, which writes
`test-results/dynamic-group-id.txt` — this is a correct fix for the prior Confirmed Issue (the file
fallback used to be permanently dead) and follows an established repo convention
(`group-helper.ts`'s `HEAL_MAP_DIR` is likewise a single shared, non-worker-suffixed file by
design, per `docs/common-issues/infra-and-environment/reconciler-offline-flag-poisons-rest-of-worker-run.md`'s
"Predict" note). But it also activates, for the first time, a previously-dead branch in
`ui/base/fixtures/dynamic-group-fixture.ts:16-20`: `if (existingGroupId) { await use(existingGroupId);
return; }`. A worker that takes this branch never calls `provisionWorkerTableGroup`, so it never
owns an `authContext`/`cleanupGroupById` pair for that group — cleanup is entirely the *creating*
worker's responsibility, on its own teardown schedule. If UI ever runs with `workers > 1` (today
pinned to `1` at `playwright.config.ts:66`, so unreachable in practice), whichever worker created
the group could finish and run its `finally { cleanupGroupById(...) }` teardown while another worker
that reused the same ID via the file is still mid-run against it — a shared-group cleanup race that
didn't exist before this fix (previously every worker deterministically created and owned its own
isolated group, since the file was always empty). This sharpens, rather than replaces, the prior
pass's more general "no tested behavior beyond `workers: 1`" note — `api/system_core` already runs
with `API_TESTS_PARALLEL_WORKERS > 1` (per `architecture.md:113-127`, TB-3911's own parallelization
work), so this is a real direction the UI suite could plausibly follow.
Fix: if multi-worker UI execution is on the roadmap, either give the reused-group branch its own
teardown registration (e.g. a per-worker refcount on the shared group, only the last worker out
calls `cleanupGroupById`) or scope `dynamic-group-id.txt` per-worker instead of sharing one file, so
a worker reusing another's group can never outlive the owner's cleanup. Not blocking today since
`workers: 1` makes the reuse branch unreachable, but worth deciding before raising UI worker count.

**[Risk] `provisionedWorkerFixture`'s cleanup ordering assumes `provision()` never throws before returning `{ cleanup }`**
`ui/base/fixtures/worker-preconditions.ts:23-29` — `preconditions.cleanup()` in the `finally` block
assumes `provision(apiRequest)` either fully succeeds (returning an object with a working `cleanup`)
or throws before allocating anything. This is exactly the failure mode the Confirmed Issue above
demonstrates is real in 5 of the 6 `provision*Preconditions` implementations it wraps — the factory
itself has no way to catch it, since it only ever sees the final returned `{ cleanup }`, never
partial state.
Fix: note this contract (partial-failure cleanup is the `provision()` implementation's own
responsibility) in a comment on `provisionedWorkerFixture`'s type/signature, and fix the 5
implementations per the Confirmed Issue above.

**[Risk] `antd-virtualized-dropdown.ts`'s new API-response wait has no cited endpoint contract**
`ui/base/interactions/antd-virtualized-dropdown.ts:14` — `DROPDOWN_SEARCH_RESPONSE_URL_PATTERN =
/\/enquiries\/[^/]+\/execute(?:\?|$)/` and the new `waitForResponse` in the private search-retry path
assume every AntD dropdown's type-ahead search hits a `POST .../enquiries/{id}/execute` endpoint. No
Bruno collection file or doc section is cited for this. If a dropdown backed by a different
enquiry/lookup route is exercised through this same helper, the `waitForResponse` will simply time
out and fall through to the `.catch()` (non-fatal), silently degrading back to the old fixed-delay
behavior — functionally safe, but the added determinism this change is presumably for would quietly
not apply to that dropdown.
Fix: cite the Bruno enquiry-execute contract this regex is matching, and log (debug-level) which
dropdown/selector triggered the fallback so a silent regression here is visible in CI output.

⸻

## Nice-to-Have Improvements

**[Nit] Case-insensitive dropdown matching (`title="..." i`, regex `i` flag) is a reasonable, uncited fix**
`ui/base/interactions/antd-virtualized-dropdown.ts:41-46` — the added `i` flag on both the CSS
attribute selector and the label regex is a plausible, self-explanatory correctness improvement (AntD
option labels are case-sensitively matched by default), but per the Necessity Citations rule below,
no bug report/ticket is cited for why this was needed now.

⸻

## Necessity Citations

- **`api/utils/helpers/table-group-provisioning.ts` (new, `44e4bc81`)** — justified: directly
  resolves this review's own prior Confirmed Issue (duplicate group-provisioning logic between
  `api-fixtures.ts` and `dynamic-group-fixture.ts`). Both call sites now share one implementation,
  parameterized by which auth-context factory to use, per that finding's own `Fix:` suggestion.
- **`api/utils/helpers/group-helper.ts`'s `persistDynamicGroupId` (new, `44e4bc81`)** — justified:
  resolves this review's own prior Confirmed Issue (the `dynamic-group-id.txt` file fallback was
  dead code) and matches `architecture.md:162-164`'s documented persist-to-file contract. See the
  updated Risk entry above for a new, narrower concern this activates.
- **`ui/base/fixtures/dynamic-group-fixture.ts` (new file, worker-scoped group creation)** — the
  duplication concern from the first review pass is resolved (now calls the shared
  `provisionWorkerTableGroup` helper above); no separate citation needed for the file's continued
  existence, since it still owns the UI-specific `createUiAdminAuthContext` wiring `api-fixtures.ts`
  doesn't need.
- **`ui/base/fixtures/worker-preconditions.ts` (new generic factory)** — justified as a genuine
  simplification: it generalizes the exact `{ scope: 'worker', timeout, try/use/finally cleanup }`
  shape that `field-registry-ui-test.ts` already had inline (visible in the diff removing that inline
  block), and both `field-registry-ui-test.ts` and the six `override-dispo-ui-test.ts` precondition
  fixtures now reuse it instead of six copies of that boilerplate.
- **`ui/base/constants/ui-timeouts.ts`'s `UI_API_RESPONSE_TIMEOUT_MS`** — used once, in
  `antd-virtualized-dropdown.ts`'s new `waitForResponse` call; a reasonable, minimal, self-contained
  addition alongside the timeout constants it sits next to.
- **`ui/base/constants/projection-runtime.values.ts` (new file, `PROJECTION_RUNTIME_UI_CONSTS`)** —
  justified: consumed by four page objects the same diff adds (`dispo-item-review-page.ts`,
  `dispo-item-system-page.ts`, `override-catalogue-page.ts`, `override-dispo-page.ts`) for the
  shared projection-runtime save-button/record-not-found test IDs. No issue.
- **`ui/base/interactions/antd-virtualized-dropdown.ts`'s `openDropdownFor` → `openDropdown`
  visibility widening** — justified: called directly from `dispo-item-review-page.ts:48,85` (same
  diff), which needs the dropdown `Locator` returned to click a specific option by exact label
  rather than by fill-text. No issue.
- **`ui/base/fixtures/base-ui-test.ts`'s `allureCaseLink` auto-fixture** — plausible purpose (attach
  the Allure case ID annotation via `allure.allureId(...)`), consistent with `allure-case-link.ts`'s
  `ALLURE_ID_ANNOTATION_TYPE` already used elsewhere in the repo, but not cited to a specific Allure
  reporting gap this closes; not blocking, just unexplained in the diff itself.
- **`api/security_management/helpers/override-dispo-cleanup.ts` (new), `ensureSystemSmUserForDispoOfficer`
  addition to `override-dispo-helper.ts`, and the new `OVERRIDE_DB_SCHEMA`/`OVERRIDE_CLASS_DB_SCHEMA`/
  `DISPO_ITEM_DB_SCHEMA`/`DISPO_OFFICER_ROUTE_TO_FIELD`/`SET_AUDIT_FIELD_BY_ID` constants/query
  additions in `override-dispo.values.ts`/`db-query-keeper.ts`** — all directly consumed by the new
  `override-dispo` fixtures/helpers in this same diff (record cleanup by kind, the SYSTEM SM.USER
  precondition, and the direct `ST_OVERRIDES` audit-field write in
  `auth-blocked-by-dispo-setup.ts`). Justified.

⸻

## Orphaned Code

None found. (`ui/base/fixtures/base-ui-test.ts`'s new `AllureCaseLinkFixtures` type and its
`test.extend(...)` wrapper change what `test` re-exports, but every downstream fixture file that
further extends `test` from here — `auth-ui-test.ts`, `field-registry-ui-test.ts`,
`override-dispo-ui-test.ts` — is unaffected and nothing in this diff's own files was found broken by
it.)

⸻

## Changelog

**2026-09-21 (first correction)** — Corrected two findings after the author flagged that
`workerGroupId` usage looked undercounted. Root cause: a prior-pass grep for
`requireDynamicGroupId`/`getDynamicGroupId` ran against the locally checked-out `group-3/TB-3922`
working tree (which doesn't contain `ui/override-dispo/` at all) instead of the MR's own ref
content — a false negative from searching the wrong tree, not a re-read of the diff itself.
- Retracted: "`provisionedWorkerFixture` hard-wires a `workerGroupId` dependency that
  `override-dispo`'s own preconditions never use." Re-verified via `git grep <mr-ref>`: 5 of the 6
  override-dispo precondition files call `requireDynamicGroupId()` directly and use it to create
  tables.
- Retracted: the "`PROJECTION_RUNTIME_UI_CONSTS` has no importer in this diff" claim. Re-verified:
  it's imported and used by four page objects in this diff's own file list.

**2026-09-21 (second correction, full re-scope)** — The author then pointed out that MR 247, as
seen in GitLab, has ~39 files and no `ui/customization/*` content at all — contradicting the first
version of this report, which included ~13 `customization` findings. Investigated via GitLab's own
synthetic `refs/merge-requests/247/merge` ref (fetched and diffed against its own first parent,
which is `origin/main`'s current tip) — that is the literal diff GitLab computes for this MR, and it
confirms 39 files, none under `ui/customization/`. Direct blob-hash comparison confirmed
`ui/customization/tests/customization-smoke.spec.ts` is byte-identical between `origin/main` and
the MR branch (already merged to `main` via a separate, unrelated MR; this branch simply inherited
it). Root cause: an early diff run in this review's first pass was made against a stale local
`main` ref (before `origin/main` was fetched) that still predated `customization`'s independent
merge to `main`, and file paths from that stale 91-file list were carried forward into later
analysis steps without re-checking them against the corrected, narrower diff — the correct diff
(computed fresh both via `git diff origin/main.._mr-247-review` and cross-checked against GitLab's
merge-preview) never included `customization` files at all, once `origin/main` was current.
- Retracted entirely: the "customization tests don't use the new shared group fixture" Confirmed
  Issue — `ui/customization/*` is not part of this MR.
- Retracted: the "`openDropdownFor` → `openDropdown` widened without a caller" Nit — re-verified via
  `git grep <mr-ref>`, it IS called from `dispo-item-review-page.ts:48,85`, which is part of this
  diff. Moved to Necessity Citations as justified.
- Added: a new Confirmed Issue (sequential test-user creation leaking on partial failure) found
  during this full re-read of every non-test file in the corrected 39-file scope
  (`ui/override-dispo/fixtures/*.ts`, `ui/override-dispo/helpers/*.ts`,
  `ui/override-dispo/constants/*.ts`, `ui/override-dispo/types/override-dispo.types.ts`,
  `ui/override-dispo/override-dispo-ui-paths.ts`, and the `api/` support files).
- All previously-standing findings (duplication of `api-fixtures.ts`'s group logic, the dead file
  fallback, and the two remaining Risk/Nit entries) were re-verified against the corrected scope and
  stand unchanged.

**2026-09-22 (fix verification, full re-review)** — Author (Sergei Tsarik) pushed two fix commits
addressing the three standing Confirmed Issues: `09a0c8de` ("fix comment 3") and `44e4bc81` ("fix
comment 1, 2"). Diff scope re-confirmed via `git diff 189fbe7a mr-247-review` (also cross-checked
`git diff --stat origin/main...mr-247-review`) — 42 files now (was 39), the 3 new/changed since the
last pass being `api/utils/helpers/table-group-provisioning.ts` (new), `eslint.config.mjs` (new
custom-assertion names added to an existing lint-rule allowlist, matching new helper functions this
diff adds — no issue), and the `api-fixtures.ts`/`group-helper.ts`/`dynamic-group-fixture.ts` trio.
Both commits were read in full (not just their stat) and cross-checked against the full current
content of every file they touch, per the Step 2.0 rationale pass:
- **Confirmed Issue #1 (duplicate group-provisioning logic) — Resolved.** New shared
  `api/utils/helpers/table-group-provisioning.ts#provisionWorkerTableGroup` is now the single
  implementation; both `api-fixtures.ts:23-40` and `dynamic-group-fixture.ts:15-24` call it,
  parameterized by their own auth-context factory. No remaining duplication.
- **Confirmed Issue #2 (dead file fallback) — Resolved.** `group-helper.ts`'s new
  `persistDynamicGroupId()` writes `process.env.DYNAMIC_GROUP_ID` and
  `test-results/dynamic-group-id.txt` together, called from inside `provisionWorkerTableGroup` on
  every successful group creation — the file is no longer dead. This activates a previously-unreachable
  code path; see the updated Risk entry above for the narrower concern that surfaces as a result
  (cleanup-ownership coordination, not a regression of this fix itself).
- **Confirmed Issue #3 (sequential user-creation leak) — Resolved, verified in all 5 files.** Read
  full current content of `auth-blocked-by-dispo-setup.ts` and `override-dispo-setup.ts` end-to-end,
  and the closing `try/catch` structure of `dispo-forward-routing-setup.ts`,
  `dispo-item-review-setup.ts`, and `dispo-ticket-generation-setup.ts`. All 5 now declare `cleanup`
  before any user is created, create users inside the same `try` that's wrapped by
  `catch (error) { await cleanup(); throw error; }`, and either guard each delete with
  `if (user) { ... }` (the 2-user files) or push into a `createdUsers` array as each user is created
  (the multi-user files) so `cleanup`/`deleteProvisionedUsers` only ever targets what actually
  exists. `override-dispo-setup.ts`'s previously-partial `catch` (`validationUsers.cleanup()` only)
  now correctly calls the full `cleanup()`, which itself calls `validationUsers.cleanup()` last. No
  new leak introduced by the restructuring in any of the 5 files.
- Checked for regressions the fix commits could have introduced: `TestUser`/`KeycloakTestUser` type
  imports added for the new `| undefined` variable declarations are used, not orphaned; verified
  `createBareKeycloakUser`'s return type (`api/utils/services/test-user-service.ts:357`) and
  `deleteTestUser`'s parameter type (`api/utils/services/test-user-service.ts:189`,
  `KeycloakTestUser & { scaffolding?: ... }`) are structurally compatible with how
  `override-dispo-setup.ts` now calls them. No import, ordering, or type issue found.
- No other files in the diff changed since the 2026-09-21 pass — the remaining Risk entries (worker
  fixture cleanup-ordering contract, the uncited `waitForResponse` endpoint pattern) and the one Nit
  are carried forward unchanged, still valid against the current diff.

**Verdict for this pass: all Confirmed Issues resolved, no new Confirmed/Critical issues found. One
Risk entry updated (not new) to reflect that this round's own fix activates a previously-dead code
path with a narrower, non-blocking follow-up concern.**

**2026-09-22 (context escalation — live multi-worker confirmed, full architecture/logic/bottleneck
pass)** — Author confirmed `UI_TESTS_PARALLEL_WORKERS` is now actually run at 2-4, not the
`workers: 1` default this diff's own (unchanged) `playwright.config.ts` falls back to when the env
var is unset. This directly invalidates this same day's earlier "not blocking today since `workers:
1`" qualifier on the group-reuse Risk entry — re-classified to **Critical** and moved to Confirmed
Issues, full mechanism verified by reading `group-cleanup-helper.ts#cleanupGroupById`,
`resource-tracker.ts#trackCreatedGroup`, and `table-registry-helper.ts`'s heal-lock machinery in full
(the heal-lock/`HEAL_MAP_DIR` machinery is a real, well-built cross-process mutex, but it only
activates on a *dead*-group heal, not on planned end-of-worker cleanup, so it does not cover this
gap). Also read, in full, every file this MR's setup/test code depends on that hadn't been read yet:
`api/security_management/helpers/override-dispo-cleanup.ts` (new, this MR's own record tracker —
surfaced the shared-schema/unsalted-ID-generator Risk above), `api/utils/helpers/
dynamic-name-generator.ts`, `ui/override-dispo/tests/override-dispo-regression.spec.ts` and
`override-dispo-smoke.spec.ts` in full (all 20 tests — confirmed `fullyParallel: false` on the
`UI-Chromium` project, so within one worker tests run sequentially; no in-file duplicate scenarios or
shared-mutable-state-between-tests found beyond what's already covered by the precondition-fixture
model), `dispo-officer-provisioning.ts`, `dispo-ticket-factory.ts`, and `override-catalogue-setup.ts`
(the latter already follows the correct cleanup-before-creation shape from day one — no defect there).
Added one Nit for `deleteOverrideDispoRecords`'s unbatched per-record cleanup queries, raised by the
same worker-count context (more concurrent workers → more concurrent sequential DB round-trips at
teardown).
