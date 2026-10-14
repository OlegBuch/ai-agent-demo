# A `test()` callback must destructure its fixtures — `async (fixtures) =>` kills the whole spec file

**TL;DR:** Playwright statically parses the first parameter of every `test(...)`/hook callback and
requires a literal `{ a, b }` destructuring. A named parameter (`async (fixtures) =>`) throws
`First argument must use the object destructuring pattern: fixtures` at load time, so **no test of
that file runs** (the run ends in seconds, exit 1, 0 results).

| | |
|---|---|
| Symptom | `run.log` ends in seconds; `First argument must use the object destructuring pattern: <name>` with `at <spec>:<line>` for each offending `test(` |
| Tell | `tsc --noEmit` is clean (TypeScript cannot see it); the error is only in the Playwright output of the failing project leg |
| Cause | 2026-10-08, `limit-hierarchy-smoke.spec.ts` TC-5786/5787/5788 took `fixtures` and passed it on to a shared helper |
| Fix | Destructure in the callback and pass an explicit object to the helper: `async ({ limitClient, limitCheckerClient, limitDb }) => helper({ limitClient, limitCheckerClient, limitDb }, ...)` |
| Rule | Never pass a whole-fixtures object through a `test()` parameter; keep helpers' own parameter destructured too |

Related: the same constraint is why wrapping the shared `test` export failed, see
[`allure-runtime-parameter-lost-under-parallel-workers.md`](allure-runtime-parameter-lost-under-parallel-workers.md).
