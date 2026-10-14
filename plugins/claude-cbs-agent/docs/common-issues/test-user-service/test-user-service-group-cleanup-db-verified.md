# `test-user-service`'s ad-hoc `SM.USER.GROUP~MAIN` cleanup is DB-verified to actually delete, not just archive

## The pattern/symptom

A colleague building a separate stage-environment permission-granting script reported that
creating a fresh `SM.USER.GROUP~MAIN` record to hold a permission grant "leaves a permanent
record — can't be deleted," alongside a second, unrelated problem in the same script (AUTH modeled
incorrectly, so maker/checker collapsed to the same user by default). This raised the question of
whether `test-user-service.ts`'s own ad-hoc group creation (`createTestUser({permissions})`) has the
same limitation — i.e. whether every disposable test user's auto-created permission group is
actually removed by `deleteTestUser`, or just quietly orphaned as a permanent LIVE (or archived
HIS) record.

## The rule

Don't take "we call a DELETE operation" as proof a CBS record is actually gone — verify against the
DB directly (`sm_user_group.liv`/`.nau`/`.his`), the same way a live-only-verification stance treats
any other unconfirmed assumption. When investigating an orphan-record concern in `test-user-service`
(or any other disposable-resource cleanup), query all three spaces for the resource's known naming
prefix rather than trusting the API call's 200/204 response alone — a table can accept a DELETE
call and still not truly purge the row (move it to HIS, or leave a soft-deleted flag), which would
still count as "not cleaned up" for practical purposes (record count growth, audit clutter).

## The incident

2026-09-08 (TB-3587 wrap-up). Queried `"sm_user_group".liv`/`.nau`/`.his` directly for every record
matching our own ad-hoc group naming convention (`AQA.USER.GROUP%`, from `createTestUser`'s
`generateCustomId('AQA.USER.GROUP')`) right after a full live run of `override-dispo-smoke.spec.ts`
that had created and torn down 3 disposable users (`dispo-major`/`dispo-superior`/
`dispo-under-test`), each with its own ad-hoc permission group:

```
LIV records matching AQA.USER.GROUP%: 0
NAU records matching AQA.USER.GROUP%: 0
HIS records matching AQA.USER.GROUP% (most recent 10): 0
```

Zero in all three spaces — `deleteTestUser`'s `performRecordOperation(USER_GROUP_VALUES.PROJECTION.MAIN,
'DELETE', {recordId: userGroupId})` (`test-user-service.ts:168-170`) genuinely purges the record, not
just soft-deletes/archives it. This is the same code path fixed for the original group-leak bug (see
`../keycloak-and-auth/keycloak-shared-credential-lockout-and-ci-log-masking.md`'s point 3/4, 2026-09-04) — this session
re-confirmed via direct DB query (not just re-reading the code) that the fix still holds and that
`SM.USER.GROUP~MAIN`'s `DELETE` operation is a real, complete removal on this environment (`proj-qa`).

**Not the same problem as the colleague's script** — his script builds a *new* LIVE group as part of
a stage permission-granting tool with, by his own account, an incorrect AUTH model and no working
delete path; `test-user-service` always pairs group creation with a tracked `scaffolding.userGroupId`
and a real, DB-confirmed `DELETE` call in `deleteTestUser`. The two are unrelated beyond sharing the
same target table.

**Open, not verified this session:** whether the same holds on `bankstg` (stage) — this check ran
only against `proj-qa`. `getCurrentEnvName() === 'bankstg'` already changes DB SSL behavior
(`buildRawClient`), so a `bankstg`-specific DB check would need its own connection, not assumed
identical to QA.

**Update 2026-09-29:** on two.bankuat the same `DELETE` returns `400 DELETE operation cannot be performed` for every user group, so this QA-only confirmation does not generalize — see [`../db-and-concurrency/user-groups-never-swept.md`](../db-and-concurrency/user-groups-never-swept.md).
