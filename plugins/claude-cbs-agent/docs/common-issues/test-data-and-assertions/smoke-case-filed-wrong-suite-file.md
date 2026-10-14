# Smoke-typed test case filed into a `*-regression.spec.ts` file

## The pattern/symptom

A manual QA test-case row carries a `Type` column (Smoke / Regression / ...). When automating a
new `US-XX.YY.ZZ` block, it's easy to drop every case from that Story into whichever spec file the
*ticket* happens to be worked under (often the regression file, since that's usually the larger,
active one) without re-checking each case's own `Type` value. Every module in this repo already has
a dedicated `<module>-smoke.spec.ts` alongside `<module>-regression.spec.ts` — a Smoke-typed case
landing in the regression file breaks the file-level convention silently; nothing fails, nothing
lints, it just means the smoke suite doesn't actually smoke-test that case, and the regression run
carries a test that shouldn't gate on it the same way.

## The rule

Before adding a new `test.describe('US-XX.YY.ZZ | ...')` block (or individual test) to a
`*-regression.spec.ts` file, check the `Type` column for *every* case in that batch, not just the
first one or the ticket's overall label. Split per-case: Smoke-typed cases go into the sibling
`*-smoke.spec.ts` file's own describe block, Regression-typed cases stay in the regression file —
even when both types share the same `US-XX.YY.ZZ` Story and would otherwise sit in one
`test.describe`. If a shared per-Story fixture (e.g. a dedicated CHECKER_USER grant for
`CURRENCY.ORDER`) is needed by tests split across both files, duplicate the minimal setup in each
file's own `beforeAll` rather than importing across spec files — the smoke file's outer
`test.describe` already has its own top-level `client`/`db`/`dbClient`, so only the case-specific
inner grant (e.g. `grantCheckerAccessToCurrencyOrder`) needs restating, not the shared DB
connection.

## The incident

2026-08-26, `US-01.13.04` (TB-1990, Currency Definition and Logic module): TC-01, TC-03, TC-05 were
pasted by the user without an explicit reminder of their `Type`, and all three were added as one
`test.describe` block in `currency-regression.spec.ts`. The user caught it after noticing TC-01's
own sheet row read `Type: Smoke`. On follow-up, TC-03 and TC-05 were confirmed `Regression`. Fix:
TC-01 moved into `currency-smoke.spec.ts` under its own `US-01.13.04` describe block (own
`checkerContext`/`checkerClient`/`producedRatesOrderIds`, reusing the smoke file's outer
`client`/`db`/`dbClient`); TC-03/TC-05 stayed in `currency-regression.spec.ts` with the original
shared `beforeAll`/`afterAll` (TC-05 still needs `checkerClient` there). See
`docs/module-theory/Currency Definition and Logic/` for the sibling Story files.
