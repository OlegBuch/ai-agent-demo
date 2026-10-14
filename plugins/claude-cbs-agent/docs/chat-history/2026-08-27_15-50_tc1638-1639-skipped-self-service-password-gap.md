# Skipped TC-1638 / TC-1639 (Password History Depth) — no self-service password-change infra in the API suite

## Context

TB-3197 (Access Administration regression suite,
`api/security_management/tests/access-administration-regression.spec.ts`,
`US-02.03.01 | Password Governance Configuration`). Manual QA supplied two tickets covering
`PWD_HISTORY_DEPTH` behavior:

- **#1638** — `PWD_HISTORY_DEPTH = 0` allows reusing the immediately previous password. Flow: log in
  as a test user with `P1`, self-service change to `P2`, self-service change back to `P1` (expect
  accepted), log out, log in with `P1` (expect success).
- **#1639** — `PWD_HISTORY_DEPTH = 1` blocks the immediately previous password but allows the one
  before it. Flow: admin forces a password reset generating temp password `T1` (same shape as
  TC-1514's `PASSWORD.RESET~MAIN` flow), log in with `T1`, on the forced Keycloak Update-Password
  screen set the new password to `P1` (the user's real password from two changes back — expect
  accepted, since the depth-1 window is occupied by `T1`, not `P1`).

## Why they were skipped instead of implemented

Both tickets require exercising real end-user Keycloak authentication and password-change flows,
which is a materially different capability than everything else in this file (which only drives the
CBS `SYSTEM.PARAMETER~MASTER` table via `TableRegistryApiClient`). Investigated before writing any
code, per this repo's "discuss feasibility first" convention:

1. **No self-service password-change client exists.** The only password-setting code path in the
   repo is `KeycloakAdminApiClient.resetPassword` (`api/utils/services/keycloak-admin-api-client.ts`),
   which hits the ADMIN endpoint `PUT admin/realms/{realm}/users/{id}/reset-password`. TC-1638 step 2
   ("change password again, back to the previous password") is explicitly a self-service change made
   by the logged-in user, not an admin override — that's a different Keycloak endpoint entirely
   (Account REST API, `POST realms/{realm}/account/credentials/password`, called with the user's own
   bearer token + old/new password). No client, path constant, or helper targets this endpoint
   anywhere in `api/`.
2. **Whether admin `resetPassword` even enforces `passwordHistory` policy is unverified.** Nothing in
   the codebase exercises this; it's genuine Keycloak server behavior that would need to be checked
   empirically, not assumed.
3. **No API-only way to complete a forced `UPDATE_PASSWORD` required-action login exists.** TC-1639
   step 2 requires logging in with a temporary password and completing Keycloak's hosted
   "Update Password" required-action form before a real session/token is issued. A real, working
   version of this flow already exists — but only in the **UI** suite:
   `ui/pages/keycloak-update-password-page.ts` + `ui/utils/helpers/first-login-flow.ts`
   (`completeFirstLoginPasswordChange`), exercised by `ui/tests/login/first-login-temp-password.spec.ts`
   (TC-199/200/202). It drives a real browser through Keycloak's login-actions page; there is no
   programmatic (`APIRequestContext`-only) equivalent.
4. **`createUserAuthenticatedApiContext` has no handling for a pending required action.** Its
   direct-grant login path (`api/utils/services/auth-service.ts` → `token-service.ts`) only retries
   blindly on any thrown error (`withKeycloakLoginRetry`, 3 attempts, fixed 750ms delay) — it does not
   distinguish Keycloak's `invalid_grant` / "Account is not fully set up" response for a pending
   `UPDATE_PASSWORD` action from a genuine transient failure. Using it to log in with `T1` would just
   retry uselessly and then throw, not land on the update-password step.
5. **No prior test anywhere (API or UI) performs a full self-service
   "login → change own password → logout → login with new password" cycle.** Confirmed via broad
   search across `api/**/tests/` and `ui/**/tests/`.

## Decision

Explicitly confirmed with the user: skip both as out of scope for this API regression suite, rather
than building fragile ad-hoc HTTP-level Keycloak form/required-action handling into an API test file.
Documented here instead of silently dropping them.

## What would be needed to implement these later

- A `KeycloakAccountApiClient` (or similar) wrapping `POST realms/{realm}/account/credentials/password`
  for self-service password change, authenticated with the target user's own token
  (`createUserAuthenticatedApiContext` already provides that part).
- For TC-1639: either (a) move it to the UI suite and reuse
  `ui/pages/keycloak-update-password-page.ts` / `completeFirstLoginPasswordChange`, or (b) build a
  genuinely new API-level required-action completion helper (POST to Keycloak's
  `login-actions/required-action` execution endpoint with the appropriate form/session state) — (a)
  is far less risky since the flow already works and is maintained there.
- Empirical confirmation (via either path above) of whether `passwordHistory` is actually enforced on
  admin-forced resets, self-service changes, or both — needed to correctly assert TC-1639's specific
  claim that `T1` (an admin-set password) occupies the depth-1 history slot.

## Related

- `US-02.03.02` (Administrative Password Reset) — already covered API-side, admin-only, on branch
  `group-1/TB-3196` (`TC-1514`), separate from and not blocked by this gap.

## Revisited 2026-08-28 (TB-3197 session) — reconfirmed, left for manual QA

Re-discussed while triaging all skipped/blocked items in the regression suite. Confirmed there was
never any code for these two in `access-administration-regression.spec.ts` (or anywhere in `api/**`)
to remove — they were skipped before implementation, per the decision above, and only exist as this
write-up. Reconfirmed with the user: leave both for manual QA, no automation attempt for now.

If this is revisited later, the open questions worth asking before writing any code:

**Developers:**
1. Does CBS have its own self-service "change password" screen, or is self-service change only
   available via Keycloak's own hosted Account Console (`/realms/{realm}/account`)? Determines
   whether TC-1638 is a CBS UI test or something else entirely.
2. Is Keycloak's Account REST API (`POST realms/{realm}/account/credentials/password`) enabled for
   this realm's client config? A working request example (headers/body) would let a
   `KeycloakAccountApiClient` be built directly instead of guessing at the contract.
3. Is `passwordHistory` enforced identically for admin-forced resets and self-service changes, or are
   they different code paths? TC-1639's premise (that an admin-set temp password `T1` occupies the
   depth-1 history slot) depends on this.

**Manual QA:**
1. Which screen did they actually use when manually verifying TC-1638/TC-1639 — a CBS screen, or
   Keycloak's own hosted pages?
2. For TC-1639: after the forced reset, does the user land on a CBS screen or directly on Keycloak's
   hosted Update Password form (the same one `ui/pages/keycloak-update-password-page.ts` already
   drives via `completeFirstLoginPasswordChange`)? If the latter, TC-1639 could very plausibly be a
   low-effort addition to `ui/tests/login/first-login-temp-password.spec.ts` rather than new
   infrastructure — but it would live in the UI suite, not this API regression file.
3. Was API-level automation ever actually expected for these two, given the flow is inherently a
   browser/hosted-login-page redirect?
