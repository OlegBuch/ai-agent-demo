# Test-case review calls, 2026-10-05 (sheets US-09.01.03 and US-09.01.04) - digest

## TL;DR

- **What:** two recordings, 55:35 (12:57 CEST) and 10:54 (15:15 CEST, "final part"). Manual QA Viktoryia Burak walks her workbook with the devs (Artur Fonichkin lead; a second dev, addressed as "Grisha", answers the Plugin/Bruno questions), BA Anastasiya Bylich ("Nastya") joins the second call, AQA (Ilona, Vadym) listen. Speakers are **not labelled** in the transcript (Whisper medium, names/numbers can be wrong).
- **Despite the folder name `discuss-US-09.01.01`, these calls review the sheets of US-09.01.03 (account linkage, 0:00-33:40) and US-09.01.04 (group limits, 33:47-end; call 2 = its "Negative regression", 18 cases).** The Oct-01 calls covered 09.01.01 (see [calls-2026-10-01-digest.md](calls-2026-10-01-digest.md)). The recording of call 1 starts mid-review (first line is already SM-01 of the linkage sheet).
- **Biggest new facts:** (1) an account is linked **only** through `PF.CONTRACT.OPERATION` + a `PF.CONTRACT.LIMIT.CONDITION`, bidirectionally; the `LI.LIMIT~INTERNAL` projection is opened to QA temporarily and **will be closed by a rejecting plugin**; (2) only **working-balance-0** accounts bind, **one account per request**, **only `ACCOUNTS` may change** (any other change = immediate 400); (3) every balance/netting/`AM.ACCOUNT.BALANCE` case is **out of this spec** (spec 3); (4) group: `TOTAL_OS_grp += only the new member's debt`, check `<= ADVISED` (equal is accepted), **no rounding**, customer must already own the group's whole reference hierarchy, **one group per customer is not yet validated** (Artur adds it), **Closed/Suspended customers are accepted today (bug)**, individuals are **allowed** (no corporate restriction); (5) **atomicity/concurrency is not started** - every parallel case waits for it; (6) first-error-only, no error aggregation.
- **Result in the workbook:** not checked here (no new xlsx); ~16 cases deleted/removed on the calls, 3 marked "keep, pending atomicity", 1 new case (inactive customer). Error ids still absent: assert **400 only**.
- Sources: own transcripts [call 3 (12:57)](transcript-call3-12_57.ru.txt), [call 4 (15:15)](transcript-call4-15_15.ru.txt) (format as the Oct-01 ones, second-accurate), `Granola-3.md`, `Granola-4.md` (both consistent with the transcripts; the transcripts add the per-level debt rule, the NAU-draft handling of the one-group rule, and the "no rounding" answer that Granola omits).

## Decisions on US-09.01.03 (account linkage) - transcript 00:00-33:40

| Topic (approx. TC) | Decision / fact on the call | Time |
|---|---|---|
| SM-01 pool limit (`SINGLE_LIMIT=FALSE`, no accounts) + same customer's account, WB 0 | 200; kept | 00:00 |
| SM-04 / SM-03 exclusive limit | first account links, second -> error; pool: any number of accounts, "no limit like 50"; WB is always 0 at link time, so "there is no other action" that could make it non-zero | 01:00-02:14 |
| E2E (contract) | contract + account are created **together**; the contract must carry a **PF Contract Condition with a limit link** at creation; the limit link is registered then. For tests: create the `PF.CONTRACT.LIMIT.CONDITION` first, then the contract operation. "I honestly don't know how account+contract are created together" -> ask dev | 02:24-04:20 |
| Response-shape case | only structure checked (recordId, data, accounts array, flags, audit); fine | 04:24 |
| "Only `ACCOUNTS` may change" | on the account write only the array may grow; **any other changed field -> immediate error, no check of what changed**. The rejecting plugin on the internal projection is **not placed yet**; devs may unbind it so QA can test, then rebind | 05:25-06:30, 26:47-29:47 |
| WB must be 0 | non-zero WB (e.g. -800, 400) refused; "-0.00" / "back to zero after -500" case: **dropped** ("never sent minus 0", murky) | 06:54, 08:30-09:54 |
| Two accounts, one by one | ok; **accounts can only be added one at a time**; two in one request = "precise error" regardless of validity | 07:59, 24:23 |
| Other customer's account on an exclusive limit; NR-05/NR-07-like | kept as "they behave like NR-5"; second account on exclusive limit via contract = error | 21:47-22:41 |
| Re-bind a NAU contract to another limit (edit its condition) | works in theory, "many manipulations"; **kept for later** | 11:52-14:00 |
| Role/permission cases ("risk officer") | **deleted**: nobody can bind by hand (action must be bidirectional), roles/privileges of a "risk officer" unknown; whoever has rights on `PF.CONTRACT.OPERATION` can bind | 14:09-15:51 |
| Parallel requests (two accounts to one empty exclusive / pool limit) | **kept but marked "pending atomicity"** (not started). Expected: first wins, second fails on version conflict, retry works. Both succeeding with one account lost = **bug** | 15:51-17:42 |
| Same account to two pool limits in parallel | **deleted**: a contract cannot carry two limit conditions | 18:05-18:32 |
| All netting / `AM.ACCOUNT.BALANCE` / "credit -40, current +15" cases | **deleted**: "third spec"; a zero-balance account never changes netting | 18:37-19:49, 33:03 |
| Duplicate account in one request | kept; needs the opened projection (no other way) | 20:11-21:16 |
| Re-bind an account already on the same limit | kept | 21:16 |
| Non-existent account / balance record absent | error, "correct" (no `AM.ACCOUNT.BALANCE` row) | 22:52 |
| Non-existent limit | expected **400**: plugin finds nothing and returns 404, core wraps it to 400 ("I think"); not verified | 23:20 |
| `AVAILABLE_MARKER=false` | "not expected to be false", left as is | 24:05 |
| Remove an account from a limit | **not possible yet** ("don't know how"); cases stay open | 24:56 |
| Create limit with accounts / change accounts of a live limit | both 400: "limit cannot be created with accounts" / "accounts cannot be changed" | 27:31-28:04 |
| Two rules violated in one request | only **one (first) error**, which one is unspecified; assert 400 | 28:04-28:59 |
| Invalid `ACCOUNTS` (string, number, `""` in array) / invalid body | schema or "account does not exist" error | 29:47-30:18 |
| USD limit + EUR account | **negative case deleted** (cross-currency binding is valid) | 30:18-30:41 |
| Closed/blocked account with WB 0 | **kept - not validated today, likely bug** (the check runs when the contract goes to LIVE; "might create us a bug") | 30:41-31:38 |
| Auth/token cases, wrong HTTP method, balance service down (500), DB failure, netting-read failure | **deleted** (cannot simulate / no roles) | 31:38-33:33 |

## Decisions on US-09.01.04 (group limits) - call 3 33:47-55:35, call 4 full

| Topic | Decision / fact | Where |
|---|---|---|
| Add 2 customers (debt 5k + 3k) to group `ADVISED 400k`, `TOTAL_OS 0` | `TOTAL_OS_grp` becomes 8000 if `<= ADVISED`; capacity check by formula | c3 33:53 |
| Group already 10k, add customer with debt 5k | 15k; **only the new member's debt is added** ("existing debts already included, no double counting") | c3 35:19, 39:16-40:42; c4 |
| Customer without debt | group `TOTAL_OS` unchanged | c3 36:43 |
| Currency | same currency: direct sum; different: converted (rate source "National Bank for now", not settled) | c3 35:45-36:34 |
| Customer has **no `LI.LIMIT` rows** | **cannot be added -> 400** (case "customer without limits, group has 2000" reversed). Customer must have **every reference of the group's hierarchy** (group 1000/1010/1020 -> customer needs the same; extra ones like 1030 are fine) | c3 36:57-39:06; c4 09:35-09:49 |
| Customer already in another group | **one group per customer**; checked on INPUT against LIVE groups and again on AUTH; **in NAU a customer may sit in many drafts**; the check may be **missing in code -> Artur adds it** | c3 41:17-44:38; c4 05:57-06:18 |
| "Group re-saved with the same members, other group" | resolved to the one-group rule above (rejected) | c3 40:42-44:00 |
| Three customers in one request | joint `TOTAL_OS` | c3 44:52 |
| Boundary | `TOTAL_OS_grp + sum <= ADVISED` accepted at equality; over by one cent rejected | c3 45:10; c4 07:21-07:36 |
| Amount precision | **no rounding**: sums with cents are added as received; "number of decimals" of a currency is validated by the balance/limit engine upstream, not here | c3 45:36-47:41 |
| Debt is counted **per level** of the hierarchy | customer 5000 appears on sub-product and product limit; group `TOTAL_OS` rises on **each matching reference**, counted once per level; group may hold only the top reference (1000) while the customer has 1000, 1010-1010, 1010-1020 - group reads only its own levels | c3 47:41-49:58 |
| Two drafts (A, B) with one free customer | both pass INPUT; drafts never lock the customer; conflict only at AUTH | c3 49:58-50:24; c4 06:18 |
| Parallel AUTH of two drafts with one customer | **atomicity-dependent**; today the group is overwritten | c4 06:26-07:12 |
| Group at limit (`TOTAL_OS` 400k): customer debt 0.1 + customer without debt | separate requests: debt-0.1 rejected, no-debt accepted; one combined request: both rejected | c4 07:43-08:36 |
| `TOTAL_OS` grew between INPUT and AUTH (396k, +5 > 400k) | check runs at AUTH; LIVE group stays without the member, `TOTAL_OS` 396k | c4 08:36-09:17 |
| Group with product + sub-product limits, sub-product passes, product exceeded | rejected: **whole hierarchy line is checked** | c4 09:17-09:35 |
| Flag `GRP_CREDIT_LIMIT=FALSE` + add customer | **deleted** ("group cannot exist with flag false") | c4 00:22-01:38 |
| Draft with customer created while TRUE, flag switched to FALSE, then draft AUTHed | **kept**: the flag can be switched off while **no group is LIVE** (NAU drafts do not block); the AUTH-time company check "we do not do" -> valid negative | c4 01:38-02:23 |
| Non-existent customer; mixed list (valid 5000 + non-existent) | error "customer does not exist"; **whole request rejected** | c4 02:25, 04:10-04:33 |
| **Closed / Suspended customer** | **not checked today -> add as a (bug) case** | c4 02:33-03:01 |
| **Individual (natural person) as member** | BA Andrei (via Artur): **no restriction planned**; case removed; Nastya to remove it from the Story validation | c4 03:01-05:03 |
| Two different errors in one request | only the first one the code reaches; **no aggregation** | c4 05:11-05:57 |
| Invalid `ALLOWED_CUSTOMER` element ("", number, `0`) | error in any case | c4 09:49-10:07 |
| Customer-service unavailable | **deleted** ("can try, better delete") | c4 10:07-10:43 |
| Reverse | LIVE -> `R NAU`; **on AUTH of the reverse: delete from NAU, delete from LIVE, insert into HIS** - the record never returns to LIVE/NAU. Without 4-eyes: delete from LIVE + insert into HIS. Reverse of a group that holds a customer: **deferred** (complex, unresolved). Call cut short | c3 50:34-55:22 |

## What is new compared with what we already held

| # | New / changed fact | Effect on existing notes |
|---|---|---|
| N1 | Only `ACCOUNTS` can change on the account write, **any other changed field = immediate 400** | Confirms `ONLY_THE_ACCOUNT_LIST_CAN_CHANGE_HERE` in the build; wording of the TC can go 400-only |
| N2 | The temporary opening of `LI.LIMIT~INTERNAL` for QA will be **closed by a plugin** | Any direct `~INTERNAL` account write test (PR-21/22, NR-17, duplicate-account case) has a **shelf life**; they are not suitable for a durable regression suite |
| N3 | Netting/balance cases are **not part of this spec** and zero-balance linking cannot affect netting | Narrows the 9 "Blocked" netting TCs of 09.01.03 to "spec 3" - not a dev blocker of this story |
| N4 | `TOTAL_OS_grp` adds **only the new member's debt**; check `grp.TOTAL_OS + new <= ADVISED`, equality accepted, no rounding | Refines PR-23 of 09.01.01 ("sum of all members <= advised" is the same invariant, expressed on the stored total) |
| N5 | Customer must own the group's **full reference hierarchy** | Answers the open D7 shape of "customer without a matching limit rejected on binding": rule is 400, **id still unseeded** |
| N6 | GRP flag may be switched FALSE while only **NAU** groups exist; blocked only by **LIVE** groups | Partly answers D3: "does a NAU draft count?" -> **no**; setup order for NR-21: no LIVE group exists when the flag is switched |
| N7 | Individuals allowed in groups; **inactive customers allowed today (bug)** | Contradicts F5/AC4 ("customer inactive/suspended -> `INVALID_GROUP_COUNTERPARTY`") - the Story rule exists, the build does not; the Story's corporate-sector check is dropped |
| N8 | One-group-per-customer validation may be **missing** in the build | Check in Bruno plugin `proj-limit-group-validation` before asserting it; Artur adds it |
| N9 | **Atomicity not started**; parallel cases deferred; both-succeed = lost update = bug | Marks every concurrency TC (all sheets) as not automatable now |
| N10 | First error only, **no error aggregation** | Multi-violation negative TCs must assert 400 only, not both messages |
| N11 | Reverse = AUTH transfer to HIS only; group-with-customer reverse unresolved | Extends Oct-01 open question D5/PR-24 |
| N12 | Excel stays the working format; Allure after the TCs are agreed; "send TCs to Claude for coverage review" | Process |

## Open questions / discrepancies (not resolved by these calls)

| # | Question | Owner |
|---|---|---|
| Q-A | Error ids/messages for every "400" above (only the two limit-create/accounts messages were quoted from memory) | Dev/BA |
| Q-B | Is the missing-limit case really 400 (plugin 404 wrapped) - unverified | Dev -> live check |
| Q-C | One-group-per-customer: where is it enforced, at INPUT only or also AUTH (the explanation says both) | Artur |
| Q-D | Closed/Suspended customer: bug or by design; Story AC4 text | BA (Nastya) |
| Q-E | Currency rate source for cross-currency `TOTAL_OS` ("National Bank for now") | BA |
| Q-F | Account removal from a limit: no mechanism | Dev |
| Q-G | Reverse of a group with members | Artur, Viktoryia |
| Q-H | How a closed/blocked account in LIVE contract state is validated | Dev |

## Impact on automation (analysis only - nothing changed)

- **Smoke SM-04 (merged):** unchanged conclusion from Oct-01 (empty group -> group limit -> customer limits -> add customers). The new call adds: customer limits must carry the **same reference hierarchy** as the group's, otherwise 400.
- **Account-linkage candidates** (09.01.03 table-level list): anything that writes `ACCOUNTS` on `LI.LIMIT~INTERNAL` directly is **temporary**; the durable path is a contract operation with a `PF.CONTRACT.LIMIT.CONDITION`. Parallel/atomicity cases and every case that needs a balance are out.
- **Group negatives that are safe table-level 400s:** customer not existing, mixed list, invalid element, no `LI.LIMIT` rows, over `ADVISED`, product-level exceed, flag-off-after-draft. **Not safe yet:** inactive customer (expected-failure/bug), one-group-per-customer (may not be built), parallel AUTH, group reverse.
