# `test-user-service.ts` now supports provisioning EXTERNAL-classified test users

## The pattern/symptom

Before 2026-09-07, `createTestUser`/`createTestUserSession` (`api/utils/services/test-user-service.ts`)
always provisioned a user via `USER_PROFILE_VALUES.PROJECTION.INTERNAL`/`buildInternalUserProfilePayload`
with no way to create an `SM.USER~EXTERNAL` identity instead. Several tests (e.g.
`api/integration_chapter/tests/sms-system-core.spec.ts`'s TC-13) that need to log in AS an
EXTERNAL-classified user to prove access-rule behavior differs by classification stayed on a
static, env-configured `EXTERNAL_USER_USERNAME`/`PASSWORD` pair for this reason, and a 2026-09-01
migration plan (`docs/superpowers/plans/2026-09-01-tb-3468-hardcoded-user-migration-plan.md`, local
to `proj-test-automation`) explicitly deferred it as new/out-of-scope work, citing a prior removed
attempt at EXTERNAL support as "untested by this pilot, and likely broken as written."

## The rule

This is now resolved — do not re-defer an EXTERNAL-classified test-user need as a blocker.
`createTestUser`/`createTestUserSession` accept a new `classification?: 'INTERNAL' | 'EXTERNAL'`
option (default `'INTERNAL'`, fully backward compatible) plus an optional `allowedCustomers?:
string[]` (EXTERNAL-only; falls back to the shared `USER_PROFILE_VALUES.ALLOWED_CUSTOMERS.DEFAULT`
via `buildExternalUserProfilePayload`'s own default if omitted). Internally this just switches
which projection (`USER_PROFILE_VALUES.PROJECTION.EXTERNAL` vs `.INTERNAL`) and payload builder
(`buildExternalUserProfilePayload` vs `buildInternalUserProfilePayload`) the profile INPUT targets
— the Keycloak user creation, group/permission provisioning, and cleanup paths are unchanged and
work identically for both classifications, since `ExternalUserProfileInputData` has its own
`GROUPS: string[]` field the same permission-group-based grant mechanism already relies on.

Before assuming a further extension is needed for some other classification (`SYSTEM`, etc.), check
whether the same pattern (a `PROJECTION.<X>`/`build<X>UserProfilePayload` pair already existing and
used live elsewhere in the codebase) already exists — if so, extending the service the same way
this entry describes is a small, low-risk change, not a new architecture problem.

**Not investigated/verified this session:** why the *prior* EXTERNAL attempt (referenced by the
2026-09-01 plan) was removed — no trace of it was found in `git log -p` on `test-user-service.ts`
(it must have existed only in an uncommitted working-tree state that got discarded before ever
being committed). If EXTERNAL-classified disposable users misbehave once live-verified, look here
first for whatever bug the prior attempt hit.

## The incident(s)

2026-09-07, TB-3587, `integration_chapter` module: implemented the extension described above,
confirmed via reading `api/utils/constants/user-profile.values.ts` (projection constants),
`api/types/user-profile.types.ts` (`ExternalUserProfileInputData` shape), and
`test-data/payload-builder.ts` (`buildExternalUserProfilePayload`'s existing defaults) that
EXTERNAL provisioning was already fully supported at the API-client/payload-builder layer — the gap
was purely in `test-user-service.ts` never exercising that path. Statically verified clean
(`tsc`/`eslint`/`prettier`); not yet live-verified (QA environment unreachable all session).
