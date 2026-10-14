# US-09.01.01 test-case review calls, 2026-10-01 - digest

## TL;DR

- **Who:** two calls, ~60 + ~55 min (12:13 and 15:16 CEST). Manual QA Viktoryia Burak walked her workbook case by case with dev Artur Fonichkin (lead for limits), dev Ryhor Kisly (Bruno seeding/plugins), BA Anastasiya Bylich ("Nastya", replaced the previous BA "Kolya"), plus Ilona Fralova and Vadym Udaltsov (AQA, listened).
- **Coverage of the review:** SM-01..04, PR-01..28, NR-01..22 of 68 (V2) cases. **NR-23..NR-40 (18 cases) not reviewed yet** - continue "tomorrow" (Artur, Viktoryia).
- **Result in the workbook:** `...vFinal-V2.xlsx` has 4 cases deleted (NR-20, PR-08, PR-16, PR-25), 5 cases annotated/edited (SM-01, SM-04, PR-22, PR-23, PR-24); **most call decisions are not yet applied** (error ids, new cases, PR-21/22 rework). Other sheets (09.01.02-04, Q1-Q22) unchanged.
- **New knowledge:** SM-04 order is now settled and **contradicts the merged `SM-04` test**; accounts are added only via contract; flag is Lead-company-only; new Reducing Limit parent/child rule; group TOTAL_OS rule; the feature exists on **Dev only** (explains the 4/4 UAT/VM failures); `WORKSPACE.MENU` projection fix in progress.
- Sources: `Granola-1.md`, `Granola-2.md` (best summaries), own Whisper transcripts `transcript-call*.ru.txt` (machine-made, small model, names/numbers can be wrong, speakers not labelled). The Gemini `.docx` notes are **unusable**: Gemini transcribed Russian speech as garbled English; their summaries are wrong in places (e.g. "Case 15/16 Kafka deleted" - the real deleted cases are PR-16 "created suspended" and PR-25 "no event/ledger").

## Decisions per test case (V2 id)

| TC | Decision on the call | In V2? | Needs |
|---|---|---|---|
| SM-01 | Flag is writable only on the **Lead company**; branch companies follow it (plugin to enforce comes in "a few days", Artur creates the task). Precondition "COMPANY is LEAD" | yes (precondition line) | + new negative TC: non-Lead company changing `ADM_EXTENSION_DAYS` / `NET_OUTSTANDING` / `GRP_CREDIT_LIMIT` -> error (blocked until the plugin ships; ties to TB-3653) |
| SM-02 | OK | - | - |
| (new) | **Reducing Limit rule**: `REDUCING_LIMIT=true` = non-revolving (mortgage); `false` = revolving (overdraft/card). Parent non-revolving (true) -> child **cannot** be revolving (false); reverse allowed. Artur creates the dev task, "needs sleeping on" | no | add TC after the task; check against US-09.02.01 |
| SM-03 | OK; with no parent it is a root (`LIMIT_REFERENCE_ID` 10000, any amount) | - | - |
| SM-04 | Flow: (0) empty group, (1) **group limit** with `GROUP_ID` and same `LIMIT_REFERENCE_ID`, (1.2) a limit for **each customer** (`CUSTOMER_ID`, same reference), (2) add the customers. Customers without a matching-reference limit are rejected on binding. `CUSTOMER_ID` of the group limit stays empty. Group limit defaults `SINGLE_LIMIT=false`, `ALLOW_NETTING=false` (Bruno, not code) | yes (body); `recordId` typo `9104.1001` vs `9104.100`, ids ignore the `LiabilityNo.LimitRef.Seq` form | **merged test is the old flow - see "Impact"** |
| PR-01 | Company created with flag TRUE is LIVE at once | - | - |
| PR-02 | Missing flag -> default FALSE | - | - |
| PR-03/04 | Root without parent accepted; a second sub-product under the same product accepted (two children) | - | - |
| PR-05 | Description of a node with active limits can be changed; `TIME_BAND` can be added, not removed (that is spec 2) | - | - |
| PR-06 | A node with **no** limits referencing it can be re-parented freely; version goes to HIS | - | clarify: "limits" means rows in `LI.LIMIT` with that `LIMIT_REFERENCE_ID` |
| PR-07 | ADVISED = INTERNAL accepted. **ADVISED is mandatory** ("cannot be absent; may equal INTERNAL") | - | **conflict with Bruno, see D1** |
| PR-08 | "Created without ADVISED" **deleted** | deleted | - |
| PR-09 | Raising INTERNAL+ADVISED of a root limit is free; with a parent it must stay <= parent | - | - |
| PR-10/11 | Child = parent and child < parent accepted; compare in one currency (cross-currency is converted at accept/auth) | - | - |
| PR-12/13 | Shared+netting: precondition **`COMPANY.NET_OUTSTANDING = true`** | no | add to precondition |
| PR-14/15 | Suspend/reactivate OK. Suspended: amounts and `TOTAL_OS` kept; deposits still allowed, **utilisation blocked** (enforced in spec 3) | - | - |
| PR-16 | "Created already suspended" **deleted** (duplicate of suspension; `AVAILABLE_MARKER=false` on create is still valid) | deleted | - |
| PR-17 | Customer with no limits, create 1010 -> Product and Global Line auto-created, **identical amounts**, ids `<CUSTOMER_ID>_<LIMIT_REFERENCE_ID>`, same customer. Verify via the `LI.LIMIT` table, **not Kafka** (Kafka is internal, only for auto-creation) | - | poll (async) |
| PR-18 | Only the missing Product is created and linked to the existing root | - | - |
| PR-19 | New child (1020) next to existing 1010 under 1000: parent amounts unchanged (50k), only child <= parent is checked; link to parent appears **asynchronously a moment later** | - | poll for `PARENT_LIMIT_ID` |
| PR-20 | Discussed as "another limit at the same reference with a different record id -> 200" (two limits at one node are legitimate: two overdraft cards). The TC as written is an **amendment** that expects the link kept | no | **unresolved, D4** |
| PR-21 | "stopped at 21, OK" - not really discussed | - | **conflicts with PR-22 ruling, D2** |
| PR-22 | Second account on a shared limit **cannot be added by the user**; only by creating a **contract whose conditions have class attribute = Limit** (bilateral add via plugins). The JSON with account1/account2 is wrong -> rework | title note only | rework to contract flow (= 09.01.03 SM-05 territory) |
| PR-23 | Adding a customer to a group: customer needs own limit with the same reference; **sum of `TOTAL_OS` of all group customers (existing + new) must not exceed the group `ADVISED_AMOUNT`**. Example: A has 200, group 300, adding B(200) -> 400 > 300 rejected. Flag-FALSE blocks group create/modify/authorize | precondition note added | positive case must keep sum <= advised |
| PR-24 | Reverse of a group - nobody could answer; maybe "only soft-delete" | note "ask about reverses" | open question |
| PR-25 | Events/ledger check **deleted**: Kafka only fires for auto-creation; result is checkable in the table | deleted | - |
| PR-26 | Parent can be reduced while >= **every** child; checks propagate to the root; failure at any level rolls back the whole operation (all-or-nothing) | - | - |
| PR-27 | Tree may mix currencies; ancestors auto-created in the **child's** currency; rates and currencies must be seeded (TB-4065) | - | seed rates |
| PR-28 | Group auto-creation: every created limit carries the same `GROUP_ID` (or same `CUSTOMER_ID`) - owner is either one or the other | - | - |
| NR-01..04 | Rejected with **HTTP 400** (plugin returns 400; Bruno accepts 400/422). NR-04: nearest existing ancestor is compared, intermediates are **not** created | - | error ids pending |
| NR-05 | Draft child passes INPUT, parent reduced, child's AUTH fails | - | - |
| NR-06 | Reduce parent below child rejected; **Story does not describe it** - BA should add | - | Story gap |
| NR-07..09 | Netting+single rejected (create / amend / reverse) | - | - |
| NR-10 | `AVAILABLE_MARKER` is boolean only (yes/no/"active" dropped) -> plain schema error | - | - |
| NR-11..13 | Missing parent / self parent / cycle rejected (same error family) | - | - |
| NR-14 | Parent only in NAU: **only LIVE parents are referable** | - | - |
| NR-15/16 | Node (or limit) with **any** limits, active or not, cannot be moved | - | - |
| NR-17 | Second account to an exclusive limit: error is seen via the **contract path**, not by direct write | - | rework like PR-22 |
| NR-18 | Limit created with accounts rejected; accounts only later via contract operations | - | - |
| NR-19 | Physical delete: not possible on LIVE records; works only on NAU drafts. REVERSE (LIV->HIS) works. Expected status not stated | - | **D5** |
| NR-20 | Table-level delete of `LI.LIMIT` **deleted** ("superadmin can do anything") | deleted | - |
| NR-21 | Flag FALSE blocks create/modify/authorize group -> 400. Flag **should not be switchable to FALSE once groups exist** | - | **D3** |
| NR-22 | Read of a group with flag FALSE: **case removed as invalid** ("maybe reads are allowed") | **not yet deleted in V2** | **D6** |

## Other facts

- **Error ids/codes are not final.** Current build returns random-id messages; the BA switch (Kolya -> Nastya) delayed the error spec; codes (400/422) get **backfilled into every negative TC after the review ends**. Do not hardcode status/ids until then.
- **Deployment:** feature is on **Dev only**; UAT after the TC set is complete (Artur will announce). The 4/4 failures of `two.bankuat` runs are therefore expected, not a defect.
- **Preconditions need real data:** currencies, exchange rates, customers must exist; Ryhor: Bruno `Limits/00 - Seeding/15 - E2E Tests` (83 files) shows how to seed; "negative cases: take from Artur's original task descriptions".
- **Spec scope:** `Available Limit` field (revolving) goes to spec 2, not spec 1; Kafka relevant to spec 3 for the evaluate path.
- **Intermediate limit id:** `<CUSTOMER_ID>_<LIMIT_REFERENCE_ID>`. Parallel auto-creation chains for one customer could collide (Ryhor to remember).
- **WORKSPACE.MENU incident:** `WORKSPACE.MENU` was created as an ordinary projection; `master` was meant for internal writes; the restriction plugin on master was never loaded, so QA/seed tests wrote through master with no hooks/validation and seeded bad LIV rows. Decision: non-system projection for the menu (code + Bruno), restriction plugin to master within ~1 h (Ryhor, Artur follows up with Olya); frontend uses `~NAVIGATION` and is unaffected; some existing tests will break. Separate: pruning bug on UAT 1 (missing rights) - Ryhor.
- **Action items:** Artur - task for Lead-company plugin, task for Reducing Limit constraint, notify when first TCs can go to UAT; Viktoryia/Artur - continue review from NR-23; Ryhor - UAT1 menu pruning, master restriction plugin; Viktoryia - backfill error codes.

## Discrepancies to escalate (not silently resolved)

| # | Call decision / V2 | Reality (source) | Ask |
|---|---|---|---|
| D1 | ADVISED mandatory (PR-07/08) | Bruno `LI.LIMIT~MASTER` requires only `LIMIT_CURRENCY`+`INTERNAL_AMOUNT`; Story lists no mandatory set; the removed PR-08 was the "optional" case | Dev/BA: is ADVISED required? If yes, add negative variant to NR-34 and seed a rule |
| D2 | Accounts only via contract (PR-22, NR-17, NR-18) | PR-21/PR-22/NR-17 write `ACCOUNTS` directly on `LI.LIMIT~INTERNAL`; Bruno `proj-limit-account-validation` is on `~INTERNAL` and the linkage plugin is on `PF.CONTRACT.OPERATION` | Manual QA: rework PR-21/22/NR-17 or move to US-09.01.03 SM-05 |
| D3 | Flag cannot become FALSE with groups (NR-21) | Not built (INDEX F4, `ACTIVE_GROUPS_EXIST` unseeded); NR-21's own setup (groups LIVE/NAU, then flag FALSE) is impossible under this rule | BA: does a NAU draft count; define setup order |
| D4 | PR-20 "different record id -> 200" | TC step is an amendment with PARENT_LIMIT_ID kept; Bruno clears it (Q12, unanswered); two limits at one node also trigger NR-29/NR-30 ambiguity | Dev: which scenario PR-20 is |
| D5 | NR-19 physical delete | Story AC7/Alt 6 says DELETE rejected; devs: DELETE allowed on NAU, impossible on LIV; no status/error seeded | BA: reword AC7 (LIV only, NAU allowed?) and give a status |
| D6 | NR-22 removed | Story Alt 7 still says reads are blocked | BA (Nastya): update Alt 7 or reinstate |
| D7 | Customer without a same-reference limit "rejected on binding" | No seeded error id for this check | Dev: error id |
| D8 | NR-06 reduce-parent-below-child | Not in Story; Bruno re-checks only the child at AUTH | BA: add rule + error id |

## Impact on automation (analysis only - nothing changed)

- **Merged SM-04** (`api/limit/tests/limit-hierarchy-smoke.spec.ts`, step 2/3) submits the group **with both customers at INPUT** and the group limit afterwards: rejected by the build (`SHARING_GROUP_MUST_BE_CREATED_WITHOUT_CUSTOMERS`) and now also contrary to the settled order. It needs: empty group -> group limit (LIVE) -> a LIVE limit per customer with the same `LIMIT_REFERENCE_ID` -> add customers (amend + AUTH). The "no customer limits" precondition stays true until step 1.2.
- **SM-01** should run on the Lead company (BNK per INDEX); verify `resolveLimitCompanyCode()` returns a Lead company, and that restore keeps `NET_OUTSTANDING`/`ADM_EXTENSION_DAYS` untouched.
- **WORKSPACE.MENU:** `api/system_core/helpers/workspace-menu-helper.ts` and `api/utils/constants/workspace-menu.values.ts` (`MASTER: 'WORKSPACE.MENU'`) write through that projection; re-check after Ryhor's change (the UI/API basic-customization specs depend on it).
- **Next batch candidates** stay PR/NR table-level cases, but assert **400** (plugin) only after the status/error backfill, and poll for async links (PR-17..19).
