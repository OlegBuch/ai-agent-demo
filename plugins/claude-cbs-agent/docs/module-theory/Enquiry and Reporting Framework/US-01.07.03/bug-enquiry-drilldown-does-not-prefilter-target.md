# Bug (or expectation mismatch): ENQUIRY-type drill-down does not pre-filter the target Enquiry by the mapped field

**Status (2026-09-25): confirmed live, blocking TC-3139. The `layout.columns` candidate fix (see
below) was tried live and made NO difference — column rendering and drilldown filtering are
confirmed independent mechanisms. Re-`test.skip`'d. Root cause still open.**

## TL;DR

A Source Enquiry's `ENQUIRY`-type drilldown (`buildEnquiryDrilldownLink(targetEnquiryId,
'CUSTOMER_ID', label)`) navigates correctly to the target Enquiry's Execute page, but the target
grid shows **every** record in the target table, not just the one matching the source record's
`CUSTOMER_ID`. A record seeded with a **different** `CUSTOMER_ID` than the source record is still
displayed after the drill-down. The filter row above the grid shows `+ Record ID`, `+ Space`, `+
Customer ID` as unapplied "add filter" buttons — no filter chip is pre-populated from the
drilldown.

## Symptom

1. Provision a target Source Table with two records: one sharing the source record's `CUSTOMER_ID`
   (`matchingTargetRecordId`), one with a different `CUSTOMER_ID`
   (`nonMatchingTargetRecordId`) — see `ui/enquiry/fixtures/enquiry-drilldown-setup.ts`.
2. Provision a target Enquiry (`CUSTOMER_ID` field only) and a source Enquiry whose only field is
   an `ENQUIRY`-type drilldown link to the target Enquiry, mapped via `filterFieldId: 'CUSTOMER_ID'`.
3. Open the source Enquiry on the Execute page, click the drill-down control on the source record,
   select the drilldown's label ("View Customer Detail").
4. The browser navigates to the target Enquiry's Execute page (`.../{targetTableId}/Enquiries/
   {targetEnquiryId}/Execute`) — URL and page title correct.
5. The grid shows **both** seeded target records ("Total 2 items"), including the one whose
   `CUSTOMER_ID` does not match the source record. No filter chip for `Customer ID` (or any field)
   is pre-applied — the filter row only shows unclicked "add filter" buttons.

## What this resolves

`ui/basic-customization`'s TC-20 (case 3843) asserts "no results" after the same kind of
`ENQUIRY`-drilldown, but against a target table with **zero** records — inconclusive, since an
empty table can't distinguish "the drilldown filtered down to nothing" from "the drilldown applies
no filter and the table simply had nothing to show". This fixture's matching/non-matching pair
makes the distinction unambiguous: **the drilldown applies no filter at all** — TC-20's "no
results" was just the trivial case of a genuinely empty target table, not evidence of filtering.

## Candidate fix — from Bruno evidence, 2026-09-25

A tester's comment about which tables she used for manual testing (pre-existing tables like
`AM.ACCOUNT`, rather than freshly API-created ones) led to pulling real Designer-authored Enquiry
Definitions off `AM.ACCOUNT` via Bruno. `AM.ACCOUNT~ENQ_AM.ACCOUNT` has a real `ENQUIRY`-type
drilldown:

```json
{
  "type": "ENQUIRY",
  "config": {
    "label": { "en-GB": "dfsfe" },
    "enquiry": { "id": "AM.ACCOUNT~Efsf" },
    "filterFieldId": "ID"
  }
}
```

This confirms the payload shape this repo's `buildEnquiryDrilldownLink` produces
(`{type:'ENQUIRY', config:{enquiry:{id}, filterFieldId, label}}`) is structurally correct — not the
likely cause. But the same Enquiry also had a non-empty `layout.columns`, exactly matching the
Execute-grid-columns bug's root cause above. This fixture's source and target Enquiry Definitions
were both sending `layout: {}`, same as every fixture did before that bug was root-caused.

**Fix tried and ruled out**: both the source and target Enquiry Definitions in
`ui/enquiry/fixtures/enquiry-drilldown-setup.ts` were given `layout.columns` via
`buildEnquiryLayoutColumns(['CUSTOMER_ID'])`, on the hypothesis that a missing `layout` — not the
`filterFieldId` mapping itself — was why the drilldown click carried no filter context to the
target page. **Live re-run showed no change**: the target grid still shows both the matching and
non-matching record ("Total 2 items"). This rules out `layout` as the cause of this specific
symptom — TC-3117's column-rendering bug and this drilldown-filtering bug are confirmed to be
independent product mechanisms, even though both fixtures happened to be missing `layout` at the
same time. The `layout.columns` change itself is harmless and has been left in place (it's still
correct per the TC-3117 finding), but it did not fix this bug.

## Still open

- `AM.ACCOUNT~ENQ_AM.ACCOUNT`'s own `filterFieldId` is `"ID"`, not a business field like
  `CUSTOMER_ID` — `"ID"` isn't in that Enquiry's `schema.properties` at all, suggesting it's a
  reserved name for "the record's own Record ID" rather than an arbitrary mapped field. This
  fixture maps `CUSTOMER_ID` (a real schema field shared by both sides) instead, since that is
  what the ticket's scenario calls for. **Next hypothesis**: `filterFieldId` may only support that
  `"ID"` pseudo-field (same-table, same-record-identity drilldowns), not arbitrary shared business
  fields mapped across two different tables — not yet tried.
- Still not tried: clicking the `+ Customer ID` filter button live after the drilldown lands, to
  see whether it pre-fills the source record's value (manual-apply model) or offers no hint at
  all.

## Incident

**2026-09-25** — `ui/enquiry/tests/enquiry-smoke.spec.ts` TC-3139 ("Drill-down navigation of the
Enquiry type is available and performed according to the setup") written against a new fixture
(`ui/enquiry/fixtures/enquiry-drilldown-setup.ts`) specifically designed to empirically settle
whether `ENQUIRY`-type drilldowns pre-filter the target Enquiry, given the ambiguous existing
evidence from `ui/basic-customization`'s TC-20. Live run confirmed no pre-filtering occurs. Marked
`test.skip(...)` pointing here. Same day, Bruno evidence from `AM.ACCOUNT`'s real Enquiries led to
a candidate fix (`layout.columns`); tried live, made no difference; re-`test.skip`'d with this
finding and the `"ID"`-vs-business-field hypothesis recorded above as the next thing to try.

## Bruno update (2026-10-05): `filterFieldId` was removed from the ENQUIRY drill-down shape

`proj-bruno-api` commit `dce8ba40` (TB-3331, 2026-08-26, "Remove filterFieldId from enquiry") deleted
`filterFieldId` from the `ENQUIRY` drill-down example in `Table Template/Enquries/Enquiry Operation.yml`
(now `{enquiry:{id}, label}`), and removed the per-conversion `currency` config of `AMOUNT` fields.
This repo's `buildEnquiryDrilldownLink(enquiryId, filterFieldId, label)` still sends `filterFieldId`.
**Hypothesis (not verified)**: an ENQUIRY drill-down no longer pre-filters the target by a field, which
would explain why TC-3139 shows every target record - i.e. the expected behavior in the ticket may be
obsolete rather than the product broken. Confirm with the product owner / TB-3331 before touching TC-3139.
Also: Bruno's PROJECTION drill-down examples use `record.sourceFieldId: null`, but the API rejects `null`
for a Projection in a different table (TC-3140 fixture, 2026-10-05): `sourceFieldId` is mandatory there.
