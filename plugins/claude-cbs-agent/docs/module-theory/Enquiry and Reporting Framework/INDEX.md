Module: Enquiry & Reporting Framework (US-01.07.xx)
Last updated: 2026-10-05

This file is the entry point for anything touching the Enquiry & Reporting Framework module. Read
it first, before re-deriving facts from Bruno/Jira/Confluence.

## Open items — read the specific file for full detail

| File | Status (as of 2026-10-05) | What it's about |
|---|---|---|
| [US-01.07.03/bug-execute-grid-drops-custom-field-columns.md](US-01.07.03/bug-execute-grid-drops-custom-field-columns.md) | **RESOLVED — TC-3117 passes live** | Root cause confirmed via Bruno evidence from real Designer-authored Enquiries on `AM.ACCOUNT`: the Execute grid's column list is driven by `layout.columns`, not `schema.properties` alone. Every fixture sent `layout: {}`. Fixed via the new `buildEnquiryLayoutColumns` helper. Also fixed along the way: the Execute grid is an AntD *virtualized* table (`data-row-key`/`.ant-table-cell`, not `<td>`), and header/body column order diverges once a Multi-marker field is expanded. |
| [US-01.07.03/bug-enquiry-drilldown-does-not-prefilter-target.md](US-01.07.03/bug-enquiry-drilldown-does-not-prefilter-target.md) | **Open — blocking TC-3139, `test.skip`'d. `layout.columns` fix tried live, ruled out.** | An `ENQUIRY`-type drilldown navigates to the correct target Enquiry but shows every record instead of pre-filtering by the mapped `filterFieldId` — confirmed live with a matching/non-matching record pair; also resolves `ui/basic-customization` TC-20's ambiguous "no results against an empty table" evidence. The `layout.columns` fix that resolved the column-rendering bug above was tried here too and made no difference — the two bugs are independent. Next hypothesis: `filterFieldId` may only support the reserved `"ID"` (record-identity) value seen on a real `AM.ACCOUNT` drilldown, not arbitrary shared business fields across two tables. |
| [US-01.07.02/bug-enquiry-type-drilldown-table-field-corrupted-after-save.md](US-01.07.02/bug-enquiry-type-drilldown-table-field-corrupted-after-save.md) | **Open — found while building TC-2938, confirmed broader (read/render issue, not save-flow-specific) while building TC-2937. Root symptom confirmed via network tab (404).** | A `Type = "Enquiry"` drill-down link's own Table field always displays the *Enquiry's* id instead of the Table's id, with "Enquiry / Projection" showing a permanent "Must be a valid Enquiry" error — confirmed via DevTools Network tab (`GET .../tables/{enquiryId}` 404s) and confirmed (TC-2937) to reproduce identically for a link seeded directly via the API that never touched the UI save form, ruling out a save-flow-specific cause. The `ENQUIRY`-type config shape (`{enquiry:{id}, filterFieldId, label}`, built by this repo's own `buildEnquiryDrilldownLink` helper) has no table-id field at all. Also confirmed: "Filter Field"/"Operation" never render for `Type = "Enquiry"`, fresh or pre-saved. Both TC-2938 and TC-2937 were adapted to assert only what's actually true (save succeeds / Link 1 shows the broken state / Link 2 displays correctly), not the ticket wording where it's contradicted. |
| [US-01.07.02/bug-workspace-menu-root-with-menu-link-returns-500.md](US-01.07.02/bug-workspace-menu-root-with-menu-link-returns-500.md) | **Server bug open (env, `two.bankuat`), worked around in fixtures (single root with direct PROJECTION item); TC-2938, 2937, 2198, 2205 all pass live.** | `POST .../projections/WORKSPACE.MENU/records/operations/INPUT` returns 500 (empty body) for a root (`IS_ROOT: true`) whose `ITEMS` link (`MENU_TARGET_TYPE: MENU`) to an existing folder; empty roots and folders with a `CUSTOM` item return 200. Passed on 2026-10-02. The `WORKSPACE.MENU` vs `WORKSPACE.MENU~MASTER` projection hypothesis was tested and refuted (default projection accepts writes). Needs the owners' server logs. |

## Patterns & Predictive Rules

- **Fixtures must not share a fixed table title.** Table titles are unique in the registry, and
  worker-scoped fixtures stay alive until the next fixture tears them down, so two fixtures creating a
  table titled `CustomerOverview` (`ENQUIRY_ASSEMBLE_TABLE_TITLE`) collide with `409 Table with name
  already exists` when their tests run back to back in one worker - tests then alternate pass/fail.
  Confirmed 2026-10-05 (TC-2929/TC-2922). **Predict**: a new Enquiry fixture should use
  `buildUniqueEnquiryTableTitle(testedTableId)`; all enquiry fixtures now use it (the last 7 - basic-persist, designer-default-view,
  assemble-basic, designer-boolean-field, no-input-permission, drilldown-config, drilldown-projection-config -
  switched on 2026-10-05 after TC-1864, TC-2147, TC-2199 failed with the 409 in the full run).
- **A new mandatory field on a shared projection breaks every test that creates that kind of record.**
  `BUSINESS_UNIT_ID` became mandatory on `SM.USER~INTERNAL` (default `CBS`, internal only); it surfaced
  as a 400 in the shared super-admin fixture, not in any one test. Bruno seeds already carried the
  field. **Predict**: when a shared fixture fails with `required property 'X' not found`, check Bruno's
  seeds for the same projection first - they usually already send it.

- **A `200` response with fully correct data at every layer does not mean the UI will render it.**
  Confirmed for the Execute grid's column list specifically — all of Execute's own data call, the
  Enquiry Definition's `SEE`, the Source Table's `table-registry` card, and its `/definitions` schema
  read `200` clean with correct content, yet the grid still shows zero custom columns. **Predict**:
  when a UI element depends on data assembled from several API calls, verify the *rendered result*
  directly (via a live paused browser + DevTools), not just that the underlying calls succeed — a
  clean network tab does not prove the frontend used that data correctly.
- **`layout.columns` — not `schema.properties` alone — drives the Execute grid's column list.**
  Confirmed 2026-09-25 via two real Designer-authored Enquiries on `AM.ACCOUNT`
  (`AM.ACCOUNT~DRILL`, `AM.ACCOUNT~ENQ_AM.ACCOUNT`), both with non-empty `layout: { columns: [...] }`
  exactly mirroring `selection.inputFieldIds`. Every fixture in this repo previously sent
  `layout: {}` (the Bruno-documented bare-minimum example), which is apparently insufficient. Use
  `buildEnquiryLayoutColumns(fieldIds)` from `payload-builder-enquiry.ts` for any new Enquiry
  Definition fixture that needs its fields to render as Execute-grid columns.
- **When something about a fixture's behavior doesn't match manual-testing reality, ask what data
  the manual tester actually used.** This module's two open bugs (columns not rendering, drilldown
  not filtering) were both traced to the same root cause after a tester mentioned she tested against
  pre-existing tables like `AM.ACCOUNT` rather than freshly API-created ones — pulling one of her
  real Enquiry Definitions via Bruno surfaced `layout.columns` directly. **Predict**: when a fixture
  built "by convention" from documented example payloads doesn't produce the expected UI behavior,
  compare against a real, human-created example of the same object before assuming it's a product
  bug — a documented minimal example (like Bruno's `layout: {}`) is not guaranteed to be what the
  real UI actually sends.
- **The Execute grid is an AntD *virtualized* table — row/cell locators must account for this.**
  The header row is a real `<table>`/`<th>`, but the body renders each row as `<div
  class="ant-table-row" data-row-key="...">` with `<div class="ant-table-cell">` cells, never
  `<td>`. Any page object targeting this grid's body should locate rows via `data-row-key`
  (exact, unaffected by cell-text truncation) and cells via `.ant-table-cell`, not `<td>`.
- **Header column order and body cell order can diverge once a Multi-marker field is expanded —
  don't assume header-position indexing maps onto body cells.** Confirmed for `CHARGES` (one
  Multi-marker entry, two sub-fields): the header lists the parent field (`Charges`) as its own
  column, but the body has no cell for it at all; the sub-field cells render immediately after the
  preceding field (not at the header's position for them); and a computed `AGGREGATE` field's cell
  drops trailing decimal zeros. When asserting cell values near a Multi-marker/computed field,
  prefer reading the row's raw ordered cell-text list and comparing directly, rather than
  header-name-to-index lookup.
- **Computed virtual field operations confirmed live (2026-09-25, TC-3128).** `type: 'CALC'` with
  `config: {expression, fieldIds}` supports `ADD`/`SUB`/`MULT` as sibling `expression` values (only
  `SUB` was directly Bruno-documented before; `ADD`/`MULT` are now confirmed too). `type: 'CONCAT'`
  with `config: {fieldIds, separator}` joins the listed fields' raw values with `separator` in
  order, no extra formatting. Both render correctly with a single value per cell (unlike the
  Multi-marker header/body divergence above) as long as `layout.columns` lists them, per the
  Execute-grid-columns fix above.
- **`ENQUIRY`-type drilldown's `filterFieldId` is not always a business field shared by both
  Enquiries.** `AM.ACCOUNT~ENQ_AM.ACCOUNT`'s drilldown uses `filterFieldId: "ID"`, which isn't in
  that Enquiry's own `schema.properties` — likely a reserved name for "the record's own Record ID",
  distinct from mapping same-named business fields (e.g. `CUSTOMER_ID`) across two tables. Not yet
  confirmed whether both forms are supported or only one.
- **`layout.columns` fixes column rendering but does NOT fix `ENQUIRY`-drilldown pre-filtering —
  confirmed these are independent mechanisms.** Both TC-3117 and TC-3139's fixtures were missing
  `layout` at the same time, which looked like it might be one shared cause; adding
  `layout.columns` to both of TC-3139's Enquiry Definitions was tried live and made zero difference
  to the filtering symptom, while it fully explained TC-3117's symptom. **Predict**: don't assume
  two coincidentally-similar-looking gaps in sibling fixtures share one root cause just because they
  both trace to "the fixture was missing X" — verify each live independently.

- **AntD selects: the selected text is on the `.ant-select` wrapper (`.ant-select-content`), not on the
  readonly combobox input (`value=""`); long option lists are virtualized.** Confirmed 2026-10-05
  (TC-1908, TC-2186). **Predict**: assert a select's value via the wrapper's text, and collect options of
  a possibly long dropdown while scrolling `.rc-virtual-list-holder` instead of reading once.
