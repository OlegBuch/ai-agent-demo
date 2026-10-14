# US-09.01.01 - Core Data Models, Storage Schemas, and Limit Configuration Registry

Confluence page 1688436738, v6, 2026-09-29. Actor: Core Banking System Administrator / Risk Configuration Officer. Module facts, finding ids (F#): see [INDEX](../INDEX.md). Full quoted BR/AC: `docs/test-cases/TB-3924/analysis.md`.

## TL;DR

Defines three tables (`LI.LIMIT.REFERENCE`, `LI.LIMIT`, `LI.LIMIT.SHARING.GROUP`) plus the COMPANY switch, with 8 rules and 9 ACs. This is the best-covered story: every rule except physical-delete prevention, immutable taxonomy and the AVAILABLE_MARKER message has a seeded Bruno error id or rule. Manual QA wrote 72 TCs (sheet "API Test Cases") and 22 open questions of her own (Q1-Q22).

## AC -> Bruno evidence -> workbook TCs

| AC | Requirement (short) | Bruno evidence | Workbook TCs | Status of the gap |
|---|---|---|---|---|
| 1 | COMPANY `GRP_CREDIT_LIMIT=TRUE` persisted | `COMPANY~MASTER`, no 4-eyes | SM-01, PR-01, PR-02, NR-40 | Which COMPANY governs a request - Q11 (QA) |
| 2 | Taxonomy 1000/1010 with parent links | `LI.LIMIT.REFERENCE~MASTER`, `PARENT_REFERENCE_ID`, cycle check | SM-02, PR-03, PR-04, NR-11..14 | Story says `SUB_PRODUCT_LEVEL`; no such field (QA Q1) |
| 3 | ADVISED > INTERNAL rejected | rule + `ADVISED_AMOUNT_CANNOT_EXCEED_INTERNAL_SANCTIONED_LIMIT` | NR-01 (a/b), PR-07 (=), NR-02, PR-09 | Message text differs (QA Q5) |
| 4 | Child > parent rejected | `PARENT_LIMIT_AMOUNT_CANNOT_BE_LESS_THAN_CHILD` | NR-03 (a/b), PR-10 (=), NR-04, NR-05, NR-06 | Parent-side check (reduce parent below child) undefined - QA Q13 |
| 5 | SINGLE_LIMIT + ALLOW_NETTING rejected | rule + `NETTING_CANNOT_BE_ENABLED_FOR_EXCLUSIVE_SINGLE_LIMITS` | NR-07, NR-08, NR-09, PR-12, PR-13 | none |
| 6 | AVAILABLE_MARKER false suspends, history kept | field default true | PR-14, PR-15, PR-16, NR-10 | "future transactions blocked" belongs to the engine (QA Q20); marker message not seeded (Q7) |
| 7 | Physical DELETE rejected | **no seeded error**; `REVERSE` works on the group | NR-19 (a/b/c), NR-20 | QA Q8: what counts as physical delete, expected status |
| 8 | Group with `ALLOWED_CUSTOMER` linked to master credit line | group table, `GROUP_CREDIT_LIMIT_PROCESSING_IS_DISABLED`, `CUSTOMER_IS_ALREADY_IN_ANOTHER_SHARING_GROUP` | SM-04, PR-23, PR-24, PR-28, NR-21..24 | Reads blocked when disabled? (QA Q10) |
| 9 | Missing parent limits auto-created with identical amounts | `proj-limit-hierarchy-auto-creation` (TB-3872), async | PR-17..PR-20, PR-28, NR-28..30 | Alt 5 says "sum", AC9 says "identical" (QA Q2); async vs atomic (QA Q3); amendment clears `PARENT_LIMIT_ID` (QA Q12) |

## Decisions from developer/BA chat (see INDEX)

- `LI.LIMIT.REFERENCE` is **FIN** (09-07), per lead company, not 1:1 with Product Factory - consistent with the workbook's 4-eyes flow (INPUT->UNAU, AUTH->LIVE) and with fixtures needing the right company context (QA Q11).
- `SINGLE_LIMIT` stays on the individual limit; the global parameter was dropped (09-07). Whether `SINGLE_LIMIT=FALSE + ALLOW_NETTING=FALSE` is valid is open; AC5 and BR "Netting and Exclusivity Invariant" only cover the TRUE+TRUE rejection.

## 2026-10-01 dev/QA review calls (workbook `...vFinal-V2.xlsx`)

Full per-TC decisions, discrepancies D1-D8 and impact: [calls-2026-10-01-digest.md](../video-calls-with-devs/discuss-US-09.01.01/calls-2026-10-01-digest.md). Reviewed SM-01..04, PR-01..28, NR-01..22; **NR-23..40 still to review**. Summary of what changed the picture:

| Open question | Answer from the calls |
|---|---|
| Q2 sum vs identical (Alt 5/AC9) | Identical amounts (PR-17); a later child does not change the parent (PR-19) |
| Q3 async vs atomic | Async confirmed (link appears "a moment later"); Kafka is internal, verify through the `LI.LIMIT` table |
| Q7 AVAILABLE_MARKER values | Boolean only; plain schema error |
| Q8 physical delete | DELETE works on NAU drafts only, impossible on LIV; REVERSE works; table-level delete case dropped (NR-20); status still undefined |
| Q9 immutable taxonomy | "Active" = **any** limit (active or inactive) referencing the node |
| Q10 reads when flag FALSE | Reads case dropped by devs (NR-22) but Story Alt 7 still says blocked - escalate; flag should be un-switchable once groups exist (not built, F4) |
| Q11 which COMPANY | **Lead company only**; branches follow (plugin pending, TB-3653) |
| Q13 parent below child | Rejected (NR-06), checks propagate to root, all-or-nothing; not in the Story |
| Q16 currencies | Mixed currencies allowed, compared after conversion; auto-created ancestors take the child's currency; rates must be seeded |
| Q5 messages / error ids | Not final; backfill after review; current build returns random-id messages; plugin status is **400** |
| Q12, Q1, Q4, Q14, Q15, Q17-Q22 | Not discussed (Q12 still open, see D4) |

New rules/cases not in the Story: Reducing Limit parent/child constraint (parent `true` -> child `false` rejected), Lead-company-only COMPANY settings, `NET_OUTSTANDING = true` precondition for shared+netting, group `TOTAL_OS` sum <= group `ADVISED_AMOUNT` on adding a customer, customers need own same-reference limits before joining a group, accounts only via contract (PF.CONTRACT.OPERATION).

## Story-text defects to raise (not in QA's list)

- Alt 2 applies the ceiling to `LI.LIMIT.REFERENCE`, which has no amounts (QA Q6 covers).
- "Event Emitted: None" vs the real `RECORD_CREATED` consumed by the hierarchy plugin (QA Q3 covers).
- Story rules lead with messages (e.g. "Advised amount cannot exceed the approved internal limit.") that differ from the seeded text; ask which is authoritative before any message assertion.

## Automation status

2026-10-01: module `api/limit/` created in proj-test-automation (branch group-3/TB-3924, uncommitted): `client/limit-api-client.ts`, `helpers/limit-setup-helper.ts`, `limit-api-paths.ts`, `limit-payload-builder.ts`, `limit-fixtures.ts` (worker-scoped CHECKER user for 4-eyes AUTH, DB cleanup of created rows), `api/types/limit.types.ts`, `api/utils/constants/limit.values.ts`, spec `api/limit/tests/limit-hierarchy-smoke.spec.ts` (registered in `singleton-record-specs.ts` because SM-01 toggles the shared COMPANY flag). Written: workbook sheet "API Test Cases" SM-01..SM-04, all ids generated, no `allureCaseId` (no Allure cases yet). SM-04 is written in the workbook's order (group with both customers at once) on the user's instruction; Bruno and US-09.01.04 create the group empty first (`SHARING_GROUP_MUST_BE_CREATED_WITHOUT_CUSTOMERS`), so expect it to fail until Manual QA/BA settle the order. **Settled 2026-10-01 (calls): empty group -> group limit -> a limit per customer -> add customers, as in Bruno; V2 workbook SM-04 already reflects it, the merged test does not (needs rework, not yet done).** Every deviation from the workbook (read-modify-write of COMPANY, generated ids and own root, dropped assertions) is tabulated in `docs/test-cases/TB-3924/analysis.md`, section "Automation notes". First VM run (vm-results-api-20261001-121256, `two.bankuat`, 3 tests): all failed on environment prerequisites - `GRP_CREDIT_LIMIT` is not in the COMPANY schema there, and `LI.LIMIT.REFERENCE` / `LI.LIMIT` are not in the table registry; details and next step in the same section.

Candidate next batch (table-level, endpoints exist, pending live status-code check): PR-01..16, NR-01..03, NR-07..14, NR-21..24, NR-31..35. Needs infra not available to the API suite: NR-38 (non-admin user context, QA Q17), NR-39 (batch atomicity, QA Q18), NR-19/20 (undefined delete semantics).

## 2026-10-07 — smoke runs on two.bankuat vs vFinal TC (analysis only, no code changed by this pass)

| Run | Result | Root cause | Owner |
|---|---|---|---|
| 153100 | 4/4 failed in 22 ms | Test-admin fixture: `SM.USER~INTERNAL` INPUT requires `BUSINESS_UNIT_ID` (LINKED_TABLE → BUSINESS.UNIT) since Bruno TB-3685 (`d49eb6af`, 2026-09-25); framework payload builder did not send it. Affects every module using `workerSuperAdmin`, not only Limit. | framework — fixed locally afterwards (uncommitted diff in user-profile builder/values/types) |
| 154623 | SM-01, SM-02 pass; SM-03, SM-04 fail | `CM.CUSTOMER` INPUT hook: 400 `ADDRESSES: Street address is mandatory for customers of this sector` (SECTOR 1001). Bruno `03 Seed the limits test customers` and vFinal "Test Data & Setup" both create customers WITHOUT ADDRESSES — deployed hook is stricter than both. Rule source not found in Bruno (backend plugin). | open: BA/Dev decision |

Automation vs vFinal TC:
- SM-04 code still creates the sharing group with both customers in one INPUT and creates no per-customer limits. vFinal: empty group → group limit `…1` → per-customer limits (same reference) → group INPUT with ALLOWED_CUSTOMER. Needs rework (matches dev call 2026-10-01, TB-4018).
- vFinal SM-04 cell still has an unfinished Russian note ("Создать лимиты к кастомерам") and a duplicate-looking limit id `9104.100`; ask Manual QA to clean before Allure import.
- SM-01..03 steps match code (company BNK vs resolveLimitCompanyCode; TC SM-01 sends the full company body incl. BANK_ID/BRANCH_ID, code re-sends the SEEn data — equivalent).
- Confluence Story page 1688436738 not re-read this pass (Haiku gather hit the org spend limit); only the stale Epic copy was read.

### 2026-10-07 (later) — fix applied for run 154623
- SM-03/SM-04 precondition customer now sends `ADDRESSES` (STREET/TOWN/COUNTRY from `RETAIL_CUSTOMER_DEFAULTS`) — workaround for the deployed CM.CUSTOMER hook; Bruno seed + vFinal Test Data still omit it, BA/Dev question stays open.
- SM-04 reordered to vFinal: empty group (INPUT+AUTH) → group limit → per-customer limits on the same reference → group INPUT with both members + AUTH → SEE. Matches Bruno `05 - Sharing Group` 01/02/07/08/09. Static checks (prettier/tsc/eslint) clean; not run live.

### 2026-10-08 — run 20261008-095817: SM-03/SM-04 now fail on LI.LIMIT~MASTER START_DATE
- Customer ADDRESSES fix worked (customers created). New 400: `required property 'START_DATE' not found` on `LI.LIMIT~MASTER` INPUT.
- Cause: Bruno TB-4123 (`f8c6062`, 2026-10-02) made `START_DATE` required on `LI.LIMIT~MASTER` (also added EXPIRY_DATE, LIMIT_BANDS, CURRENT_BAND). Bruno E2E uses `"START_DATE": "2026-01-01"`.
- vFinal TC predates TB-4123: zero `START_DATE` occurrences in all 6 sheets — every limit INPUT body in the workbook is missing a now-required field. Manual QA must update the bodies (SM-03, SM-04 and all PR/NR limit bodies).
- Fix: `LIMIT_VALUES.START_DATE = '2026-01-01'` sent by `buildCustomerLimitPayload`/`buildGroupLimitPayload`; `LimitData.START_DATE` required. Static checks clean, not run live.

### 2026-10-08 — limit-customer payload aligned to Bruno `CM.CUSTOMER~RETAIL.INPUT`
- Bruno required: SECTOR, CUSTOMER_STATUS, SHORT_NAME, NAME, ADDRESSES[STREET,TOWN,COUNTRY], NATIONALITY, RESIDENCE, LANGUAGE, GENDER, DATE_OF_BIRTH, LEGAL_DOCUMENTS[LEGAL_ID,LEGAL_DOC_NAME], BUSINESS_UNIT_ID. `buildLimitCustomerPayload` now sends all of them (BUSINESS_UNIT_ID = `CBS`, same value as the SM.USER fix).
- Framework gotcha (outside Limit, not changed): `BUSINESS_UNIT` was renamed `BUSINESS_UNIT_ID` in Bruno by TB-3616 (2026-09-22), but `dm-payload-builder.ts` (`buildRetailCustomerInputPayload`, reused by account) and `ap-e2e-setup-helper.ts` still send `BUSINESS_UNIT`.

### 2026-10-08 — run 20261008-100553: 4/4 smoke pass; coverage audit vs vFinal SM-01..04 (TC ids 5764-5767)
- Every explicit Expected Result of SM-01..SM-04 has a matching assertion in `limit-hierarchy-smoke.spec.ts` (statuses UNAU/LIVE after each INPUT/AUTH, all listed field values, history, no LI.LIMIT at taxonomy nodes, one limit for root-node customer).
- Not asserted (TC lists or implies it): "no ledger posting" (SM-02, SM-03); SM-02 REDUCING_LIMIT/TIME_BAND of the Sub-Product (TC lists them for the Product only); persisted START_DATE (absent from TC, sent because TB-4123 made it required).
- TC underspecified: SM-04 step "create customer limits" gives bodies but no AUTH; code does INPUT+AUTH. Tests carry no `allureCaseId` yet.

### 2026-10-08 — steps mirror the TC, Allure linked
- Smoke spec restructured step-for-step to vFinal: SM-01 4 steps, SM-02/03/04 5 steps each (check-status steps hold the assertions of the calls sent in earlier steps). SM-04 step 3 also carries the customer-limit and membership INPUT/AUTH because the TC step text was not updated for the new order.
- Linked: 5764→SM-01, 5765→SM-02, 5766→SM-03, 5767→SM-04 (`TC-N:` prefix + `allureCaseId`). 44 Limit cases exist in Allure (all Draft, Not Automated); the other 40 are regression/other stories, not automated yet. `Automation Status` in Allure not changed (needs explicit go-ahead).
