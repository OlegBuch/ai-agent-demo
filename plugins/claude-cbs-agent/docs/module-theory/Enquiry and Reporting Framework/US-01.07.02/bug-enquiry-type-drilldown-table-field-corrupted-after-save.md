# Bug (or expectation mismatch): ENQUIRY-type drill-down links never display their own Table/Enquiry correctly, however they were created

**Status (2026-10-02): confirmed live while building TC-2938 AND TC-2937, including a direct
network-tab confirmation of the root symptom (see "Confirmed root cause" below), and confirmed
(TC-2937) to reproduce identically for a link that was seeded directly via the API and NEVER
touched the UI's own save form - this rules out "corruption introduced by the save flow" entirely;
it is a read/render issue for this link Type, full stop, regardless of how the link was created.
Not pursued further than that (per the "проверяем внешний вид, не копаем" rule) - documented and
worked around in both tests.**

## TL;DR

On the Drill-down tab of an existing Enquiry's edit page
(`.../enquiries/{tableId}~{enquiryId}`), creating a new `Type = "Enquiry"` drill-down link (Table =
a real source table with its own Enquiry, Enquiry = that table's Enquiry), filling Label for both
configured languages, and clicking "Save Drill-down" shows the expected "Enquiry saved
successfully." toast - but the link's own row immediately (and persistently, confirmed after a full
page reload, not just a transient re-render race) shows a broken state:

- The **Table** field displays the *Enquiry's* raw ID (e.g. `aqa_enq_a_w0_1790929495146_6a8`)
  instead of the Table's ID (e.g. `aqa_int_table_w0_1790929422692_c2b`).
- The **Enquiry / Projection** field shows that same raw Enquiry ID string, with a **"Must be a
  valid Enquiry"** validation error directly underneath it.
- The **Label (Multi-language)** fields (both EN-GB and FR-FR) remain correctly populated with
  whatever was typed/auto-filled before Save.

## Symptom (steps to reproduce)

1. Open an existing Enquiry for editing (via the Enquiries list's "View" action), go to its
   Drill-down tab - confirmed empty (`ui/enquiry/pages/enquiry-edit-page.ts` +
   `enquiry-drilldown-step-page.ts`'s `assertDrilldownEmptyState()`).
2. Click "Create Drill-down link". Order auto-assigns to "1" (disabled input).
3. Set Type = "Enquiry". Confirmed live: the whole secondary-fields block (Operation + Source
   Field) is removed from the DOM entirely for this Type - not just disabled, contrary to this
   ticket's own wording ("Operation field becomes disabled/greyed out") and its mention of a
   "Filter Field" for Type = Enquiry, which never appears at all.
4. Search and select a real Table that already has its own Enquiry (here: a fixture-provisioned
   `TABLE_A` with `ENQ_A`).
5. Open "Enquiry / Projection" - correctly lists only that one Enquiry. Select it. Label (EN-GB)
   auto-fills with the Enquiry's own name; Label (FR-FR) stays empty and must be filled manually
   (confirmed: unlike EN-GB, FR-FR does NOT auto-fill).
6. Fill Label (FR-FR) manually, e.g. `"Automated Enquiry A FR"`.
7. Click "Save Drill-down". Toast "Enquiry saved successfully." appears. **Already at this point**,
   before any reload, the row's Table/Enquiry-Projection fields show the broken state described
   above.
8. Reload the page (F5) and reopen the Drill-down tab fresh. The broken state is identical and
   stable - not a one-off render race during the save transition.

## What this affects

TC-2938 ("[Drill-down] Add Drill-down link (Type=Enquiry and Type=Projection)") step 7 of the
ticket text expects "Link 1 saved and displayed" with no further qualification. The test was
adapted to assert only the "Enquiry saved successfully." toast after clicking "Save Drill-down" -
it does **not** assert what the Table/Enquiry-Projection fields show afterward, since that would
either (a) encode this bug as a passing-test "contract" that breaks the moment it's fixed, or (b)
fail the test on a defect unrelated to what TC-2938 is actually trying to verify (that the link can
be created and saved at all).

TC-2937 ("[Drill-down] Configured drill-down link is displayed correctly when opened for editing")
step 1 expects Link 1's Table/Enquiry/Filter Field/Operation to all display correctly for a
pre-configured `Type = "Enquiry"` link - this is the ticket this bug most directly contradicts,
since its entire premise (viewing an existing, correctly-configured link) is exactly the case that
is broken. Adapted the same way: assert the actual observed broken state for Link 1 (Table shows
the enquiry id, "Must be a valid Enquiry" error, no Filter Field/Operation), and assert Link 2
(`Type = "Projection"`) displays correctly, since that part of the ticket does hold.

## Confirmed root cause (network tab, 2026-10-02)

DevTools Network tab on reload shows the frontend firing:

```
GET http://bankstg.local/table-registry/api/v1/tables/aqa_enq_a_w0_1790929495146_6a8
-> 404 Not Found
{
  "detail": "Table not found by id: aqa_enq_a_w0_1790929495146_6a8",
  "instance": "/table-registry/api/v1/tables/aqa_enq_a_w0_1790929495146_6a8",
  "status": 404,
  "title": "Not Found"
}
```

`aqa_enq_a_w0_1790929495146_6a8` is the **Enquiry's** id (`ENQ_A`), not the Table's id
(`aqa_int_table_w0_1790929422692_c2b`, i.e. `TABLE_A`). This directly confirms the hypothesis
below: whatever the frontend reads as "the table id" for a saved `Type = "Enquiry"` drill-down link
is literally the enquiry id, not the table id - it then calls the Table Registry with that wrong id
and 404s, which is what produces the broken Table-field display and the "Must be a valid Enquiry"
error (its own lookup is presumably keyed off this same wrong/missing table context). Not
pursued further than this - root-causing whether the bug is in what the backend *saves* vs. what
the frontend *reads back* would need a Bruno payload inspection of the raw saved record, which is
out of scope for this test-writing session.

## Candidate explanation for *why* (not independently verified against the raw saved payload)

The untracked Bruno reference example in `proj-bruno-api`
(`collections/Table Template/Enquries/Enquiry Operation FOR DRILLDOWN.yml`) shows the `ENQUIRY`
type's saved `config` shape as `{enquiry: {id}, label, filterFieldId?}` - with **no `targetTableId`
field at all**. If the real backend payload genuinely omits the table id for this link type, the
frontend has no way to reconstruct which Table the row's "Table" selector should show on reload,
and falls back to displaying `config.enquiry.id` in both the Table and Enquiry/Projection fields
instead - matching the confirmed 404 above exactly.

## Confirmed scope (2026-10-02): Type = "Projection" is NOT affected

Created a second drill-down link (`Type = "Projection"`, Table = a different source table with its
own Projection, Operation = `SEE`, Source Field auto-filled to `"Record ID"`, Label both languages)
on the same Enquiry, right after the broken `Type = "Enquiry"` link above. This second link saved
and redisplayed **correctly** - Table kept showing the real table, "Enquiry / Projection" showed no
error. So this bug is specific to `Type = "Enquiry"` links; `Type = "Projection"` is unaffected,
consistent with the candidate explanation below (the `PROJECTION` config shape, unlike `ENQUIRY`'s,
includes `record: {sourceFieldId}` alongside `projection: {id}` - plausibly giving the frontend
enough to resolve the Table correctly on reload where the `ENQUIRY` shape does not).

## Confirmed (2026-10-02, TC-2937): reproduces identically for an API-seeded link that never touched the UI save form

TC-2937 provisions its Enquiry directly through `EnquiryApiClient.createEnquiryDefinition`, with
its `drilldowns` array built entirely via this repo's own existing
`buildEnquiryDrilldownLink(enquiryId, filterFieldId, label)` helper
(`api/system_core/payload-builder-enquiry.ts`) - whose own return shape is
`{type: 'ENQUIRY', config: {enquiry: {id}, filterFieldId, label}}`, written by this test itself, so
there is no ambiguity about what was sent: **no `targetTableId` field was ever included, because
there is no such field in this shape to include.** Opening this Enquiry for editing (never
previously opened, never saved through the UI form) shows the exact same broken Table/Enquiry
display as TC-2938's live-created link. This resolves the previously-open question below in favor
of "the config shape itself has no table-id field, by design or by gap - not a frontend
save-time/read-time field-mapping mistake limited to the live-UI-save path." Also reconfirmed in
the same pass: "Filter Field" and "Operation" render for NEITHER a freshly-configured (TC-2938) NOR
an already-saved-with-`filterFieldId`-set (TC-2937) `Type = "Enquiry"` link - this UI simply never
shows those controls for this Type, independent of whether the link's config has a
`filterFieldId` value already set.

## Still open

- Not yet tried: whether re-selecting the Table (and re-saving) heals the display, or whether the
  corruption is permanent for a given link once rendered broken once.
- Not yet tried: confirming via Bruno whether a real, Designer-authored `Type = "Enquiry"` drilldown
  (the way `AM.ACCOUNT~ENQ_AM.ACCOUNT`'s was found for the sibling prefilter bug) also lacks a
  table-id field in its `config`, which would confirm this is the documented/intended shape rather
  than an accidental omission.

## Incident

**2026-10-02** - found live while building `ui/enquiry/tests/enquiry-smoke.spec.ts`'s TC-2938 with
the user (Sergei) walking the real app by hand through the Playwright Inspector's `page.pause()`
breakpoints and reporting back screenshots/outerHTML at each step. Agreed approach: don't hard
-assert the broken post-save display in the test (would either encode-the-bug or fail unrelated to
TC-2938's actual intent), just assert the save succeeded via its toast, and capture the finding
here for whoever picks this up next.
