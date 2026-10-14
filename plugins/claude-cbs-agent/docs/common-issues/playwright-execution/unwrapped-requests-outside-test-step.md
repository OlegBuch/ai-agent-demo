# Unwrapped requests outside any test.step

## The pattern/symptom

In the Allure/Playwright HTML report, some HTTP requests (`POST tables/api/v1/projections/...`)
show up as bare, unlabeled lines directly under "Test body" (or right after "Before Hooks"
collapses) rather than nested inside a named step. This is purely a reporting/readability problem
— the test still passes/fails correctly — but it makes the report much harder to read: a reviewer
can't tell what a loose request was *for* without opening its request/response body, and it breaks
the story a well-named PRECONDITION/STEP/CLEANUP sequence is supposed to tell.

**Worse variant, when the bare call is the one that fails**: `override-dispo-smoke.spec.ts` TC-19
(`vm-results-smoke-m2-20260918-143907`, 2026-09-18) failed with a `404` on the actual rule-creation
call, but that call has no `test.step()` of its own — the report goes straight from the last named
`PRECONDITION` to Playwright's own auto-generated `error-context` attachments and `After Hooks`,
with nothing in between naming what request actually ran or failed. A reviewer has to open the raw
`error-context`/`stdout` attachments to find out what happened, exactly the failure mode this file
exists to prevent — except here it's the STEP THAT MATTERS, not a setup/cleanup call, that's
missing. When triaging a bare-call finding, check whether the missing step is on the test's
critical path (higher priority: it directly hides the failure reason) versus setup/cleanup
(lower priority: still worth fixing, but doesn't hide *why* something failed).

Four recurring causes, all from code that calls a helper directly in the test body (or inside an
outer step's callback) instead of inside its own nested `test.step(...)` callback:

1. **Setup/data-minting calls before the first `test.step`.** e.g.
   `const baseCurrency = await createDedicatedCurrency(client, db);` written at the top of
   `test('...', async () => { ... })`, before any `test.step` call. Every request the helper makes
   (and `createDedicatedCurrency` can make more than one, e.g. on a numeric-code collision retry)
   shows up unlabeled.
2. **Cleanup code in a bare `finally { ... }` block.** A `try { ...steps... } finally { await
   client.performRecordOperation(...) }` — the restore/cleanup call in `finally` runs after the
   last named step closes, so it shows up as a trailing unlabeled request instead of under a
   `CLEANUP: ...` step.
3. **A per-iteration `test.step(\`...\`, async () => {...})` loop wrapper** (a scenario repeated
   across a data table, e.g. `for (const { a, b } of CASES) { await test.step(\`a=${a}, b=${b}\`,
   async () => { ... }) }`). The loop body reads like a mini-test of its own, which makes it easy to
   write its setup as plain code before remembering to nest a `PRECONDITION` step inside it — the
   outer template-literal step name doesn't exempt the body from the same rule.
4. **A resource that must be created outside `try` for safe `finally`-disposal** (an auth context /
   API client whose `finally { await context.dispose() }` must not run against an unassigned
   variable if creation itself throws) — e.g.
   `const { pluginClient, pluginContext } = await createPluginManagerClient(playwright); try { ... } finally { await pluginContext.dispose(); }`.
   The safety reasoning (create before `try` so a creation failure never calls `.dispose()` on
   `undefined`) is correct, but it's easy to conflate "must be created before `try`" with "must be
   created bare, outside any `test.step`" — those are independent concerns. Fix: hoist the
   destructured variables to `let` and wrap just the creation call in its own leading
   `PRECONDITION` step, still positioned before `try`:
   ```
   let pluginClient!: Awaited<ReturnType<typeof createPluginManagerClient>>['pluginClient'];
   let pluginContext!: Awaited<ReturnType<typeof createPluginManagerClient>>['pluginContext'];
   await test.step('PRECONDITION: obtain an authenticated Plugin Manager client', async () => {
     ({ pluginClient, pluginContext } = await createPluginManagerClient(playwright));
   });
   try { ... } finally { await pluginContext.dispose(); }
   ```
5. **Bare calls inside `test.beforeAll`/`test.beforeEach`/`test.afterEach`/`test.afterAll` hooks
   themselves** — not just test-body code. A hook that does
   `const setupContext = await createAuthenticatedApiContext(...); await ensureXViaApi(...); await
   createTableAndWait(...);` with no `test.step()` wrapping shows up in the report's "Before Hooks"/
   "After Hooks" section as a flat dump of unlabeled `POST`/`GET` lines — the exact same problem as
   causes 1-4, just in a hook instead of a test body. `test.step()` works fine inside
   `beforeAll`/`beforeEach`/`afterEach`/`afterAll` (Playwright attaches it to that hook's own section
   of the report) — wrap each logical action the same way: `PRECONDITION: ...` for setup,
   `CLEANUP: ...` for teardown. A `beforeEach` doing lazy one-time initialization behind an
   `if (!tablesCreated) { ... }` guard is not exempt — wrap the guarded body too.
6. **A shared, pervasively-called low-level helper never got its own `test.step()`,** so *every*
   caller's hook/test-body inherits its bare lines regardless of how well that caller's own code is
   structured. The two highest-leverage examples in this codebase: `fetchKeycloakToken` (`api/utils/
   services/auth-service.ts`) — called by nearly every test's `authenticatedApiContext` fixture and
   any direct `createAuthenticatedApiContext(...)` call, previously surfacing two unlabeled lines
   ("Create request context" + `POST .../protocol/openid-connect/token`) in *every single test's*
   Before Hooks; and `createTestUser`/`deleteTestUser` (`api/utils/services/test-user-service.ts`)
   — called by nearly every maker/checker/dedicated-user setup across every module. Fixing the one
   shared function (wrapping its own internal phases in `test.step(...)`) fixes every call site at
   once — check whether a "bare hook" finding traces back to a shared service function before
   patching each call site individually; the shared-function fix is strictly better (fix the named function itself, not just one caller) and cannot be missed by a future per-file sweep.
   **Correction, 2026-09-18 — this caveat was wrong, don't follow the old version.** `test.step()`
   and Allure's own attachment are NOT the same kind of "no-op outside a test": Allure's
   `withAllureAttachment`/`allure-js-commons` calls really do gracefully no-op with a benign
   `NoopTestRuntime` console warning (see
   [`allure-noop-runtime-warning-outside-test-context.md`](../allure-testops/allure-noop-runtime-warning-outside-test-context.md)
   — note the corrected path, it lives in `allure-testops/`, not this folder). `test.step()` itself
   is a **hard throw** — `Error: test.step() can only be called from a test` — in exactly the same
   contexts (`global-setup.ts`/`global-teardown.ts`, and a `{ scope: 'worker' }` fixture's setup or
   teardown body, which has no per-test `TestInfo` either). This is not hypothetical: it crashed
   `global-setup.ts` (via `fetchKeycloakToken`) and crashed `workerSuperAdmin`'s teardown (via
   `deleteTestUser`, called through `deleteSuperAdminTestUser` — the fixture that actually calls it,
   not `global-setup.ts`/`global-teardown.ts` directly as an older note here claimed). Fix: a shared
   guard `isInsideTest()` (`api/utils/helpers/playwright-context-helper.ts`, `try { test.info();
   return true } catch { return false }`) — call `isInsideTest() ? test.step(label, fn) : fn()`
   instead of calling `test.step()` unconditionally in any shared helper that might run from a
   worker-scoped fixture or global-setup/teardown. This guard is a no-op change for every *normal*
   test/`beforeAll`/`afterAll` caller (those always have a `TestInfo`, so `isInsideTest()` is `true`
   there and `test.step()` still runs exactly as before) — it only changes behavior in the narrow
   set of genuinely test-less contexts, where skipping the step wrapper doesn't make a report
   "worse," because no report entry exists to write into there either way.

   **Full repo-wide sweep, same day.** Grepped every `{ scope: 'worker' }` fixture and traced
   `global-setup.ts`/`global-teardown.ts`'s call graphs for reachable `test.step()` calls. Besides
   the two above, found two more unconditional call sites in `createTestUser`
   (`test-user-service.ts`) — reachable from `workerSuperAdmin` (`api-fixtures.ts`), `apCheckerClient`
   (`api/action_processing/ap-fixtures.ts`), and `cceCheckerClient` (`api/interest_and_charges/
   charges_calculation_engine/cce-fixtures.ts`)'s setup phases, via `createTestUserSession` →
   `createTestUser`. Fixed the same way. `createTestUserWithoutPermissions`'s three `test.step()`
   calls were left unguarded — confirmed its only caller, `apUnauthorizedClient`, is a plain
   test-scoped fixture (no `{ scope: 'worker' }` tuple), so it always has a real `TestInfo`. After
   this pass, every `{ scope: 'worker' }` fixture's setup/teardown and both global hooks are clean.

## The rule

**Every network or DB call made directly inside a test body — including in a `finally` cleanup
block — must be wrapped in its own `test.step(...)`, not called bare.** Concretely:

- If a value (a minted currency, a company snapshot) is needed before the test's first logical
  step, still wrap the minting itself in a small leading step, e.g.
  `await test.step('PRECONDITION: mint dedicated base/quote/... currencies', async () => { baseCurrency = await createDedicatedCurrency(client, db); ... })`,
  declaring the variables as `let x: Awaited<ReturnType<typeof createDedicatedCurrency>>;` above it
  (not `const`, since assignment now happens inside the step callback).
- Wrap `finally` block bodies in `await test.step('CLEANUP: ...', async () => { ... })` — this
  applies whether the block deletes staged `CURRENCY.RATES` rows, restores a shared/global record
  (e.g. `COMPANY~MASTER`) to its original data, or both.
- This is a Playwright-wide/Allure-wide convention, not specific to any one CBS module — apply it
  to every new test in every spec file, not just Currency.

## The incident(s)

**2026-08-26, `TB-2960` / `US-01.13.03` (Currency Definition and Logic).** User ran two new tests
live (`TC-24`, `TC-30`) and flagged that requests were appearing outside any step in the Allure
report. A follow-up sweep of the whole `US-01.13.03` block in `currency-regression.spec.ts` found
**12 occurrences across 8 tests — TC-11, TC-12, TC-24, TC-27, TC-28, TC-29, TC-30, TC-31** — three
of which (`TC-11`, `TC-12`, `TC-29`) predated this session (written 2026-08-24/25), meaning the
pattern had been silently accumulating for two days before anyone noticed it in a report. The
`US-01.13.01` and `US-01.13.02` blocks, and `currency-smoke.spec.ts`, were already clean — their
tests happen to declare `let x; await test.step('PRECONDITION: ...', async () => { x = await
createDedicatedCurrency(...); ... })` from the start, which is exactly the pattern above. Fixed all
12 by adding a leading `PRECONDITION: mint dedicated ... currencies` step and wrapping every
`finally` cleanup body in a `CLEANUP: ...` step — no assertions or business logic changed, verified
via `tsc`/`eslint`/`prettier` only. See
`docs/test-cases/TB-1989/analysis.md`'s 2026-08-26 changelog entry for the full list of locations.

**2026-08-27, repo-wide sweep (all `proj-test-automation` spec files, prompted by `currency-regression.spec.ts`'s `allureCaseId(3153)` reading as "precondition → step → unlabeled → precondition → step" in a live report).** User flagged 3153 by eye; a full audit of all ~30 spec files carrying the `PRECONDITION`/`STEP` convention found the causes above recurring in genuinely new code shapes the 2026-08-26 sweep didn't cover — cause 3 (per-iteration loop wrapper) and cause 4 (resource needing pre-`try` disposal) were identified from this sweep, not before it. Confirmed and fixed:
- `currency-regression.spec.ts`: `allureCaseId(3153)`, `allureCaseId(3154)` — cause 3, inside the `TRIANGULATION_FORMULA_CASES` loop wrapper.
- `table-registry-regression.spec.ts:601` (TC-048) — a bare `waitForRecord(...)` sitting between two named steps; moved inside the preceding `PRECONDITION`.
- `projection-forms-smoke.spec.ts` (TC-251, TC-271, TC-293, TC-295) — cause 4, `createPluginManagerClient(playwright)`.
- `override-dispo-smoke.spec.ts` — the single worst file, 14 occurrences across TC-24, TC-25, TC-00, TC-31, TC-34 (×3, including one genuine Variant-B interleave fixed by relabeling a verification `STEP` as `PRECONDITION`), TC-39 (a Variant-B interleave fixed by scoping each of the test's two independent scenarios into its own outer step), TC-45, TC-48–TC-53 — all `OverrideDispoHelper.ensure*`/`configure*`/`assertSeeded*`/`provision*` calls that ran bare ahead of a `PRECONDITION` or between two step-labeled blocks.
- `pf-sc-sms.spec.ts` (TC-SMS-002 cause 1; TC-SMS-007 — setup mislabeled `STEP`/`AUTH STEP` instead of `PRECONDITION`, relabeled and steps renumbered).
- `cce-smoke.spec.ts` (TC-47, TC-72) — the actual test action ran bare directly after a `PRECONDITIONS` step instead of inside its own `STEP 1`.
- `product_factory`'s 8 spec files, and the rest of `system_core`'s spec files, audited clean (a few step-*naming* inconsistencies noted but not fixed, e.g. an unlabeled setup step or a `STEP 1` used for what's really a precondition — cosmetic, not a structural ordering violation, left for a future pass).
No assertions or business logic changed in any of the above; verified via `tsc --noEmit`, `eslint`, and `prettier --check` only, consistent with the 2026-08-26 fix's own verification approach.

**2026-09-18, rate-limit interruption + heuristic blind-spot lesson.** A batch of 5 parallel agents
covering `action_processing`/`consolidation_engine`/`customer`/`document_management` all failed
mid-task on an org spend-limit 429. One agent had also made an unauthorized, unrelated fix while it
had the file open (`consolidation-engine-regression.spec.ts`: replaced `process.env.CBS_ENV_NAME`
with `getCurrentEnvName()` in ~10 places — a real, already-documented bug per
[`kafka-topic-env-prefix-uses-env-target.md`](../infra-and-environment/kafka-topic-env-prefix-uses-env-target.md),
but explicitly out of scope for a "structure only" task) — reverted back to `process.env.CBS_ENV_NAME`
before resuming. **A hand-rolled "does this test have test.step()" scan is not reliable either**: it
found `consolidation-engine-smoke.spec.ts` had only 1 fully-bare test, but manual inspection found a
2nd (`TC-3`) with one precondition step followed by ~50 lines of bare assertions — the scan only
checks for *any* `test.step()` presence, not *complete* coverage, so a partially-stepped test is a
false negative. Fixed both by hand, then re-dispatched 6 fresh resume agents for the remaining files
with this exact caveat spelled out ("has at least one step ≠ done, read every test yourself") and a
second explicit "do not fix unrelated bugs, even obviously-correct ones" constraint.
`consolidation-engine-regression.spec.ts` done and independently verified (22/22 expect count,
`CBS_ENV_NAME` confirmed untouched): the resume agent found 2 more heuristic-missed partial tests
(TC-12/13) plus 2 fully-missed bare tests outside the original scan (TC-57/58), and — good instinct
— wrapped 3 shared assertion helpers used by ~33 forEach-generated test instances internally rather
than duplicating step boilerplate at every call site (same pattern as cause 6 above). The
heuristic's own remaining "still bare" hits on this file are themselves false positives: the test
body only calls a shared helper, so the actual `test.step()` text lives in that helper's separate
function definition, invisible to a same-scope text scan — confirmed by reading one call site
directly. `image-capture-regression.spec.ts` done and independently verified (all 40 tests,
73/73 expect count, 0 bare remaining). `account-maintenance-regression.spec.ts` fully done and
independently verified (all 63 tests, 226/226 expect count) — this resume agent wrote a proper
TypeScript-AST-based bare-expect checker (walks every `test()` body, tracks step-callback nesting,
flags any `expect(` outside all steps) instead of a line-text heuristic, confirming zero bare
`expect()` calls anywhere in the file, front-to-back — a stronger verification method worth reusing
for the remaining files in this batch.

**2026-09-18, framework-wide sweep (all 16 `api/` module folders, prompted by the same
`allure-review-report` session as [`expect-poll-step-explosion.md`](expect-poll-step-explosion.md)'s
incident).** Confirmed this pattern is NOT self-limiting — a per-module `grep`-based sweep genuinely
misses instances hiding in subdirectories with unusual paths (`account/balance_management/tests/`,
`document_management/tests/` using a shared `dmTestSupport.cleanupDb()` wrapper, `customer/tests/`)
or in a nested nested `test.describe` block deep in a large file (`soft-accounting-regression.spec.ts`
line 1574, `access-administration-regression.spec.ts` line 1709). Three verification passes were
needed before a truly clean sweep: pass 1 (this file's causes 1-4) covered the original ~30-file set;
pass 2 (causes 5-6, hooks + shared helpers) covered 45 files across all 16 modules but a first-pass
Haiku Gather split by module missed 11 hooks in files its own prompt's directory list happened to
exclude (`table-registry-*.spec.ts`, `dynamic-data-dictionary-smoke.spec.ts`,
`lng-trn-regression.spec.ts`, `customization-integration.spec.ts`, `sys-params.spec.ts`,
`system-param-regression.spec.ts`); a follow-up independent Haiku audit of pass 2's own fixes then
caught 1 of those 11 as still incompletely fixed (`customization-integration.spec.ts`'s `afterAll`
had a second bare block the first patch didn't reach) plus 14 more never-scanned hooks across
`soft_accounting`, `account/balance_management`, `customer`, `document_management`, `transfer`, and
`fin_accounting`. **Lesson: a module-by-module directory-list Gather split is not exhaustive by
construction — always follow it with an independent full-tree `grep`-based verification pass (not
just a spot-check of the files the Gather claimed to cover) before considering a framework-wide sweep
done.** No assertions or business logic changed; verified via `tsc --noEmit` and `eslint .` (both
clean, repo-wide) after every batch.

## New, broader variant: whole test bodies with zero step structure at all (2026-09-18, `group-3/TB-3922`)

Distinct from every cause above (which are about isolated bare calls inside an otherwise-stepped
test/hook): a full repo scope (110 spec files) found entire test bodies with **zero** `test.step()`
calls anywhere in them — not a missed precondition/cleanup wrapper, but no PRECONDITION/STEP N/
CLEANUP structure at all, e.g. `account/balance_management/tests/balance-management-smoke.spec.ts`
(user-reported: `The sum of all journal entry movements for a balance type equals its current
BALANCE_AMOUNT` rendered in Allure as one flat wall of requests with no labels). 17 files were
confirmed fully bare (0 steps for N tests) and 62 more only partially/inconsistently follow the
`testing-standards.md` convention.

**Same Haiku-classification-unreliability lesson as the third verification round below, hit again
immediately:** the scoping agent's own "GOOD" label (steps present, consistent convention) was
checked against the same `balance-management-smoke.spec.ts` file (labeled GOOD: 4 tests, 1 step) —
that 1 step turned out to sit in `afterAll`'s `CLEANUP:`, not in any test body, i.e. it was actually
NONE for test-body structure. Recomputing `steps/tests` ratio by hand across all 31 files the agent
called GOOD found ~20-22 of them exhibit the identical pattern (a handful of hook-only steps
inflating the count) — only ~9 are genuinely well-structured. **Predict: never trust a Gather
agent's own qualitative label (GOOD/PARTIAL/BAD, PASS/FAIL) for this class of survey — always pull
the raw counts back to the main thread and recompute the classification criterion yourself before
acting on it**, exactly the lesson the third verification round below already recorded for a
different survey on the same date; this is the second time in one day a first-pass qualitative
label needed to be discarded in favor of the raw numbers.

**Status**: pilot module `account/balance_management` done (`balance-management-smoke.spec.ts`,
4 tests, done directly; `balance-management-regression.spec.ts`, 19 tests, delegated). User reviewed
the pilot and approved continuing at scale, scoped strictly to files/tests that are actually bare
(don't touch already-good tests). In progress (2026-09-18, same session): 8 parallel same-tier
agents dispatched, one file each, against the confirmed-NONE list —
done and independently verified (single-file scope + matching plus/minus `expect(` count):
`payment-order-smoke.spec.ts` (7 tests, 24/24), `ddi-smoke.spec.ts` (11 tests, 68/68),
`payment-order-regression.spec.ts` (21 tests, 73/73), `system-tables-static-dictionaries.spec.ts`
(5 tests, 9/9) + `system-tables-static-dictionaries-smoke.spec.ts` (2 tests, 14/14),
`validation-engine-regression.spec.ts` (15 tests, 21/21), `system-tables-regress.spec.ts`
(9 tests, 14/14), `balance-management-regression.spec.ts` (19 tests, 49/49 — pilot module
`account/balance_management` now fully done, smoke+regression). Still running:
`account-maintenance-regression.spec.ts` (63 tests) — the last file on the confirmed-NONE list.
**2026-09-18, same session, user independently spotted (by eye) 4 more modules with the same
problem — `action_processing`, `consolidation_engine`, `customer`, `document_management` — which
matches this file's own earlier-recorded classification-unreliability correction exactly:
`ap-regression.spec.ts` (55 tests/1 step), `customer-party-data-regression.spec.ts` (65/2),
`customer-party-data-smoke.spec.ts` (14/2), `document-management-regression.spec.ts` (32/1),
`document-management-smoke.spec.ts` (13/1), `image-capture-regression.spec.ts` (40/1),
`image-capture-smoke.spec.ts` (5/1) were all in the scoping agent's mislabeled "GOOD" bucket:
genuinely bare, now being fixed. `ap-smoke.spec.ts` (12/7), `consolidation-engine-regression.spec.ts`
(52/191), `consolidation-engine-smoke.spec.ts` (14/85), `customer-party-integration.spec.ts` (6/28)
already have real step density — being re-verified test-by-test rather than assumed either way,
touching only whichever specific tests turn out bare.** Each agent instructed and self-verified: `tsc --noEmit`/
`eslint`/`prettier` clean, single-file `git diff --stat` scope, and a plus/minus `expect(` count
match (no assertions added/removed). Skipped deliberately: trivial `health-check.spec.ts` files
(several call a shared `expectApiHealth` factory with no `test()` of their own in the file — any fix
belongs in that one helper, not per file; others are 1-2-assertion pings where the reporting problem
this file exists for doesn't manifest). Remaining after this batch: ~90 files (62 PARTIAL + the
~20-22 misclassified-GOOD files), not yet started.

A third verification round (same session) asked a fresh Haiku agent to re-scan every `beforeAll`/
`afterAll` in all 16 modules from scratch and report every bare hook it found: 109 "violations."
**Its own criterion was wrong** — it flagged every hook containing `dbClient.connect()`/`.end()`
regardless of whether that was the hook's *entire* body (the explicitly-exempt trivial case) or one
call sitting alongside other, genuinely bare, real work. Trusting that count at face value would have
meant either re-doing ~65 already-correct hooks for nothing, or dismissing the whole report as noise
and missing what was actually in it. Neither is right: **the fix was to have a second Haiku agent
dump the full verbatim body of all 109 flagged hooks (pure mechanical extraction, no judgment), then
read every single one and categorize it by hand** — 22 turned out to be genuine misses (a beforeAll
or afterAll this session had simply never opened, in files like `pf-sc-sms.spec.ts`,
`idempotency-regression.spec.ts`, `lng-trn-smoke.spec.ts`, `user-profile-api-regression.spec.ts`,
`projection-forms-smoke.spec.ts`, `card-management-smoke.spec.ts` — mostly `system_core/tests/`
files a directory-based split never visited at all), the other ~65+ were confirmed-correct
already-trivial or already-fixed hooks. **Lesson: a Haiku verification agent's pass/fail *label* on
each finding is not trustworthy without independently re-deriving it from the raw content** — its
raw extraction (mechanical, no judgment) is reliable and worth paying for; its own classification of
what that extraction means is not, and applying the rule's actual exemption criterion is Judge-stage
work that has to happen on the main model, not be delegated a second time. tsc/eslint stayed clean
(repo-wide) after this round too.

**Closeout, 2026-09-21 (branch `group-3/TB-3922`, commit `0880ea13` "Refactor Tests with Allure
Strcture", reviewed cold by a separate session before MR creation).** This "Status" section was
never updated after the sweep above actually finished — the committed diff (88 files) is far more
complete than "Remaining after this batch: ~90 files, not yet started" implied. Cross-checking every
`*.spec.ts` in the repo against the commit's changed-file list found the sweep is complete except
for two confirmed gaps, both siblings of a file that *did* get fixed in this same commit:
- `api/system_core/tests/validation-engine-smoke.spec.ts` — untouched; 6 of 7 tests have zero
  `test.step()` at all, while its `validation-engine-regression.spec.ts` sibling was fully
  restructured in this commit.
- `api/system_core/tests/ddd-regression.spec.ts` — untouched; 6 of 65 tests (TC-155, TC-157, TC-158,
  TC-160, TC-161, TC-162 — the "validation error" cluster) have zero steps; the rest of the file is
  already well-structured.

All other untouched files in the repo were checked by steps/tests density and are legitimately
already-good or deliberately-exempt health-check files — not further gaps.

A separate, independent line-by-line review of the same commit (code-review skill, high effort)
found two real defects introduced by the mechanical step-wrapping itself (not coverage gaps):
- `api/action_processing/tests/ap-smoke.spec.ts` TC-13 (`allureCaseId(1946)`) — two consecutive
  `test.step` calls both titled `"STEP 1: ..."` (submit, then verify); should be STEP 1/STEP 2.
- `api/document_management/tests/image-capture-regression.spec.ts` TC-09 (`allureCaseId(1091)`) —
  same duplicate-numbering pattern (two steps both labeled `"STEP 1"`), at least twice in this file.

No assertion was lost in either case (this is a pure step-numbering slip from the mechanical pass,
confirmed by reading both test bodies), but it reproduces exactly the "looks like a missing step"
confusion this whole effort exists to eliminate — worth a final grep sweep for
`test.step\(\s*['"\`]STEP 1` occurring twice inside the same test before the next similar effort is
declared done.

That same review also found this commit is **not purely mechanical**, though both riders are
legitimate, already-independently-confirmed fixes rather than defects:
1. `consolidation-engine-regression.spec.ts`/`-smoke.spec.ts` swap `process.env.CBS_ENV_NAME`
   (always `undefined` — never set anywhere in this repo) for `getCurrentEnvName()` at ~15 call
   sites — this is the fix already recorded in
   [`kafka-topic-env-prefix-uses-env-target.md`](../infra-and-environment/kafka-topic-env-prefix-uses-env-target.md),
   correctly applied here.
2. `pf-core-regression.spec.ts`/`-smoke.spec.ts` and both
   `product-attribute-classes-core-engine-*.spec.ts` files change `afterAll`'s cleanup to build a
   fresh `createAuthenticatedApiContext` instead of reusing the suite's `client` — confirmed real:
   `client` was reassigned from the test-scoped `authenticatedApiContext` fixture in `beforeEach`,
   which Playwright disposes after the last test, before `afterAll` runs; the old code was calling
   cleanup through an already-disposed context. Genuine latent-bug fix, not a new defect — but
   undisclosed scope creep inside a commit titled as pure Allure restructuring, worth calling out
   explicitly in the MR description so a reviewer doesn't wave it through as "just formatting."

Lower-priority, non-blocking maintainability notes from the same review: the
`isInsideTest() ? test.step(...) : fn()` ternary this effort introduced is hand-repeated at 5+ call
sites in `auth-service.ts`/`test-user-service.ts` instead of being factored into one
`stepIfInsideTest()` helper in `playwright-context-helper.ts` — the direct cause of
`createTestUserWithoutPermissions`'s three unguarded `test.step()` calls (confirmed harmless today,
see above, but structurally one accidental new call site away from repeating the exact incident this
file documents). `idempotency-regression.spec.ts`'s `beforeAll` runs two `test.step`-wrapped setup
closures concurrently via `Promise.all([...])`, producing overlapping/interleaved step timing in the
report — cosmetic, not a correctness bug.
