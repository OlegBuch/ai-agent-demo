# `createTestUserWithoutPermissions` silently grants `SM.USER:SEE`, not zero permissions

## The pattern/symptom

A test using `createTestUserWithoutPermissions(apiRequest, {...})` (or `createTestUser(apiRequest,
{permissions: [], ...})` directly) expects the resulting user to hold **no** permissions at all.
It actually gets a group with `PERMISSIONS: [{TABLE: 'SM.USER', FUNCTION: 'SEE'}]` (the
`USER_GROUP_VALUES.PERMISSIONS.MINIMAL` constant) — a real, narrow grant, not an empty one.

## The rule

In `api/utils/services/test-user-service.ts`'s `createTestUser`, the permission-fallback check is:

```ts
const permissions = options.permissions?.length
  ? options.permissions
  : [...USER_GROUP_VALUES.PERMISSIONS.MINIMAL];
```

`options.permissions?.length` is `0` (falsy) both when `permissions` was never specified **and**
when the caller explicitly passed `[]` — the two are indistinguishable, so an intentional "give
this user zero permissions" request silently falls back to `MINIMAL` instead. This is a classic
falsy-empty-array bug, the same shape as `if (!array.length)` conflating "empty" with "absent."

**Fix**: check presence, not truthiness — `options.permissions !== undefined ? options.permissions
: [...USER_GROUP_VALUES.PERMISSIONS.MINIMAL]` (or equivalent) so an explicit `[]` is respected.

**Predict**: any test relying on a "no-permission" user being denied access to `SM.USER` itself
(not just some unrelated table) will get a false negative from this fixture today — it silently
already has `SM.USER:SEE`. Tests verifying denial on any *other* table are unaffected (the extra
grant is irrelevant to them), which is exactly why this shipped without failing anything yet.

## The incident

2026-09-02, branch `group-3/TB-3468` (test-user-service migration). Found during a pre-merge review
requested by the user ("no hidden bugs before I commit/push"), not by any failing test — the
currently-migrated negative-permission cases (`idempotency-regression.spec.ts`,
`customization-regression.spec.ts` TC-647, both live-verified 403 during the TB-3468 migration) happen to target tables other than `SM.USER`, so the
extra grant never surfaced as a visible failure. **Fixed same day**: the fallback now uses `??`
(nullish coalescing) instead of `?.length` —
`options.permissions ?? [...USER_GROUP_VALUES.PERMISSIONS.MINIMAL]` — so `undefined` still falls
back to `MINIMAL` but an explicit `[]` is respected as genuinely zero permissions. Not yet
re-verified live (the fixture wasn't re-run after the fix as of this entry) — if a future session
finds a `createTestUserWithoutPermissions` user still getting `SM.USER:SEE`, re-check this fix
landed and wasn't reverted.

**Update 2026-09-03 — the `??` fix landed and IS respected, but it exposed a NEW, more fundamental
problem: the backend won't create a permission group with zero permissions at all.** First live
exercise of `createTestUserWithoutPermissions` since the fix (Currency module,
`currency-regression.spec.ts`'s "Adapter without ESB permission is rejected", allureCaseId 3104):
`createUserGroup` now correctly POSTs `PERMISSIONS: []` to `SM.USER.GROUP~MAIN` INPUT (the `??` fix
works) — but the backend schema rejects it outright: `400 "PERMISSIONS - must have at least 1 items
but found 0"`. **A CBS user group requires at least 1 permission item by schema — "truly zero
permissions" is not a constructible state via this endpoint, full stop**, independent of anything in
this test-automation repo. The 2026-09-02 fix was correct about respecting caller intent, but nobody
had exercised the resulting empty-array POST against the real backend yet.
**Predict / open decision, not yet resolved**: `createTestUserWithoutPermissions` needs a different
strategy than literal `[]` to represent "lacks the permission this specific test cares about" —
either (a) revert to granting `MINIMAL` (`SM.USER:SEE`) and accept the 2026-09-02 doc's own caveat
that a test verifying denial on `SM.USER` itself would need a different fixture, or (b) grant one
inert permission on a table/function unrelated to both `SM.USER` and whatever the calling test
actually checks access to (preserves the 2026-09-02 fix's intent while satisfying the backend's
≥1-item floor). (b) is the stronger option architecturally since it keeps both fixes' goals intact —
flagged to the user for a decision before touching `test-user-service.ts` (a shared, actively
worked-on file — a parallel session was mid-migration of hardcoded users (TB-3468) on this exact file the same day), not yet implemented.

**Two bugs found on first live run of the implemented design (2026-09-03):**
1. **Self-inflicted, `createTestUserWithoutPermissions`'s final line returned `{ ...user,
   scaffolding: {...} }`** — spread only copies enumerable own properties, and `TestUser.password`
   is deliberately `enumerable: false` (`withMaskedPassword`, so it doesn't leak into casual
   `console.log`s). Spreading silently dropped `password` (TS's structural typing doesn't catch
   this — `{...user}` still type-checks as a full `TestUser`). Every login for a no-permission user
   then sent `password: undefined` to Keycloak — a deterministic `401 Invalid user credentials` on
   every attempt, not transient. **Fix**: mutate the existing object instead of spreading —
   `user.scaffolding = {...}; return user;`. **Predict**: never rebuild a `TestUser`-shaped object
   via `{...user, ...}` — always mutate the original, or it silently loses `password` (and the
   custom inspect symbol).
2. **Pre-existing, unrelated to today's changes, only exposed because bug 1 made login fail
   deterministically**: `createUserAuthenticatedApiContextWithRetry`/
   `createAuthenticatedApiContextWithRetry` (`test-polling-helper.ts`) wrapped
   `createUserAuthenticatedApiContext`/`createAuthenticatedApiContext` in an outer retry
   (`retryContextCreation`, `maxAttempts=10`) — but those already retry the Keycloak login
   internally via `withKeycloakLoginRetry` (5 attempts, `token-service.ts`). A persistent login
   failure exhausted the inner 5, threw, got caught by the outer wrapper, and restarted a **fresh**
   5-attempt cycle — up to 10 times (50 total attempts, several minutes), reading as an infinite
   loop in the terminal even though technically bounded. **Fix, user-confirmed scope**: reduced
   both outer wrappers' `maxAttempts` default from `10` to `1` — the outer layer is now a pure
   passthrough, so the *only* retry budget for a login failure is the inner 5-attempt cycle,
   exactly the "5 attempts then the test fails" behavior wanted. Initially considered `2` (as a
   safety margin for non-login context-creation failures) but the user correctly pushed back that
   changing shared, framework-wide helpers deserves the narrowest change that achieves the actual
   requirement, not an arbitrary margin — `1` is that. **Predict**: any "with retry" wrapper added
   around a function that might already retry internally needs this exact check before picking a
   `maxAttempts` — a persistent failure should fail loud after one honest retry cycle, not multiply
   wait time across stacked retry layers.

**Update 2026-09-03, design settled (implementation pending):** the BA independently
confirmed live in chat that granting a single `SEE` permission is the standard way to represent a
"no-permission" user in this system (matches the ≥1-item backend floor above). First design
(`SEE` on the SAME table the calling test checks denial against) was rejected before implementation
— the user correctly pointed out this breaks any *future* test asserting that a no-permission user
also can't `SEE` that table, not just can't mutate it. **Final design**: `createTestUserWithoutPermissions`
creates a throwaway TABLE + a throwaway GROUP granting `SEE` on that table, assigns the user to it,
and cleans up all three (user, group, table) afterward. Since the table is freshly minted and never
referenced anywhere else in the suite, no current or future test can ever collide with it — this is
strictly better than picking any *existing* "inert" table (which stays a guess about what future
tests won't check). Implementation to reuse this repo's existing dynamic-table-creation helper
(`createTableAndWait` or equivalent, already used by `global-setup.ts` for the shared AQA table
group) rather than hand-rolling table creation.

**Implemented 2026-09-03**, in `test-user-service.ts`, reusing the exact pattern already proven in
`integration_chapter/tests/customization-integration.spec.ts` (own dedicated table group via
`client.createGroup(buildCreateGroupPayload(...))`, not the shared global one — user explicitly
requested full isolation over reuse, so no future test's table-group scope can ever collide with
it). `createTestUserWithoutPermissions` now: creates a throwaway table group → a throwaway table in
it via `createTableAndWait` → a throwaway `SM.USER.GROUP~MAIN` group granting `SEE` on that table →
the user assigned to that group. `TestUser` gained an optional `scaffolding: {tableGroupId,
userGroupId}` field; `deleteTestUser` cleans both up (via `cleanupGroupById` for the table group,
`performRecordOperation(..., 'DELETE', ...)` for the user group) when present, and is a no-op for
every other user-creation path since only this function sets `scaffolding`. `tsc --noEmit` and
`eslint` both clean. Not yet live-verified (network to QA was down during design; user hasn't run it
yet) — re-check this note once it has been.

**Hardened 2026-09-03, two layers, so nobody hits this landmine again by calling `createTestUser`
directly with `permissions: []`:** (1) `CreateTestUserOptions.permissions` retyped from
`UserGroupPermission[]` to a non-empty tuple `[UserGroupPermission, ...UserGroupPermission[]]` — a
literal `permissions: []` (or a general-array-typed variable) is now a **compile-time** TS error,
project-wide `tsc --noEmit` confirmed clean after the change (no other call site was relying on
passing `[]`). (2) A runtime guard at the top of `createTestUser` throws a clear, actionable error
(`"...Use createTestUserWithoutPermissions() for a genuinely permission-less test user instead."`)
for anything that still slips an empty array through at runtime (a type assertion, a JS caller). The
type change alone catches the common case; the runtime check is defense-in-depth for what the type
system can't see.
