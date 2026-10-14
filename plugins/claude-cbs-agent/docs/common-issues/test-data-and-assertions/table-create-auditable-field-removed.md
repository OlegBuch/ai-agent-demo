# `POST /table-registry/api/v1/tables` no longer accepts `auditable` — never send it on create

Applies to: any test that creates a table via `buildCreateTablePayload` /
`table-registry-helper.ts` (`registerTableIdempotently`, `createTableAndWait`,
`createTablesAndWait`), any module. First hit while triaging Idempotency (Smoke/Regression) and
Customization (Smoke/Regression) failures on `group-3/TB-2960` (2026-08-28); fully resolved same
day once confirmed against `proj-bruno-api`.

## The pattern/symptom

Table creation fails with:

```
400 Bad Request — {"detail":"unknown field 'auditable'","instance":"/table-registry/api/v1/tables","status":400,"title":"Bad Request"}
```

thrown from `table-registry-helper.ts`'s `registerTableIdempotently` (status !== 201 and not an
"already exists" case). Because table creation is a shared setup step, this cascades: the first
`test.step`/table-creation call in a spec throws, and every subsequent test in the same file that
depends on that table is skipped rather than failing individually — the report shows one `failed`
and a long tail of `skipped`.

## The rule

`auditable` is **not part of the create-table request contract at all anymore** — not optional,
gone. Confirmed two independent ways:

1. Dev chat (Artur Fonichkin, 2026-07-24): *"из всех запросов в Бруно POST
   {{table-registry-url}}/api/v1/tables, убираем поле 'auditable', на БЕ было убрано давно,
   передавать его смысла нет."*
2. `proj-bruno-api` `origin/main` (fetched fresh 2026-08-28, local `main` was stale —
   `ad447439`→`44d44205`): `collections/Table Registry/Tables/folder.yml`'s Table Schema table for
   `POST /api/v1/tables` has no `auditable` row at all, and a real request example (`Date and
   Holiday Management/DATES/proj-table-registry/Create DATES table.yml`) has no `auditable` key in
   its JSON body. The schema doc states auditability is now derived from `type`: *"`type`... Also
   determines auditability — `USR` tables are auditable ..., `SYS` tables are not"*.
3. **Live verification against qa.proj.local (2026-08-28)** — a throwaway probe script created a
   fresh table group, then sent `POST /api/v1/tables` for all 6 combinations of
   `type: USR|SYS` × `{omit auditable, auditable: true, auditable: false}`:

   | `type` | `auditable` in request | Result |
   |---|---|---|
   | `USR` | omitted | `201` created |
   | `USR` | `true` | `400 unknown field 'auditable'` |
   | `USR` | `false` | `400 unknown field 'auditable'` |
   | `SYS` | omitted | `201` created |
   | `SYS` | `true` | `400 unknown field 'auditable'` |
   | `SYS` | `false` | `400 unknown field 'auditable'` |

   Rejection is unconditional — independent of table `type` and independent of the value sent; there
   is no combination the backend accepts the field in. The create response and a subsequent public
   `GET /api/v1/tables/{id}` on the two successfully-created tables carry no `auditable` key at all.
   The internal `GET /table-registry-groups/{id}/tables` (`GroupTablesResponse` /
   `getTablesConfigsByGroup`, backs `GroupTableConfig`) **does** return it, server-derived exactly as
   documented: the created `USR` table came back `"auditable": true`, the `SYS` table
   `"auditable": false`. All probe resources (2 tables, 1 group) were deleted after — confirmed
   `204` on every delete, environment left clean.

**Auditability is now a derived, read-only property of a Table (`type: USR` → auditable,
`type: SYS` → not), never a client-settable field on create.** It still appears in one place: the
`Internal` bootstrap-config response (`GroupTableConfig` in `api/types/table-registry.types.ts`,
used by `GroupTablesResponse` — `collections/Table Registry/Internal/folder.yml` explicitly says
*"Derived by the registry from the Table's `type`"*). That response-side field was left untouched —
only the create-**request** contract changed.

**Never include `auditable` in any table-creation payload.** `CreateTablePayload`
(`api/types/table-registry.types.ts`) no longer declares the field at all — passing it in an
override object literal is now a TypeScript excess-property error, which is the intended guard
against reintroducing it.

## The incident (2026-08-28)

`idempotency-smoke.spec.ts`, `idempotency-regression.spec.ts`, `customization-smoke.spec.ts`,
`customization-regression.spec.ts` all call `buildCreateTablePayload(...)` without overriding
`auditable`, so they inherited the builder's old `auditable: false` default and got the 400 above on
their very first table-creation step.

First pass only removed the default and made the type field optional (to avoid touching unrelated
call sites live-fire); on review, confirmed via Bruno (see above) that the field is fully gone from
the contract, not merely defaulted — so the type was tightened to omit it entirely, and every
remaining call site that still passed it explicitly was fixed in the same pass, since all of them
were passing a value that already matched what the backend now derives from `type` (`auditable:
true`/`table.type === 'USR'` alongside `type: 'USR'`), so stripping the field changes nothing about
what gets created:

- `test-data/payload-builder.ts` — `buildCreateTablePayload`'s `auditable: false` default line
  removed.
- `api/types/table-registry.types.ts` — `CreateTablePayload.auditable` removed entirely (not left
  optional).
- `api/security_management/tests/override-dispo-regression.spec.ts:839`,
  `api/system_core/tests/table-registry-regression.spec.ts:855`,
  `api/system_core/helpers/validation-engine-helper.ts:73` — explicit `auditable: true/false` lines
  removed.
- `api/integration_chapter/tests/audit-fields-integration.spec.ts:112`,
  `api/system_core/tests/audit-fields-regression.spec.ts:97,138`,
  `api/system_core/tests/audit-fields-smoke.spec.ts:154` — explicit `auditable: table.type ===
  'USR'` / `auditable: true` lines removed; these tests assert on the *resulting* audit-column
  behavior of the created table, not on the payload field itself, so removing a now-rejected field
  that duplicated the backend's own derivation doesn't change what they're proving.

`tsc --noEmit` and `eslint` both clean across every touched file afterward.
