# `mode: 'serial'` skips every remaining test after one failure — redundant on a `workers: 1` project

**Symptom:** A `test.describe.configure({ mode: 'serial' })` block has one test fail; every other
test declared after it in that same (possibly nested) `describe` reports `skipped` in the
Allure/HTML report instead of running — even when those tests share no state with the failed one.

**Rule:** `mode: 'serial'` buys two Playwright guarantees: (1) tests in the group always run in
declaration order, always on the same worker, and (2) any failure in the group skips every
remaining test in it. Guarantee (1) is already true for free on any project pinned to
`workers: 1` + `fullyParallel: false` (this repo's `UI-Chromium` project — see
`playwright.config.ts`): with a single worker and no re-sharding, there is no other order Playwright
could run those tests in, `mode: 'serial'` or not. So on such a project, `mode: 'serial'` adds
nothing but guarantee (2)'s downside — it converts one test's failure into a full skip-cascade for
every later test in the group, even when each test provisions its own independent fixtures (its own
test user, its own data) and has zero ordering dependency on the others. Before adding or keeping
`mode: 'serial'` on a `describe`, check whether the project it runs under is already
`workers: 1`/`fullyParallel: false` — if so, the only effect left is the skip-cascade, and it needs
a real state-sharing justification (a `beforeAll`-provisioned fixture reused across tests, a
genuinely ordered scenario) to be worth that cost. "Avoid contention when tests run in parallel" is
not such a justification on a `workers: 1` project, because nothing there ever runs in parallel
regardless of `mode`.

**Incident (2026-09-09):** `ui/auth/tests/company-selection.spec.ts` set
`test.describe.configure({ mode: 'serial' })` on its whole top-level `describe`, commented as
"Execute serially because user provisioning against the shared QA environment can time out when
tests run in parallel" — but `UI-Chromium` is already `workers: 1`/`fullyParallel: false`, so that
parallelism was never possible for these tests in the first place. Each test provisions and tears
down its own `dashboardUser` independently via a `test`-scoped fixture — no shared state at all. TC-210
failed on an unrelated assertion bug (see
[`antd-dropdown-option-label-can-carry-a-parenthetical-suffix.md`](../test-data-and-assertions/antd-dropdown-option-label-can-carry-a-parenthetical-suffix.md)),
and the run's own Allure results confirmed TC-214, TC-211a and TC-211b all reported `skipped`, not
`passed`/`failed` — three independent, otherwise-healthy test cases produced zero signal for that CI
run. The same `mode: 'serial'` pattern, with the same kind of unfounded justification, also appeared
in `ui/auth/tests/login-invalid-credentials.spec.ts` ("avoid login contention on the shared QA
Keycloak") and `ui/auth/tests/first-login-invalid-credentials.spec.ts` — neither had a real
ordering/shared-state dependency either.

**Resolution (2026-09-09):** removed `mode: 'serial'` from all three files. The next run proved the
point directly: with `mode: 'serial'` gone, TC-214, TC-211a and TC-211b (previously skipped) all
ran and passed independently, while TC-210 failed on its own unrelated later-stage bug (see
`table-registry-redirect-times-out-after-company-select.md` once filed) without taking any sibling
test down with it.
