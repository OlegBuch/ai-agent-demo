# AntD dropdown option labels can carry a `(...)` suffix the shared exact-match helper doesn't tolerate

**Symptom:** An assertion comparing AntD `combobox` dropdown option labels against bare business
codes fails with the actual label carrying extra parenthetical text, e.g.
`Expected ["MOCK"], got ["MOCK (UTC)"]`. Separately, `selectComboboxOption(trigger, code)` called
with the bare code can fail to find/select the option at all, even though it is visibly mounted.

**Rule:** `ui/base/interactions/antd-virtualized-dropdown.ts`'s `dropdownOptionByExactLabel()`
already tolerates one specific suffix shape — `"VALUE - description"` (dash-separated) — via its
regex `^\s*VALUE(?:\s+-\s+.*)?\s*$`. It does **not** tolerate a parenthetical suffix,
`"VALUE (description)"`. Any screen whose AntD `Select` renders option labels as
`"<code> (<extra info>)"` (company selector showing `"<code> (<timezone>)"` is the first confirmed
case) needs its own page object to strip that suffix before comparing against or searching for the
bare code — don't assume the shared dropdown helper's built-in tolerance already covers it, and
don't assume a dropdown's rendered label equals the underlying business value without checking a
live page snapshot first.

**Incident (2026-09-09):** `ui/auth/pages/select-company-page.ts`'s `assertCompanyOptions()`
compared dropdown labels directly against bare company codes (`['MOCK']`), and `selectCompany()`
passed a bare code straight into `selectComboboxOption()`. The real Select Company dropdown renders
`"MOCK (UTC)"` — confirmed independently by a sibling spec
(`ui/schedule/tests/company-timezone-enforcement.spec.ts`) which already establishes that `MOCK`'s
configured timezone is `UTC`, and by the same file's own sidebar assertion, which already used a
tolerant regex (`^MOCK(\s|$)`) instead of an exact match — a sign the timezone-suffix format was
already known elsewhere in the file but not applied consistently. Fixed by adding a
`stripTimezoneSuffix()` helper (`label.replace(/\s*\([^)]*\)\s*$/, '').trim()`) in
`SelectCompanyPage`, used both to normalize labels before comparing in `assertCompanyOptions()` and
to resolve the real full label before handing it to `selectComboboxOption()` in `selectCompany()`.
