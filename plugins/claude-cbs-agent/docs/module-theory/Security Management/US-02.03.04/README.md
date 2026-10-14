# US-02.03.04 | Lock & Intent Management

Story under module 02.03 "Access Administration" (Security Management component). Automated in
`api/security_management/tests/access-administration-smoke.spec.ts`, branch `group-1/TB-3196`.

## Data model — `record_lock`

A CBS "lock" is a real row in a `record_lock` table living inside the *target table's own*
Postgres schema (same location pattern as `LIV`/`NAU`/`HIS` — see
`docs/common-issues/fin-table-schema-naming.md` for the `INT`-vs-`FIN` schema-naming split).

**`record_lock` has exactly 4 columns, on either classification — no `company_id`:**

```json
{
  "record_id": "aqa_tc-lock-01_1788330911024_915",
  "user_id": "9bbb5ee5-b6c9-4c3e-a325-dd9919a25a59",
  "created_at": "2026-09-02T06:34:52.029Z",
  "expires_at": "2026-09-02T06:49:51.848Z"
}
```

Confirmed live on both an `INT` table (`qa_lock_admin_<workerGroupId>`, queried as
`"<tableId>"."record_lock"`) and a `FIN` table's company-scoped schema
(`<tableId>_<companyCode>.record_lock`) while building `TC-3029`/`TC-3057`/`TC-3059`. The three
manual cases' original premises (`TC-3029`: `company_id` populated with the caller's current
company on `INT`; `TC-3057`/`TC-3059`: `company_id` absent/null on `FIN`, implying it exists as a
column at all) don't hold — there's no ambient `company_id` to carry even implicitly, since the
table lives inside each table's own physical schema, not a shared/global location.

**Don't assert on `record_lock.company_id` in any classification** — assert only that a row
exists for the `record_id`, plus `user_id`/`created_at`/`expires_at` via the REST
`listRecordLocks` endpoint where those fields are actually surfaced.

## Endpoints

- **Create Record Intent**: `POST .../records/:recordId/operations/:operation/intent` → `201`.
- **Refresh Record Intent** (heartbeat, prolongs `expiresAt`): `PUT`, same path → `200` /
  `404 LOCK_EXPIRED` / `403 RECORD_LOCKED`.
- **Release Record Intent** (self-service "cancel/release my own intent"): `DELETE`, same path →
  `204 No Content`. Distinct from the ADMIN-only **Force Release Record Lock**
  (`DELETE .../tables/:tableId/record-locks/:recordId`, requires `proj-user-context` header,
  `404 LOCK_NOT_FOUND` if no active lock) — same "release a lock" concept, different actor/scope.
- All three require a `{TABLE: 'TABLE_REGISTRY', FUNCTION: 'TABLE_REGISTRY_WRITE'}` grant in
  addition to the data table's own permission — see
  `docs/common-issues/table-registry-permission-for-intents.md`.
- Auto-generated record ID (`recordId: "NEW"`) requires the target table to carry an
  `IDENTIFIER_GENERATION` policy (`policies: [{type: 'IDENTIFIER_GENERATION', config: {rules:
  [{condition, result: {isEnforced, prefix, maxLength, strategy}}]}}]`) — sending `"NEW"` without
  one fails `500: "No identifier-generation policy configured; cannot generate a record id"`.
  `api/system_core/helpers/auto-id-helper.ts` already has an extensive helper suite for this
  (`buildIntSequentialAutoIdRule`, `createAutoIdTablePrecondition`,
  `inputAutoIdRecordIntentWithReadinessRetry`, `requireCreatedRecordId`) — reuse it rather than
  hand-rolling the policy payload. Its readiness-retry helper also tolerates a transient
  `503 "no healthy upstream"` right after table creation (fixed 2026-09-02, previously only
  retried `404`/`Unknown tableId`) — a genuine `500` misconfiguration is still treated as
  immediately fatal, don't broaden that further without a live signal it's needed.

## Four-eyes on AUTH — intent-holding vs. execution are not symmetric

Creating an AUTH **intent** (lock) has no maker/checker restriction — the same identity that
INPUT-ed a record can also successfully hold an AUTH intent on it (confirmed while building
`TC-3059`).

**Executing** the AUTH operation itself is different: `POST .../records/operations/AUTH` rejects
the call if the executor is the same user who INPUT-ed the record:

```
403 Forbidden
{"detail":"Authorisation denied: Inputter and Authoriser must be different","properties":{"error":"FORBIDDEN"},"status":403,"title":"Forbidden","type":null}
```

Any test that INPUTs a record and then executes AUTH on it (as opposed to just holding an AUTH
intent) needs two distinct identities. See also
`docs/common-issues/keycloak-and-auth/auth-operation-required.md`'s "table `classification` gates..." section for
the related, but separate, `INT`-tables-can't-require-AUTH-at-all constraint.

## Test coverage (smoke, `access-administration-smoke.spec.ts`)

| Case | Title | Status |
|---|---|---|
| TC-3073 | Closing the tab does NOT remove intent — lock persists, different user rejected, owner can reopen | Automated |
| TC-3029 | Make intent on INPUT (INT table) — `record_lock` row created for the caller | Automated |
| TC-3057 | Make intent on INPUT (FIN table) — `record_lock` row created for the caller | Automated |
| TC-3059 | Make intent on AUTH (FIN table) — `record_lock` row created for the caller | Automated |
| TC-3064 | Manual record ID — entered `recordId` honored, not overwritten with "NEW" | Automated |
| TC-3066 | A locked record rejects a different user's intent — no new `record_lock` row created | Automated |
| TC-3070 | A successful AUTH execution removes the intent — `user_b` can now lock the record | Automated |
| TC-3072 | Releasing the intent removes the lock — `user_b` can now lock the record | Automated |
| TC-3071 | Cancelling via breadcrumbs releases the intent — `user_b` can now lock the record | Automated |
| TC-3069 | A successful INPUT execution removes the intent — `user_b` can now lock the record | Automated |
| TC-3062 | Auto-generated record ID ("NEW") — backend generates a real `recordId` | Automated |
| TC-3067 | An action on the Projection prolongs the lock's `expiresAt` | Automated |
| TC-3068 | Idle until `expiresAt` auto-removes the lock | **Not automated — open, see below** |

## Open item — `TC-3068`, record-lock TTL does not follow a live `AUTOLOG_TIME_MINS` change

Attempted to shrink the real ~15-minute wait by reducing `AUTOLOG_TIME_MINS` from `15` to `1` via
`SYSTEM.PARAMETER` INPUT immediately before creating the lock. The `SYSTEM.PARAMETER` change was
confirmed immediately (`SEE` returned `"AUTOLOG_TIME_MINS":"1"`), but the very next `Create Record
Intent` call (~19s later) still returned an `expiresAt` ~15 minutes out, not ~1 minute:

- `AUTOLOG_TIME_MINS` INPUT confirmed at `05:46:44.588Z`
- `Create Record Intent` at `05:46:44.868Z` → `expiresAt: "2026-09-02T06:01:25.70Z"` (≈14m41s later)

**Not yet resolved**: either the record-lock service caches `AUTOLOG_TIME_MINS` on some interval
instead of reading it live, or lock TTL isn't actually driven by `AUTOLOG_TIME_MINS` at all (the
15-minute match seen elsewhere could be two independent defaults coinciding). No env var or
alternate config for a short lock TTL has been identified. Until this is confirmed, `TC-3068` can
only be exercised by waiting out the real default TTL, which doesn't fit the smoke suite's timeout
budget as currently designed.

**Developer's answer (to be filled in once received):**
