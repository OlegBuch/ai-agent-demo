# Error-message assertions via `toContain()` on the raw response body

## The pattern/symptom

A negative-path test reads the response with `readResponseBody(response)` (raw `.text()`) and
asserts the expected error text with `expect(resText, ...).toContain('some message')` against the
**entire** JSON blob, e.g.:

```ts
const resText = await readResponseBody(response);
expect(resText, `...`).toContain('Requested Rate Type missing. Spread auto-calculation is prohibited.');
```

This "works" as long as the substring happens to appear anywhere in the body, but it means the
assertion isn't actually checking the error-message *field* — it would just as easily pass if the
same text showed up in `instance` or `title` instead of `detail`, and the failure diff dumps the
whole envelope (`{"detail":"Rate Not Found","instance":"/currency-engine/...","status":404,...}`)
instead of just the field that matters, making failures noisier to read than necessary.

## The rule

The backend already returns a consistent Problem+JSON-shaped error envelope
(`detail`/`instance`/`status`/`title`/`message`/`error`/`errors` — see `ErrorResponse` in
`api/types/table-registry.types.ts`), and `api/utils/helpers/response-parser.ts` already provides
the typed accessors: `parseErrorBody(raw: string): ErrorResponse` and
`extractErrorMessage(body: ErrorResponse): string` (→ `detail ?? message ?? error ?? title`).
When a test needs to assert on the *content* of an error message, parse the body and assert on
`extractErrorMessage(...)` specifically, not on the raw string:

```ts
const resText = await readResponseBody(response); // keep for the status-code assertion's message
expect(
  extractErrorMessage(parseErrorBody(resText)),
  `...`,
).toContain('Requested Rate Type missing. Spread auto-calculation is prohibited.');
```

`readResponseBody`'s raw string is still fine (and preferred) for the *status-code* assertion's
diagnostic text (`` `Got status ${response.status()}: ${resText}` ``) — this rule is specifically
about the assertion that checks message *content*, not every use of the raw body. The one
exception: a test whose whole point is to catch corruption in the raw JSON text itself (e.g.
verifying a `rateValue` field isn't silently rounded to IEEE-double precision) should keep
asserting on the raw string — `JSON.parse` would round-trip through a JS `number` and defeat the
test's actual purpose there.

## The incident

2026-08-26, Currency Definition and Logic module: `currency-regression.spec.ts` had 15 negative-path
assertions using `readResponseBody(...).toContain(...)` against the full body, even though the same
`ErrorResponse`/`extractErrorMessage` convention was already established and in active use in four
other spec files (`customization-smoke.spec.ts`, `customization-regression.spec.ts`,
`table-registry-smoke.spec.ts`, `validation-engine-regression.spec.ts`). The user noticed the raw
JSON envelope showing up in a failure diff and asked whether a typed error payload already existed.
Fixed by switching all 15 sites to `extractErrorMessage(parseErrorBody(resText))`; the 5 sites
checking raw `rateValue` JSON-text precision were left untouched (see the exception above).
`currency-smoke.spec.ts` had zero non-2xx assertions at the time, so nothing to change there.

**Follow-up, same day, later pass.** This fix itself had a gap: a hook-validation failure's real
per-field reason lives at `properties.errors.<FIELD>`, not `detail` — `detail` on that error shape is
only the generic `"Hook execution failed for operation X in PRE phase for projection Y"` envelope
(confirmed as the platform-wide shape via `proj-bruno-api`'s `Table Template/Operations/Batch INPUT
Records.yml`, same `details.fieldErrors` pattern). `extractErrorMessage` only ever read `detail`, so
6 of the 15 sites (the ones checking a hook-validated message's content, not a schema-validation
message — schema errors *do* land straight in `detail` unwrapped) silently broke the moment the
raw-`toContain` fix above landed. Fixed by adding `extractPropertiesErrorMessage(body)` in
`response-parser.ts` (prefers `properties.errors`/`errors`, falls back to `extractErrorMessage`) and
switching those 6 sites to it. Full write-up:
`docs/module-theory/Currency Definition and Logic/US-01.13.02/README.md` ("Sixth live run" section).
**The rule, updated**: before asserting on `extractErrorMessage(...)`, check whether the failure is a
schema-validation error (message lands in `detail` directly) or a hook/business-rule validation
error (message lands in `properties.errors.<FIELD>`, `detail` is just the generic wrapper) — use
`extractPropertiesErrorMessage(...)` for the latter.

**Third incident, 2026-09-10, MR 202 (TB-3197, Access Administration regression).** A module defined
its own parallel error type (`SystemParameterErrorResponse` in
`api/types/system-parametrization.types.ts`) instead of reusing the shared `ErrorResponse` above,
and got the shape wrong in the process: it modeled `errors` as `{ id, params, targetFieldId }[]`
(an array of objects), which matches neither the shared `ErrorResponse.errors: Record<string,
string>` shape nor either of the two real contracts found in `proj-bruno-api` for a SYSTEM.PARAMETER
validation-rule rejection (an executable Bruno test asserts a flat `res.body.errorIds: string[]`;
a docs comment for the same rule instead describes a singular `{errorId, params, targetFieldId}`
object). The new test (`access-administration-regression.spec.ts`'s TC-1650) asserts
`parsedBody.errors?.[0]?.id === 'PASSWORD_MIN_LENGTH_POSITIVE'` against this invented shape — never
confirmed live before merge. Full write-up: `docs/review-mr/202-tb-3197-access-administration-regression/logical_analysis.md`
(Confirmed Issue #1). **The rule, updated again**: before typing a new per-module error-response
shape, check whether the shared `ErrorResponse`/`extractErrorMessage`/`extractPropertiesErrorMessage`
machinery in `table-registry.types.ts`/`response-parser.ts` already covers it — and never type an
error field's shape from a Bruno *docs* comment alone; prefer a Bruno request file that has an actual
`runtime.scripts` assertion against that field, since a docs comment can describe intent rather than
the real wire shape.
