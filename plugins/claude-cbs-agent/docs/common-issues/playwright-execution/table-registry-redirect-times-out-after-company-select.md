# Post-navigation `expect(page).toHaveURL(...)` needs a `waitForUrl()` first, or it inherits the bare 5000ms default

**Symptom:** `expect(page).toHaveURL(pattern)` immediately after a UI action that triggers
navigation (a button click that fires a backend call before routing) fails intermittently —
`Timeout: 5000ms`, page still on the pre-action URL — while the action step right before it (the
click itself) reports no error at all. Not reproducible every run; passes most of the time.

**Rule:** This repo's `playwright.config.ts` sets no `expect: { timeout }`, so any bare
`expect(...).toHaveURL(...)` with no explicit timeout silently gets Playwright's built-in 5000ms
default — far tighter than the purpose-built navigation timeouts already defined in
`ui/base/constants/ui-timeouts.ts` (`AUTH_REDIRECT_TIMEOUT_MS` = 30s, `AUTH_SELECT_COMPANY_TIMEOUT_MS`
= 15s). The established pattern elsewhere in this codebase (`ui/auth/helpers/first-login-flow.ts`,
and `company-selection.spec.ts`'s own `TC-211b`) is two-step: call the destination page object's own
`waitForUrl()` (backed by `page.waitForURL()` with one of those generous constants) **first**, then
assert with `expect(...).toHaveURL(...)` — by the time the assertion runs, the URL has already
settled, so the bare 5000ms default never matters. A page object that's missing its own `waitForUrl()`
method (only exposing the inherited, non-waiting `assertUrl()`) is a sign this pattern was skipped for
that destination.

**Incident (2026-09-10):** `ui/auth/tests/company-selection.spec.ts`'s `TC-210`/`TC-214` "Verify
redirect to main page" step asserted `toHaveURL(TABLE_REGISTRY_URL_PATTERN)` directly after clicking
Continue, with no preceding wait — `DashboardShellPage` had no public `waitForUrl()` at all (unlike
`SelectCompanyPage`, which does, and which `TC-211b` in the very same file already uses this way).
Confirmed via three consecutive local runs of the same file/command: run 1 all green, run 2 TC-210 +
TC-214 both failed on exactly this assertion at exactly 5000ms (page still on `/selectCompany`), run 3
all green again — classic "backend round-trip usually under 5s, occasionally not" flake, not a
dropdown-selection bug (the preceding "select company + click Continue" step threw no error in either
failed run, so the option had already been selected and Continue already clicked by the time the
redirect assertion started timing).

**Resolution (2026-09-10):** added `DashboardShellPage.waitForUrl()` (mirrors
`SelectCompanyPage.waitForUrl()`, defaults to `AUTH_REDIRECT_TIMEOUT_MS`) and call it before the
`toHaveURL` assertion in both `TC-210` and `TC-214`.

**Predictive rule:** before adding any `expect(page).toHaveURL(...)` right after an action that
triggers navigation, check whether the destination page object already exposes a `waitForUrl()` — if
not, that's a gap, not a reason to just bump the assertion's own `{ timeout }` inline; add the method
(reusing an existing `AUTH_*`/`UI_*` timeout constant, not a new one) and call it first, matching the
pattern above.

**Correction, same day — the per-test fix above was incomplete.** `SelectCompanyPage.selectCompany()`
itself clicks Continue and returns immediately, without waiting for the resulting redirect — the
TC-210/TC-214 fix only patched two of its call sites (`company-selection.spec.ts`'s own tests), not
the method itself. `ui/auth/helpers/login-flow.ts`'s `loginAndSelectCompany()` — a shared precondition
helper used well beyond `company-selection.spec.ts` — calls `selectCompany()` and returns just as
fast. `ui/field-registry/helpers/field-registry-flow.ts`'s `loginAndOpenFieldRegistry()` then
immediately does a **hard** `page.goto()` to `/fieldRegistry` right after `loginAndSelectCompany()`
returns — and that new navigation races the still-in-flight company-selection→Table Registry redirect.
Confirmed via `trace.zip`'s network log on `field-registry.spec.ts`'s `TC-08`: `GET
/proj-web/en/fieldRegistry` returns 200, but a leftover `tableRegistry` redirect chain (307→307→200,
already in flight from the Continue click) wins the race a moment later and the browser ends up back
on `/proj-web/en/tableRegistry` — `TC-08`'s very next assertion (`FieldRegistryPage.assertDisplayed()`)
then fails on the wrong URL. This is the general "fix in the named method, not just its one caller"
lesson: the earlier fix addressed the symptom at two call sites instead of the actual method that has
several. **Real fix:** added `await this.waitForUrlPattern(TABLE_REGISTRY_URL_PATTERN,
AUTH_REDIRECT_TIMEOUT_MS)` inside `SelectCompanyPage.selectCompany()` itself, right after the Continue
click — this now protects every current and future caller (`loginAndSelectCompany`, `TC-210`/`TC-214`
directly, `back-button-after-logout.spec.ts`), not just the two that had already been separately
patched. The TC-210/TC-214 `dashboardShell.waitForUrl()` calls added earlier are now redundant (the
URL already matches by the time they run) but harmless — left in place rather than churned back out.
