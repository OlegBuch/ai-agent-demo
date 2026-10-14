# Jackson coerces a nonzero JSON number into `true` for a `boolean` field, but rejects an arbitrary string

## The pattern/symptom

A negative test that sends an invalid type for a `boolean` request field expects a uniform
`400 "Failed to read request"` (generic Spring/Jackson JSON-deserialization failure) regardless of
*which* wrong type was sent. In practice the two "wrong type" cases behave differently:

- A JSON **string** that isn't `"true"`/`"false"` (e.g. `"yes"`) → **fails** deserialization →
  `400`, `{"detail":"Failed to read request", ...}`.
- A JSON **number** (e.g. `1`, `0`, `42`) → **succeeds** — Jackson's default lenient scalar
  coercion treats `0` as `false` and any nonzero number as `true`, so the request is accepted as if
  the caller had sent the equivalent boolean literal (`200`, normal response body).

Assuming both "wrong type" cases fail the same way (no implicit numeric coercion) is a reasonable
first guess but is **wrong** for any backend using Jackson's default `CoercionConfig` — confirmed
live on the Currency Engine's `POST /rates/local` (`isBaseCurrency`), see
`docs/module-theory/Currency Definition and Logic/US-01.13.03/README.md`, case 3435 step 3.

## The rule

Never assume a `boolean` field's negative-type test generalizes across JSON types. Test each JSON
type that isn't the expected one separately, and expect:

- **String** (other than the literal tokens Jackson accepts, typically `"true"`/`"false"`) →
  rejected, `400`.
- **Number** → **accepted**, coerced (`0`→`false`, nonzero→`true`), unless the specific service has
  explicitly disabled scalar coercion (`MapperFeature.ALLOW_COERCION_OF_SCALARS = false` or an
  equivalent `CoercionAction.Fail` override) — check the live response before assuming either way,
  this is a per-service config, not a language guarantee.
- **`null`** → typically accepted without error into a boxed `Boolean` field, falling through to
  whatever default-value logic the endpoint applies when the field is omitted.

## The incident

2026-09-02, Currency Engine `US-01.13.03`, Allure case 3435 ("Rejects a non-boolean
`isBaseCurrency`"). The AQA-authored BVA step 3 (`isBaseCurrency: 1`) predicted the same rejection
as the string case (`isBaseCurrency: "yes"`, step 1) — this was the AQA's own added boundary step,
not a BA-authored Allure Expected Result, and was explicitly flagged as an unverified prediction to
watch on first live run. First live run: step 1 (string) correctly rejected with `400`; step 3
(number) returned `200` with the numeric value coerced to `true`. Fixed by updating step 3 to assert
`200` with the coerced-to-`true` base/quote shape, matching the module doc's own precedent of
treating a live-confirmed technical finding as ground truth over an unverified prior guess.
