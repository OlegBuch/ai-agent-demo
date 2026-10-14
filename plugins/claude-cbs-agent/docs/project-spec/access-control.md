# Access Control

Actor and permission model as exercised by this repo's tests (`api/system_core/tests/*`,
`api/integration_chapter/tests/sms-system-core.spec.ts`). This is what the test suite proves about
CBS's RBAC — not a full spec of the platform's security model (defer platform-level detail to
`proj-context`/the live system where this repo's evidence is thin).

## Authentication

All actors authenticate against Keycloak (OAuth2 Resource Owner Password Credentials) — see
`docs/frame-specs/api-conventions.md`. There is no session/cookie-based auth path exercised in this
repo; every authenticated call carries a `Bearer` token.

## User classifications (`SM.USER~INTERNAL` / external / system)

Observed via `UserProfileApiClient`/`USER_PROFILE_VALUES.PROJECTION`:

| Classification | Projection | Notes |
|---|---|---|
| Internal | `SM.USER~INTERNAL` (or similar; see `USER_PROFILE_VALUES.PROJECTION.INTERNAL`) | Staff/employee-type user; tests authenticate as named internal users (`INTERNAL_USER_USERNAME`) to probe permission boundaries |
| External | `USER_PROFILE_VALUES.PROJECTION.EXTERNAL` | Non-staff actor (e.g. customer-facing); tests use a distinct external identity (`EXTERNAL_USER_USERNAME`) specifically to prove external users are denied access internal-only rules grant |
| System | `USER_PROFILE_VALUES.PROJECTION.SYSTEM` | Service/system-level identity |

Each user profile carries a `GROUPS` array — the set of User Groups (see below) determining that
user's actual permissions. A user's effective permission set is the union of what their groups
grant.

## User Groups and permissions

`SM.USER.GROUP~MAIN` (via `UserGroupApiClient.inputUserGroup`) — a group is created with a
`PERMISSIONS` array, each entry shaped `{ TABLE: <tableId>, FUNCTION: <operation> }`
(e.g. `{ TABLE: 'SM.USER', FUNCTION: 'SEE' }`). A user gains a group's permissions by having the
group's ID in their profile's `GROUPS` array.

- **A permission grant is table+function scoped**, not table-wide — granting `SEE` does not imply
  `INPUT`, and vice versa.
- Group/profile changes are **not instantaneous** in tests — specs insert an explicit delay
  (typically 5s) after granting/updating group membership before asserting on the effect, implying
  some propagation latency in the real platform. Don't remove this delay when refactoring a test
  without confirming the propagation is actually synchronous now.

## Data Access Rules

A separate mechanism from table-level `PERMISSIONS`: a Data Access Rule (also modeled through the
`SM.USER` family, `USER_GROUP_VALUES.PROJECTION.DATA_ACCESS`) can grant or deny visibility into
*specific records* independent of blanket table permissions — e.g. "UserB can see the specific
record UserA created" despite UserB not having unconditional `SEE` on that table. Tests name these
rules descriptively, e.g. `DENY.AQA.<tableId>.SYSTEM.ACCESS`.

## Permission-boundary test pattern

The recurring pattern across `system_core`/`integration_chapter` regression tests, for any RBAC
assertion:

1. Create a restricted User Group with a narrow/absent `PERMISSIONS` entry for the target
   table+function.
2. Link a real, named user (via env-provided credentials) to **only** that restricted group.
3. Wait for propagation (~5s, see above).
4. Authenticate as that specific user (`createUserAuthenticatedApiContext`, not the shared
   service-account context) and attempt the operation.
5. Assert `403` (authenticated but forbidden) with a message matching
   `/access denied|user does not|permission denied/i` — the exact wording is not standardized
   platform-wide, so assertions match this pattern rather than an exact string.

Contrast with `401`, which is reserved for a request with no/invalid credentials at all (an
unauthenticated `APIRequestContext` with no `Authorization` header) — never conflate the two in a
new test.

## Override Authorisation Matrix (module 02.05) vs. standard RBAC

A third permission-like mechanism, distinct from both `PERMISSIONS` (`{TABLE, FUNCTION}`) and Data
Access Rules above: approving a **standard override** (see `business-rules.md`'s "Override and
Dispo Processing" section) requires the user's `SM.USER.GROUP.OVERRIDE_CLASSES` to intersect the
override's `OVERRIDE.CLASS.DETAILS.REQUIRED_CLASS` (ANY semantics, ≥1 shared class is sufficient) —
this is checked in addition to, not instead of, table-level `PERMISSIONS`. Dispo (financial
exception) approval authority is a fourth, separate mechanism again: purely monetary
(`DISPO.OFFICER.OVERDRAFT_AMT`/`DISPO_AMOUNT`), with **no** override-class involvement at all. Live
test coverage exists for both as of MR !138 (TB-2083) —
`api/security_management/tests/override-dispo-smoke.spec.ts` — see `business-rules.md`'s "Override
and Dispo Processing" section for the specific `TC-NNN` cases.

## Multi-tenant scoping vs. RBAC

`X-Company-Code` (see `docs/project-spec/business-rules.md`'s multi-company isolation rules) is a
**data-scoping** mechanism, not a permission mechanism — a user can be fully authorized for a
`FIN` table's `SEE` function and still get `404` (not `403`) reading a record that belongs to a
different company. Don't conflate a `404` from cross-company isolation with a `403` from an actual
permission denial when writing a new assertion — they mean different things and this suite tests
both explicitly as distinct cases.

## What this repo does not yet establish evidence for

- A full enumeration of all `FUNCTION` values beyond `SEE`/`INPUT` observed in practice (`AUTH` is
  referenced as a projection operation but not confirmed as a distinct grantable `FUNCTION` value
  in a `PERMISSIONS` entry in current tests).
- Group/role hierarchy (e.g. whether groups can inherit from other groups) — not exercised here.
- Session/token expiry and refresh behavior — not tested in this repo.

Treat these as open questions for `proj-context`/the live platform/Jira rather than inferring an
answer from this repo's current test set.
