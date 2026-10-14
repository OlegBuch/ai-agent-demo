# Customer (Party) Data (EP-03.01)

**TL;DR.** UI regression (TB-3542, MR 184, 62 tests) and UI smoke (TB-3124, MR 185, 46 tests) live in `ui/customer/sub_modules/customer_party_data/`; all 108 green on bankuat on 2026-10-08 (4 workers, 7 min). MR 185 was reworked by merging the reworked MR 184 branch into it and porting only the smoke spec, so the shared files exist once. Three manual TCs (3638, 3718, 3741) describe behaviour the system does not have; their tests were written to the real behaviour on the owner's instruction and the TCs in Allure were deliberately left unchanged (to be corrected later). Source check: Confluence (both sites), Bruno `origin/main`, live bankuat probe.

## Verified facts (bankuat, 2026-10-08)

| TC | TC says | Real behaviour | Evidence | Test now asserts |
|---|---|---|---|---|
| 3638 | Sector read-only / auto-set on creation forms | Mandatory, editable LinkedTable, chosen by the user; INPUT without `SECTOR` -> 400 `SECTOR is required to apply customer defaults` | Bruno projections list SECTOR in `required`, no readOnly/default; bank `CM.CUSTOMER~RETAIL.INPUT` page v14 "Selected manually by the user"; API TC-3522 asserts `readOnly != true`. innowise master US-03.01.01 v41 still says auto-set (conflict, open for BA) | Sector is mandatory and editable |
| 3718 | Promotion with a legal id already held by an active customer is rejected | Accepted (200); same for plain creation. No duplicate-config exists on `CM.CUSTOMER` (404); DB showed 1 LIV + 2 NAU rows with the id | Bruno has no LEGAL_ID duplicate config or error id; the rule "LEGAL_ID unique among active CM.CUSTOMER" exists only in innowise US-03.01.05 v21, absent from bank v15 | Promotion is accepted |
| 3741 | Authoriser can reject a relationship creation, record deleted, no entries | `CM.CUSTOMER.RELATIONSHIP` does not support DEL (API 400 `does not support DEL operation`); UI DELETE disabled, AUTH panel offers only "Authorize" | Probe + UI; bank US-03.01.07 Alt 4 describes NAU -> DEL but names no action | Authoriser cannot reject; record stays Unauthorised |

Open for BA/Dev: which Sector wording is current (bank v18 vs innowise v41); whether a LEGAL_ID uniqueness rule should exist and with which error id; how a relationship creation is meant to be rejected.

## Patterns & Predictive Rules

- A UI TC that says "read-only/auto-set" for a LinkedTable field is suspect: check the projection `required`/`readOnly` flags in Bruno and the API definition (TC-3522 style) before automating.
- "Unique among active records" in a Story is not implemented unless a duplicate-config (`/tables/<id>/duplicate-configs`) or a named error id exists in Bruno; GET the duplicate-config first, a 404 means no rule.
- Whether a table supports DELETE is table-specific (`does not support DEL operation`); do not assume a reject path from a sibling table (customer/prospect DELETE works, relationship does not).
- Test-fixture `SECTOR` must be a seeded value (`1001` on bankuat); the builders send it.
- A UI form `Save`/`Save Draft` click returns before the request finishes: a test that then navigates away races the save (record "not found" for 60 s). `CustomerPartyFormPage.submit()/saveAsDraft()` now wait for the `records/operations` response; do the same in any new Customer page object instead of fixed sleeps.
- `LEGAL_DOC_NAME` (and other linked fields inside array items) must be chosen with `selectNestedOption`, not typed with `fillNestedText`: typing leaves it unset and the form blocks with "LEGAL_DOC_NAME must be specified" (no network call is made).
- `no healthy upstream` (envoy) on a page snapshot is a transient environment failure, not a test defect: re-run only the failed tests before investigating.
- Run UI specs with `--workers=4 --fully-parallel` (per-test users make them order-independent): 62 tests 40 min -> 3.5 min.
