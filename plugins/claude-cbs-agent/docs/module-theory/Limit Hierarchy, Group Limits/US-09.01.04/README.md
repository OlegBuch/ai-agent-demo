# US-09.01.04 - Group Limits for Corporate Holdings and Nested Sub-Groups

Confluence page 1689845761, v5, 2026-09-30. Actor: Corporate Risk Administrator. Finding ids (F#): see [INDEX](../INDEX.md). Full quoted BR/AC: `docs/test-cases/TB-3924/analysis.md`.

## TL;DR

Group lifecycle in the Story (empty group -> group limit with `CUSTOMER_ID=NULL`, `SINGLE_LIMIT=FALSE` -> add customers, recalculating `TOTAL_OS_grp`) matches the build (TB-4018). Gaps: the title promises **nested sub-groups** but the body has none; the "four-tier restriction principle" needs `/limits/evaluate` (F2); three error ids named by the ACs are not seeded; the GRP_CREDIT_LIMIT TRUE->FALSE block was not found in Bruno. Workbook: 65 TCs.

## AC -> Bruno evidence -> workbook TCs

| AC | Requirement (short) | Bruno evidence | Workbook TCs | Gap |
|---|---|---|---|---|
| 1 | With switch TRUE and verified corporate customers: create empty group, group limit, add customers; auto-create hierarchy to Product; check `TOTAL_OS_grp + members <= ADVISED_grp`; recalc `TOTAL_OS_grp` | `SHARING_GROUP_MUST_BE_CREATED_WITHOUT_CUSTOMERS`, `SHARING_GROUP_HAS_NO_LIMIT_CONFIGURED`, `TRANSFERRED_UTILIZATION_CANNOT_EXCEED_GROUP_ADVISED_AMOUNT`, `GROUP_LIMIT_TOTAL_OS_CANNOT_BE_NEGATIVE`, hierarchy plugin | SM-01..03, PR-01..09, PR-23 (member removal, assumed), NR-18..19, NR-36 | Capacity-exceeded error id undefined (QA assumes `GROUP_CAPACITY_EXCEEDED`, her Q10); corporate-sector check "CONFIRM" still on the page |
| 2 | Switch FALSE: any group evaluation/creation -> HTTP 400 | `GROUP_CREDIT_LIMIT_PROCESSING_IS_DISABLED` (Story BR says message "Group credit processing is disabled globally."; QA TCs cite `GROUP_PROCESSING_DISABLED`) | NR-01..05 | Id mismatch (F3, QA Q1); evaluation case needs engine |
| 3 | Active non-expired group limits -> setting switch FALSE blocked, 400 `ACTIVE_GROUPS_EXIST` | **not found** (F4) | NR-06..08, PR-13, PR-14 | "non-expired" depends on an expiry field QA says is undefined (Q5); ADM_EXTENSION_DAYS window |
| 4 | Customer inactive/suspended/not found -> 400 `INVALID_GROUP_COUNTERPARTY` with the customer id | **not found** (F5) | NR-09..13 | Domain check source (EP-03.01) not visible in Bruno; QA Q3 (non-corporate) |

## Story rules without an AC

Restriction Principle (min across Individual Sub-Product, Individual Product, Group Sub-Product, Group Product during `/limits/evaluate`): TCs SM-04, SM-05, PR-15..22, NR-04, NR-37 - **blocked by F2**. Onboarding member with existing debt (`TOTAL_OS_grp_new = old + member`): PR-05..08 (QA Q11: only new members counted). "Acyclic Group Graph Enforcement" says "nested group structure must be built based on taxonomy tree" - unclear, no nesting fields exist; group-limit tree is the taxonomy tree (`PARENT_LIMIT_ID` within the same `GROUP_ID`, NR-30). Cross-guarantee / Collateral Management precondition conflicts with "ALLOW_NETTING strictly FALSE" for group limits.

## Review call 2026-10-05 (details: [digest](../video-calls-with-devs/discuss-US-09.01.01/calls-2026-10-05-digest.md))

`TOTAL_OS_grp += only the new member's debt`; accept if `<= ADVISED` (equality ok), no rounding; debt counted per matching reference level; customer must own the group's full reference hierarchy else 400; one group per customer (checked at LIVE, NAU drafts may overlap; **possibly not built yet**, Artur adds); Closed/Suspended customer accepted today (**bug case to add**); individuals allowed (no restriction, BA to drop it from the Story); non-existent/mixed list rejects the whole request; first error only; `GRP_CREDIT_LIMIT` may be switched FALSE while no group is LIVE; parallel AUTH waits for atomicity; reverse of a group with members unresolved.

## Automation status

None. Table-level candidates: SM-01..03, PR-01..14, PR-23, NR-01..03, NR-05, NR-09..16, NR-20..36 (several pending error-id decisions). Blocked on the engine contract: SM-04, SM-05, PR-15..22, NR-04, NR-37.

## 2026-10-08 Research Flow - Confluence drift and smoke verdict (5786-5788)

**TL;DR:** page 1689845761 is now v8 (2026-10-08 08:40 UTC), this README cites v5. v8 has 3 AC: link + recalculate TOTAL_OS, switch FALSE halts, validation failure halts. The old AC3 (`ACTIVE_GROUPS_EXIST`) and AC4 (`INVALID_GROUP_COUNTERPARTY`) are no longer on the page; negative messages are `***TBD***`. Formula in Story: new group TOTAL_OS = old + sum of the added customers' TOTAL_OS. Bruno only writes group TOTAL_OS directly (flow 05/07) and no request asserts it after adding members; the transfer is built (TB-4018, error `TRANSFERRED_UTILIZATION_CANNOT_EXCEED_GROUP_ADVISED_AMOUNT`).

| Case | Verdict | Why |
|---|---|---|
| 5786 two legal entities (5,000 + 3,000) -> group TOTAL_OS 8,000 | automatable | attachment 735: INPUT on existing group with ALLOWED_CUSTOMER then AUTH; individual TOTAL_OS needs `LI.LIMIT~INTERNAL` write (only writer of TOTAL_OS) |
| 5787 group 10,000 + customer 5,000 -> 15,000 | automatable | 10-05 call: only the new member's debt is added |
| 5788 zero-debt customer, group stays 10,000 | automatable | same |

Open: SECTOR 2001 corporate in the preconditions (call: individuals are allowed, restriction removed; the tests keep SECTOR 1001 - a 2001 variant for 5786/5787 was tried and reverted on 2026-10-09); company BNK in the TC vs MOCK on the test environment; customer must carry a limit with the same LIMIT_REFERENCE_ID as the group (10-05 call), otherwise 400 with an unseeded id.
