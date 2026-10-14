# A JSON Schema `required` check and a business-rule "must be empty" check test different equivalence classes — "key omitted" ≠ "key present with an empty value"

## The pattern/symptom

A field that is conditionally mandatory (required only when some other field/config says so) is
often enforced by two separate, independently-running validators on a CBS projection:

1. The projection's own JSON-schema `required: [...]` list — evaluated first, before any
   business-rule plugin. This check only asks "is the key present in the payload at all?" It is
   satisfied by *any* value, including `''`/`null` — it never looks at the value itself.
2. A business-rule/plugin-level check — evaluated later, after schema validation passes. This is
   where conditional logic like "must be empty when config X is false" actually lives, and it only
   ever sees payloads that already passed step 1.

A test suite that always sends the field (as `''` or a real value) — never with the key fully
omitted from the JSON body — only ever exercises validator #2. It can look like full coverage
(a test literally named "... no `<FIELD>` is accepted") while never constructing the one payload
shape (`delete data.<FIELD>` / never setting it) that validator #1 actually gates on. The two
failure modes look identical in prose ("no UNIT") but are different request shapes and trip
completely different code paths.

## The rule

When a field is "optional/omittable under condition X" per a ticket or Story, write (or ask Manual
QA to add an Allure case for) *three* payload shapes, not two:
- key omitted entirely (`delete`d from the object before serialization, not set to `undefined` in a
  language where that still serializes the key)
- key present with an empty/blank value (`''`, `null`, whitespace)
- key present with a real value

Don't assume a case titled "no `<FIELD>`" already covers the omitted-key shape — check the actual
payload-construction code, since a shared builder's own default (e.g. `UNIT: ''` in this repo's
`currency-payload-builder.ts`) can silently make every "no X" test in the suite send an empty string
instead of actually omitting the key.

## The incident(s)

**TB-3588 (Currency Definition and Logic / US-01.13.02, 2026-09-03).** `CURRENCY.ORDER~MASTER`'s
`UNIT` field is meant to be optional whenever its market's `DIFF_UNIT=false` (rejected only if
present-and-non-empty — confirmed 2026-09-02, see that module's `INDEX.md`). The business-rule
plugin correctly implements that. But the projection's own schema still lists `UNIT` as
unconditionally `required`, so a payload that omits the key entirely still 400s with `"required
property 'UNIT' not found"`, regardless of `DIFF_UNIT`. Every `CURRENCY.ORDER` test in
`currency-regression.spec.ts` — including allureCaseId 3441, titled "...no UNIT is accepted" —
always sent `UNIT: ''` (a shared builder's default), never an omitted key.

**This one was a genuine misread, not an unavoidable ambiguity — worth calling out explicitly,
since it's the sharper version of the general rule above.** allureCaseId 3441's Step read (in
isolation) as ambiguous between "key omitted" and "key present, empty" — but its sibling case
(allureCaseId 3438, same file, same author) writes a real value in literal `UNIT="TESY"` form,
while 3441 never writes `UNIT=` at all, just prose "no UNIT" next to a literal `RATE_BANDS: [...]`
snippet. Read next to its sibling, that's a clear signal the key itself is absent, not merely
empty. The automation's `UNIT: ''` choice didn't just miss an edge case Manual QA hadn't specified
— it implemented an already-existing, reasonably-clear case incorrectly. **Predict**: when a
"required-if" field's test case is phrased as prose ("no `<FIELD>`") rather than literal
`FIELD=value` syntax, and a sibling case in the same file *does* use literal syntax for the
field's present-value branch, treat the prose phrasing as deliberately signaling "omitted", not as
shorthand for an empty literal — verify against the sibling's phrasing convention before picking an
implementation, don't default to whatever a shared builder already happens to send.

**Fixed** in `currency-regression.spec.ts`: the 3441 test now overrides `UNIT: undefined` (which
`JSON.stringify` drops from the request body entirely, since the API client posts via `{ data:
payload }`), so the request now genuinely omits the key. The test now correctly reproduces TB-3588
and is expected to fail live until the backend fix ships. Full writeup:
[`module-theory/Currency Definition and Logic/US-01.13.02/README.md`](../../module-theory/Currency%20Definition%20and%20Logic/US-01.13.02/README.md)'s
2026-09-03 entry.
