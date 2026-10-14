Module: Security Management
Confluence/Jira: module 02.03 "Access Administration" (Password Governance, Administrative
Password Reset, Lockout Management, Lock & Intent Management) and module 02.05 "Override and
Dispo Processing" — same `Security Management` component in Allure TestOps, different Epics/
Stories per sub-area. Check the specific Story's own Confluence page rather than assuming one
page covers the whole component.
Last updated: 2026-09-02

This file is the entry point for anything touching the Security Management module. Read it first,
before re-deriving facts from Bruno/Jira/Confluence.

## What this module does

`api/security_management/**` in `proj-test-automation`. `SMApiClient` itself is an empty class —
every real SM entity (`SM.USER~INTERNAL`, `SM.USER.GROUP~MAIN`, `SYSTEM.PARAMETER`, and the
record-lock/intent machinery below) is tested *through* `system_core`'s
`TableRegistryApiClient`/`FieldDefinitionApiClient`, not through a dedicated SM client — same
established pattern as `UserProfileApiClient`/`UserGroupApiClient`/`PFApiClient` in other modules.

Two real suites exist so far:

- `tests/override-dispo-smoke.spec.ts` (TB-2083, module 02.05) — Override and Dispo Processing,
  53 cases.
- `tests/access-administration-smoke.spec.ts` (TB-3196, module 02.03) — Password Governance
  (`US-02.03.01`), Administrative Password Reset (`US-02.03.02`), Lockout Management
  (`US-02.03.03`), Lock & Intent Management (`US-02.03.04`, see [US-02.03.04/](US-02.03.04/)).

## Open/resolved items — read the specific file for full detail

Only `US-02.03.04` has its own subfolder so far ([US-02.03.04/](US-02.03.04/)); the other three
`US-02.03.0x` Stories in `access-administration-smoke.spec.ts` have no open items yet.

| Story | Status | What it's about |
|---|---|---|
| [US-02.03.04/README.md](US-02.03.04/README.md) | 11 of 12 planned smoke cases automated, 1 open | Lock & Intent Management — `record_lock`'s real data model, the four-eyes distinction between holding an AUTH intent vs. executing AUTH, and the unresolved `TC-3068` TTL question. |

## Patterns & Predictive Rules (use these to predict, then verify — don't just cite the facts above)

- **A CBS "lock" is a real Postgres row (`record_lock`), not just an in-memory/Redis
  reservation, and it lives inside the *target table's own* schema, not a global/shared location.**
  This means direct-DB assertions on locks follow the exact same `INT`-vs-`FIN`
  classification-dependent schema-naming split as `LIV`/`NAU`/`HIS` do (see
  `docs/common-issues/fin-table-schema-naming.md`) — **predict**: any new lock/intent-related
  assertion needs the same classification check before choosing a query pattern, don't assume the
  `INT` per-table-schema shape is universal.
- **This module's four-eyes enforcement is stricter at execution time than at intent-creation
  time — don't conflate the two.** Holding an AUTH intent has no maker/checker restriction (the
  inputter can hold it), but *executing* AUTH always requires a different identity from whoever
  INPUT-ed the record, confirmed with a concrete `403` (see
  `docs/common-issues/keycloak-and-auth/auth-operation-required.md`'s "table `classification` gates..." section).
  **Predict**: for any new SM flow that separates "create an intent to act" from "actually
  perform the act," verify each step's permission/identity requirements independently — don't
  assume they're symmetric just because they're the same nominal operation name.
- **A `SYSTEM.PARAMETER`-mutating test needs its own save/restore hooks scoped to the Story that
  actually mutates it, not the whole file.** Confirmed while responding to reviewer feedback on
  `access-administration-smoke.spec.ts`: only `US-02.03.01`'s `TC-1606` touches
  `SYSTEM.PARAMETER`, so its `beforeAll`/`afterEach` pair belongs inside that nested `describe`,
  not at the file's outer `describe` level where every other Story's tests would otherwise pay
  for a `GET`/`PUT` round-trip they never need.

## Don't re-litigate these

- **`record_lock` has no `company_id` column on either `INT` or `FIN` classification** — confirmed
  live with the full 4-column row shape, see
  [US-02.03.04/README.md](US-02.03.04/README.md). Don't design a new lock-related assertion around
  an expected `company_id` field; it structurally doesn't exist.
