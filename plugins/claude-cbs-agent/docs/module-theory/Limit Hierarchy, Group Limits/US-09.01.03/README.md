# US-09.01.03 - Account Linkage Modes and Intelligent Balance Netting

Confluence page 1689387033, v6, 2026-09-30. Actor: Core Banking System Risk Manager. Finding ids (F#): see [INDEX](../INDEX.md). Full quoted BR/AC: `docs/test-cases/TB-3924/analysis.md`.

## TL;DR

Account linkage is specified well (2 ACs, 4 rules) and built (TB-3904, TB-3969, TB-4014); **netting is only in the title and user story** - no rule, formula or AC defines it. Workbook: 53 TCs, 9 marked Blocked for exactly that reason (PR-12..18, PR-20, NR-28).

## AC -> Bruno evidence -> workbook TCs

| AC | Requirement (short) | Bruno evidence | Workbook TCs | Gap |
|---|---|---|---|---|
| 1 | Link account via `PF.CONTRACT.OPERATION`: SINGLE_LIMIT FALSE or no other account; account free; balance 0; registers link; returns availability profile | `proj-pf-contract-operation-limit-linkage-plugin` (AUTH/POST, order 2) reads `LIMIT_ID` from `PF.CONTRACT.LIMIT.CONDITION~MAIN`; `LI.LIMIT~INTERNAL` `ACCOUNTS`; `ATTACHED_ACCOUNT_BALANCE_MUST_BE_ZERO`, `ACCOUNT_BELONGS_TO_ANOTHER_CUSTOMER` | SM-01..03, SM-05 (E2E via PF), PR-01..08, NR-04..06 | "returns the updated availability profile" has no field spec (QA Q6); response is "HTTP 200 with mapping" |
| 2 | Second account on exclusive limit -> HTTP 400 `SINGLE_LIMIT_EXCLUSIVITY_VIOLATION`, existing link unmodified | `SINGLE_LIMIT_CAN_CARRY_ONLY_ONE_ACCOUNT` | SM-04, PR-07, PR-09, NR-07 (E2E) | **Code mismatch** (F3): TCs follow the Story and flag it as QA Q1 |

## Rules without an AC / drift

- "Account must not be linked to any limit": no seeded error id; QA assumes 'account already linked' (Q3), tests NR-01/02, PR-11.
- Duplicated sentence in the Story table ("Cross-customer account linkage on individual limits is blocked" repeated in the zero-balance rule) and a precondition that lists US-09.01.03 as its own dependency.
- Built-only rules: one account change at a time, no removal (`ACCOUNTS_CANNOT_BE_REMOVED`), no accounts at creation, accounts only on customer limits, only the account list may change on the engine write (`ONLY_THE_ACCOUNT_LIST_CAN_CHANGE_HERE`). QA covers NR-08, NR-13..17.

## Netting (blocked)

Sheet "09.01.03", TCs PR-12..18, PR-20, NR-28 assume net exposure = debits - credits of linked accounts floored at 0 and `ALLOW_NETTING=FALSE` = gross. Not in any Confluence page read here. The BA's 09-01 chat (see INDEX "Developer / BA chat decisions") supports the shape: net debt of the linked accounts is written to `TOTAL_OS`, `LIMIT_AVAIL_AMT = INTERNAL_AMOUNT - TOTAL_OS`, Available Funds `= WORKING_BALANCE + LIMIT_AVAIL_AMT - LOCKED_AMOUNT`, and a withdrawal that would push net exposure above `INTERNAL_AMOUNT` is rejected even from a positive account (example +500 / -1500 / limit 1000 -> `TOTAL_OS` 1000, available 0, withdrawal of 100 blocked). Still undefined: floor at 0 when net is positive (PR-14), currency mixing, unlinked accounts (PR-16), whether netting stays in this milestone (devs offered to cut it), and how the client is told a balance is used as cover. `TOTAL_OS` is "updated when WORKING_BALANCE is updated", i.e. tests need real balance movements (EP-06), not just limit writes. Needs the BA to put it into the Story (Q-N1) and a balance seeding path.

## Availability profile and modes (chat 09-08, stale in the build)

AC1 says the call "returns the updated availability profile". Agreed shape in chat: `{"LIMIT_AVAILABLE_AMOUNT":[{"ACCOUNT_ID":"...","AVAILABLE_AMOUNT":n}]}` - one entry for `SINGLE_LIMIT=TRUE`, equal values for `SINGLE_LIMIT=FALSE + ALLOW_NETTING=TRUE`, different per account for both FALSE. TB-4014 (09-22) removed `LIMIT_AVAILABLE_AMOUNT` from `LI.LIMIT`, so where the array is now returned is unknown (Q-S6); the workbook PR-01 asserts only the plain `recordId/data/audit` body of `LI.LIMIT~INTERNAL`.

## Review call 2026-10-05 (details: [digest](../video-calls-with-devs/discuss-US-09.01.01/calls-2026-10-05-digest.md))

Link only via `PF.CONTRACT.OPERATION` + `PF.CONTRACT.LIMIT.CONDITION` (bidirectional); `LI.LIMIT~INTERNAL` is open to QA temporarily, a rejecting plugin will seal it. WB must be 0; one account per request; only `ACCOUNTS` may change else 400; limit created with accounts / accounts changed on a live limit -> 400. Exclusive: one account; pool: unlimited. Deleted: roles, wrong method, 500/DB failures, USD-limit/EUR-account negative, all netting/`AM.ACCOUNT.BALANCE` cases (spec 3). Kept/pending: parallel cases (atomicity not started), duplicate account (needs open projection), closed/blocked zero-balance account (not validated - likely bug), NAU contract re-bind. Account removal has no mechanism. Netting TCs are therefore a spec-3 matter, not a dev blocker of this story.

## Automation status

None. Table-level candidates: SM-01..04, PR-01..08, PR-19, NR-01..02, NR-04..06, NR-08..17, NR-19..20, NR-27. Needs fault/availability hooks (NR-25 balance service down, NR-26 DB failure) or unusual auth contexts (NR-23 token variants) - likely outside the API suite. E2E SM-05/NR-07 require a working contract operation with a LIMIT condition.

## 2026-10-08 Research Flow - Confluence drift and smoke verdict (5770, 5773-5776)

**TL;DR:** page 1689387033 is now v9 (2026-10-08 08:35 UTC), this README cites v6. v9 has 2 generic AC and six validation rules, every negative message is `***TBD***`; the specific code `SINGLE_LIMIT_EXCLUSIVITY_VIOLATION` that TC 5775 quotes is no longer in the Story. Bruno seeds `SINGLE_LIMIT_CAN_CARRY_ONLY_ONE_ACCOUNT` instead and no Bruno request exercises it. No Bruno flow attaches an account validly; every `ACCOUNTS` write in the E2E folder is a rejection.

| Validation rule (v9) | Bruno error id (built) |
|---|---|
| account exists and active | `ACCOUNT_DOES_NOT_EXIST` |
| limit exists and active | `LIMIT_TO_AMEND_DOES_NOT_EXIST` |
| SINGLE_LIMIT false OR no account linked yet | `SINGLE_LIMIT_CAN_CARRY_ONLY_ONE_ACCOUNT` (TC says `SINGLE_LIMIT_EXCLUSIVITY_VIOLATION`) |
| account belongs to the limit's customer | `ACCOUNT_BELONGS_TO_ANOTHER_CUSTOMER` |
| account not linked to another limit | none seeded (Q3) |
| WORKING_BALANCE not null / zero | `ACCOUNT_BALANCE_DOES_NOT_EXIST`, `ATTACHED_ACCOUNT_BALANCE_MUST_BE_ZERO` |

Smoke cases (attachments 727, 731-734 hold the bodies; 5770/5773/5774/5775 write `LI.LIMIT~INTERNAL`, 5776 uses `PF.CONTRACT.OPERATION~MAIN`):

| Case | Verdict | Why |
|---|---|---|
| 5770, 5773, 5774 attach to pooled/exclusive limit | automatable on the `~INTERNAL` path, shelf life limited | 10-05 call: `~INTERNAL` open to QA temporarily, a plugin will seal it; binding will only be via contract operation. Needs an account with a zero `AM.ACCOUNT.BALANCE` record (Bruno account seed creates no balance) |
| 5775 second account on exclusive | automate as written; expected red on the error code | TC code is in no current source (Story v9 `TBD`, Bruno other id) - escalate, do not rewrite |
| 5776 E2E contract with LIMIT condition | BLOCKED | no Bruno request sets LIMIT_ID on a contract or creates a product LIMIT condition body; `PF.CONTRACT.LIMIT.CONDITION` projection doc: LIMIT_ID "not required because nothing supplies it yet"; 10-05 call: devs unsure how account and contract are created together |

## 2026-10-08 bankuat smoke runs (13 limit cases: 8 passed, 5 failed, twice)

**TL;DR:** the 5 reds are backend/TC facts, not test defects, after the ACCOUNTS-only payload bug (5774/5775) was fixed in the 2nd run. Evidence read from the bankuat Kafka UI (`kafka.bankuat.local`, cluster `proj-kafka`, read-only).

| Case | Failure | Verified cause |
|---|---|---|
| 5768 (US-09.01.02) | parent link empty 300 s after AUTH | DLQ `events.two.LI.LIMIT.two.LI.LIMIT.two.LI.LIMIT.dlq` holds the event of both runs: `proj-limit-hierarchy-auto-creation-plugin failed ... 400 UTILIZATION_IS_REQUIRED_ON_AN_ENGINE_WRITE (targetFieldId ACCOUNTS)` - the plugin cannot write the ancestors; backend defect, escalate |
| 5770, 5773, 5774 | steps 1-4 green, step 5: 0 `RECORD_UPDATED` in 90 s | topic `two.LI.LIMIT` carries only `RECORD_CREATED` (68 messages, one per limit at seqNo 1); the ACCOUNTS update (seqNo 2) publishes nothing. Bruno seeding disables it on purpose: `09 - Enable Event Emission/01 Enable LI.LIMIT event emission.yml` l.20-29 has RECORD_CREATED enabled (rule space=LIV) and `"RECORD_UPDATED": {"enabled": false}`. TC says RECORD_UPDATED (Q5) - TC contradicts the seeded config; BA/dev decide which wins |
| 5775 | 400 `SINGLE_LIMIT_CAN_CARRY_ONLY_ONE_ACCOUNT`, TC wants `SINGLE_LIMIT_EXCLUSIVITY_VIOLATION` | TC itself marks it (`ADD CODE` in title, Q1 implementation difference); steps 4-5 not reached |

Test-side fix applied the same day: the first attach used an ACCOUNTS-only payload that wiped the stored limit (see INDEX pattern); 5774/5775 now send the full body.

### 2026-10-08 owner rule: payloads follow the real contract, assertions follow the TC

Rule (owner, 2026-10-08): the TC can be wrong about a request **payload** (fields, body shape) - then the body follows Bruno / the live contract; but every **check** the TC states (error code, message, event, step) is asserted exactly as written, and a mismatch is reported with cause and owner, never adapted. TC bodies are in Allure attachments (REST `/api/testcase/attachment/<id>/content`: 725, 726, 727, 731-733).

| Case | Body (real contract) | Checks (as in TC) | If red - owner |
|---|---|---|---|
| 5768 | sub-product body carries `TOTAL_OS: 0` (Bruno 04-Hierarchy/11; TC body 725 lacks it) | event `LIMIT.HIERARCHY.UPDATED` | plugin still in DLQ = backend plugin; event absent = Story v11 / Bruno name `RECORD_CREATED`, BA decides |
| 5775 | full limit body with both accounts (TC body 733 is ACCOUNTS-only, and an ACCOUNTS-only INPUT wipes the record on bankuat) | code `SINGLE_LIMIT_EXCLUSIVITY_VIOLATION` + exclusivity message | Bruno seeds `SINGLE_LIMIT_CAN_CARRY_ONLY_ONE_ACCOUNT` - BA/devs (TC Q1) |
| 5770, 5773, 5774 | full bodies (727, 731, 732); precondition switches `RECORD_UPDATED` emission on for LI.LIMIT, afterEach restores | one `RECORD_UPDATED` | still red = backend does not emit; green = env seeding disabled it (Bruno 09/01) |
