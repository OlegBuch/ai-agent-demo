# TB-2960 currency-smoke DIFF_AMT band-count fix

**Date/time:** 2026-08-26 11:52 · **Branch:** group-3/TB-2960 · **Ticket(s):** TB-2960, TB-2980

## Discussed
- User reported `currency-smoke.spec.ts`'s `allureCaseId(3094)` test ("A direct cross-rate
  resolves exactly as stored for BID, ASK and MID, with no auto-spread derivation", US-01.13.03)
  failing with a 400 on `CURRENCY.ORDER~MASTER` INPUT: `RATE_BANDS may hold only one band because
  market 1 does not allow amount-based differentiation (DIFF_AMT is false)`.
- Ran systematic-debugging: confirmed root cause via `proj-bruno-api` (`origin/main`) rather than
  guessing — `INPUT - Reject Amount Ranges Against Market Without DIFF_AMT.yml` and `INPUT - Multi
  Band.yml` both document/test that `proj-currency-order-validation-plugin`'s band gate counts
  **array rows**, not unique `AMT_FROM` values: a market with `DIFF_AMT: false` accepts exactly one
  `RATE_BANDS` row, even if extra rows share the same `AMT_FROM` and differ only by `RATE_TYPE`.
- Confirmed via Jira (`getJiraIssue`) that **TB-2980** ("CURRENCY.ORDER: allow RATE_BANDS amount
  ranges only when the market enables DIFF_AMT") is **Closed as of 2026-08-24** — it had been
  logged "In progress" in `US-01.13.02/README.md`'s ticket snapshot as of 2026-08-19. This explains
  why the test broke now: the gate wasn't enforced (or wasn't merged to `qa.proj.local`) when the
  test was originally written, and started firing once TB-2980 shipped.
- This is not a contract mismatch requiring escalation to BA/Dev — the test's own scenario (BID/
  ASK/MID resolve exactly as stored, no spread derivation) doesn't depend on the market's DIFF_AMT
  setting at all; it was only using the wrong (default) market as its precondition.

## Implemented
- `api/system_core/tests/currency-smoke.spec.ts`: fixed the `allureCaseId(3094)` test — added a
  PRECONDITION step ensuring market `'10'` (`DIFF_AMT: true`) exists, set `CCY_MKT: diffAmtMarketId`
  in the staged order, and switched the `resolveRate` call's `market` param from
  `CCY_ORDER_TEST_MARKET_ID` to `diffAmtMarketId`. Removed the now-unused `CCY_ORDER_TEST_MARKET_ID`
  import. This mirrors the exact pattern already used by the sibling US-01.13.02 smoke test
  (`allureCaseId(2405)`) and four spots in `currency-regression.spec.ts` — no new convention
  introduced.
- Verified statically only (per this repo's convention — user runs tests manually): `npx tsc
  --noEmit -p .` clean, `npx eslint api/system_core/tests/currency-smoke.spec.ts` clean, `npx
  prettier --write/--check` clean. Not executed live.
- `docs/module-theory/Currency Definition and Logic/INDEX.md`: added a new Patterns & Predictive
  Rules entry documenting the DIFF_AMT band-count gate's exact semantics (counts rows, not unique
  `AMT_FROM`) and the `diffAmtMarketId = '10'` convention as the standard workaround.
- `docs/module-theory/Currency Definition and Logic/US-01.13.02/README.md`: updated the Jira
  ticket snapshot table's TB-2980 row from "In progress" to "Closed 2026-08-24", with a note on
  what it broke and the fix.

## Learned
- TB-2980 is fully shipped and enforced on `qa.proj.local` as of this session (2026-08-26) — any
  future Currency test/case staging more than one `RATE_BANDS` row, for any reason, must use a
  `DIFF_AMT: true` market (`'10'` by convention), never the default market `'1'`.
- This is a durable module fact, already routed into `docs/module-theory/Currency Definition and
  Logic/INDEX.md` and `US-01.13.02/README.md` above (not just recorded here).

## Open Items / Follow-ups
- None — fix applied, statically verified, docs updated. User will run the test live to confirm.

## References
- Jira: TB-2980 (https://bank-proj.atlassian.net/browse/TB-2980)
- `proj-bruno-api` `origin/main`: `collections/Tables/System Core/CURRENCY.ORDER/proj-table-template/
  Operations/INPUT Rejections/INPUT - Reject Amount Ranges Against Market Without DIFF_AMT.yml`,
  `.../INPUT/INPUT - Multi Band.yml`
