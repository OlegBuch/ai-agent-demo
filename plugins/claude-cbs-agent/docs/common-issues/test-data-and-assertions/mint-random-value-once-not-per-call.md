# A `generateRandom*` call inside a reused payload-builder closure must be minted once, not re-rolled per invocation

## The pattern/symptom

A test stages the same logical record across multiple API calls (create, then update, then
re-submit) via a small local `buildPayload(...)` closure that's called more than once. If that
closure calls a `generateRandom*` id/code generator *inside itself* for a field that must stay
identical across those calls (an immutable field, or any field the backend requires to match the
already-persisted value), each invocation draws a *different* random value — silently breaking the
call site's own invariant. The first call may succeed; the second then either 409s against the
immutability rule (since the record can't retroactively accept the new random value) or collides
with an unrelated real record, and the resulting failure looks unrelated to the actual bug (an
immutability rejection or a "already held by" collision message), not "your random value changed
between calls."

A related but distinct risk: if the field's value space is small (a 3-digit numeric code, ~900
combinations; a 3-letter alphabetic code, ~17,576), a bare `generateRandom*()` call with no
collision-retry has a real, non-theoretical chance of colliding with an existing record on a
long-lived, never-cleaned environment — this compounds the "re-rolled per call" bug, since now even
a single fresh call at the top of the test can fail outright.

## The rule

Mint any value that must stay constant across multiple calls for the same logical record **once**,
outside the closure, and pass it in — never call the generator from inside a function meant to be
invoked repeatedly for that same record. Separately, if the value's space is small enough that a
create-time collision is plausible, use (or add) a collision-retrying variant rather than a bare
one-shot `generateRandom*()` — this project's `createDedicatedCurrency` (`currency-helper.ts`)
already retries up to `MAX_NUMERIC_CODE_COLLISION_RETRIES` (10) internally; prefer it, or a helper
like it, over reinventing single-shot generation for anything that actually needs to persist.

## The incident (2026-09-03)

`currency-regression.spec.ts`'s `allureCaseId(1870)` ("Creating currency with numeric BASE_RANK")
builds one currency, updates its `BASE_RANK` twice more, re-sending the same recordId across 3
`test.step`s via a shared `buildPayload(rank)` closure. An edit meant to remove a hardcoded
`NUMERIC_CODE` literal replaced it with `generateRandomNumericCode()` called *inside* that closure
— so each of the 3 calls sent a different `NUMERIC_CODE` for what should have been one immutable
value on one record. Live run failed immediately: the very first call already collided with an
existing currency's `NUMERIC_CODE` (this environment's 900-value pool is saturated with
accumulated test debris — `CURRENCY` records are never deleted, see
`docs/module-theory/Currency Definition and Logic/INDEX.md`'s "never hardcode" rule for the
same underlying data-pollution cause). **Fixed** by mint-once: call `createDedicatedCurrency(client,
db, { BASE_RANK: initialRank })` once for the initial creation (gets the existing collision-retry
for free) and reuse its returned `recordId`/`numericCode` for every subsequent payload in the test.
