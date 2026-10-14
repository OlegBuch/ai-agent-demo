# `authenticatedApiContext` fixture already resolves through the super-admin bootstrap, not `proj-admin`

## The pattern/symptom

When auditing a module for TB-3587's hardcoded-user migration, a spec file that has **zero**
`USERS_DATA.*` references and no maker/checker/no-permission pattern can look like it's simply "not
migrated yet" and a candidate for converting to a disposable per-test user. Before treating it as
migration work, check whether it even still depends on the shared `proj-admin` credential at all —
as of 2026-09-04 (`keycloak-shared-credential-lockout-and-ci-log-masking.md`'s "Fix 3"), it likely
doesn't.

> **Superseded in mechanism 2026-09-17 (TB-3911):** `readSuperAdminSentinel()` and the sentinel file
> are gone. `resolveKeycloakCredentials` (`token-service.ts`) now reads an in-memory per-worker value set
> by the `workerSuperAdmin` auto fixture in `api-fixtures.ts` (`setWorkerSuperAdmin(...)`), so the super-admin
> is created once per Playwright worker, not once per run in `global-setup.ts`. The conclusion below
> (the plain `authenticatedApiContext` already rides the super-admin, not `proj-admin`) still holds.

## The rule

`api/utils/fixtures/api-fixtures.ts`'s `authenticatedApiContext` fixture calls
`createAuthenticatedApiContext()` with **no** explicit `username`/`password`:

```ts
const apiContext = await createAuthenticatedApiContext(playwright.request, {
  baseURL, extraHTTPHeaders,
  realm: process.env.KEYCLOAK_REALM,
  userContext: process.env.CBS_USER_CONTEXT_HEADER,
});
```

Internally this resolves credentials via `token-service.ts`'s `resolveKeycloakCredentials`:

```ts
export function resolveKeycloakCredentials(username?, password?) {
  return {
    username: username ?? workerSuperAdmin?.username ?? process.env.KEYCLOAK_USERNAME,
    password: password ?? workerSuperAdmin?.password ?? process.env.KEYCLOAK_PASSWORD,
  };
}
```

Since no explicit credential is passed, any test using the plain `authenticatedApiContext` fixture
already authenticates as the worker-scoped super-admin bootstrap user (created once per worker by
the `workerSuperAdmin` fixture), falling back to the static `proj-admin` env credential only if no
super-admin was set. **This means the shared-credential-lockout risk this whole migration exists to
kill is already closed for every file using the plain fixture, with zero code change** — before
spending effort converting such a file to a disposable per-test user, confirm with the user whether
that's still wanted for its own sake (e.g. stronger per-test isolation) or whether the lockout-risk
motivation alone is already satisfied.

This does **not** apply to any file still building its own context from `USERS_DATA.*` or a
module-specific static env pair (e.g. `CUSTOMER_PARTY_CHECKER_USERNAME`) — those bypass
`resolveKeycloakCredentials`'s super-admin-first fallback by passing an explicit username/password,
and still need the full migration treatment.

## The incident(s)

2026-09-04, TB-3587, `system_core` module: most of the module's spec files
(`system-tables-*`, `dynamic-data-dictionary-smoke`, `validation-engine-*`, `projection-forms-*`,
`dates-holidays-*`, `system-param*`, `user-profile-api-*`) turned out to have no `USERS_DATA`
hardcoding at all — initially flagged as an open scope question ("should these be migrated too?").
Traced to the fixture layer and confirmed (per above) they already ride the super-admin bootstrap;
user confirmed migrating them further is not the TB-3587 priority, which is specifically about
killing `USERS_DATA`-style checker/maker/no-permission-style hardcoded credential constants.
