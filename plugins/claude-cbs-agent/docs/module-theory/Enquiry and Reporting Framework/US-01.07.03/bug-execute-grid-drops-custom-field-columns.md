# Bug: Execute grid never renders custom field columns, regardless of permissions or data correctness

**Status (2026-09-25): RESOLVED. TC-3117 passes live.** Root-caused via live Bruno evidence from a
real Designer-authored Enquiry on AM.ACCOUNT (`AM.ACCOUNT~DRILL`, `AM.ACCOUNT~ENQ_AM.ACCOUNT`) —
every fixture in this repo sent `layout: {}`, but the Execute grid's column list is driven by
`layout.columns` (an ordered array of `{ fieldId }`), not `schema.properties` alone. Fixed in
`ui/enquiry/fixtures/enquiry-column-display-setup.ts` via the new `buildEnquiryLayoutColumns` helper
in `payload-builder-enquiry.ts`. Getting the test fully green also required fixing the page object's
cell-lookup (see "Related fixes" below) — the column-rendering bug itself is fully closed.

## TL;DR

An Enquiry created via direct API calls (`POST .../definitions/enquiry/operation/INPUT`, the same
pattern used by every other UI-smoke fixture in this repo) never shows any of its configured fields
as columns on the Execute page — not even plain `ALPHANUMERIC`/`AMOUNT` fields, let alone the
Multi-value/Multi-marker ones TC-3117 targets. The column-visibility (gear) panel only ever lists
the three built-in columns (Record ID, Status, Space). This happens even when every relevant API
call returns `200` with fully correct data: the Execute grid's records, the Enquiry Definition's
`SEE`, the Source Table's `table-registry` card, and the Source Table's `/definitions` schema were
all confirmed live-correct in the same run that still showed zero custom columns.

## Symptom

1. Provision a Source Table (via `updateTableDefinition`) and an Enquiry Definition (via
   `enquiryClient.createEnquiryDefinition`) with several fields, exactly like
   `ui/enquiry/fixtures/enquiry-display-setup.ts` and the new
   `ui/enquiry/fixtures/enquiry-column-display-setup.ts` do.
2. Open the Enquiry on the Execute page (`.../tableRegistry/{tableId}/enquiries/{enquiryId}/execute`).
3. The grid renders the correct number of rows and the built-in `Record ID` / `Status` / `Space`
   columns. `POST .../enquiries/{enquiryId}/execute` returns `200` with the full `result` object per
   row (every configured field present, correctly typed and valued).
4. The column-visibility gear panel (top-right, next to "Generate Report") lists only `Record ID`,
   `Status`, `Space` — no checkbox for any configured field, even a plain `CUSTOMER_ID`. No extra
   `<th>` columns are ever rendered.

## What's been ruled out (confirmed live, in order)

- **Not a stale/deleted-table artifact** — reproduced on a table still alive mid-test (`page.pause()`
  before the fixture's own cleanup ran).
- **Not the disposable test-user's permissions, for the obvious grants** — after granting
  `{TABLE: tableId, FUNCTION: 'SEE'}` alone (TC-3112's grant) still showed zero columns; adding
  `{TABLE: 'TABLE_REGISTRY', FUNCTION: 'TABLE_REGISTRY_READ'}` turned a `403 "User does not have
  access to table: TABLE_REGISTRY"` on `GET table-registry/api/v1/tables/{tableId}` into `200` —
  still zero columns. Adding `{TABLE: 'SYSTEM.PARAMETER', FUNCTION: 'SEE'}` did not change the
  outcome either (see below — that 403 turned out to be unrelated noise).
- **Not the `/definitions` read-path's known post-write propagation lag** — `GET
  .../tables/{tableId}/definitions` 503'd ("no healthy upstream") right after fixture setup on one
  run (an Envoy/Istio-level outage, confirmed also failing the fixture's own `PUT`); adding a
  `pollUntilReady` loop on the read path (mirroring the write path's own `TABLE_API_READY_MAX_WAIT_MS`
  poll in `table-registry-api-client.ts`'s `updateTableDefinition`) got it to a clean `200`. Still
  zero columns.
- **Not a malformed schema** — the `200` response body from `GET .../definitions` was inspected
  directly and is exactly the submitted schema (`TAGS`, `CHARGES` with `CHARGE_CCY`/`CHARGE_AMOUNT`,
  `VALUE_DATE`, `CUSTOMER_ID`, `PRINCIPAL_AMOUNT`, all correct `x-type`/`x-config`).
- **The `SYSTEM.PARAMETER~MASTER SEE` 403 (`"User does not have access to company: null"`) is a red
  herring** — it fires repeatedly during the login/company-selection flow itself (`company: null` in
  every instance), not specifically while rendering the Execute grid, and granting `SEE` on
  `SYSTEM.PARAMETER` didn't change the outcome.
- **No JS console errors/exceptions were observed** in the browser during any of this — the missing
  columns are not obviously the result of an uncaught client-side exception (though this wasn't
  exhaustively instrumented; a caught-and-swallowed exception can't be ruled out this way).

## Root cause — confirmed via Bruno, 2026-09-25

Pulled two real, Designer-authored Enquiry Definitions off `AM.ACCOUNT` via `POST
table-template/api/v1/tables/AM.ACCOUNT/definitions/enquiry/operation/SEE`:

- `AM.ACCOUNT~DRILL`: `layout: { columns: [{fieldId:'CONTRACT'}, {fieldId:'CURRENCY'},
  {fieldId:'CATEGORY'}] }` — exactly mirrors `selection.inputFieldIds`' order.
- `AM.ACCOUNT~ENQ_AM.ACCOUNT`: `layout: { columns: [{fieldId:'CURRENCY'}, {fieldId:'CONTRACT'},
  {fieldId:'ALTERNATE_ACCOUNTS'}] }` — same pattern.

Both are non-empty and both exactly enumerate the fields meant to show as grid columns, in order.
Every fixture in this repo (this one included, until now) sent `layout: {}` — the bare-minimum
shape from Bruno's documented example request — which is apparently insufficient: `schema.properties`
alone does not drive the Execute grid's column list, `layout.columns` does.

**Fix applied**: `payload-builder-enquiry.ts` gained `buildEnquiryLayoutColumns(fieldIds)`, which
builds `{ columns: fieldIds.map(fieldId => ({ fieldId })) }`. `enquiry-column-display-setup.ts` now
passes this (built from the same field-id order as its `schema`) as the Enquiry's `layout`. TC-3117
has been unskipped.

## Related fixes required to get TC-3117 fully green

Two more things, unrelated to the `layout.columns` root cause itself, were found and fixed live
while finishing TC-3117:

1. **The Execute grid is an AntD *virtualized* table** (`.ant-table-tbody-virtual`) — the header row
   is a real `<table>`/`<th>`, but the body renders each row as `<div class="ant-table-row"
   data-row-key="...">` with `<div class="ant-table-cell">` cells, never `<td>`. The page object's
   cell/row locators (`gridRows`, `fieldCellForRecord`) previously assumed a plain `<td>`-based
   table and matched zero elements. Fixed: row lookup now uses the row's `data-row-key` attribute
   (exact match, unaffected by any cell-text truncation) and cell lookup uses `.ant-table-cell`.
2. **Header order and body cell order diverge once a Multi-marker field is involved.** For this
   fixture's `CHARGES` field, the header row lists `..., Charges, Total Charges, CHARGE_CCY,
   CHARGE_AMOUNT` (7 non-default headers), but the body row only has 6 non-default cells — the
   `Charges` header has no corresponding body cell at all, and the body's actual order is
   `..., CHARGE_CCY, CHARGE_AMOUNT, Total Charges` (CHARGE_CCY/CHARGE_AMOUNT render immediately
   after the field before CHARGES, not at the header row's position for them). A computed
   `AGGREGATE` field's cell (`TOTAL_CHARGES`) also drops trailing decimal zeros (`"100"`, not
   `"100.00"`). Given this, header-position-based cell lookup (`fieldCellForRecord`) is only valid
   for plain fields; the page object gained `bodyCellTexts(recordId)` (returns the row's raw
   ordered cell text list) for asserting the reordered tail directly instead.

## Still open

Whether `layout.columns` is *sufficient* on its own for every field-type combination, or whether
other `layout` content the Designer UI also writes (view type, widths, etc. — unknown, since these
two live examples only showed `columns`) matters too for cases not yet exercised by a fixture. The
header/body divergence for Multi-marker fields (point 2 above) is also only confirmed for a single
CHARGES entry with two sub-fields — untested with more sub-fields or multiple group instances.

## Incident

**2026-09-24/25** — `ui/enquiry/tests/enquiry-smoke.spec.ts` TC-3117 ("Displayed columns exactly
match the fields added on Enquiry Designer step") written against a new fixture
(`ui/enquiry/fixtures/enquiry-column-display-setup.ts`) covering a plain field, a Multi-value
multifield (`TAGS`), a Multi-marker multifield-array (`CHARGES`), a computed/virtual `AGGREGATE`
field (`TOTAL_CHARGES`), and a deliberately-unadded field (`VALUE_DATE`). After ruling out every
permission/propagation-lag cause found above across two sessions' worth of live debugging (see the
DevTools evidence trail above), the test was marked `test.skip(...)` pointing here. A tester's
comment about which tables she used for manual testing (`AM.ACCOUNT`, among other pre-existing
tables) led to pulling two of its real Designer-authored Enquiry Definitions via Bruno, which
confirmed `layout.columns` as the root cause. Fix applied and test unskipped same day. Two further
live-debugging rounds (virtualized-table locators, header/body order divergence for the expanded
Multi-marker field — see "Related fixes" above) were needed to get the test fully green. TC-3117
passes as of the same day.
