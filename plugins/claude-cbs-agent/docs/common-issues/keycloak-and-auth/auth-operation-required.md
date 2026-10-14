# `authOperationRequired` — check before assuming an `AUTH` call is needed (or copying one)

Applies to: any CBS Table/Projection, any module. First written up while automating Currency
(US-01.13.02) and Idempotency work; re-confirmed while building `currency-helper.ts`'s
`grantCheckerAccessToCurrencyOrder` (2026-08-18) — see that incident below.

## The rule

Not every projection has a NAU (unauthorized-draft) stage. A projection's Bruno "Create X
projection" example carries `"authOperationRequired": true|false`:

- `true` (e.g. `CURRENCY.ORDER~MASTER`): `INPUT` stages a NAU draft; a separate `AUTH` call by a
  **different** user (4-eyes) is required to commit it to LIV. Calling `SEE` on a record staged
  this way returns 404 until it's authorized.
- `false` (e.g. `SM.USER.GROUP~MAIN`, `SM.USER~INTERNAL`, `CURRENCY~MASTER`,
  `CURRENCY.MARKET~MASTER`, `CURRENCY.RATES~MASTER`): `INPUT` commits straight to LIV. There is no
  NAU stage at all, and calling `AUTH` on such a record returns `404 "NAU record not found"` — not
  a timing/propagation issue, a structurally invalid call.

**Before writing or copying an `INPUT`-then-`AUTH` sequence for a table/projection your test
doesn't already exercise via a passing, status-asserted case, grep `proj-bruno-api` for that exact
projection's `authOperationRequired` value first.** Existing helper code that performs an AUTH call
without asserting its response status is not evidence the call is needed or correct.

## The incident (2026-08-18)

`table-registry-helper.ts`'s `setupFinTableWithFourEyes` (and copies of its shape) call `AUTH` on
`SM.USER.GROUP~MAIN`/`SM.USER~INTERNAL` right after `INPUT`, without ever asserting that AUTH
call's response status. Both projections are `authOperationRequired: false` (confirmed in
`proj-bruno-api`) — `INPUT` alone already commits to LIV, so that `AUTH` call is a no-op `404 "NAU
record not found"` that had silently gone unnoticed in every caller of this shape (e.g.
`audit-fields-smoke.spec.ts`'s `runOpAndLog`, which only logs the status, never asserts it).

This surfaced again, independently, while automating Currency's
`grantCheckerAccessToCurrencyOrder` (see
`module-theory/Currency Definition and Logic/US-01.13.02/README.md`'s "AUTH / 4-eyes pattern"):
copying the same INPUT+AUTH shape onto `SM.USER.GROUP~MAIN`/`SM.USER~INTERNAL` surfaced the same
404 the moment the AUTH call's status was actually checked — three live round-trips were spent
chasing a "propagation delay" theory before checking the flag directly settled it in seconds.

**Don't copy the AUTH call for these two projections into new setup helpers — `INPUT` alone is the
whole operation.** For a table that genuinely does need it (`authOperationRequired: true`, e.g.
`CURRENCY.ORDER~MASTER`), the extra requirement is that the *authorizing* user must be different
from the *inputting* user, and must hold an actual table-level permission grant that has had time
to propagate — see the Currency story file above for the full working recipe.

## A table's `classification` gates whether `authOperationRequired` can be set at all (2026-09-01)

Distinct from the per-projection flag above: whether a projection is even *allowed* to require
AUTH depends on the backing table's `classification` (`TEST_CONSTS.CLASSIFICATION`), not just a
free choice at projection-creation time.

- `classification: 'INT'` — **cannot** have `authOperationRequired: true` on any projection.
  Attempting it (e.g. via `setAuthRequired`, `api/system_core/helpers/table-registry-helper.ts`)
  fails with `400`: `"Projection '<id>' requires AUTH, but table '<tableId>' is classified as INT
  and cannot require AUTH operations."`
- `classification: 'FIN'` — supports `authOperationRequired: true`.

**Practical rule:** if a test needs `setAuthRequired(client, projectionId, true)` to actually
work, the table backing that projection must be created with `classification: 'FIN'`, not the
default `INT` (`buildCreateTablePayload` defaults to `INT`).

Confirmed live building `TC-3077` (`api/security_management/tests/access-administration-smoke.spec.ts`,
US-02.03.04 | Lock & Intent Management). Also re-confirmed the *executing*-user-must-differ rule
above with the exact live error text while building `TC-3070` in the same suite:

```
403 Forbidden
{"detail":"Authorisation denied: Inputter and Authoriser must be different","properties":{"error":"FORBIDDEN"},"status":403,"title":"Forbidden","type":null}
```

— note this fires on *executing* the AUTH operation
(`POST .../records/operations/AUTH`), not on *creating an AUTH intent/lock*: the same identity
that INPUT-ed a record can successfully hold an AUTH intent on it; only the actual AUTH execution
call enforces the different-user check.
