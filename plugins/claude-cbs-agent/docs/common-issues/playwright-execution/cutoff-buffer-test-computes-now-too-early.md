# A cutoff/buffer-boundary test flakes when "now" is computed at test start, not at request time

**Symptom.** `api/system_core/tests/currency-regression.spec.ts` — "Reject START_DATETIME inside the
CCY_ORDER_CUTOFF buffer at INPUT" (US-01.13.02) — intermittently passed or failed on the same
environment, same code, across regression runs.

**Root cause.** The test computed its boundary timestamp once, at the very top of the test function:
```ts
const insideBufferStart = new Date(Date.now() + 2 * 60 * 1000); // "now" captured here
...
await test.step('STEP 1: POST ...', async () => {
  const payload = buildRecordInputPayload(recordId, buildOrderData({ START_DATETIME: insideBufferStart... }));
  const response = await client.performRecordOperation(...); // actually sent much later
});
```
`CCY_ORDER_CUTOFF_SECONDS` is 300 (5 minutes, `constants-keeper.ts`). The test deliberately picks a
value 2 minutes ahead, meaning to land inside that 5-minute forbidden window — a 3-minute margin
before the same value would cross the boundary and flip the expected result (400 → 200). Any real
delay between computing `Date.now()` and the server actually evaluating the request (a Keycloak
token-refresh retry, observed at 8s per attempt in the same day's run logs; general load under a
multi-worker regression run) eats directly into that margin, since the timestamp itself never gets
recomputed.

**Fix.** Move the `Date.now()` capture to immediately before building the payload, inside the same
`test.step` that sends the request (not at the top of the test), and reduce the lead time from 2
minutes to 1 — same assertion, same business rule covered, but the margin before crossing the
boundary is now 4 minutes instead of 3, and the window during which unrelated delay (auth, fixture
setup) can erode it is essentially eliminated.

**Predict.** Any test asserting "a value close to but inside a time-boundary must be rejected/
accepted" is at risk of this exact flake if the value is computed before other setup work (auth,
preconditions) rather than immediately before the request that consumes it — check for this pattern
specifically wherever a cutoff/buffer/expiry-window business rule is tested elsewhere in the suite,
not just this one Currency Definition and Logic case.
