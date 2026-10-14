# bankuat: UI needs BASE_URL on the `one.bankuat.local` host

**TL;DR.** On bankuat the CBS web app is canonical on `http://one.bankuat.local` (Keycloak `redirect_uri` points there). With `BASE_URL=http://bankuat.local` the login works, but the first deep-link `page.goto(UI_BASE_URL + ...)` goes to another origin: no session cookie, a fresh Keycloak round-trip, then `/proj-web/api/auth/signin?error=OAuthCallback` and a redirect to Home with a "Record not found" toast. Every UI test that navigates after login fails the same way, including unrelated `main` specs (override-dispo TC-3931 failed identically).

| Item | Value |
|---|---|
| Symptom | `OAuthCallback` in the Playwright call log, page ends on `/proj-web/en`, `Record not found` toast; all API-only tests still pass |
| Cause | `ui/base/constants/base-url.ts` derives `UI_BASE_URL` from `BASE_URL`; host differs from the one the session was created on |
| Fix | `.env.bankuat-local`: `BASE_URL=http://one.bankuat.local` (done 2026-10-08, TB-3542); both hosts serve the UI and the API gateway |
| Check | run one UI spec from `main` plus one new spec together; if the `main` spec also fails, it is this, not the new code |
| Open | a dedicated UI host variable would avoid coupling UI and API hosts; not added |

Related: running UI tests with `--workers=4 --fully-parallel` cut a 62-test spec from 40 min to 3.5 min, because `UI-Chromium` is `fullyParallel: false` and `UI_TESTS_PARALLEL_WORKERS` defaults to 1.
