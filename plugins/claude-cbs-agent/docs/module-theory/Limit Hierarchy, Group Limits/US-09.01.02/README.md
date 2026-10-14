# US-09.01.02 - Hierarchical Limit Control: Structural Validation and Utilization Cascading

Confluence page 1688010806, v6, 2026-09-30 (child of container 1688338434). Actor: Risk Systems Architect / Risk Administrator. Finding ids (F#): see [INDEX](../INDEX.md). Full quoted BR/AC: `docs/test-cases/TB-3924/analysis.md`.

## TL;DR

Auto-instantiation of missing parents, a strict pairwise ceiling on `INTERNAL` and `ADVISED`, and `TOTAL_OS` roll-up / roll-down with a non-negative cap. The structural half (AC1, AC2, AC4) maps to existing projections and plugins; the **utilization half (AC3, AC5) has no Bruno endpoint** - the workbook drives it through `POST {{limits-url}}/limits/evaluate` and `/limits/release`, which exist only as the contract on the older alternate page 1688698881. Workbook: 69 TCs.

## Name clash

Two Confluence pages carry the id "US-09.01.02": this one (Hierarchical Limit Control, current, 09-30) and "Core Limits Engine and Pre-Flight Evaluation API" (1688698881, v4, 09-18, other parent). The current page's preconditions say the "Limits Engine evaluation service (under US-09.01.02)" must be active. Which page owns the engine is Q-E1 in analysis.md.

## AC -> Bruno evidence -> workbook TCs

| AC | Requirement (short) | Bruno evidence | Workbook TCs | Gap |
|---|---|---|---|---|
| 1 | Sub-product 2010 of $30k for a customer with no limits auto-creates 2000 and 1000 ($30k), links 2010->2000->1000 | auto-creation plugin, async | SM-01, PR-01..08, PR-30 | Story step 4: auto-created parents `SINGLE_LIMIT=TRUE`; QA Q3 asks why. AC labels 2000 and 1000 both "Product Limit" |
| 2 | Child $60k under sub-product $50k rejected, message names ceiling | `PARENT_LIMIT_AMOUNT_CANNOT_BE_LESS_THAN_CHILD` | SM-04, PR-09..12, PR-15, PR-36 | Story text vs seeded text; ADVISED-side check (PR-11) not clearly implemented |
| 3 | Utilization $15k then release $5k leaves $10k on every tier | **none** - needs `evaluate`/`release` (or a `~INTERNAL` TOTAL_OS write + recalculation plugin TB-3983, unverified) | SM-03, PR-23..30, NR-16..23 | F2 |
| 4 | Lowering a parent below its TOTAL_OS rejected | rule `UTILIZATION_CANNOT_EXCEED_INTERNAL_SANCTIONED_LIMIT` (TOTAL_OS <= INTERNAL) | PR-17..22, NR-17 | Message with amounts not seeded (QA Q5); "reduce parent below child" is a separate undefined check (QA Q24) |
| 5 | $30k on Credit Cards: Credit Cards +30k, Product +30k, sibling Personal Loans 0 | **none** (as AC3) | SM-02, PR-24..26, PR-35 | F2 |

## Story rules without an AC

Non-negative safeguard ("caps TOTAL_OS at 0" - Bruno has `GROUP_LIMIT_TOTAL_OS_CANNOT_BE_NEGATIVE` for groups, which rejects rather than caps): TCs PR-27..29, NR-18 assume capping; **Cascading Release Roll-down**, **Parent Auto-Instantiation** partial chains, ambiguous-parent abort (`MORE_THAN_ONE_LIMIT_AT_THE_SAME_HIERARCHY_NODE`) are covered by QA beyond the ACs.

## Risks QA already flagged that matter for automation

Fault injection and atomicity (NR-22, NR-23), concurrency (NR-17), idempotency of release without a transaction id (NR-21), batch order (NR-29), single-transaction claim vs async plugin (Story step 7). These are likely **not automatable in the API suite** without test hooks - to be confirmed with Dev (Q-E2).

## Automation status

None. Table-level candidates (endpoints exist): PR-01..PR-22, PR-31..PR-34, NR-01..NR-15, NR-24..NR-28. Blocked on F2: SM-02, SM-03, PR-23..PR-30, PR-35, NR-16, NR-18..NR-21, NR-23.

## 2026-10-08 Research Flow - Confluence drift and smoke verdict (5768, 5769)

**TL;DR:** Confluence page 1688010806 is now v11 (edited 2026-10-08 08:23 UTC), this README was written against v6. The Story now has 4 AC and describes only auto-generation of parent limits; utilisation/release (old AC3/AC5) and the amount ceiling (old AC2) are gone from it. The ceiling rule is still built (Bruno `PARENT_LIMIT_AMOUNT_CANNOT_BE_LESS_THAN_CHILD`) and covered by US-09.01.01 AC4. Every negative outcome on the page is `***TBD***`.

| Item | Current fact | Source |
|---|---|---|
| AC1 | missing ancestors up to the root are auto-created; copies LIMIT_CURRENCY, INTERNAL_AMOUNT, ADVISED_AMOUNT, CUSTOMER_ID, GROUP_ID from the target; SINGLE_LIMIT `true`, ALLOW_NETTING `false`, PARENT_LIMIT_ID set | Confluence v11 step 5.1-5.8 |
| AC2 | incomplete taxonomy tree: missing levels created with PARENT_REFERENCE_ID | v11 Alt 1 |
| AC3 | all ancestors already active: nothing created | v11 Alt 2 |
| AC4 | more than one candidate parent at a level: process halted, error `***TBD***` (Bruno: `MORE_THAN_ONE_LIMIT_AT_THE_SAME_HIERARCHY_NODE`) | v11 Alt 3 |
| Event | `RECORD_CREATED`; no `LIMIT.HIERARCHY.UPDATED` anywhere in Bruno origin/main (grep empty) | v11 post-conditions; Bruno |
| Name clash | page 1688698881 "Core Limits Engine and Pre-Flight Evaluation API" (older, v0.1/v4) still carries the same US id | Confluence |

Smoke cases (Allure, all Draft, attachments 725/726 hold the request bodies):

| Case | Verdict | Why |
|---|---|---|
| 5768 SM-01 auto-create chain 2010 -> 2000 -> 1000 | automatable steps 1-5; step 6 (event `LIMIT.HIERARCHY.UPDATED`) has no source | event name absent in Bruno and in v11 (`RECORD_CREATED`); 10-01 call: verify through the LI.LIMIT table, not Kafka |
| 5769 SM-04 child 60k under parent 50k rejected | automatable; error id seeded in Bruno, message text not final (400, Q4); TC title carries "TBD" | Bruno `07 - Seed Error Records`; calls 10-01 Q5 |
