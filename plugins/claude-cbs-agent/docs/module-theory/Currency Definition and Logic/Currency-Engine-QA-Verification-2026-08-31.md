# QA verification of the 2026-08-28 Currency Engine update (2026-08-31)

Follow-up to [Currency-Engine-Updates-2026-08-28-Analysis.md](Currency-Engine-Updates-2026-08-28-Analysis.md)
(the dev-call analysis) — that file recorded what the dev *said*/demoed locally; this file records
what's actually **live on `qa.proj.local`** now that the image was deployed, verified directly
against the running service (not against Bruno, which is still stale — see §2), plus what the
existing automated suite/Allure cases look like against that live reality.

---

## 1. Confirmed live contract (`qa.proj.local`, verified 2026-08-31)

### `POST currency-engine/api/v1/currencies/rates` (existing endpoint)

Response, confirmed via a fresh `market=1, baseCurrency=quoteCurrency=USD` probe:
```json
{
  "baseCurrency": {"currency": "USD", "quotationCode": 0, "numberOfDecimals": 2},
  "quoteCurrency": {"currency": "USD", "quotationCode": 0, "numberOfDecimals": 2},
  "rate": {"type": "MID", "value": {"units": 1, "nanos": 0}}
}
```
Exactly matches the call's description and the shape the user pasted. `amount`/error envelope
(`{detail, instance, status, title}`, RFC7807-style) are unchanged.

Request: `currencies: string[]` (array/unordered-pair mode) is **confirmed removed** —
`{"currencies":["EUR","USD"], ...}` now returns `400 "Invalid request content."` instead of `200`.
Every other existing request field (`market`, `businessUnit`, `baseCurrency`, `quoteCurrency`,
`rateType`, `transitCurrency`, `amount`) still works exactly as before — this is a pure removal,
not a rename.

Same-currency-both-sides confirmed live: `baseCurrency=quoteCurrency=USD` → `200`,
`rate.value = {units:1, nanos:0}`, no DB lookup needed apparently (works even where no literal
`CURRENCY.RATES` row exists for that "pair").

### `POST currency-engine/api/v1/currencies/rates/local` (new endpoint, reverse-engineered — not yet in Bruno)

Not documented anywhere (see §2) — path and shape below are **empirically confirmed live**, not
guessed:

Request: `{"currency": "<code>", "isBaseCurrency"?: boolean}` — `currency` is the only required
field (missing/unknown code → `400 "Invalid request content."`). `isBaseCurrency` defaults to
`true`. `rateType`/`market`/`businessUnit`/`amount` sent in the body are silently ignored (schema
tolerates unknown fields) — the endpoint is hardcoded to `market=1`, `rateType=MID`, matching the
call.

- `isBaseCurrency: true` (default): `currency` becomes `baseCurrency`, `COMPANY.LOCAL_CURRENCY`
  becomes `quoteCurrency`.
- `isBaseCurrency: false`: reversed — `COMPANY.LOCAL_CURRENCY` becomes `baseCurrency`, `currency`
  becomes `quoteCurrency`.
- Confirmed **not symmetric/auto-inverted**: `{currency:"EUR", isBaseCurrency:true}` → `200` (a
  live `EUR→XAF` rate exists), but `{currency:"EUR", isBaseCurrency:false}` → `404 Rate Not Found`
  (no `XAF→EUR` rate exists) — same "no auto-spread/no auto-invert" rule as the main endpoint.
- Response: identical nested shape to the main endpoint.
- `COMPANY.MOCK`'s current `LOCAL_CURRENCY` is `XAF` (confirmed live via this endpoint's own
  output, not a DB read — matches the drifting value already noted in
  [US-01.13.03/README.md](US-01.13.03/README.md)).

---

## 2. Bruno is still stale — confirmed, re-checked today

`proj-bruno-api` `origin/main` re-fetched 2026-08-31 (`6d557566`, no new commits since the
2026-08-30 fetch used for the dev-call analysis). Grepped every remote branch's `Currency Engine`
collection and the whole repo for `quotationCode`, `numberOfDecimals`, `isBaseCurrency`,
`rates/local` — **zero hits anywhere**. Nobody has pushed the new contract to Bruno yet. Don't wait
for Bruno to catch up before treating the live findings in §1 as authoritative — it demonstrably
lags the real deployed service by at least this update.

**Unrelated but adjacent discovery, worth a separate follow-up**: `feature/TB-2344` (unmerged
branch, not confirmed live) adds a `BUSINESS.UNIT` table (with a materialised `PARENT_PATH`
ancestor chain) and a new `proj-currency-rate-fallback-plugin` `SEE`/`PRE` hook on
`CURRENCY.RATES~MASTER` — this is the previously-blocked "hierarchical Business Unit fallback"
(US-01.13.03's AC6/AC7, documented as unautomatable since `BUSINESS.UNIT` didn't exist on this
environment at all). Not part of the 2026-08-28 call's own topic — a different, independent
workstream. Worth checking with the dev whether/when this lands too, since it would unblock two
currently-dead ACs.

---

## 3. Two regressions found live, neither mentioned on the call

### 3a. Any `DIFF_UNIT: false` market no longer resolves via the main endpoint at all — HIGH IMPACT, broader than first thought

**UPDATE 2026-08-31, later same day — re-scoped after a live market sweep.** Originally framed as
"market `1` specifically." A systematic sweep across every existing market plus two purpose-built
new markets proves this is **not** about market `1`'s identity — it's tied to the `DIFF_UNIT: false`
configuration itself, on any market, old or brand new:

| Market | Config | Staged order, resolve WITH businessUnit | resolve WITHOUT businessUnit |
|---|---|---|---|
| `1` "Interbank Market" | `DIFF_UNIT: false, DIFF_AMT: false` | `404 Rate Not Found` | `404 Rate Not Found` |
| `2` "Central Bank Market" (pre-existing, not touched by this session) | `DIFF_UNIT: false, DIFF_AMT: false` | `404 Rate Not Found` | `404 Rate Not Found` |
| `57` (brand-new, created live this session specifically to mimic market 1's flags) | `DIFF_UNIT: false, DIFF_AMT: false` | `404 Rate Not Found` | `404 Rate Not Found` |
| `3` "Interbank Market" (yes, same display name as market 1, different config) | `DIFF_UNIT: true, DIFF_AMT: true` | `200`, correct nested response | `404` (expected — order was staged for a specific unit) |
| `10` (existing test control market) | `DIFF_UNIT: true, DIFF_AMT: true` | `200`, correct nested response | — |

Every `DIFF_UNIT: true` market resolves correctly; every `DIFF_UNIT: false` market — regardless of
whether it's `1`, a pre-existing `2`, or one minted from scratch two minutes ago — returns `404` no
matter what `businessUnit` is sent. **Also confirmed live**: `CURRENCY.ORDER~MASTER` `INPUT` still
requires a real `UNIT` value even for a `DIFF_UNIT: false` market — omitting it now gets rejected
outright with `400 "required property 'UNIT' not found"`. So an order for a `DIFF_UNIT: false`
market currently *must* carry a `UNIT`, exactly like before, but the engine can no longer find the
resulting rate at all afterwards.

**Working theory (not confirmed by a dev): a partial rollout.** This lines up exactly with the
CURRENCY.ORDER business-unit rule the dev described on the call as "code landing Monday-Tuesday"
(see [Currency-Engine-Updates-2026-08-28-Analysis.md](Currency-Engine-Updates-2026-08-28-Analysis.md)
§5) — it looks like the **read side** (`resolveRate`'s lookup key logic) already started treating
`DIFF_UNIT: false` markets as unit-agnostic, while the **write side** (`CURRENCY.ORDER` `INPUT`
validation) hasn't shipped its half yet and still always stores a real `UNIT` — so the daemon writes
a unit-specific `CURRENCY.RATES` key that the now-unit-agnostic read path can no longer match. Pure
inference from the symptom, not something a dev confirmed — flag it as a hypothesis when escalating,
not a diagnosis.

**Bonus finding from the same sweep, unrelated to the market-1 topic**: creating a
`CURRENCY.MARKET~MASTER` record outside `1`-`99` now correctly rejects with `400 "Market ID must be
between 1 and 99"` — this was previously documented (`US-01.13.01/README.md`) as an *unimplemented*
validation gap ("Market id must be 1–99 per the Story, but no such validation actually exists in
Bruno"). That gap is now closed, live-confirmed 2026-08-31 — a genuine fix landed alongside
everything else, worth a small update to that story's own doc separately from this file.

**Why this matters:** `CCY_ORDER_TEST_MARKET_ID = '1'` (`api/system_core/currency-payload-builder.ts`)
is the shared default market for nearly every existing Currency test (`currency-smoke.spec.ts`,
`currency-regression.spec.ts`) — this isn't a one-off, it silently breaks any test that resolves a
rate on the default market. Confirmed live in the actual suite run: `currency-smoke.spec.ts`'s
"Front-Office retrieves the pure MID rate..." (`allureCaseId(3229)`) failed with exactly this `404`
even though its own precondition demonstrably staged and processed the rate correctly.

**Open question for the dev, not yet answered by anything on the call:** is this intentional
("market 1 is now local-endpoint-only, use `/rates/local` or a real business market for anything
else") or a bug in the main endpoint's market-1 handling? The call never said the main endpoint
would stop working for market 1 — it only described the *new* `/rates/local` endpoint being added
alongside it. Needs an explicit answer before deciding how to fix the test suite (see §5).

### 3b. Market `10`, multi-tier `RATE_BANDS`, resolveRate → persistent `500` — MEDIUM IMPACT, narrower

Reproduced live via the real regression suite, not a synthetic probe: `currency-regression.spec.ts`'s
"A 15,000 transaction selects the 10,000 tier, not the 0 tier" (`allureCaseId(3147)`) — a market
`10` (control market, not the locked-down market `1`) order staged with **two** `RATE_BANDS` rows
(`AMT_FROM 0` and `AMT_FROM 10000`) — every `resolveRate` call against it returns:
```json
{"detail":"An unexpected server error occurred","instance":"/currency-engine/api/v1/currencies/rates","status":500,"title":"Internal Server Error"}
```
Retried 80 times over 4.4 minutes (the suite's own retry policy) — never recovered. The very next
test against the **same staged data** (different amount, same pair) also failed instantly on
attempt 1 — this is a sticky/persistent failure tied to that specific rate record, not a transient
blip. A single-tier market-10 probe (staged separately, this session) resolved fine at `200`, so the
trigger looks tied to **multiple `RATE_BANDS` rows on one record**, not market `10` in general —
unconfirmed hypothesis, needs the dev to isolate (this is a strong, reproducible repro to hand over
as-is: market `10`, two bands at `AMT_FROM` `0`/`10000`, query at any amount ≥ 0).

---

## 4. Allure case audit — all 67 currently-linked Currency cases reviewed

Roster resolved from the **actual `allureCaseId(...)` calls in code** (`currency-smoke.spec.ts` +
`currency-regression.spec.ts`), not from an Allure-side Story-field scan — this is exact, not a
sampled/paged guess. All 67 ids fetched and their `description`/`scenario` content reviewed against
the live contract in §1.

### 6 cases whose Expected Result text is now stale (commits to the old flat shape)

| Allure id | Test title | What's stale |
|---|---|---|
| 3094 | Direct Cross-Rate Resolution via Explicit Currency Pair | ER implies `response.baseCurrency`/`quoteCurrency` are the literal echoed currency-code strings — now objects |
| 3145 | Base vs Quote Resolution L1 — Explicit API Override Strict Lookup | Same pattern — asserts the explicit base/quote strings win, phrased as if they're the literal field values |
| 3153 | Triangulation via explicit API transitCurrency | ER states `rateValue ~= 0.010478` as a bare field |
| 3160 | Validate rateValue is rounded/scaled to the currency NO_OF_DECIMALS | Both the title and ER refer to `rateValue` as a top-level field |
| 3208 | Triangulated cross-rate rounds ONCE at the end (not per leg) | ER states `rateValue = 0.21` |
| 3209 | Triangulated cross-rate preserves ≥18 decimal digits internally | ER states "`rateValue`, read from the raw response body, must start with 0.11263526798643499" |

None of these need their *business* claim changed (direct-pair resolution, triangulation
arithmetic, and rounding behavior are all unchanged per the dev's own "for you, nothing changes,
just a different description") — only the field-path wording in the Expected Result needs updating
to point at `rate.value` (and `baseCurrency.currency`/`quoteCurrency.currency` for 3094/3145) instead
of the old flat fields. **Not yet edited in Allure — needs your go-ahead per the standing
confirm-before-mutating rule**, see the plan in §5.

### 61 cases reviewed and confirmed still accurate

Every other linked case (including all 20 of US-01.13.02, most of US-01.13.03's non-triangulation
cases, and all of US-01.13.04) either doesn't touch the Currency Engine response at all, or already
describes the assertion at a behavioral level ("resolves to the 10,000 tier's rate", "returns Rate
Not Found", "leaves CURRENCY.RATES unmodified") without committing to a specific JSON field path —
these survive the contract change with zero edits needed. Full per-id roster (all 67, with Story
and automation status) is in this session's working notes; ask if you want it dumped into this file
too — kept out here to avoid duplicating the `allureCaseId(...)` grep, which is the actual source of
truth and won't drift the way a copied table would.

### Cases about the new `/rates/local` endpoint or the market-1 regression

**None exist yet** — expected, since neither was documented anywhere before this session and Manual
QA hasn't authored cases for them. This is exactly the gap Manual QA's next pass should fill (per
your own plan) — §5 lists what those new cases would need to cover.

---

## 5. What actually failed in the automated suite, live, today

`currency-smoke.spec.ts` (full run): **2 of 6 failed** —
- `allureCaseId(3094)`'s test: `body.baseCurrency` expected `"LFQ"`, got
  `{"currency":"LFQ","numberOfDecimals":4,"quotationCode":1}` — direct hit of the flat→nested change.
- `allureCaseId(3229)`'s test: expected `200`, got `404 Rate Not Found` — direct hit of the market-1
  regression (§3a), even though its own precondition correctly staged the rate.

`currency-regression.spec.ts` (partial run, stopped after confirming the pattern — see below):
41 tests in, all of US-01.13.01 (21 tests, no Currency Engine calls) and most of US-01.13.02 (20
tests, order lifecycle only, no `resolveRate` calls) passed clean. The **first** test that reaches
`resolveRate` (`allureCaseId(3147)`, market `10`, multi-tier bands) hit the `500` in §3b and
consumed 4.4 minutes retrying before failing. Stopped the run there rather than let it burn another
20+ minutes re-confirming the same two already-proven root causes against the remaining ~20
Currency-Engine tests in the file — but based on `allureCaseId(3145)`'s code (read directly,
`market: Number(CCY_ORDER_TEST_MARKET_ID)` = market `1`, `.toBe(baseCurrency.recordId)` flat-string
assertion), it will hit **both** §3a and the flat-shape assertion simultaneously, and this pattern
(`CCY_ORDER_TEST_MARKET_ID` + flat `body.baseCurrency`/`body.quoteCurrency`/`body.rateValue`
assertions) repeats across effectively the whole US-01.13.03 block. Treat "most of US-01.13.03 is
currently red" as the working assumption for planning, not "2 tests failed" — the smoke run's 2
failures are representative samples of a suite-wide pattern, not the full extent of it.

---

## 6. Update plan

Ordered by what has to happen before the next thing is safe to do — not a strict sequence, some
rows can run in parallel.

1. **Escalate the two regressions to the dev now, with the exact repros above (§3a, §3b)** — before
   touching any test code. Both are either bugs or undocumented intentional changes; either answer
   changes what "fix the test" means. Specifically ask: (a) is market 1 meant to be
   local-endpoint-only now, or should the main endpoint still resolve it? (b) can they reproduce the
   multi-tier-band 500 on market 10 from the exact repro in §3b?
2. **Bruno**: flag to the dev/team that `proj-bruno-api` needs the new `/rates` response shape and
   the new `/rates/local` endpoint documented — not something this role writes into that repo
   directly (see the module-agnostic rule that `proj-bruno-api` is referenced, not owned, by this
   framework).
3. **Allure — the 6 stale ERs (§4)**: ready to fix now, low-risk, no dependency on the two open
   regressions. Needs your explicit go-ahead per the standing confirm-before-mutating-Allure rule
   before any `testops_update_testcase` call — say the word and I'll show you the exact before/after
   text for each of the 6 before writing anything.
4. **Test code — the response-shape fix**: once (1)'s market-1 question is answered, update
   `ResolveRateResponse`/`ResolveRatePayload` (`api/types/currency-engine.types.ts`) to the new
   nested shape, remove `currencies?: string[]` from the request type, and fix every assertion site
   across `currency-smoke.spec.ts`/`currency-regression.spec.ts` that reads `body.baseCurrency`/
   `body.quoteCurrency`/`body.rateValue`/`body.quoteCode` as a flat value. This is a mechanical,
   suite-wide change once the shape is settled — worth doing as one pass, not test-by-test, given how
   many tests share the same pattern.
5. **Test infrastructure — the market-1 default**: depends entirely on (1)'s answer.
   - If market 1 is intentionally local-endpoint-only now: `CCY_ORDER_TEST_MARKET_ID` needs to stop
     being the default for every test that calls the *main* `resolveRate` endpoint — those tests
     need to either move to a dedicated non-locked market (like the existing `diffAmtMarketId = '10'`
     pattern) or be rewritten to use the new `/rates/local` endpoint where that's actually what
     they're testing.
   - If it's a bug: no test change needed here at all, just wait for the fix and re-run.
6. **New client + tests for `/rates/local`**: add `CurrencyEngineApiClient.resolveLocalRate(...)` (or
   similar) once the endpoint is confirmed stable and ideally once it's in Bruno (or accept the
   empirically-reverse-engineered contract in §1 if the dev confirms it's final) — this is new
   coverage, not a fix, and per this role's own rule doesn't get automated ahead of Manual QA writing
   the corresponding Allure case(s) first.
7. **New client/test support for the CURRENCY.ORDER business-unit rule**: still not deployed as of
   this check (the dev's own "Monday/Tuesday" code) — nothing to do here yet except re-check once it
   lands; when it does, both a positive case (`DIFF_UNIT=false` market, `UNIT` omitted, accepted) and
   a negative case (`DIFF_UNIT=false` market, `UNIT` supplied, rejected) are needed, matching
   [Currency-Engine-Updates-2026-08-28-Analysis.md](Currency-Engine-Updates-2026-08-28-Analysis.md)'s
   §5.
8. **Manual QA's new-case pass** (your own next step, mentioned separately): once (1)/(2) settle the
   open questions, the natural new-case list is: `/rates/local` happy path + direction-flag flip +
   no-local-rate-found, and the two `CURRENCY.ORDER` business-unit cases from row 7 — all currently
   uncovered by any existing Allure case (confirmed in §4).

Nothing in rows 4–7 should be started as actual code changes without your go-ahead on scope — this
section is the plan, not a change already made.
