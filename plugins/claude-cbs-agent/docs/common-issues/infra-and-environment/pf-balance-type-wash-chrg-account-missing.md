# `PF.BALANCE.TYPE` missing `WASH-ACCOUNT`/`CHRG-ACCOUNT` on bankstg — charge/cross-currency transfers can't post

## The pattern/symptom

A transfer that involves a charge or a cross-currency leg authorises the `TF.FUNDS.TRANSFER~AUTH`
INPUT step fine, but the Posting Engine rejects it with `422` at AUTH time:
`Failed to update the account balances in Balance Management for the posting request:
BALANCE_BUCKETS[N].BALANCE_TYPE - target table='PF.BALANCE.TYPE' does not contain record with
ID='WASH-ACCOUNT' in LIV space` (and/or `'CHRG-ACCOUNT'`). Because the checker's AUTH attempt fails
with this wrapped-as-400 error, `authoriseWithFirstAllowedClient` falls through to retry as the
`main` user, which then correctly gets `403 Authorisation denied: Inputter and Authoriser must be
different` (expected 4-eyes enforcement, not a bug) — so the visible top-level error is "failed for
every user" with two stacked causes; the real blocker is the first one.

## The rule

`WASH-ACCOUNT` and `CHRG-ACCOUNT` are reference-data rows expected in `PF.BALANCE.TYPE` (`LIV`
space) on bankstg but aren't provisioned there. Any test whose flow requires a wash or charge account
bucket — not just the two below — will hit this until the rows are seeded; this is a data-provisioning
gap, not a test or framework bug. Same shape as the already-known
the Currency Definition and Logic QA-env gap (`docs/module-theory/Currency Definition and Logic/US-01.13.02/README.md`) for
`BASE_RANK`/`PRECIOUS_METAL` on `CURRENCY~MASTER` — bankstg's reference-data set lags behind what
newer Stories assume is seeded.

## The incident (2026-09-16, bankstg e2e run, both `vm-results-e2e-20260916-093211` and `-110804`)

`transfer-integration.spec.ts`:
- `US-08.02.01 Transfer Execution & Authorisation › TC-05: Simple transfer with a charge` (line 227)
  — missing both `WASH-ACCOUNT` and `CHRG-ACCOUNT`.
- `US-08.02.01 Transfer Execution & Authorisation › TC-06: Cross-currency transfer: rate from
  Currency Logic` (line 375) — missing `WASH-ACCOUNT` only.

Reproduced identically in two same-day runs — not transient. Needs the reference rows seeded in
`PF.BALANCE.TYPE` on bankstg (owner TBD — raise with the environment/data-provisioning owner rather
than working around it in test code).
