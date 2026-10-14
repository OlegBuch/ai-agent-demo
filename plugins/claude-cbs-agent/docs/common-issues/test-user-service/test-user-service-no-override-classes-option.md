# test-user-service has no OVERRIDE_CLASSES option — pass a pre-built group instead

**The pattern/symptom.** `createTestUser`/`createTestUserSession` (`api/utils/services/test-user-service.ts`)
auto-create a one-off `SM.USER.GROUP` from `CreateTestUserOptions.permissions`, but that auto-created
group only ever sets `PERMISSIONS` — there is no `overrideClasses` field on `CreateTestUserOptions`,
so a case that needs a group with `OVERRIDE_CLASSES` (e.g. an Override/Dispo "Glass-Break" bypass
role) cannot express that via `permissions` alone. Reaching for `permissions` here silently produces
a user who can act on the table but never gets the override-class bypass, since `OVERRIDE_CLASSES`
was never set on the group.

**The rule.** Build the `SM.USER.GROUP` payload yourself first — `PERMISSIONS` and `OVERRIDE_CLASSES`
together, exactly as the pre-migration code did it — then pass that group's id through
`CreateTestUserOptions.groups: [groupId]` instead of `permissions`. `createTestUser` already supports
an explicit `groups` array as a first-class path (it skips the auto-create-from-permissions branch
whenever `groups.length > 0`), so this needs no change to `test-user-service.ts` itself. A useful side
effect: since the user is disposable, there is no need for the old read-original-profile /
restore-original-profile dance that a shared static identity required — just `deleteTestUser` it at
the end like any other dynamically created user.

**The incident.** TB-3587 (2026-09-03), migrating `api/account/tests/account-restrictions-locked-amounts.spec.ts`'s
"Glass-Break" test off the shared static `USERS_DATA.RESTRICTED_USER`. The pre-migration code
(`assignRestrictedUserFullOverrideClasses` in `api/security_management/helpers/override-dispo-helper.ts`,
shared with `override-dispo-regression/smoke.spec.ts`) read `RESTRICTED_USER`'s current profile,
appended a group carrying both `PERMISSIONS` and `OVERRIDE_CLASSES`, ran the test, then restored the
original profile — because it was mutating a shared identity other tests also depend on. Replaced with:
build the same `PERMISSIONS`+`OVERRIDE_CLASSES` group locally in the spec file, then
`createTestUserSession(apiRequest, { groups: [groupId], companyCodes: [...] })` for a disposable user,
no restore step needed. `override-dispo-helper.ts` itself was left untouched — it is still used by
`override-dispo-regression.spec.ts`/`override-dispo-smoke.spec.ts`, migrated later in the same TB-3587
module-by-module effort.
