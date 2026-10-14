# TC-1569 / TC-1524 skipped — SM.USER never syncs to LOCKED after a Keycloak brute-force lock

**Ticket:** Allure #1569 / #1524 — unblocking a user locked out by Keycloak brute-force protection
(SIGN.ON.RESET, `US-02.03.03 | Lockout Management`). AC3: 5 consecutive wrong-password logins lock
the account (`SM.USER` becomes `LOCKED`); a SIGN.ON.RESET unblock reactivates the profile and
allows login again. AC2/TC-1524: the unblock resets the failed-attempt counter to zero (not just
past-threshold masking).

**Scenario as automated:** create a Keycloak user, drive 5 wrong-password logins spaced past the
realm's brute-force timing window, confirm `SM.USER~INTERNAL` STATUS becomes `LOCKED`, unblock via
SIGN.ON.RESET INPUT, confirm STATUS returns to `ACTIVE`, repeat with 4+1 more attempts to prove the
counter was genuinely reset (not just under threshold), unblock again, confirm login with the
correct password succeeds.

## Why this can't be automated as written

The test's `SM.USER` poll for `STATUS === 'LOCKED'` after the 5th wrong-password attempt
consistently times out (tried at 20s and 60s) — `STATUS` stays `ACTIVE`.

Two hypotheses were investigated in order:

1. **Attempt timing** — the realm's Brute Force Detection config (confirmed via Keycloak Admin
   Console: Realm settings → Security defenses → Brute force detection) has `Quick login check
   milliseconds = 1000`; attempts closer together than that don't advance Keycloak's real failure
   counter. The test's original back-to-back attempts (~350–400ms apart) never counted toward the
   `Max login failures = 5` threshold. Fixed by spacing consecutive attempts by 1200ms
   (`pauseBeforeNextLoginAttempt`, `api/utils/services/auth-service.ts`). This fix did not resolve
   the failure — ruled out as the (sole) root cause.

2. **CBS-side sync gap** — added a diagnostic helper, `getKeycloakBruteForceStatus`
   (`api/utils/services/auth-service.ts`, backed by `KeycloakAdminApiClient.getBruteForceStatus` /
   `GET admin/realms/{realm}/attack-detection/brute-force/users/{userId}`), to read Keycloak's own
   brute-force counter directly, independent of whatever listener is supposed to sync a lock into
   `SM.USER`. With attempts properly spaced (confirmed via
   `LOG/keycloak-login-attempts.log`, ~1.5–1.6s apart), Keycloak's own state came back as:

   ```json
   { "numFailures": 5, "disabled": true, "numTemporaryLockouts": 0, ... }
   ```

   captured ~7s after the 5th attempt — well inside the poll window. So Keycloak itself locks the
   account correctly and promptly. `SM.USER~INTERNAL` STATUS, however, stayed `ACTIVE` for the
   entire poll (confirmed at both 20s and 60s timeouts in separate runs).

This isolates the gap to the CBS-side listener that's supposed to sync a Keycloak-driven lockout
into `SM.USER` (referenced in the tickets' own screenshots via `ST_AUTHORISER:
"keycloak-lockout-listener_..."`) — it is not applying that sync in this test environment, at
least not within any timeframe practical for an automated test to wait on.

## Disposition

Permanently left for manual QA (confirmed with the user 2026-08-28, superseding the earlier
"skipped, pending restoration" framing below) — not automated against a listener that doesn't
observably fire in this environment, and not being kept on standby for a future fix either. The
test code, and the diagnostic helpers written specifically to investigate this
(`getKeycloakBruteForceStatus`/`attemptKeycloakLogin`/`pauseBeforeNextLoginAttempt` in
`api/utils/services/auth-service.ts`, `KeycloakAdminApiClient.getBruteForceStatus` in
`api/utils/services/keycloak-admin-api-client.ts`, and `BRUTE_FORCE_STATUS` in
`api/utils/paths/keycloak-admin-api-paths.ts`), were removed in full — no unused infrastructure
kept in the codebase for this one.

If this is picked up again later, it would need to be re-investigated from scratch (the root-cause
findings above — Keycloak's own brute-force counter trips correctly, `SM.USER~INTERNAL` STATUS
does not sync — are still valid background, just not backed by any surviving code).
