# A missing-env-var failure can mean the workaround it needs is now obsolete, not that the env is incomplete

**Resolved 2026-09-07 — the master-admin Keycloak path this entry originally covered was removed
entirely; see "The fix" below before assuming the advice here is still "add the missing vars."**

**The pattern/symptom.** A test calling `createMasterAdminKeycloakUser` failed deterministically
on the Azure `bankstg` stage with:

```
Error: KEYCLOAK_BASE_URL, KEYCLOAK_ADMIN_USERNAME, and KEYCLOAK_ADMIN_PASSWORD must be set in environment variables
```

while every other e2e test in the same run passed, including ones creating Keycloak users through
the *other*, already-working path (`createKeycloakUser`, the service-account path used by
`test-user-service.ts`, needing `KEYCLOAK_ADMIN_CLIENT_ID`/`KEYCLOAK_CLIENT_SECRET` — a
**different, non-overlapping** pair from `KEYCLOAK_ADMIN_USERNAME`/`KEYCLOAK_ADMIN_PASSWORD`).
Having one pair configured says nothing about the other.

**The rule.** Before treating a missing-credential-pair failure as "the environment needs one more
secret," check *why* that second path exists at all — `git log -S <function name>` on the function
that throws, read the introducing commit's message. If it was added as a fallback because some
*other* environment lacked the primary path's credential (see "The root cause" below), and the
*current* environment has the primary path fully configured and already proven working by every
other test in the run, the fix is to point the failing call back at the primary path and delete the
fallback — not to provision yet another credential pair for a path nothing else needs. Also check
whether the created identity's password/temporary-flag is ever actually used to log in (grep the
returned object's fields) before assuming the two paths aren't interchangeable for that specific
caller.

**The root cause.** `git log -1 --format=%B f3845acf` (the commit that introduced
`createMasterAdminKeycloakUser`) stated it directly: "a master-realm admin path... used to
provision the throwaway SM.USER~EXTERNAL identity in 1840 (**this environment's confidential
service-account client isn't configured**)." On whatever environment that test was authored
against, the service-account path was unavailable, so a master-admin fallback was built. On Azure
`bankstg`, the situation is inverted: the service-account pair is configured and working, the
master-admin pair never was (neither the old Vault-driven `bankstg-bootstrap-env.sh` nor its
`.env.bankstg-local`-sourced successor ever wrote `KEYCLOAK_ADMIN_USERNAME`/`PASSWORD`). The one
caller, `customer-party-integration.spec.ts` (3 call sites), only ever read `.userId` off the
returned object to attach to an `SM.USER~EXTERNAL` profile — `.username`/`.password` were minted
but never used for an actual login — so the two paths were functionally interchangeable for this
specific use.

**The fix (2026-09-07).** Switched `customer-party-integration.spec.ts`'s 4 call sites
(`createMasterAdminKeycloakUser`/`deleteMasterAdminKeycloakUser` → `createKeycloakUser`/
`deleteKeycloakUser`) to the already-working service-account path — no `.env` change needed. Since
that left `createMasterAdminKeycloakUser`, `deleteMasterAdminKeycloakUser`, and
`resolveMasterAdminKeycloakContext` with zero remaining callers anywhere in the repo, removed all
three (~95 lines) from `api/utils/services/auth-service.ts`, along with an unrelated, already-dead
`getUserKeycloakAccessToken` export (zero callers, including internal) found during the same sweep.
`withTrailingSlash`/`normalizeHttpUrl`/`getKeycloakAccessTokenPair`/`getKeycloakAccessToken`/
`getKeycloakServiceAccountToken` are exported but only called internally within the same file —
checked and left alone, not dead code.

**The incident.** `vm-results-e2e-20260907-174157` (e2e suite on Azure): 14 passed, 3 failed, one
of which was this gap.
