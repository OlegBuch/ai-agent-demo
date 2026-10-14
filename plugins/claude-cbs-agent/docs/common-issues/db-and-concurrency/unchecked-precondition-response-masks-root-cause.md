# Unchecked precondition response masks the real root cause

## The pattern/symptom

A helper function makes a sequence of API calls where an earlier call is expected to succeed
(precondition/setup/staging code, not a deliberate negative-test assertion), but the response of
that earlier call is discarded — not assigned to a variable, not checked with `expectStatus`/
`expect(...status()...)`. A later call in the same function depends on the earlier one having
actually persisted something (polls it, reads it back, authorizes it). When the earlier call
silently fails, the failure doesn't surface there — it surfaces several calls later, as a confusing,
unrelated-looking symptom on the *dependent* call, which then gets misdiagnosed as its own bug
(a timing issue, a propagation delay, a different root cause entirely).

**Concrete incident (2026-09-03, Currency module):** `currency-helper.ts`'s
`grantCheckerAccessToCurrencyOrder` created a probe `CURRENCY.ORDER` record via `INPUT` and
discarded the response, then immediately called `AUTH` on that same record. A real backend bug
(see [Currency Definition and Logic/INDEX.md](../../module-theory/Currency%20Definition%20and%20Logic/INDEX.md)'s
`DIFF_UNIT` deadlock entry) made every `INPUT` attempt fail — but because the response was never
checked, this was invisible. The `AUTH` call then failed with `"START_DATETIME is not available on
the record"`, which looked like an AUTH-permission-propagation timing issue and was chased as one
for a long time before the actual `INPUT` failure was found.

## The rule

Any helper that chains API calls where a later call depends on an earlier one having succeeded must
check the earlier response before proceeding — `expectStatus(...)` (throws with a clear message) or
an inline `if (response.status() !== HTTP_STATUS.OK) { ... }` branch that reports its *own* failure
distinctly from whatever the dependent call would report. This isn't about negative-test assertions
(a deliberately-expected-to-fail call is fine to leave as just a status check) — it's specifically
about precondition/setup calls silently swallowed inside helper functions.

**When reviewing or writing a helper that does INPUT-then-AUTH, INPUT-then-poll, or any
create-then-use sequence:** check that every intermediate response is captured and checked. A
2026-09-03 audit of `currency-helper.ts`, `test-polling-helper.ts`, and `system-tables-helper.ts`
found exactly one violation (the incident above, now fixed) — everything else in those files already
follows the good pattern below, so this is a one-off audit finding, not a systemic gap in this
codebase's helpers. Still worth re-checking whenever writing a new multi-step helper.

**Good pattern (already the norm in this codebase) — pick either:**
```ts
// Inline check, cheapest, use when the caller wants to react (retry, alternate path):
const response = await client.performRecordOperation(...);
if (response.status() !== HTTP_STATUS.OK) {
  return { ready: false, diagnostic: `X was rejected: status ${response.status()}: ${await readResponseBody(response)}` };
}

// expectStatus, use for simple setup code where any failure should just fail the test clearly:
const response = await client.performRecordOperation(...);
await expectStatus(response, HTTP_STATUS.OK, `Expected X to succeed. Got status ${response.status()}: ${await readResponseBody(response)}`);
```

## The incident

- **2026-09-03, Currency module, `grantCheckerAccessToCurrencyOrder`** (`currency-helper.ts`): fixed
  by capturing the `INPUT` response and returning a distinct `ready: false` diagnostic
  (`"CURRENCY.ORDER probe INPUT was rejected (not an AUTH-propagation issue): ..."`) when it isn't
  `200`, instead of silently proceeding to `AUTH`. See the Currency module's `INDEX.md` for the
  backend bug this was masking.
