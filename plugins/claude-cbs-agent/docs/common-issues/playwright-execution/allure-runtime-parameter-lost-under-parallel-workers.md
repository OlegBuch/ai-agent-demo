# Correlation-id / Allure TestOps case-link silently missing per file, not per test

**TL;DR.** A module-level `apiTest.beforeEach(...)` in a shared fixtures file only ever attaches to
the *first* spec file a given worker process loads (Playwright's `_hook()` binds to "whichever file
is currently being required," and the fixtures module is only required once per worker). Every later
file in that same worker silently gets **no hook at all** — not flaky, 100% deterministic per file.
This affected both `allure.allureId()` (Allure TestOps case linking — broken since before this
investigation, unrelated to correlation-id) and a later-added `X-Correlation-ID` reporting call in
the same hook. **Fixed** by converting the hook into an `{ auto: true }` fixture instead — fixtures
live on the shared `TestType`'s fixture pool, not on a particular file's suite, so they reach every
test regardless of load order or how many further `.extend()` layers a module adds. Two earlier fix
attempts that tried to solve a (partly wrong) *concurrency* theory were shipped and reverted the same
day — one broke test collection for the entire suite. See "Dead ends" below before trying either
again.

## Symptom

`api/utils/fixtures/api-fixtures.ts`'s `apiTest.beforeEach(...)` called `allure.parameter()` (later
`allure.allureId()` too) for every test, gated by an `{ auto: true }` fixture so it should always
run. In the Allure report, the correlation id (and, it turned out, the `ALLURE_ID` TestOps-case-link
label) was present on some tests and absent on others — including files that looked structurally
identical.

## Root cause, confirmed two ways independently (not inferred from one signal)

1. **Playwright source, `node_modules/playwright/lib/common/index.js` ~line 2311:**
   ```js
   _hook(name, location, title, fn) {
     const suite = this._currentSuite(location, `test.${name}()`);
     if (!suite) return;          // silently does nothing — no error, no warning
     suite._hooks.push({ type: name, fn, title, location });
   }
   ```
   `_currentSuite` resolves via `currentlyLoadingFileSuite()` — the file that's synchronously being
   `require()`d *right now*. A `beforeEach()` call sitting at a fixtures file's own module top level
   runs exactly once per worker process (Node's `require` cache) — at the moment that file is first
   imported, which is during the load of whichever spec file happens to import it first in that
   worker. Every subsequent spec file in the same worker gets the cached module with no re-execution
   of that top-level call, so the hook is never registered against it.

2. **Raw Allure result JSON from a real 4-worker VM run, grouped by source file and load order:**
   `currency-regression.spec.ts` (loaded first on one worker): **77/77 tests have the id.**
   `currency-smoke.spec.ts` (loaded second, same worker process): **6/6 tests are missing it** — a
   clean, deterministic, all-or-nothing split by file, not a scattered pattern. Confirmed the same
   split independently for the `ALLURE_ID` TestOps-case-link label (present on the first file's
   tests, absent on the second file's) — this part predates the correlation-id work entirely; it's
   the same `allure.allureId()` call, same hook, same bug.

Fixtures don't have this problem: a `{ auto: true }` fixture is stored on the `TestTypeImpl` object
returned by `base.extend(...)` — built once, and resolved *per test at run time* by walking that
test's own fixture graph, not tied to "which file was loading when `.extend()` was called." Every
spec file that imports this `test` (directly, or through any further `.extend()` chain) shares the
same fixture pool regardless of load order.

## Fix (shipped)

Deleted the module-level `apiTest.beforeEach(...)`. Replaced with a new, dependency-free auto
fixture in `api-fixtures.ts`:
```ts
allureTestMetadata: [
  async ({ testCorrelationId }, use, testInfo) => {
    const idAnnotation = testInfo.annotations.find((a) => a.type === ALLURE_ID_ANNOTATION_TYPE);
    if (idAnnotation?.description) await allure.allureId(idAnnotation.description);
    testInfo.annotations.push({ type: HeaderName.CorrelationId, description: testCorrelationId });
    await allure.step(HeaderName.CorrelationId, async (step) => {
      await step.parameter(HeaderName.CorrelationId, testCorrelationId);
    });
    await use();
  },
  { auto: true },
],
```
Notes on why it's shaped this way:
- `allure.step(...)` + the step's own `parameter()` (sends a `"step_metadata"` runtime message), not
  bare `allure.parameter()` (sends `"metadata"`) — confirmed separately, by reading
  `allure-playwright`'s `processHookRuntimeMessage` switch directly, that `"metadata"` has no case
  there and falls through to a queued, fire-and-forget path that can silently drop the value if
  `attachment.body` is gone by the time it runs; `"step_metadata"` is handled inline and
  synchronously in the same switch. This part of the original diagnosis was correct and is still
  the reason to use `allure.step()` here rather than a bare `allure.parameter()` call.
- Nothing else in `api-fixtures.ts` depends on `allureTestMetadata`, so it can't get pulled into a
  `beforeAll`'s own transient fixture resolution the way `testCorrelationId` (which `beforeAll`-used
  fixtures like `authenticatedApiContext` do depend on) can.
- `testInfo.annotations.push(...)` is kept for Playwright's own native HTML report, which has no
  concept of Allure parameters and only renders `testInfo.annotations` directly.

`tsc --noEmit -p .` and `eslint` both clean. Getting the correlation id into the Allure report's
*top-level* "Parameters" panel (vs. nested under a step) is still not achieved — see "Dead ends"
below for why that specific ask turned out to be much more expensive than it looks.

**To verify before trusting this fully closed (the owner runs it):** the owner runs at least 2 spec files on one worker (this exact
grouping — by file and load order — is what exposed the bug, project-level pass/fail counts alone
will not) and confirm every test has both the `X-Correlation-ID` step and an `ALLURE_ID` label, with
no duplicate/stray `X-Correlation-ID` step appearing under a `beforeAll` for the first test of a
`describe` that also uses a fixture depending on `testCorrelationId`.

## A wrong turn worth remembering: the "concurrency" theory

Before finding the real cause above, a residual ~5% miss rate (after an earlier, narrower fix) was
diagnosed as a **race between two fixtures that both depend on `testCorrelationId` starting
concurrently** for the same test, based on two fixtures sharing an identical *millisecond* `start`
timestamp in the raw JSON. That reasoning was wrong: Playwright resolves fixtures for a test strictly
one at a time (confirmed by reading `workerProcessEntry.js`'s fixture-setup loop), so the identical
timestamp was just two very fast operations (a `randomUUID()` call, sub-millisecond) landing in the
same millisecond bucket, not evidence of concurrency. The *actual* ~5% gap turned out to be the exact
same first-file-per-worker bug above — millisecond-resolution timestamps are not fine-grained enough
to distinguish "concurrent" from "fast and sequential"; don't reuse that inference pattern to declare
a race confirmed without a data source that can actually distinguish the two (e.g. grouping by file
and load order, or a sub-millisecond trace).

## Dead ends — confirmed, do not retry without solving the cited constraint first

**Wrapping the shared `test` export (`Proxy` around `apiTest`, intercepting the `apply` trap) so
metadata would run during the actual test body** was tried specifically to get the value into the
report's top-level "Parameters" panel (nested-under-a-step placement was the only other option, and
was considered a lesser but acceptable outcome). It broke **test collection for the entire suite —
zero tests ran**, because Playwright statically parses each test function's own source text and
requires a literal `{ ... }` object-destructuring first parameter
(`node_modules/playwright/lib/common/index.js` ~line 1704, `onError("First argument must use the
object destructuring pattern")`); a synthetic wrapper function's signature can never satisfy that for
an arbitrary inner test function it doesn't statically know the shape of. `tsc`/`eslint` both stay
clean on this class of break — it's a Playwright runtime contract, invisible to the type system.
Do not attempt this again (`Proxy`, `.bind()`, a dynamically-built `Function`, etc.) without
independently solving that specific constraint on a single spec file first — the failure mode is
total, not partial, so verify small before rolling out.

A `.extend()`-chaining gap was also found and fixed *within* that same wrapper attempt (re-wrapping
whatever `.extend()` returns) before the whole approach was reverted — noted here only so a future
attempt at test-body wrapping doesn't have to rediscover it: `.extend()` builds its return value from
the real, unwrapped `TestType`, so a naive wrapper is silently lost for every module that does
`test = base.extend({...})` unless `extend` itself is specifically intercepted to re-wrap its result.

## Incident timeline (compressed)

2026-09-25: user found `X-Correlation-ID` (added by TB-4081) missing from a 4-worker regression run
on more than half the tests. First fix (switch `allure.parameter()` → `allure.step()` + step
`parameter()` in the existing `beforeEach`) shipped, verified on a real run, left an unexplained
~5% residual gap concentrated in one project. Two test-body-wrapper attempts to chase both the
residual gap and a separate "not in the top-level Parameters panel" cosmetic ask were shipped and
reverted the same day (one took down the whole suite). Re-investigating the residual gap by grouping
misses by file and load order (rather than by project/worker count) found the real, unrelated root
cause above, which also explained the *original* "more than half missing" symptom and a pre-existing,
independent `ALLURE_ID` TestOps-linking bug. Final fix (the `allureTestMetadata` auto fixture) shipped
same day, pending the verification run described above.
