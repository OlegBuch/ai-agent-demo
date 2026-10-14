# `testProject.workers` is a per-project ceiling inside the global pool, not a separate reservation

Applies to: `playwright.config.ts`'s root `workers` and the `workers` field on the `API-tests`/
`API-tests-singleton` projects. Found on `group-3/TB-3911`, 2026-09-17.

**Current state (verified 2026-10-07 on branch `group-3/TB-4295`; the single definition is
`docs/frame-specs/parallelization-readiness.md`):** root `workers` is
`API_TESTS_PARALLEL_WORKERS + UI_TESTS_PARALLEL_WORKERS` (both default 1), `API-tests-singleton` has
`Math.min(API_TESTS_PARALLEL_WORKERS, API_TESTS_SINGLETON_WORKERS)`, and `run-suite.sh` always runs the
singleton project as a second, separate `npx playwright test` invocation after the main one
(`--pass-with-no-tests` on both legs, blob reports merged at the end). The "Fix" section directly
below is the intermediate 2026-09-17 state and is superseded by the 2026-09-25 sections.

## The rule

Per Playwright's own type docs (`playwright/types/test.d.ts`, `testProject.workers`): "the global
`testConfig.workers` limit applies to the total number of worker processes. However, Playwright
will limit the number of workers used for **this project** by the value of `testProject.workers`."
A project-level `workers` is a **cap**, not a reservation — it never guarantees that many workers
are available to that project, and it never stops a *different* project from running concurrently
alongside it as long as the **root-level** `workers` pool has room.

**Consequence**: if the root `workers` is computed as a sum across projects (e.g.
`workers: A_WORKERS + B_WORKERS`), passing "1" to one of those inputs does not make the whole run
use 1 worker — it only lowers that one project's own cap. The other project's cap plus this one's
still add up to a pool ≥2, and Playwright is free to run both projects' worker processes at the same
time, one each. The root/global `workers` is the only number that bounds *total* concurrency across
all projects combined.

## The incident (2026-09-17)

`playwright.config.ts` had:

```ts
workers: API_TESTS_PARALLEL_WORKERS + API_TESTS_SINGLETON_WORKERS, // root
// ...
{ name: 'API-tests', workers: API_TESTS_PARALLEL_WORKERS, ... },
{ name: 'API-tests-singleton', workers: API_TESTS_SINGLETON_WORKERS, ... }, // always 1, hardcoded constant
```

User set `API_TESTS_PARALLEL_WORKERS=1` via `.env`, expecting a fully sequential run (matches
`run-on-vm.sh`'s own progress line printing `workers: API-tests=1, API-tests-singleton=1`, which is
technically accurate per-project but easy to misread as "1 worker total"). The actual root pool was
`1 + 1 = 2`, so Playwright printed `Running 443 tests using 2 workers` and ran `API-tests` and
`API-tests-singleton` test files concurrently in two separate worker processes for the whole run —
directly visible in the run log as interleaved `[API-tests]`/`[API-tests-singleton]` lines with
out-of-order test-index numbering.

This wasn't just cosmetic: it caused two worker *processes* to independently authenticate as the
same run-scoped super-admin Keycloak user around the same moments, reproducing the known
concurrent-load transient-401 pattern from
[`keycloak-and-auth/keycloak-transient-login-401.md`](../keycloak-and-auth/keycloak-transient-login-401.md)
(that doc's 2026-09-02 entry: "3 concurrent suites reproduces the failure chain, 1 suite doesn't") —
except here it happened even though the user believed they'd configured a single-worker,
fully-sequential run.

## Fix (2026-09-17, superseded by the 2026-09-25 regression section below)

Made the root `workers` the single knob, matching what the user actually passes:

```ts
workers: API_TESTS_PARALLEL_WORKERS, // root — the only number that bounds total concurrency
// ...
{ name: 'API-tests', workers: API_TESTS_PARALLEL_WORKERS, ... }, // unchanged, already correct
{ name: 'API-tests-singleton', workers: Math.min(API_TESTS_PARALLEL_WORKERS, API_TESTS_SINGLETON_WORKERS), ... },
```

- `N=1` → root pool is 1 → true full serialization across both projects, no possible concurrent
  super-admin logins.
- `N≥2` → root pool is `N`; the singleton project's own cap still never exceeds `min(N, 1) = 1`
  (its whole reason for existing — shared/singleton records can't be mutated by two workers at
  once), but the API-tests project can use up to `N` of the pool. Total concurrency across both
  projects combined never exceeds `N`, whereas before it was always `N + 1`.

This does not eliminate the underlying transient-401-under-load risk at `N≥2` (multiple real workers
concurrently authenticating as the same super-admin is still possible by design once you ask for
more than 1 worker) — that risk is what
[`keycloak-and-auth/keycloak-transient-login-401.md`](../keycloak-and-auth/keycloak-transient-login-401.md)'s
2026-09-17 entry (found while investigating this incident) separately addresses by restoring the
uniform retry-with-backoff a later merge had silently undone.

**Predict**: any config that computes a root `workers` as a sum/derivation of multiple
project-level `workers` values is the same trap — check whether the intent is "N total across
everything" (root should equal that N directly) or "N reserved per project regardless of the
others" (Playwright's per-project cap cannot actually guarantee that; there is no reservation
primitive, only a shared pool and per-project ceilings).

**Regression, 2026-09-25.** The prediction above came true: `UI_TESTS_PARALLEL_WORKERS` was added as
a third term to the same sum (`API_TESTS_PARALLEL_WORKERS + API_TESTS_SINGLETON_WORKERS +
UI_TESTS_PARALLEL_WORKERS`), reintroducing the exact trap this file already documented — confirmed
directly in a real run's raw Allure result timestamps: `API-tests-singleton`'s own worker ran the
entire time alongside `API-tests`'s 3 workers, never waiting for them, contradicting what the
`API-tests-singleton` name implies about isolation.

**Realization that a per-project worker cap ≠ execution order — this needed a different fix, not
just a smaller sum.** Capping `API-tests-singleton` at `workers: 1` only ever guaranteed it
wouldn't race *against itself*; it was always still racing in wall-clock time against every other
concurrently-scheduled project. The user wanted an actual, conditional ordering guarantee: whenever
singleton runs alongside anything else in a given invocation, it runs strictly last, alone — but
only the projects actually selected for *that* invocation, not an unconditional "always run X
first" (which is what Playwright's own `dependencies` field does — see
`node_modules/playwright/types/test.d.ts` lines 139-141: "projects that need to run before any test
in this project runs," pulled in unconditionally regardless of `--project` filtering, ignorable only
via `--no-deps`). Since `dependencies` can't express "only if also selected this run," this is not
solvable inside `playwright.config.ts` alone.

**Fix, in two parts (`playwright.config.ts` + `scripts/test-scripts/shell-scripts/run-suite.sh`, both uncommitted).**
1. Dropped `API_TESTS_SINGLETON_WORKERS` back out of the root `workers` sum (now
   `API_TESTS_PARALLEL_WORKERS + UI_TESTS_PARALLEL_WORKERS` — singleton no longer shares a pool with
   anything, per part 2 below, so it doesn't need to be in this sum at all).
2. `run-suite.sh` now issues **two sequential `npx playwright test` invocations** instead of one,
   whenever `API-tests-singleton` is part of what a suite name selects: first, all the
   non-singleton projects the suite actually chose (unchanged relative concurrency between them);
   then, only after that finishes, a second invocation with just `--project=API-tests-singleton`.
   The first version fell back to one combined invocation when a positional spec-file arg was passed; that fallback is gone — both legs now always run with `--pass-with-no-tests`, so a leg that matches no file is not a failure. `tsc`/`eslint`/`bash -n` all clean.

**Confirmed, 2026-09-25: the native HTML reporter did NOT accumulate across the two invocations -
`playwright-report/` silently ended up with only the singleton leg's results, the main leg's 42
tests gone entirely.** `allure-results/` was fine, as predicted (individually-named per-test JSON
files, purely additive, no clearing between invocations) - only `playwright-report/` was the
problem, confirmed on a real run: main leg logged `42 passed (5.8m)`, singleton leg logged `1 failed
80 passed (31.8m)`, but the fetched `playwright-report/index.html` only showed the 81 singleton
tests. The native `html` reporter, unlike `allure-playwright`, fully regenerates/overwrites its
output directory on every separate `npx playwright test` process - the second invocation's `html`
reporter has no idea a first invocation happened at all, so its overwrite is total, not additive.

**Fix (2026-09-25, `playwright.config.ts` + `scripts/test-scripts/shell-scripts/run-suite.sh`, both uncommitted).** Added
Playwright's own purpose-built mechanism for exactly this - the `blob` reporter plus
`playwright merge-reports`:
1. `playwright.config.ts` reporter list gained `['blob', { outputDir: blobReportDir, fileName:
   blobReportFile }]` (`BLOB_REPORT_DIR`/`BLOB_REPORT_FILE` env vars, both optional - default dir
   `blob-report`, no default filename). `blob` writes one self-contained zip per invocation instead
   of overwriting shared state.
2. `run-suite.sh` sets `BLOB_REPORT_FILE=main.zip` for the first invocation and
   `BLOB_REPORT_FILE=singleton.zip` for the second, so their blobs land as two distinct files
   instead of colliding on `blob`'s own default name. After the singleton leg finishes, it runs
   `npx playwright merge-reports --reporter=html blob-report` (best-effort - a merge failure warns
   but doesn't fail the run or mask `MAIN_EXIT`/`SINGLETON_EXIT`), which overwrites
   `playwright-report/` with the actual combined result of both legs' zips - this is what fetch
   scripts already expected to find there.
3. `scripts/test-scripts/shell-scripts/run-on-vm.sh`'s launcher now also `rm -rf`s `blob-report` alongside
   `allure-results`/`playwright-report` at the start of every run (stale zips from an earlier run
   would otherwise get merged into the new one), and both `sync_sources()` exclude lists
   (`find ... ! -name`, `tar --exclude`) gained `blob-report` too.

The plain `html` reporter entry is kept in the config as-is (still correct for the common
single-invocation case - a local `npx playwright test somefile.spec.ts`, or any suite that never
triggers the singleton leg) - the merge step only runs when `run-suite.sh` actually splits into two
invocations, and its output simply overwrites whatever the lone `html` reporter run already wrote.

## Not a bug: the printed "workers: API-tests=N" label doesn't account for `testIgnore` filtering per invocation (2026-09-25)

Confirmed while verifying the two-invocation split above, on the very first real run — looked like a
regression at first (`API_TESTS_PARALLEL_WORKERS=3` in `.env`, but the main leg logged
`Running 42 tests using 2 workers`), but is fully explained by the specific file list passed on the
CLI, not by anything in the new run-suite.sh/config split:

```
./scripts/test-scripts/shell-scripts/run-on-vm.sh api api/system_core/tests/currency-regression.spec.ts \
  api/system_core/tests/currency-smoke.spec.ts \
  api/system_core/tests/idempotency-regression.spec.ts \
  api/system_core/tests/idempotency-smoke.spec.ts
```

Two of those four files — `currency-regression.spec.ts` and `currency-smoke.spec.ts` — are already
listed in `SINGLETON_RECORD_SPECS`, so the `API-tests` project's `testIgnore: [...SINGLETON_RECORD_SPECS]`
drops them entirely from the main leg; they only match `API-tests-singleton`. That leaves just
`idempotency-regression.spec.ts` (38 tests) + `idempotency-smoke.spec.ts` (4 tests) = **42 tests**
for the main leg — the exact number in the log.

`API-tests` has `fullyParallel: false`, so a spec **file** is the unit Playwright hands to a worker —
tests inside one file always run serially in one worker, but separate files can run in separate
workers concurrently, *up to however many independent files actually matched*. With only 2 files
routed to the main leg for this particular invocation, Playwright used `min(configured cap 3,
2 available files) = 2` workers — correctly, not as a regression. The 3rd worker isn't being starved
by anything; there was simply no 3rd file left to give it once `testIgnore` did its job.

**The pre-run `workers: API-tests=N` line `run-suite.sh` prints is only the configured ceiling read
from `.env`** — it is computed independently of which files will actually land in that project for
this invocation, so it can overstate the worker count that will actually be observed whenever the
positional file args mix singleton and non-singleton specs. This is not something to "fix" (the cap
is still correct, and reporting the true post-filter count would need running Playwright's own list
logic twice); just don't read that line as a promise of N running workers when passing an explicit,
mixed file list.

**Predict**: any time someone passes an explicit mix of singleton and non-singleton spec files (or
files whose count is smaller than the configured worker cap) to `api`/a milestone suite and reports
"fewer workers than I configured," check the actual file→project routing via `SINGLETON_RECORD_SPECS`
and the matched-file count before assuming a scheduling bug — `fullyParallel: false` worker
utilization is bounded by `min(configured cap, matched files)`, not just the configured cap.
