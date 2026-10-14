# AntD multi-select combobox stays open after `selectComboboxOption()` — can intercept later clicks

**Symptom:** `locator.click()` on an unrelated element (typically a form's submit button) times out
with `element is not enabled` retries, then `<div ... ant-select-item ant-select-item-option-active
ant-select-item-option-selected> ... intercepts pointer events` — even though the same locator was
already confirmed visible/enabled moments earlier. A saved trace/`error-context.md` snapshot shows an
unrelated `combobox` still `[expanded] [active]` with its `listbox` rendered and overlapping later
content.

**Rule:** `ui/base/interactions/antd-virtualized-dropdown.ts`'s `selectComboboxOption()` clicks the
matched option and returns — it never closes the dropdown afterward. For a single-select AntD
`Select`, that's fine: AntD closes the dropdown itself once an option is picked. For a **multi-select**
(`mode="multiple"`) `Select`, AntD deliberately keeps the dropdown open after each pick so the user can
choose more — calling `selectComboboxOption()` in a loop (one call per value) leaves the dropdown open
after the loop, and its rendered option list can overlap and intercept clicks on whatever comes next in
the form (a submit button below it, another field). Any component that fills a multi-select this way
must explicitly close the dropdown itself once done (e.g. `page.keyboard.press('Escape')` — the same
call `readComboboxOptionLabels()` already makes for its own, unrelated reason) — don't assume the
shared helper does this, and don't assume "the button was momentarily visible/enabled" during Playwright's
actionability retries means the click will actually land.

**Incident (2026-09-10):** `ui/field-registry/components/information-calculation-block.ts`'s
`fill()` looped `selectComboboxOption(this.sourceFieldsSelect, fieldId)` over multiple source field
ids (a multi-select). `field-registry.spec.ts`'s `TC-05: Create field by Type (valid data) -
Information` then called `modal.submit()` right after, which times out clicking the submit button —
confirmed via the saved `error-context.md` snapshot showing `sourceFieldsSelect`'s combobox still
`[expanded] [active]` with the last-picked option's listbox rendered over the modal footer.

**Resolution (2026-09-10):** added `await this.page.keyboard.press('Escape');` at the end of
`InformationCalculationBlock.fill()`, after the multi-select loop. `join-block.ts`,
`create-field-modal.ts`, and `select-company-page.ts` were checked and confirmed to call
`selectComboboxOption()` exactly once per trigger (single-select) — this is currently the only
multi-select use site in the suite.
