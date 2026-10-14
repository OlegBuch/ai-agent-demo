Module: Dynamic Data Dictionary / Field Registry (US-01.02.01)
Confluence: `US-01.02.01 | Define Field Metadata`
(innowise-group/CBSA space is the BA-authored master; the bank-proj/TB copy can lag behind it — check
the master when the two disagree).
Last updated: 2026-09-10

This file is the entry point for anything touching the Dynamic Data Dictionary / Field Registry
module. Read it first, before re-deriving facts from Bruno/Jira/Confluence.

## What this module does

The Field Registry lets a user define reusable field metadata (Title, generated Field ID, and a
`Field Type` that gates which type-specific config block — Enum values, Virtual Table, Join,
Information/computed — is shown and required) via a "Create Field" modal in the CBS UI
(`ui/field-registry/`).

## Field Type — the permitted-values list (source of truth)

**19 values, per US-01.02.01 AC-5 (confirmed 2026-09-10)** — the UI itself also states this exact
count ("Select one of 19 supported field types" help text):

`ANY`, `ASCII_PRINTABLE`, `ALPHANUMERIC`, `MULTILANGUAGE_TEXT`, `SWIFT`, `NUMERIC`, `BOOLEAN`,
`AMOUNT`, `RATE`, `DATE`, `TIME`, `DATE_TIME`, `PERIOD`, `FREQUENCY`, `LINKED_TABLE`, `ENUM`,
`VIRTUAL_TABLE`, `INFORMATION`, `JOIN`.

AC-6 requires the system to reject saving a field whose `Field Type` isn't in this list — so this
list is meant to be exhaustive and enforced, not just illustrative.

See [US-01.02.01/README.md](US-01.02.01/README.md) for the `ARRAY` discrepancy this resolved.

## Patterns & Predictive Rules

- **A type/enum-like constant shared across `api/` and `ui/` test layers (`FIELD_CONSTS.X_TYPE` in
  `constants-keeper.ts`) can drift ahead of the live product** — it's a plain object literal, not
  generated from any contract, so nothing stops someone adding a value the product doesn't actually
  expose yet (or no longer exposes). Before trusting a shared constant's full value set as a test
  oracle (a "must contain exactly N items" / "must equal this list" assertion), check it against the
  Confluence spec's own enumerated list, not just against what the live UI/API currently returns —
  live behavior confirms the constant is *wrong*, but only the spec says which side (constant vs.
  live behavior) is actually correct. Confirmed 2026-09-10: `X_TYPE` had 20 entries (`ARRAY`
  included), only 19 are UI-visible, and the Confluence spec explicitly enumerates only the same 19
  — the constant was the stale side, not the environment.
- **A multi-select AntD dropdown filled via the shared `antd-virtualized-dropdown.ts` helper needs an
  explicit close after the last selection** — see
  `docs/common-issues/test-data-and-assertions/antd-multi-select-dropdown-stays-open-after-selection.md`.
  Before writing a new component that fills a multi-select (loop of `selectComboboxOption()` calls
  on the same trigger), predict it will need this and add it up front, rather than discovering the
  intercepted-click failure live.
