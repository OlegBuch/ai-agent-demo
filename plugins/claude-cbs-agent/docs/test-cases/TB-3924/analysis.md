Status: Draft
Related Ticket: TB-3924
Related Epic: TB-58
Source Project: Jira TB (bank-proj.atlassian.net) / Confluence TB space (container "US-09.01 | User stories", page 1688338434)
Owner: Full Stack AQA (input for Manual QA and BA; Manual QA's own TCs are in the workbook next to the module docs)

# Requirement Analysis: Test-design: 09.01 | Limit Hierarchy, Group Limits

## TL;DR

- **4 Stories, 20 ACs:** US-09.01.01 (9), US-09.01.02 (5), US-09.01.03 (2), US-09.01.04 (4). Pages v5-v6, edited 2026-09-29/30, no comments.
- **Manual TCs exist** (workbook, 259; 250 Not run, 9 Blocked) but **are not in Allure yet**. This document analyses US + Bruno and cross-checks the workbook; it does not redesign her cases.
- **Verdict: Needs clarification (blocking for ~1/5 of the cases, not for the rest).** Table-level cases map to what is built; blockers: engine API absent from Bruno (Q-E1), netting undefined (Q-N1), six error ids named by Stories/TCs not seeded (Q-X1).
- Nothing automated. No live calls yet (planned read-only first).
- Module facts, findings F1-F10, patterns: `docs/module-theory/Limit Hierarchy, Group Limits/INDEX.md`. Per-Story AC->Bruno->TC mapping: that folder's `US-09.01.0x/README.md`. Not repeated here.
- Correction (2026-10-01): the first draft of this file analysed the "US-LIM-01..04" table inside the Epic page, not the real Story pages. Replaced.

## Modules Touched

| Module | Source |
|---|---|
| US-09.01.01 Core Data Models, Storage Schemas, and Limit Configuration Registry | Confluence 1688436738 v6 |
| US-09.01.02 Hierarchical Limit Control: Structural Validation and Utilization Cascading | Confluence 1688010806 v6 |
| US-09.01.03 Account Linkage Modes and Intelligent Balance Netting | Confluence 1689387033 v6 |
| US-09.01.04 Group Limits for Corporate Holdings and Nested Sub-Groups | Confluence 1689845761 v5 |
| Reference only: alternate "US-09.01.02 Core Limits Engine and Pre-Flight Evaluation API" | Confluence 1688698881 v4 (2026-09-18, other parent) |
| Reference only: Epic-level pages | bank 1682440339 v5; BA master 4913233953 - older, different model (see INDEX) |

Epic walk (TB-58): BA TB-1485, TI TB-3258, test-design TB-3924, analysis&testing TB-4294, test-impl smoke TB-4295; dev tickets listed in INDEX. Jira descriptions of TB-1485/TB-3258 are empty.

## Per-Module Analysis

### US-09.01.01 (Confluence 1688436738)

#### Business Flows
1. Admin sets COMPANY parameters (`GRP_CREDIT_LIMIT`). 2. Admin populates `LI.LIMIT.REFERENCE` with parent links. 3. Admin creates customer limits (`LI.LIMIT`) with `SINGLE_LIMIT` / `ALLOW_NETTING`. 4. Admin creates sharing groups. 5. System saves with constraints, defaults and parent bounds.

#### Business Rules (BR)
| ID | Rule (quoted) |
|---|---|
| BR-1.1 | Advised Amount Ceiling: ADVISED_AMOUNT <= INTERNAL_AMOUNT; rejected "Advised amount cannot exceed the approved internal limit." |
| BR-1.2 | Hierarchical Allocation: child INTERNAL_AMOUNT <= parent (via PARENT_REFERENCE_ID); rejected "Child limit exceeds parent limit exposure limit." |
| BR-1.3 | Netting and Exclusivity: "If SINGLE_LIMIT is set to TRUE, ALLOW_NETTING must be FALSE"; "Netting cannot be enabled for exclusive single limits" |
| BR-1.4 | Available Marker Domain: strictly [true, false]; "Invalid availability marker. Must be true (Active) or false (Suspended)" |
| BR-1.5 | Risk Taxonomy Depth: sub-product (SUB_PRODUCT_LEVEL >= 1) links to parent product (level 0) via PARENT_REFERENCE_ID; "Sub-product level must reference a valid parent product" |
| BR-1.6 | Group Credit Limit Master Switch: GRP_CREDIT_LIMIT FALSE denies inserts/updates/activations on LI.LIMIT.SHARING.GROUP; "Group credit processing is disabled globally." |
| BR-1.7 | Deletion Prevention: physical DELETE on LI.LIMIT, LI.LIMIT.SHARING.GROUP, LI.LIMIT.REFERENCE prohibited; "Physical record deletion is not permitted. Update status or set AVAILABLE_MARKER to false" |
| BR-1.8 | Immutable Taxonomy Levels: no change of parent-child references if active limits depend on them; "Risk taxonomy structure cannot be changed while active limits are assigned." |

#### Alternative Flows (ALT)
The page lists no separate Alt Flow section; the workbook's Coverage sheet cites "Alt 1-7" (advised exceeds internal; hierarchical sum breach; duplicate account exclusivity; invalid netting; orphan child / auto-creation; physical deletion; group modification when disabled), i.e. she read a version with an Alt Flows section ("US-09.01.01 v0.1 export"). Confirm which text is current (Q-S4).

#### Acceptance Criteria (AC)
| AC | Text (quoted) |
|---|---|
| 1 | GIVEN an administrator is initializing the limits module WHEN they configure COMPANY with GRP_CREDIT_LIMIT set to TRUE THEN the system persists the company parameter record and enables group liability sharing processing. |
| 2 | GIVEN a risk administrator is defining the product taxonomy in LI.LIMIT.REFERENCE WHEN they define Product (1000) and Sub-Product (1010) with appropriate PARENT_REFERENCE_ID links THEN the system saves the hierarchical blueprint, establishing the immutable risk tree for future limit origination. |
| 3 | GIVEN a credit line is being provisioned in LI.LIMIT WHEN the administrator sets INTERNAL_AMOUNT to $1,000,000 and ADVISED_AMOUNT to $1,200,000 THEN the system blocks the save and displays an error indicating that the advised amount cannot exceed the internal sanctioned limit. |
| 4 | GIVEN a customer has a parent Product Limit with an INTERNAL_AMOUNT of $500k WHEN an administrator attempts to create a child Sub-product Limit for the same customer with an INTERNAL_AMOUNT of $600k THEN the system must block the record creation and return a hierarchical validation error. |
| 5 | GIVEN a limit record is configured with SINGLE_LIMIT = TRUE WHEN an administrator attempts to set ALLOW_NETTING = TRUE THEN the system rejects the operation, enforcing the rule that balance netting is only allowed on shared, non-exclusive limits. |
| 6 | GIVEN an active credit line in LI.LIMIT with AVAILABLE_MARKER = true WHEN a risk officer changes the marker to false THEN the system updates the record state to suspended, preserving all historical balances and preventing any future transaction authorizations against this line. |
| 7 | GIVEN an initialized LI.LIMIT or LI.LIMIT.REFERENCE record WHEN an application or user attempts to execute a physical database DELETE THEN the database enforces referential integrity and audit rules, rejecting the deletion request. |
| 8 | GIVEN GRP_CREDIT_LIMIT is set to TRUE in COMPANY WHEN a corporate group structure is configured in LI.LIMIT.SHARING.GROUP with ALLOWED_CUSTOMER THEN the system successfully links the corporate entities to the master credit line for shared pool utilization. |
| 9 | GIVEN the LI.LIMIT.REFERENCE has a hierarchy where Sub-product 1010 belongs to Product 1000 WHEN an administrator creates a LI.LIMIT for a customer under 1010 with INTERNAL_AMOUNT = $50k and ADVISED_AMOUNT = $50k, but parent limit 1000 does not yet exist for this customer THEN the registry must automatically instantiate a parent LI.LIMIT record for Product 1000 with identical amounts ($50k) cascading all the way to the top of the declared taxonomy. |

Flow mapping: AC1 -> step 1; AC2 -> step 2; AC3-AC6, AC9 -> step 3; AC7 -> post-save; AC8 -> step 4. BR-1.4 has only AC6 as indirect cover; BR-1.5/1.7/1.8 have no dedicated message AC beyond AC2/AC7.

### US-09.01.02 (Confluence 1688010806)

#### Business Flows
1. Admin submits a create/update of a customer limit at a taxonomy node. 2. System maps the ancestor chain. 3. Checks which ancestor limits exist. 4. Auto-instantiates missing parents with child's currency/amounts, `SINGLE_LIMIT=TRUE`, `ALLOW_NETTING=FALSE`. 5. Enforces ceilings pairwise (INTERNAL and ADVISED). 6. Links `PARENT_LIMIT_ID` (or builds the chain if NULL). 7. Computes availability, commits atomically.

#### Business Rules (BR)
| ID | Rule (quoted) |
|---|---|
| BR-2.1 | Parent Auto-Instantiation: "the engine must automatically create the parent limit node(s) with amounts equal to the child limit." |
| BR-2.2 | Strict Ceiling: INTERNAL_AMOUNT_Child <= INTERNAL_AMOUNT_Parent and ADVISED_AMOUNT_Child <= ADVISED_AMOUNT_Parent; "the system rejects the save or update operation" |
| BR-2.3 | Cascading Utilization Roll-up: posting A at child C increments TOTAL_OS for C and each ancestor up to root "within a single atomic database transaction" |
| BR-2.4 | Cascading Release Roll-down: release R at child subtracts R from TOTAL_OS of the node and each ancestor |
| BR-2.5 | Non-Negative Safeguard: "If TOTAL_OS - R < 0, the system caps TOTAL_OS at 0." |

#### Alternative Flows (ALT)
None on the page; ALT derived from ACs: ALT-2.1 ceiling breach rejected (AC2); ALT-2.2 parent lowered below utilization rejected (AC4).

#### Acceptance Criteria (AC)
| AC | Text (quoted) |
|---|---|
| 1 | GIVEN Customer B (CUST-100) has no existing limit records WHEN a Risk Administrator creates a Sub-product Limit (Auto Loans, Ref ID: 2010) of $30,000 for CUST-100 THEN the system must automatically create a Product Limit (Retail Loans, Ref ID: 2000) of $30,000 and a Product Limit (Ref ID: 1000) of $30,000, establishing foreign key parent links from 2010-> 2000 -> 1000. |
| 2 | GIVEN Customer B has a Product Limit of $100,000 and a Sub-Product Limit of $50,000 WHEN an administrator attempts to create a Sub-product (+1) Limit of $60,000 under the Sub-Product Limit THEN the system must reject the request with a validation error stating that the child limit ($60,000) exceeds the parent ceiling ($50,000). |
| 3 | GIVEN Customer B has a 3-tier hierarchy (Sub-product(+1) -> Sub-Product -> Product) with $0 initial utilization WHEN a utilization of $15,000 is posted at the Sub-product (+1) tier, followed by a partial repayment/release of $5,000 at the same tier THEN the system must first increase TOTAL_OS by $15,000 across all 3 tiers, and then decrease TOTAL_OS by $5,000 across all 3 tiers, leaving TOTAL_OS = $10,000 at every level. |
| 4 | GIVEN Customer B has a Product Limit of $100,000 with $75,000 currently utilized (TOTAL_OS) WHEN a Risk Administrator attempts to modify the Product Limit's INTERNAL_AMOUNT\ADVISED_AMMOUNT down to $60,000 THEN the system must reject the edit, stating that the proposed limit ($60,000) is less than the current active utilization ($75,000). |
| 5 | GIVEN Customer B has a Product Limit of $100,000, with two child Sub-Product Limits: Credit Cards ($40,000) and Personal Loans ($50,000) WHEN a transaction of $30,000 is authorized under Credit Cards THEN TOTAL_OS for Credit Cards increases by $30,000 (Available: $10,000), TOTAL_OS for Product Limit increases by $30,000 (Available: $70,000), while Personal Loans TOTAL_OS remains $0 (Available: $50,000). |

Flow mapping: AC1 -> steps 2-4, 6; AC2 -> step 5; AC3, AC5 -> BR-2.3/2.4 (not in the Main Scenario, which stops at structure); AC4 -> no step (parent edit). Main Scenario step 6 "or automatically create all hierarchical chain if PARENT_LIMIT_ID = NULL" is the amendment path, which the workbook (PR-34, QA Q9) says the plugin does not run on.

### US-09.01.03 (Confluence 1689387033)

#### Business Flows
1. `PF.CONTRACT.OPERATION` submits account linkage (ACCOUNT_ID, LIMIT_ID). 2-3. SINGLE_LIMIT check. 4. Account not linked to any limit. 5. Working balance = 0. 6. Registers link. 7. Evaluation / recalculation trigger. 8. Returns availability profile.

#### Business Rules (BR)
| ID | Rule (quoted) |
|---|---|
| BR-3.1 | Single Limit Linkage: "1:1 relationship"; rejected "Limit is configured as exclusive (SINGLE_LIMIT=TRUE). Cannot attach multiple accounts." |
| BR-3.2 | Account Linked Limits: "The account must not be linked to any limit." |
| BR-3.3 | Empty Account Working Balance: "The account must have working balance = 0." (second sentence is a copy of BR-3.4's) |
| BR-3.4 | Intra-Customer Ownership: accounts of a non-group limit "must belong to the same CUSTOMER_ID"; "Linked account owner does not match limit owner." |

#### Alternative Flows (ALT)
ALT-3.1 second account on exclusive limit (AC2). Netting (user story goal) has no flow or rule.

#### Acceptance Criteria (AC)
| AC | Text (quoted, condensed to GIVEN/WHEN/THEN) |
|---|---|
| 1 | GIVEN a request to link an account to a limit via PF.CONTRACT.OPERATION, the account not linked to any limit, working balance = 0; WHEN the system verifies SINGLE_LIMIT = FALSE OR no other account is attached when TRUE; THEN it registers the linkage, processes the transaction evaluation or risk recalculation trigger, and returns the updated availability profile. |
| 2 | GIVEN SINGLE_LIMIT = TRUE and an active account already linked; WHEN a new linkage request is submitted via PF.CONTRACT.OPERATION; THEN the system blocks it, returns HTTP 400 with the code SINGLE_LIMIT_EXCLUSIVITY_VIOLATION, and ensures the existing linkage remains unmodified. |

Flow mapping: AC1 -> steps 1-8 (steps 7-8 undefined in detail); AC2 -> step 3.

### US-09.01.04 (Confluence 1689845761)

#### Business Flows
1. Create group with ID and empty ALLOWED_CUSTOMER. 2. Create group limit (`CUSTOMER_ID` NULL, GROUP_ID, LIMIT_REFERENCE_ID, INTERNAL_AMOUNT, `SINGLE_LIMIT=FALSE`); hierarchy to Product level auto-created. 3. Add customers: verify active corporate entities (EP-03.01), not in another group, switch TRUE, `TOTAL_OS_grp + members <= ADVISED_AMOUNT_grp`, recalc `TOTAL_OS_grp`.

#### Business Rules (BR)
| ID | Rule (quoted) |
|---|---|
| BR-4.1 | Global Group Switch Gate: all group operations require GRP_CREDIT_LIMIT = TRUE, else "Group credit processing is disabled globally." |
| BR-4.2 | Counterparty Entity Verification: unverified/inactive customers rejected "Customer ID is inactive or invalid in Customer Domain." |
| BR-4.3 | Acyclic Group Graph Enforcement: "The nested group structure must be built based on taxonomy tree." |
| BR-4.4 | Restriction Principle: group limit is "strictly an additional ceiling"; /limits/evaluate must verify four tiers (Individual Sub-Product, Individual Product, Group Sub-Product, Group Product) |
| BR-4.5 | Onboarding Member with Existing Debt: `TOTAL_OS_grp_new = TOTAL_OS_grp_old + TOTAL_OS_cust` |

#### Alternative Flows (ALT)
ALT-4.1 switch FALSE (AC2). ALT-4.2 invalid counterparty (AC4). ALT-4.3 switch to FALSE with active groups (AC3).

#### Acceptance Criteria (AC)
| AC | Text (quoted, condensed) |
|---|---|
| 1 | GIVEN GRP_CREDIT_LIMIT TRUE, customers (e.g. CUST-A, CUST-B) verified as active corporate legal entities (CM.CUSTOMER.SECTOR = Corporate) and not linked to any other group; WHEN an Actor creates the group with empty ALLOWED_CUSTOMER, creates the group limit (CUSTOMER_ID = NULL, SINGLE_LIMIT = FALSE, GROUP_ID, LIMIT_REFERENCE_ID, INTERNAL_AMOUNT) and updates the group with ALLOWED_CUSTOMER = ["CUST-A","CUST-B"]; THEN the system creates the taxonomy hierarchy up to Product level if needed, verifies TOTAL_OS_grp + (TOTAL_OS_cust_a + TOTAL_OS_cust_b) <= ADVISED_AMOUNT_grp, recalculates TOTAL_OS_grp, and registers the group limit and linkage. |
| 2 | GIVEN GRP_CREDIT_LIMIT is FALSE; WHEN an Actor submits any group evaluation or group creation request; THEN the System rejects the request and returns an HTTP 400 error response. |
| 3 | GIVEN active, non-expired group credit limit records exist; WHEN an Administrator attempts to update GRP_CREDIT_LIMIT to FALSE; THEN the System blocks the update and returns HTTP 400 with the code ACTIVE_GROUPS_EXIST. |
| 4 | GIVEN a customer ID in ALLOWED_CUSTOMER is inactive, suspended, or not found in Customer Domain Service; WHEN an Actor submits a group configuration request; THEN the System blocks it and returns HTTP 400 specifying INVALID_GROUP_COUNTERPARTY along with details of the rejected customer ID. |

Flow mapping: AC1 -> steps 1-3; AC2 -> BR-4.1; AC3 -> no step; AC4 -> step 3; BR-4.4 (restriction principle, the story's headline value) has **no AC**.

## Gaps & Conflicts Found

| # | Gap / conflict (both sides quoted) |
|---|---|
| G1 | **Engine API**: Stories 03/04 and BR-4.4 rely on "/limits/evaluate"; the only contract is the older alternate page ("POST /limits/evaluate ... 422 LimitBreachResponse"); Bruno has no `/limits/evaluate`, `/limits/release` or `limits-url`. AC3/AC5 of US-09.01.02 cannot be driven. (F2) |
| G2 | **Error ids**: AC US-09.01.03/2 `SINGLE_LIMIT_EXCLUSIVITY_VIOLATION` vs seeded `SINGLE_LIMIT_CAN_CARRY_ONLY_ONE_ACCOUNT`; AC US-09.01.04/3 `ACTIVE_GROUPS_EXIST` and AC/4 `INVALID_GROUP_COUNTERPARTY` not seeded; workbook's `GROUP_PROCESSING_DISABLED` vs seeded `GROUP_CREDIT_LIMIT_PROCESSING_IS_DISABLED`; `LIMIT_BREACHED` (alt engine page) and QA-assumed `GROUP_CAPACITY_EXCEEDED` not seeded. (F3) |
| G3 | **AC US-09.01.04/3 not implemented per Bruno**: no rule blocks switching GRP_CREDIT_LIMIT to FALSE; also "non-expired" needs an expiry field nobody defines (QA Q5). (F4) |
| G4 | **Netting**: US-09.01.03 title and user story say "Intelligent Balance Netting"; no BR/AC defines it; Epic-level pages use a formula with `AVAILABLE_AMOUNT`, which does not exist now. 9 TCs Blocked. The BA described the semantics in a 09-01 chat (net debt -> `TOTAL_OS`, withdrawal that lifts net exposure above `INTERNAL_AMOUNT` is rejected; example +500/-1500/limit 1000) but the Story was not updated afterwards (edited 09-29/30), and devs offered to drop netting for now. (F6, INDEX chat table) |
| G14 | **Availability profile**: AC1 of US-09.01.03 returns "the updated availability profile" with no shape; chat 09-08 agreed `{"LIMIT_AVAILABLE_AMOUNT":[{"ACCOUNT_ID","AVAILABLE_AMOUNT"}]}` and the BA said spec 03 "must be corrected"; TB-4014 (09-22) removed that field from `LI.LIMIT`. |
| G15 | **`SINGLE_LIMIT` semantics**: chat 09-07 kept it per limit and removed the global parameter; BA said it carries meaning only with `ALLOW_NETTING=TRUE`, yet the Stories and workbook use `SINGLE_LIMIT=FALSE + ALLOW_NETTING=FALSE` (pooled, different availability per account) as a normal mode. |
| G16 | **Chats vs Stories**: all pasted decisions (netting, FIN reference, availability array, contract condition fields) predate the Story edits and are not reflected in them. |
| G17 | **Engine contract has moved**: the runtime API is owned by US-09.03.01 (v2, 2026-09-28: `POST /limits/evaluate` input `transaction_id, account_id, customer_id, transaction_amount, ...`, output `status` APPROVED/OVERRIDE_REQUIRED/REJECTED + `decision_code`; plus `/limits/commit`, `/limits/release`), while workbook sheets 09.01.02 and 09.01.04 assert the older page's contract (`customer_id, limit_reference_id, currency, amount`; 422 `LIMIT_BREACHED` with `breached_node_id`, `deficit_amount`). Both newer stories (US-09.02.01, US-09.03.01) use `AVAILABLE_AMOUNT`, removed from `LI.LIMIT` by TB-4014. |
| G18 | **Environments are not seeded**: `two.bankuat` and `bankuat` have no `LI.*` tables in the table registry (only the old `LIMIT.REFERENCE`), no COMPANY fields `GRP_CREDIT_LIMIT`/`NET_OUTSTANDING`/`ADM_EXTENSION_DAYS`, 3 of the limit plugins, no limits ERROR records (VM probe 2026-10-01). Dev tickets themselves list a "live-table migration LIMIT.REFERENCE -> LI.LIMIT.REFERENCE" as needed on seeded environments. |
| G19 | **Which company**: workbook uses lead company `BNK` (DEFAULT_AUTH false; branch `BNK-BR` exists); the spec uses `COMPANY_CODE` = MOCK (standalone lead, DEFAULT_AUTH true). Limit parameters are lead-level (TB-3653 To Do: branch write protection and cascade not implemented). |
| G5 | **Title vs body**: US-09.01.04 "Nested Sub-Groups" - the body has no nesting; BR-4.3 is unintelligible as written. |
| G6 | **US-09.01.01 text vs build**: `SUB_PRODUCT_LEVEL` (BR-1.5), physical-delete prevention (BR-1.7), immutable taxonomy (BR-1.8), AVAILABLE_MARKER message (BR-1.4) have no seeded id/field. (F7, QA Q1/Q7-Q9) |
| G7 | **Auto-creation semantics**: BR-1 Alt 5 "sum" vs AC9 "identical" (QA Q2); async plugin vs "single atomic transaction" and "Event Emitted: None" (QA Q3); US-09.01.02 step 4 sets ancestors `SINGLE_LIMIT=TRUE` while US-09.01.04 group limits require FALSE and QA asks if the plugin works for GROUP_ID lines at all (QA Q22). |
| G8 | **ADVISED ceiling across levels** (BR-2.2) - Bruno shows only `PARENT_LIMIT_AMOUNT_CANNOT_BE_LESS_THAN_CHILD`; whether it checks ADVISED is unverified (workbook US-09.01.02 PR-11). |
| G9 | **Non-negative safeguard**: BR-2.5 caps at 0; Bruno `GROUP_LIMIT_TOTAL_OS_CANNOT_BE_NEGATIVE` rejects. |
| G10 | **Built behaviour with no Story text**: owner xor, owner/reference immutability, one limit per node, ambiguous-parent suspension, account rules (one change at a time, no removal, no accounts at creation, customer limits only). (F8) |
| G11 | **Page hygiene**: typos "GRP_CREIT_LIMIT", "ADVISED_AMMOUNT"; US-09.01.03 precondition lists itself; duplicated sentence in BR-3.3; "CONFIRM: CM.CUSTOMER.SECTOR = Corporate?" left in US-09.01.04; US-09.01.02 AC1 labels 2000 and 1000 both "Product Limit". |
| G12 | **Source drift**: workbook cites "US-09.01.01 v0.1 (Confluence export 30.09.2026)" and "Alt 1-7" sections; live page is v6 (09-29) with no Alt section. Workbook sheets 09.01.02-09.01.04 cite Q numbers (up to Q28) that are absent from its Open Questions sheet, which holds Q1-Q22 for US-09.01.01 only. |
| G13 | **Name clash**: two pages titled "US-09.01.02" (current Hierarchical Control; older Core Limits Engine). |

## Open Questions (Business Analyst Andrei Sech / Mikalai Yudzilevich as Story author / Solution Architect; Dev for engine)

| # | To | Question |
|---|---|---|
| Q-E1 | Dev / SA | Is `POST /limits/evaluate` (and `/limits/release`) real? Which page defines it (alt 1688698881 or none)? Base URL variable? Where in Bruno will it be added (proj-limit-engine TB-3621 Done, TB-3973 refactoring, TB-3653 To Do)? Is posting `TOTAL_OS` through `LI.LIMIT~INTERNAL` plus the recalculation plugin (TB-3983) the intended test path instead? |
| Q-E0 | Dev / DevOps | On which environment is the Limits module deployed and seeded (tables `LI.*`, COMPANY fields, 5+ plugins, ERROR records, `proj-limit-engine` enabled)? `two.bankuat` and `bankuat` are not. Who runs the System Core COMPANY seeding and the Limits `00 - Seeding` collection (with the `LIMIT.REFERENCE` -> `LI.LIMIT.REFERENCE` migration), or which other environment should the smoke suite target? |
| Q-E3 | Dev / BA | Which company must smoke tests use: lead `BNK` (as in the workbook) or `MOCK` (current `COMPANY_CODE`)? Does `DEFAULT_AUTH=true` on MOCK change the 4-eyes behaviour of `~MASTER` projections? Will TB-3653 (lead/branch cascade and branch write protection) be in scope for these smoke tests? |
| Q-E2 | Dev | Testability hooks for fault injection (NR-22/23/26 in the workbook), concurrency (locking claim on alt page), release idempotency (no transaction id), batch atomicity (QA Q18). Otherwise mark Not Automatable. |
| Q-N1 | BA | Write the 09-01 netting decision into US-09.01.03 as BR + AC (net debt of linked accounts -> `TOTAL_OS`; floor at 0 when net is positive? only linked accounts? currency mixing? `TOTAL_OS` refreshed on every `WORKING_BALANCE` change - which event/process?). How to seed EP-06 balances on QA. |
| Q-N2 | BA | Is netting in this milestone at all (devs offered to cut it 09-01)? If yes, how is the client told that a balance is used as cover? If no, the 9 Blocked TCs should be Not Applicable, not Blocked. |
| Q-N3 | BA | Is `SINGLE_LIMIT=FALSE + ALLOW_NETTING=FALSE` (accounts with different availability) a valid mode (chat 09-07 vs Stories)? |
| Q-X1 | BA / Dev | Error ids: which is authoritative for `SINGLE_LIMIT_EXCLUSIVITY_VIOLATION`, `GROUP_PROCESSING_DISABLED`, `ACTIVE_GROUPS_EXIST`, `INVALID_GROUP_COUNTERPARTY`, `LIMIT_BREACHED`, capacity-exceeded id? Are they to be seeded? HTTP status per class (400 vs 422). |
| Q-X2 | Dev | Is the GRP_CREDIT_LIMIT TRUE->FALSE block (AC US-09.01.04/3) implemented? What field defines "expired" and how does `ADM_EXTENSION_DAYS` apply? |
| Q-X3 | Dev | Where is the Customer Domain check (active, suspended, corporate sector) implemented, and what does it return? |
| Q-S1 | BA | US-09.01.04: are nested sub-groups in scope? Clarify BR-4.3. |
| Q-S2 | BA | Authoritative text for `SUB_PRODUCT_LEVEL`, physical delete, immutable taxonomy, AVAILABLE_MARKER message (workbook Q1, Q7-Q9). |
| Q-S3 | BA | Auto-creation: "sum" vs "identical" (workbook Q2); why `SINGLE_LIMIT=TRUE` on ancestors; behaviour on failure; behaviour on amendment (workbook Q9, Q12); group-owned ancestors (Q22). |
| Q-S4 | BA | Confirm Stories (09-29/30) supersede the Epic-level pages and the alternate engine page; confirm no Story edits since the workbook's export. |
| Q-S5 | BA | Release above outstanding: cap at 0 (BR-2.5) or reject? Same for a zero-utilization release. |
| Q-S6 | BA / Dev | US-09.01.03 AC1: where is the "updated availability profile" returned now that `LIMIT_AVAILABLE_AMOUNT` is gone from `LI.LIMIT` (TB-4014)? Is the 09-08 array shape still valid? Error id for "account already linked". |
| Q-S7 | BA | Does the ceiling apply to ADVISED_AMOUNT per BR-2.2, and with which error text? |
| Q-W | Manual QA | Fix the workbook's Q numbering (sheet-local vs global) and add the Open Questions for 09.01.02-.04; Allure case creation is pending. |

The workbook's own Q1-Q22 (US-09.01.01) are accepted as raised; not re-asked here.

## Required Test Types (with triggering signal per type)

Provisional - the Test Type Selection Matrix in `manual-qa-agent.md` was not re-read in this pass.

| Type | Triggering signal |
|---|---|
| API | table operations through `/api/v1/projections/:id/records/operations/:op` on 4 tables; engine API once defined |
| Negative / validation | ~28 seeded error ids, 3 cross-field rules, amount pattern |
| RBAC / 4-eyes | `~MASTER` 4-eyes vs `~INTERNAL`/COMPANY none; Access Rules in Stories |
| Integration | Kafka-fed hierarchy plugin, PF.CONTRACT.OPERATION linkage plugin, CM.CUSTOMER, AM.ACCOUNT, CURRENCY, EP-06, EP-03.01 |
| Boundary | `=`, +/-0.01, `ADM_EXTENSION_DAYS`, amount decimals |
| Concurrency / fault injection | workbook cases on locking, parallel AUTH, balance service down - hook-dependent |
| Smoke | 18 workbook Smoke cases; implementation ticket TB-4295 |
| UI | none identified |

## Manual QA workbook cross-check (summary)

| Sheet | Story | TCs | Status | Smoke / Positive / Negative |
|---|---|---|---|---|
| API Test Cases | US-09.01.01 | 72 | 72 Not run | 4 / 28 / 40 |
| 09.01.02 | US-09.01.02 | 69 | 69 Not run | 4 / 36 / 29 |
| 09.01.03 | US-09.01.03 | 53 | 44 Not run, 9 Blocked | 5 / 20 / 28 |
| 09.01.04 | US-09.01.04 | 65 | 65 Not run | 5 / 23 / 37 |

Endpoint use (workbook, all-sheet count): `LI.LIMIT~MASTER` INPUT 55, `LI.LIMIT~INTERNAL` INPUT 45, `LI.LIMIT.SHARING.GROUP~MASTER` INPUT 30, `/limits/evaluate` up to 32, `/limits/release` 10, `COMPANY~MASTER` 10, `LI.LIMIT.REFERENCE~MASTER` 10, `AM.ACCOUNT.BALANCE~MAIN` 8. Roughly 42-51 TCs depend on the missing engine API or undefined netting; the remainder run on projections that exist, subject to the error-id and status questions above and to hook-dependent cases being declared Not Automatable.

Coverage vs Stories: every AC of all four Stories has at least one TC; the workbook adds ~60+ cases for built-but-unspecified rules (she marks them "implemented, not in US - assumed"). Rule of the module docs applies: where a TC follows the Story and Bruno differs, the case stays blocked/escalated, not silently re-pointed at the Bruno id.

## Step-3 verdict for automation (no TC is in Allure yet)

Not yet decidable per case. What is established: (1) ~half the workbook can be proven with endpoints that exist today; (2) the case set must not be automated against `limits-url` until Q-E1 is answered; (3) every mismatch in G2/G6 needs a BA decision before assertions on ids or messages; (4) first candidate batch for TB-4295 smoke: US-09.01.01 SM-01..04, US-09.01.02 SM-01 and SM-04, US-09.01.03 SM-01..04, US-09.01.04 SM-01..03.

## Automation notes: workbook as written vs what the code does (US-09.01.01 smoke, spec `api/limit/tests/limit-hierarchy-smoke.spec.ts`)

Rule agreed with the user 2026-10-01: automate each case as written in the workbook; every deviation is recorded here instead of being silently "fixed".

| Case | Workbook says | Code does | Why | Expected consequence |
|---|---|---|---|---|
| SM-01 | Body overwrites the whole COMPANY record `BNK` (names, holidays, XAF, bank/branch ids), precondition "GRP_CREDIT_LIMIT = FALSE" | SEE the company of `COMPANY_CODE` (MOCK on bankuat), INPUT the same data with only `GRP_CREDIT_LIMIT` flipped, restore the original value in `afterEach`; precondition enforced by `ensure...(false)` | Shared environment: the TC body would overwrite real company data; the TC's own expectation "all other fields equal the before snapshot" is kept | Needs `GRP_CREDIT_LIMIT` on `COMPANY~MASTER`; "Group sharing becomes available - verified by SM-04" not asserted here |
| SM-02 | Fixed ids 10000 (pre-existing root), 1000, 1010 | Generated ids; own LIVE root created in the precondition (INPUT + AUTH by a second user); title says Product/Sub-Product without the literals | Ids are free-form; fixed ids collide on a shared environment; references are per company (FIN) | "No LI.LIMIT record is created" and "no ledger posting" dropped (vacuous for fresh ids / no ledger endpoint) |
| SM-03 | Fixed `9103.10000.1`, customer `LI.CUS.SM03`, reference 10000 | Generated limit id, own customer (CM.CUSTOMER INPUT, defaults from `DM_CONSTS.RETAIL_CUSTOMER_DEFAULTS`), own root; amounts compared with `Number()` | Same; customer must have no limits | `TOTAL_OS` "empty or 0" dropped (QA Q19 undecided); "no ancestor limits created" dropped (root has no parent; async plugin would need a negative wait); "no ledger posting" dropped |
| SM-04 | Body #1 creates the group **with** `ALLOWED_CUSTOMER [A, B]`, then body #2 the group limit | Written in exactly that order (user decision), ids generated, own root and two own customers, flag forced to TRUE then restored | User asked for the case as written | **Likely to fail** at the first group INPUT: Bruno seeds `SHARING_GROUP_MUST_BE_CREATED_WITHOUT_CUSTOMERS` ("always created empty ...") and `SHARING_GROUP_HAS_NO_LIMIT_CONFIGURED`; US-09.01.04 flow and Bruno flow `05 - Sharing Group` use empty group -> group limit -> add customers. A failure here is a TC/Story discrepancy for Manual QA and BA, not an automation defect |
| all | AUTH by an unspecified user | AUTH by a dynamic CHECKER user (`createTestUserSession`, ALL on `LI.LIMIT.REFERENCE`, `LI.LIMIT`, `LI.LIMIT.SHARING.GROUP`, `CM.CUSTOMER`) per worker | Repo's 4-eyes pattern; Bruno's static `operation-authorizer` is not used anywhere in this repo | Grant sufficiency and propagation (about 40 s) unverified until the first run reaches AUTH |
| all | "Response: 200 OK" | one status per assertion: 200 for INPUT/AUTH/SEE/VIEW_HISTORY, 404 for absent records | Bruno accepts 200/201; repo suites assert 200 | A 201 on an environment would fail the case |
| all | no cleanup stated | DB delete of created `LI.*`/`CM.CUSTOMER` rows after every test (tracking inside the creating helpers) | Unique ids stay harmless otherwise | COMPANY history versions remain (1-3 per run) |
| file | none | whole spec registered in `SINGLETON_RECORD_SPECS` (1 worker, after the parallel leg) | SM-01/SM-04 mutate the shared COMPANY flag; registration is per file, so SM-02/SM-03 ride along although they are parallel-safe | Splitting SM-01/SM-04 into their own file would let SM-02/SM-03 run in parallel |

### First VM run (2026-10-01, `two.bankuat`, folder `vm-results-api-20261001-121256`, spec had 3 tests, SM-04 not yet included)

| Test | Result | Error (verbatim essentials) | Reading |
|---|---|---|---|
| SM-01 | failed, 347 ms | 400 `property 'GRP_CREDIT_LIMIT' is not defined in the schema and the schema does not allow additional properties` on `COMPANY~MASTER` INPUT | The COMPANY schema on this environment has no `GRP_CREDIT_LIMIT`; the field (TB-3570) is not deployed/seeded there |
| SM-02 | failed, 74 ms | fixture error creating the checker user group: `PERMISSIONS[0].TABLE - target table='TABLE_REGISTRY' does not contain record with ID='LI.LIMIT.REFERENCE' in LIV space, PERMISSIONS[1] ... 'LI.LIMIT'` (400 on `SM.USER.GROUP~MAIN` INPUT) | `LI.LIMIT.REFERENCE` and `LI.LIMIT` are not registered in the table registry of this environment |
| SM-03 | failed, 75 ms | same as SM-02 | same |

Global setup/teardown, Keycloak, user creation/cleanup and DB access worked; the spec ran in `API-tests-singleton`. Reading: **environment prerequisite missing, not an automation defect** - the Limits tables (and the COMPANY field) have not been seeded on `two.bankuat` (Bruno `collections/Tables/Limits/00 - Seeding` and System Core COMPANY seeding). Not yet verified directly (e.g. by listing the table registry on that environment). The checker fixture fails before any test body when `LI.*` tables are absent, so SM-04 will fail the same way until seeding is done. Next step: seed the environment (or choose one where the Limits module is deployed) and re-run; then judge SM-04 on its real merits.

## Not done in this pass

- No live Bruno/API calls (QA-environment credentials and side effects to be agreed; read-only SEE/definition calls first).
- No Jira comment on TB-3924 and no Allure writes.
- EP-09.02 / EP-09.03 pages and the Bruno E2E request files (`15 - E2E Tests/03-LI.LIMIT`: utilization, engine write-back flows) were only listed, not read in detail - they decide whether Q-E1's alternative path exists.

## Changelog

- 2026-10-01 - v1 analysed the wrong source (Epic-page inline table "US-LIM-01..04").
- 2026-10-01 - v2 rewritten from the four real Story pages; added alternate engine page, second Bruno pass and the Manual QA workbook cross-check.
- 2026-10-01 - v4 added the environment probe (G18), lead company findings (G19), the moved engine contract (G17), the dev-ticket digest and DEFAULT_AUTH reading (all in INDEX.md); first VM run recorded above.
- 2026-10-01 - v3 folded in the user-pasted developer/BA chats (09-01 netting, 09-07 FIN reference and `SINGLE_LIMIT`, 09-08 contract condition and availability array, 09-09/10 time bands): G4 extended, G14-G16 and Q-N2, Q-N3 added, Q-N1 and Q-S6 narrowed. Workbook TC ids are provisional (sheet-local `SM-`/`PR-`/`NR-`, renumbered when loaded into Allure).
