# `provisionDashboardUser`/`createTestUser` never set `WORKSPACE_MENU_ROOT_ID` — the nav menu SEE 404s for every UI-test user

**Symptom:** After a UI test's `dashboardUser` reaches a page that loads the workspace navigation
menu (e.g. Table Registry, right after company selection), `POST
/tables/api/v1/projections/WORKSPACE.MENU~NAVIGATION/records/operations/SEE` returns
`404 {"detail":"Record not found", ...}`. Observed once so far as the apparent trigger for the CBS
web app bouncing the session back through `/proj-web/en` to `/proj-web/en/selectCompany`, which then
fails a `toHaveURL(TABLE_REGISTRY_URL_PATTERN)` assertion with a timeout — the URL never lands on
Table Registry even though the earlier `/table-registry/api/v1/tables` call it also fires already
succeeded (`200`) and the page briefly rendered before bouncing back.

**Root cause (confirmed by response body + existing code):** the fetched `/api/v1/user-profile`
response for the test's `dashboardUser` carries `"workspaceMenuRootId": null`. Per
`api/types/user-profile.types.ts`'s own doc comment, `WORKSPACE_MENU_ROOT_ID` is exactly "which
`WORKSPACE.MENU` root record `WORKSPACE.MENU~NAVIGATION`'s SEE resolves for this user" — with it
unset, that SEE call has no root to resolve and 404s by design (matches the existing API-level
assertion in `api/system_core/tests/basic-customization-smoke.spec.ts`'s "SEE
`WORKSPACE.MENU~NAVIGATION` for a root that does not exist" step). `provisionDashboardUser`
(`ui/auth/helpers/dashboard-user.ts`) → `createTestUser` (`api/utils/services/test-user-service.ts`)
never passes `profileOverrides.WORKSPACE_MENU_ROOT_ID`, and never provisions an actual
`WORKSPACE.MENU~MASTER` root record for the test user to point at (that requires
`inputWorkspaceMenuRecord({ isRoot: true, ... })` from `api/system_core/helpers/workspace-menu-helper.ts`,
which today is only ever called from `system_core`'s own API-level customization tests).

**Open question — not yet resolved:** this 404 is presumably identical for every `dashboardUser`
in every UI test (the field is never set for any of them), yet in the one run that surfaced it, 3
sibling tests in the same file that also reach Table Registry (`company-selection.spec.ts`'s
TC-214/TC-211a/TC-211b) passed in the same run while TC-210 hit the redirect-back. Whether the CBS
web app's bounce-to-`selectCompany` on this 404 is deterministic (and something else about TC-210
specifically triggers it) or a timing-sensitive/flaky reaction to a 404 that's normally tolerated is
still unconfirmed — needs either a reliably-reproducing case or a dev-side answer on whether a null
`workspaceMenuRootId` is supposed to be tolerated gracefully (empty nav) or is actually invalid
state for a dashboard user. Don't treat this write-up as license to add `WORKSPACE_MENU_ROOT_ID`
provisioning to the shared `dashboardUser` fixture without that answer — it's a cross-cutting change
to a fixture every UI-auth test uses.
