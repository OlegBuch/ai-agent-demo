# TC-1506 skipped — "no Password Policy configured" is unreachable via the API

**Ticket:** #1506 — Verify a default Password Policy is used when no Password Policy is
configured in the CBS (traceability: Alt 2, BR-3).

**Scenario:** with `SYSTEM.PARAMETER~SYSTEM` holding no Password Policy fields at all, trigger a
Password Reset and confirm the generated password satisfies the system default Policy (AC1:
`PWD_MIN_LENGTH=12`, `PWD_COMPLEXITY={upperCase:1, lowerCase:1, digits:1, specialChars:1}`) even
though nothing was explicitly configured.

## Why this can't be automated as written

This suite's `US-02.03.01` tests already established (TC-1645) that `PWD_COMPLEXITY` cannot be
omitted from a `SYSTEM.PARAMETER` INPUT — the live environment rejects it with 400
`"required property 'PWD_COMPLEXITY' not found"`. `PWD_MIN_LENGTH` behaves the same way once a
Policy has ever been set (TC-1608 only demonstrates *resetting to the default* on omission, which
requires a Policy to already exist to reset from — see TC-1643's "delete-fields-resets-to-default"
pattern).

There is also no DELETE operation for `SYSTEM.PARAMETER` in
`api/system_core/helpers/system-parametrization-helper.ts` — `TEST_CONSTS.OPERATION.DELETE` is
only used for `COMPANY` records, and `COMPANY` itself is documented as "structurally immutable
from deletion routines post-initialization" (`constants-keeper.ts`). By analogy, the same is
likely true for `SYSTEM.PARAMETER` as a system singleton, though this hasn't been directly tested.

Combined, this means: once `SYSTEM.PARAMETER` has ever had a Policy configured (true for every
environment this suite runs against — it's a live, shared system record, not something recreated
per test run), there is no API-reachable path back to a genuine "never configured" state. Omitting
the fields on INPUT is rejected outright, and there's no DELETE to reach a blank slate.

## Disposition

Skipped per explicit user decision (2026-08-28): document the infeasibility rather than force a
test against a state the API cannot produce, or misrepresent "currently-default values" as "never
configured" (which would just duplicate TC-1486, not test this ticket's actual premise).

## What would be needed to restore this

- Confirmation from manual QA / dev on whether `SYSTEM.PARAMETER` truly has no reachable
  "unconfigured" state via the API, or whether a fresh/uninitialized environment (before any
  `SYSTEM.PARAMETER` INPUT has ever been submitted) is the only way to observe this — in which
  case the test would need to run against a freshly provisioned environment, not this suite's
  shared live one.
- Alternatively, if a DELETE operation for `SYSTEM.PARAMETER` (or a subset of its fields) is ever
  added on the CBS side, this test could be rewritten using that operation instead.
