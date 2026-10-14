# `PARTIALLY_ACCESS_USER`'s standing permission grant — resolved (TB-3587)

## The pattern/symptom

TB-3587's hardcoded-user migration left `system_core/tests/user-groups-api-regression.spec.ts`
TC-15/16/100/131 (`USERS_DATA.PARTIALLY_ACCESS_USER`) genuinely blocked, not just deferred: these
tests exercise Data Access Rule (DAR) ALLOW/DENY precedence and field-level grants gating a user's
own self-`SEE` on their own `SM.USER` record. `PARTIALLY_ACCESS_USER`'s baseline table permissions
were environment-seeded state — declared nowhere in code (`user-credentials.values.ts` only had
`ID`/`CREDENTIALS`) — so it was unknown whether self-`SEE` is gated purely by the DAR rule under
test (a disposable zero/default-permission user would work identically) or also requires an
undeclared standing table-level grant (swapping in a minimal-permission disposable user would make
these tests fail for the wrong reason — a false negative).

## The rule

Confirmed (2026-09-07, permission data supplied directly by the user/BA): `PARTIALLY_ACCESS_USER`'s
standing grant is membership in a real environment user group (`SM-USER-GROUP-USER-MANAGEMENT`)
whose profile shows `ST_PROJECTION: ["SM.USER~INTERNAL"]` — i.e. a group that grants standing
access to the `SM.USER` table, matching this same file's own established `asUserRestrictedToSmUser`
precedent (`[{ TABLE: 'SM.USER', FUNCTION: 'ALL' }]`, already used by TC-10/48 for other
SM.USER-scoped restricted-access tests). Self-`SEE` does **not** bypass the table-access gate: a
disposable user needs that same standing `SM.USER` permission before a DAR rule can be evaluated at
all — no need to reference the real environment group by name/id, since `createTestUser`/
`createTestUserSession`'s `permissions` option builds an equivalent throwaway group per test.

## The incident

`api/system_core/tests/user-groups-api-regression.spec.ts` TC-15/16/100/131 migrated 2026-09-07:
each now creates its own disposable user (`createTestUser`/`createTestUserSession` with
`permissions: [{ TABLE: 'SM.USER', FUNCTION: 'ALL' }]`, label `'restricted'`) instead of using the
shared `USERS_DATA.PARTIALLY_ACCESS_USER`, and deletes it in `finally` instead of restoring the
shared profile. This retired the last `USERS_DATA` entry in the whole migration:
`user-credentials.values.ts`'s `PARTIALLY_ACCESS_USER` field and its `.env.example` line were
deleted, and `user-group-helper.ts`'s `restoreUserAccessToAllow`/`restorePartialAccessUserProfile`
(each had exactly these 4 tests as their only callers) were deleted as dead code along with their
now-unused `buildInternalUserProfilePayload`/`USERS_DATA` imports. Statically verified clean
(`tsc --noEmit`, `eslint`, `prettier --check`); not yet live-verified (QA env/VPN unreachable the
whole TB-3587 session — the TB-3468/TB-3587 hardcoded-user migration history is in `docs/chat-history/`). This closes the second, and last, of TB-3587's two genuinely open items —
the first (`security_management`'s `DISPO_OFFICER_FIRST/SECOND/THIRD`) is unrelated and still open.

**Follow-up, same day:** a final repo-wide `grep -rn "USERS_DATA"` (not just `USERS_DATA\.`, to
also catch a bare import with no dot-access) confirmed the whole `USERS_DATA` export in
`user-credentials.values.ts` had zero consumers left anywhere in the repo — every other field
(`MAKER_USER`/`CHECKER_USER`/`TR_*`/`DM_CHECKER_*`/`CM_CHECKER_*`/`PAYMENT_ORDER_*`/
`DDI_CHECKER_USER`/`USER_WITHOUT_PERM`) had already been migrated off in earlier TB-3587 sessions,
just never re-checked at the file level. Deleted the whole file (no importers of the module path
itself either) and the now-fully-dead matching `.env.example` entries
(`USER_WITHOUT_PERM_ID`, `DM_CHECKER_*`, `CM_CHECKER_*`, `DDI_CHECKER_*`) — each var confirmed to
have zero direct `process.env.<NAME>` references anywhere before removal (several others, e.g.
`SUCCESSFUL_USER_ID`/`MAKER_USER_ID`/`PAYMENT_ORDER_*`, were already absent from `.env.example`,
consistent with `../infra-and-environment/env-example-stale-vs-user-credentials-values.md`).
This is the true end state: TB-3587's whole `USERS_DATA` hardcoded-user pattern no longer exists in
the codebase at all, only the unrelated `DISPO_OFFICER` item remains open.
