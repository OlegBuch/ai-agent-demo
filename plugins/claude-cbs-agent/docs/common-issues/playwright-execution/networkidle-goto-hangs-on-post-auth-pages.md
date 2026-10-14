# `waitUntil: 'networkidle'` on a `page.goto()` to an authenticated page hangs for the full navigation timeout

**Symptom:** `page.goto(url)` to an already-authenticated app page (e.g. Table Registry) times out
at the project's `navigationTimeout` (`TimeoutError: page.goto: Timeout 45000ms exceeded ... waiting
until "networkidle"`) even though the page object's very next step (`assertDisplayed()`, checking a
concrete element) would have passed instantly — the page snapshot at failure time shows the full app
shell, sidebar, and page content already rendered and interactive.

**Rule:** `networkidle` requires zero network connections for 500ms continuously — it is Playwright's
own documented anti-pattern for any app with background polling, websockets, or retry-on-error
fetches, because those never let the connection count stay at zero. This repo's authenticated shell
polls/retries background projection reads after login (see incident below), so `networkidle` is
structurally the wrong wait condition for any `goto()` landing on a post-auth page — it measures
network quiescence, not UI readiness, and this app is never fully network-quiescent once
authenticated. Use `waitUntil: 'domcontentloaded'` (already the working pattern in
`ui/health-check/tests/ui-health-check.spec.ts`) for the navigation, and let the page object's own
concrete-element assertion (`assertDisplayed()`, an `expect(...).toBeVisible()` on a real locator)
be the actual readiness check — that's what it's already there for.

**Incident (2026-09-10):** `ui/auth/tests/cross-tab-logout.spec.ts`'s TC-208 opens Tab #2
(`context.newPage()`, sharing Tab #1's cookies) and calls `DashboardShellPage.goto()` directly — the
only place in the suite that hard-navigates straight to an already-authenticated Table Registry page
(the other `.goto()` call site, `company-selection.spec.ts` TC-211b, gets redirected away to
`/selectCompany` before this matters). `DashboardShellPage`'s constructor set
`{ waitUntil: 'networkidle' }`. Trace network log (`trace.zip`'s `*.network` JSONL) showed
`POST /tables/api/v1/projections/WORKSPACE.MENU~NAVIGATION/records/operations/SEE` returning **404**
for Tab #2 and being retried repeatedly with growing backoff (~1.4s, ~2.4s gaps, growing per-attempt
latency too) — background chatter that never fully quiesces within the 45s `navigationTimeout`. The
saved `error-context.md` accessibility snapshot at failure time showed the complete, fully rendered,
interactive Table Registry shell (sidebar with company selector, Logout button, navigation, populated
table list) — proving the page was genuinely ready almost immediately; only the `goto()`'s own
`networkidle` promise never settled. Whether the `WORKSPACE.MENU~NAVIGATION` SEE 404 itself is a real
product-level bug specific to a tab that shares cookies without going through the normal
login/company-selection SPA flow is a separate, still-open question — not something this test
suite's fix addresses.

**Resolution (2026-09-10):** changed `DashboardShellPage`'s `gotoOptions` from
`{ waitUntil: 'networkidle' }` to `{ waitUntil: 'domcontentloaded' }`. `LoginPage` uses the identical
`networkidle` pattern for its own pre-auth `goto()` — left untouched, since there's no confirmed
evidence (no background polling exists before authentication) that it has the same problem; flagged
here as the same risky pattern for the future if it ever shows the same symptom.
