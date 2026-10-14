# `LIV`/`NAU`/`HIS` physical schema location differs by table `classification`

Applies to: any direct Postgres verification (`api/utils/helpers/db-helper.ts`, `createDbClient()`)
against a table's `liv`/`nau`/`his` rows, any module. First written up while building
`US-02.03.04 | Lock & Intent Management` (`TC-3067`, `access-administration-smoke.spec.ts`),
2026-09-01.

## The pattern

`docs/project-spec/business-rules.md` documents what `LIV`/`NAU`/`HIS` *mean*; this entry is about
*where they physically live* in Postgres, which depends on the table's `classification`:

- **`INT` tables**: each table gets its own dynamically created Postgres schema, named after the
  table itself — query as `"<tableId>"."liv"` / `"<tableId>"."nau"` / `"<tableId>"."his"` (quoted
  identifier; see `TC-045` in `table-registry-regression.spec.ts`).
- **`FIN` tables**: `LIV`/`NAU`/`HIS` (and `record_lock`) live in one **shared**
  per-table-per-company schema instead — `<tableId>_<companyCode lowercased>` (e.g.
  `qa_lock_auth_6344_mock`), **unquoted**, no per-table dynamic schema. Query as
  `<tableId>_<companyCode>.liv` etc. See `fin.targetSchema` in `audit-fields-regression.spec.ts`
  (`` `${finDb}_${TARGET_COMPANY.toLowerCase()}` ``).

## The rule

Using the wrong pattern for a table's classification fails immediately with
`relation "<x>" does not exist` — not a permissions error, not a timing issue. Before writing a
direct-DB assertion against a new table, check that table's `classification` first and pick the
matching schema-naming pattern; don't assume the `INT` per-table-dynamic-schema shape is
universal just because it's the more common case in most existing specs.

## The incident (2026-09-01/02)

Building `TC-3067`/`TC-3029`/`TC-3057`/`TC-3059` for `US-02.03.04 | Lock & Intent Management`
required querying `record_lock` against both an `INT` table (`qa_lock_admin_<workerGroupId>`,
queried as `"<tableId>"."record_lock"`) and a `FIN` table (`qa_lock_auth_<workerGroupId>`, queried
as `<tableId>_<companyCode>.record_lock`) in the same test file — getting the pattern backwards
for either produces the `relation does not exist` failure immediately, with no other symptom to
go on.
