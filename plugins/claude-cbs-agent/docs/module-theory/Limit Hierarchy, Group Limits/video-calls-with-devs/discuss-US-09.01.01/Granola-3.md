# Spec Review (Table 4)

- Spec reformatted: technical details moved out, API-related items removed
- Technical implementation details belong in a separate tech spec, not here
- Second spec not yet started; first spec considered done
- File not in shared access yet: will be shared among testers first, then moved to Allure
  - Excel preferred for now: easier to generate and edit; Allure requires extra clicks

# Account-to-Limit Binding: Core Rules

- Binding happens via PF Contract Operation, not manually
  - Account and limit must both know about each other: action is bidirectional
  - Plugin will block external access after testing; projection opened temporarily for QA
- Only zero-balance (working balance = 0) accounts can be attached to limits
- Accounts added one at a time only: multiple accounts in one request = error
- On binding, only the accounts array may change: any other field change triggers immediate rejection
- Exclusive limit: only one account allowed; second request rejected
- Pool limit: multiple accounts allowed, added sequentially

# Test Cases: Decisions and Removals

- **Keep:**
  - SM01 zero-balance account at single limit (valid)
  - Positive regression duplicates: kept as regression cases for second spec
  - Blocked/closed account with zero balance: good edge case, likely missing validation
  - Parallel requests to exclusive limit: only first succeeds; mark parallel cases as pending atomicity
  - Account already attached to same limit: valid error case
  - Duplicate account in single request: test via open projection
  - Non-zero balance attachment (e.g. 400): valid negative case
  - Customer without limit record in group: results in 400 error
- **Remove:**
  - Cases involving account balance calculations (IM Account Balance): moved to aspects
  - “Single Limit Rating Impossible” and similar unclear cases
  - Role/permission-based cases: roles not defined, officer privileges unknown
  - Invalid HTTP method cases
  - USD limit with EUR account attachment: likely valid, remove negative case
  - Service unavailability (500): cannot simulate
  - DB failure case: cannot model
  - Netting balance recalculation case: zero-balance account has no netting impact, always returns 200

# Parallel Requests and Atomicity

- Parallel test cases flagged: not testable until atomicity is implemented
  - Atomicity work not yet started
  - Expected behavior: first request succeeds, second fails on version conflict, then retries
  - Risk: if both succeed, one account silently overwritten — this is a bug
- Cases involving same account sent to two different pool limits: also deferred to atomicity

# Group Limit and Customer Binding

- Customer can belong to only one group at a time
  - Validation may not be explicitly coded yet: Artur to add if missing
  - Attempting to add customer already in a group = 400 error
- Group Total OS updated by adding the new customer’s debt only
  - Existing customers’ debts already reflected; no double-counting
- Multi-currency: Total OS recalculated using National Bank rates
  - Same-currency additions: direct sum; cross-currency: converted amounts may differ
- Customer without a limit record cannot be added to a group: must have matching limit hierarchy
- Decimal precision: balance engine rejects non-standard fractional amounts; not our responsibility to validate upstream

# Reverse Operations and Next Steps

- Reverse operation flow clarified:
  - Record moves from Live to RNow (pre-authorization)
  - On AUS: deleted from Now, deleted from Live, inserted into Hist
  - Record does not return to Live or Now after AUS: ends in Hist only
- Reverse test case for group holding a customer: deferred, complex flow not fully resolved
- Meeting cut short: reverse cases to be continued in a follow-up session

# Next Steps

- **Share test case file link with Anastasiya** (Viktoryia)
- **Send test cases to Claude for code coverage review**
- **Add validation: customer can only belong to one group** (Artur)
- **Continue reverse operation test case review** (Viktoryia, Artur, Ryhor)