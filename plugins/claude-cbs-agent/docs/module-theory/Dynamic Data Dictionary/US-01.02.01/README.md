# US-01.02.01 | Define Field Metadata

**TL;DR:** `field-registry.spec.ts`'s `TC-03` (exactly-20-types assertion) and `TC-05` (Information
type, multi-select source fields) both failed 2026-09-10 in the same run. TC-03 was a genuine stale
test-oracle bug, not flakiness or an environment gap — fixed by removing `ARRAY` from the shared
`FIELD_CONSTS.X_TYPE` constant. TC-05 was an unrelated AntD multi-select timing bug — fixed in the
page component. Both fixes are code-complete and statically verified (`tsc`/`eslint`/`prettier`);
not yet live-verified by the user.

## Confluence sources

| Site | Space | Page | Version | Last modified |
|---|---|---|---|---|
| innowise-group (master) | CBSA | US-01.02.01 \| Define Field Metadata | 2.0 | 2026-06-22 |
| bank-proj (mirror) | TB | US-01.02.01 \| Define Field Metadata | 1.0 | 2026-08-17 (stale) |

## TC-03: "Type dropdown contains exactly 20 permitted values" — resolved 2026-09-10

**Symptom:** `expect(labels.length).toBe(20)` failed with `Received: 19`.

**Investigation:** The live UI's own help text already said "Select one of 19 supported field
types," and extracting the actual mounted option titles from the failing run's `trace.zip` gave
exactly 19 values — every `FIELD_CONSTS.X_TYPE` entry except `ARRAY`. `ARRAY` was defined in that
shared constant (`api/utils/constants/constants-keeper.ts:275`) but referenced nowhere else in the
suite (grep confirmed). Per this role's "no automate on contract mismatch" rule, this was escalated
rather than silently patched — a background Confluence lookup (Jira remote issue links →
US-01.02.01's dedicated Confluence page, read in full) confirmed AC-5 enumerates exactly the same 19
types verbatim, `ARRAY` is not present anywhere in the page (not even as a future/planned type), and
AC-6 requires the system to reject any `Field Type` not in that list. So the constant — not the live
UI — was the stale side.

**Resolution:** removed `ARRAY: 'ARRAY'` from `FIELD_CONSTS.X_TYPE`. `EXPECTED_FIELD_TYPE_LABELS`
(`ui/field-registry/constants/field-registry.values.ts`) derives from this constant via
`Object.values()`, so `TC-03` needs no separate change.

## TC-05 "Create field by Type (valid data) - Information" — resolved 2026-09-10

Unrelated to the above — a test-code timing bug in the multi-select "Source Fields" dropdown
leaving its option list open and intercepting the submit-button click. Full detail:
[[../../common-issues/test-data-and-assertions/antd-multi-select-dropdown-stays-open-after-selection]].
