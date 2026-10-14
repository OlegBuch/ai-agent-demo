# A randomly-generated "unknown"/"never created" id can collide with real reference data

Applies to: any negative test that generates a random id and assumes it doesn't exist, when that
id is drawn from a small, fixed alphabet that overlaps with real pre-seeded reference data. First
hit in Currency (`currency-helper.ts`'s `generateRandomCurrencyId`, 3 letters A-Z, 17,576 combos)
on `group-3/TB-3468`, 2026-09-02.

## The rule

A random-id generator built for *dedicated test fixtures* (where a 409/collision on creation just
means "retry with a new id") is not automatically safe to reuse for a *negative test's "this must
not exist" fixture* — those are different guarantees. The first only needs the id to be free at the
moment of creation; the second needs the id to never resolve to anything, including real reference
data the generator was never designed to avoid (ISO currency codes, seeded lookup values, etc.).
If the id space is small enough that a collision is plausible (a 3-letter alphabet, a short numeric
range), generating and immediately trusting "it doesn't exist" without checking is a real risk, not
theoretical.

**Fix pattern:** before using a randomly-generated id as a "known not to exist" fixture, `SEE` it
and regenerate (bounded retry) if it already resolves — the same shape of check the *creation* path
already uses for id collisions, just checking existence instead of a creation-time 409.

## The incident (2026-09-02)

`currency-regression.spec.ts`'s "Same-currency request with an inactive/unknown currency is
rejected" (Allure 3428) and "Rejects an unknown/inactive currency" (Allure 3434, `/rates/local`)
both called `generateRandomCurrencyId()` directly and treated the result as guaranteed non-existent.
One run drew `'COU'` — a real ISO 4217 code (Colombian Unidad de Valor Real) — which this
environment has pre-seeded as a real, active currency. The test got a genuine `200`/`rate=1`
instead of the expected `404`, failing for a reason that had nothing to do with the behavior under
test.

**Fix:** added `generateUnknownCurrencyId(client)` to `currency-helper.ts` — generates a candidate
via the existing `generateRandomCurrencyId()`, `SEE`s it, and retries (max 10 attempts) until it
finds one that returns `404`. Both call sites switched from the bare generator to this helper.
