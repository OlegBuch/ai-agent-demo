# Record Intent endpoints require a separate `TABLE_REGISTRY` permission, not just the data table's own

Applies to: any restricted (non-admin) user calling Create/Refresh/Release Record Intent
(`POST`/`PUT`/`DELETE .../records/:recordId/operations/:operation/intent`), any module. First
written up while building `US-02.03.04 | Lock & Intent Management` (`TC-3074`,
`access-administration-smoke.spec.ts`), 2026-09-01.

## The pattern

A restricted user granted only `{TABLE: '<tableId>', FUNCTION: 'INPUT'}` (or the equivalent
per-table data permission for another operation) is **not** enough to call the intent endpoints.
The call fails with:

```
403: "User does not have access to table: TABLE_REGISTRY"
```

— note the denial names the reserved system table `TABLE_REGISTRY`, not the actual data table
being locked, which is easy to misread as a config error on the wrong table.

## The rule

The intent endpoints internally look up table metadata from the Table Registry service using the
caller's own permissions, so the user's `SM.USER.GROUP` also needs a direct `TABLE_REGISTRY`
grant, in addition to whatever data-table permission the operation itself needs.
`TABLE_REGISTRY_READ` alone is not enough either — creating an intent writes a lock record, so a
read-only grant fails next with `403: "User does not have function: TABLE_REGISTRY.TABLE_REGISTRY_WRITE"`.
The working grant to add alongside the data-table permission:

```
{ TABLE: 'TABLE_REGISTRY', FUNCTION: 'TABLE_REGISTRY_WRITE' }
```

(`TABLE_REGISTRY_READ`/`TABLE_REGISTRY_WRITE` are seeded FUNCTION values — see
`proj-bruno-api/collections/Tables/SMS/00 - Seeding/04 - Create Fields/POST create FUNCTION.yml`.)

The same `403 ... TABLE_REGISTRY` message also gates other registry-level operations for
under-permissioned users (e.g. `DELETE table-registry/api/v1/tables/:id`, see
`api/system_core/tests/customization-regression.spec.ts`) — it's a general "needs registry
access" signal, not specific to intents. Any new restricted-user test that exercises a
registry-adjacent endpoint for the first time should check whether it needs this grant before
assuming the data-table permission alone is sufficient.

## The incident (2026-09-01)

Building `TC-3074`'s restricted-user precondition (a user with only `{TABLE: tableId, FUNCTION:
'INPUT'}` should still be able to create an INPUT intent) initially failed with the
`TABLE_REGISTRY` denial above even though the test's premise was that `INPUT` permission on the
target table should be sufficient — resolved by adding the `TABLE_REGISTRY_WRITE` grant to the
test's group-permission setup.
