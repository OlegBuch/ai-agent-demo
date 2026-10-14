Story: US-01.13.03 (TB-1989) — part of the [Currency Definition and Logic](../INDEX.md) module.
Last updated: 2026-08-26

Read the module [INDEX.md](../INDEX.md) first for module-wide facts (BUSINESS.UNIT scope, the
never-hardcode-a-currency-id rule, shared test-data helpers). This file covers only what's
specific to the Currency Engine's rate-resolution behavior.

Confluence source (read in full, not summarized from Jira): `bank-proj.atlassian.net`, pageId
`1529872396`, "US-01.13.03 | Dynamic High-TPS Execution & Hierarchical Rate Resolution", v1.2
(2026-08-11). No separate innowise-group/CBSA copy exists for this per-story page — only the
Epic-level `EP-01.13` page duplicates an abbreviated version of some of this content (and that
Epic page's own two copies disagree with each other and with this file — see
[[project_currency-engine-contract-findings]]).

---

## Story text (full)

**AS A** Core Execution Module (e.g., Funds Transfer, Treasury/FX, or Teller)
**I WANT TO** dynamically query currency exchange rates from the live cache with real-time
fallback resolution across Business Unit hierarchies and synthetic triangulation paths
**SO THAT** I can execute high-TPS cross-currency operations with absolute mathematical
precision, without risking database lockups or database pollution and in strict compliance with
sovereign exchange control regulations.

**Architectural note (memory-only triangulation & precision):** triangulation is strictly
transient, computed in-memory by the Pricing Engine, and the calculated cross-rate is **never
written or cached in `CURRENCY.RATES`**. The intermediate converted amount in the transit
currency must never be rounded to its native scale — held at **18-decimal `BigDecimal` precision**
and rounded exactly once, at the final step, to the target currency's `NO_OF_DECIMALS`.

**Pre-conditions:** `CURRENCY.RATES` populated with active, time-bounded rates; static
dictionaries (`CURRENCY`, `COMPANY`, `CURRENCY.MARKET`, `BUSINESS.UNIT`) operational; default
transit currencies parameterized at the `COMPANY` level. **Access rule**: front-office and
accounting execution modules (EP-06, EP-08) must have internal system-integration permissions to
query the Pricing Engine API — this is the literal source of the "internal system-integration
permission" precondition in the pasted manual TC; it is not invented.

**Happy path (9 steps):** actor sends `Market ID`, `Business Unit ID`, `CCY_BASE`, `CCY_QUOTE`,
`Amount`, `RATE_TYPE` → system resolves the requesting BU's `COMPANY` → confirms
`MANDATORY_TRIANGULATION = NO` → resolves Base/Quote via a 3-level hierarchy (explicit API
override → transaction payload `BASE_CURRENCY` → `BASE_CCY_RANK` fallback) → builds key
`MM.UUUUUUU.BBB.SSS` → finds the direct pair → filters to the exact `RATE_TYPE` (no auto-spread)
→ selects the `AMT_FROM` band → **"returns only the raw numerical `RATE_VALUE`"** back to the
caller.

**4 alternative flows:**
- **Alt 1 — Triangulation (memory-only):** no direct pair → resolve transit currency (API param →
  `COMPANY.TRIANGULATION_CCY` fallback `LOCAL_CURRENCY` → `SYSTEM.PARAMETER` global default) →
  triangulate at 18-decimal precision → round once → **never persisted**.
- **Alt 2 — Mandatory regulatory triangulation bypass:** if `COMPANY.MANDATORY_TRIANGULATION =
  YES`, direct-rate records are bypassed entirely (even if they exist) and the engine forces a
  two-hop path through `TRIANGULATION_CURRENCY`.
- **Alt 3 — Business Unit fallback (recursive):** no rate at the exact BU → walk up
  `BUSINESS.UNIT` parents → nearest active parent's rate wins → if none anywhere up to Head
  Office, abort with **"Rate Not Found"**.
- **Alt 4 — Missing explicit rate type:** requested `RATE_TYPE` isn't present for that key (even
  if another type is) → reject with **"Requested Rate Type missing. Spread auto-calculation is
  prohibited."** — a *specific* message, not the generic "Rate Not Found".

**Business rules:** Base/Quote resolution failure → "Base currency cannot be resolved"; No
Auto-Spread (as above); Transit Currency Restriction — `BASE_CCY_RANK` must never be used to pick
a transit currency; Banding boundary `AMT_FROM <= Amount < Next_Tier_AMT_FROM`; Read-only —
execution must never lock or insert into `CURRENCY.RATES`.

**9 Acceptance Criteria** (verbatim numbering from the page, condensed):
1. Explicit `BASE_CURRENCY`/`Quote` in payload overrides rank-based fallback.
2. ~~No explicit base declared → lowest `BASE_RANK` wins.~~ — **REMOVED from the Story,
   2026-09-02** (Artur Fonichkin + Mikalai Yudzilevich, team chat): invalid per Andrei Petkevich's
   hard rule that rates always exist in both directions (e.g. both GBP→JPY and JPY→GBP), so there
   is never a "no base declared" case left to resolve by rank. This is *why* the `currencies[]`
   array-mode request field was removed from the real API too (§ below) — not a regression, the
   whole scenario stopped being a real requirement. See the corresponding entry in
   [[project_currency-engine-contract-findings]].
3. `KES→JPY`, no direct pair, no transit param → BU's default transit currency used, in-memory
   triangulation, **nothing persisted**.
4. Bands at `0` and `10,000`, a `15,000` request → the `10,000`-tier rate is selected.
5. `RATE_TYPE=ASK` requested, only `MID` exists → reject with the *specific* "Requested Rate Type
   missing..." message (not a generic 404).
6. No rate at `MM.BR-NORTH-01.USD.EUR` → recursively check `BR-NORTH`, then Head Office → return
   nearest available.
7. No rate anywhere up the BU chain → abort, "Rate Not Found".
8. Company with `MANDATORY_TRIANGULATION=YES` + `TRIANGULATION_CURRENCY=XAF` → direct `USD/EUR`
   rate is bypassed even though it exists; two-hop `USD→XAF→EUR` at 18-decimal precision, rounded
   once.
9. `MANDATORY_TRIANGULATION=NO`, no `KES/JPY` pair, no transit param → BU's default transit
   currency (e.g. `USD`) used, in-memory triangulation, nothing persisted (same shape as AC3,
   phrased as the "NO" counterpart to AC8's "YES").

---

## Real implementation (`proj-currency-engine`, confirmed via `proj-bruno-api` `origin/main` + live)

- **Endpoint:** `POST {{currency-engine-url}}/api/v1/currencies/rates`
  (`http://qa.proj.local/currency-engine` on this environment) — **not** the GET-with-query-params
  shape the Story's own embedded illustrative examples elsewhere in this Epic use; see
  [[project_currency-engine-contract-findings]] for the three-way contract disagreement
  (BA-illustrative spec / pasted manual TC / real implementation).
- **Request body:** ~~`{market, businessUnit, baseCurrency, quoteCurrency (or currencies[] —
  BASE_RANK-ordered array mode), rateType, transitCurrency?, amount:{units,nanos}}`~~ — **the
  `currencies[]` array/unordered-pair mode appears REMOVED as of 2026-09-02** (live-probed
  directly: `currencies`, `currencyCodes`, `codes`, `baseCurrencies`, and omitting the pair
  entirely all get the same generic `400 {"detail":"Invalid request content."}`; only explicit
  `baseCurrency`+`quoteCurrency` together succeeds — control call got a legitimate `404 Rate Not
  Found`, so the endpoint itself is healthy, this isn't an outage). Two
  documented "request modes" (explicit pair vs. `currencies[]` array) used to map onto the Story's
  "Explicit API Override" vs. "System Fallback via `BASE_CCY_RANK`" resolution levels 1 and 3 —
  level 2 (`BASE_CURRENCY` inside a transaction payload) isn't representable at this endpoint at
  all, since this endpoint has no notion of a "transaction payload," only a bare rate query.
  **RESOLVED 2026-09-02 (Artur Fonichkin, team chat) — array-mode/`BASE_RANK`-fallback was not
  moved anywhere, it was deliberately dropped, because AC2 itself is invalid.** Rates now always
  exist in both directions (Andrei Petkevich's hard rule), so a "no base declared" pair is not a
  real system state to resolve. AC2 is being removed from the Story text (Mikalai Yudzilevich to
  update Confluence). `currency-regression.spec.ts`'s TC-04 (allureCaseId 3146, "Base resolution
  falls back to the lower BASE_RANK when no base is declared") was deleted from the suite the same
  day, per explicit user instruction, and Allure case 3146 was deleted (moved to trash) in
  TestOps. The `currencies?: string[]` field was also removed from `ResolveRatePayload`
  (`api/types/currency-engine.types.ts`) since nothing references it any more. See
  [[project_currency-engine-contract-findings]]'s 2026-09-02 entries for the raw probe results and
  the resolution.
- **Response:** ~~`{baseCurrency, quoteCurrency, rateType, quoteCode, rateValue}`~~ — **superseded
  2026-09-02.** The Currency Engine was upgraded on QA (2026-09-01) and `/rates` now returns a
  nested `Amount`-based shape instead:
  `{baseCurrency: {currency, quotationCode, numberOfDecimals}, quoteCurrency: {same}, rate: {type,
  value: {units, nanos}}}`. `proj-bruno-api`'s `Resolve Rate.yml` doc block still shows the old flat
  example (dated 2026-08-20, TB-3100, not yet refreshed post-upgrade) — trust the live shape over
  it. Convert `rate.value` with `readMoneyAmount()` (`charges-calculation-engine.types.ts`) to get
  a plain number. Full detail: [[project_currency-engine-contract-findings]]'s 2026-09-02 entry.
  Everything below this point in this file that shows the old flat `body.rateValue`/`body.baseCurrency`
  (string) shape is describing that superseded contract — the underlying business-logic findings
  (QUOTATION_CODE scaling, rounding, error catalog, etc.) still hold, only the field *paths* changed.
  `quoteCode` (the *base* currency's `QUOTATION_CODE`) is now presumably `baseCurrency.quotationCode`
  — not yet independently re-verified live against a triangulation call.
  Originally: **not** "only the raw numerical `RATE_VALUE`" as the Story's happy-path step 9
  states; a richer object is returned, and this extra field isn't mentioned in the Story at all.
- **Error catalog** (13 files, `Currency Engine/Errors/*.yml`, all live-verified against QA):
  400/404/422/500 rows exist; **no 401/403 row exists anywhere** — the Story's own "internal
  system-integration permission" access rule has no confirmed enforcement behavior documented in
  Bruno. Two AC-relevant mismatches against the Story's exact wording:
  - AC5's "Requested Rate Type missing. Spread auto-calculation is prohibited." is **not** what
    Bruno confirms — the real message for a valid-but-unmatched `RATE_TYPE` is the generic `404
    Rate Not Found` (same code path as "no record at all"), per `opencollection.yml`'s error table
    and `Errors/13 Invalid Rate Type.yml`'s own doc note ("a *valid* rate type with no matching
    band is a 404 Rate Not Found").
  - AC7's "Rate Not Found" *is* confirmed correct as the terminal fallback message.
- **RESOLVED 2026-08-26 (TB-3276 team-chat thread, dev + BA decision) — AC5's special message is
  being dropped, `Rate Not Found` becomes the uniform response for every missing-rate situation,
  direct or triangulated.** Sequence of the thread: Artur Fonichkin asked what should happen when
  the direct pair has zero rows (triangulation attempted) but the specific requested `RATE_TYPE` is
  missing on a transit leg. The AQA-side proposal was to generalize AC5's existing distinction
  *per leg* (zero rows anywhere on a leg → `Rate Not Found`; leg has rows but wrong type →
  "Requested Rate Type missing..."). **Artur's counter, which settled it:** the entire value of the
  distinct message is the implicit promise "try a different `RATE_TYPE`, you'll get a real answer"
  — that promise is only reliable in the single-key direct case (the alternate type is confirmed
  present at that exact key), not across a multi-leg triangulation chain (the other leg's type
  coverage is unknown/unrelated, so the hint can point the caller at a retry that still fails).
  With no reliable caller-facing benefit left, **Artur + BA decided to return `Rate Not Found`
  everywhere rate resolution fails**, dropping the AC5-specific message entirely rather than
  scoping it more narrowly. Practical effect: **TB-3276 converts from "bug, fix the message" to
  "not a bug — current implementation is already correct behavior; AC5/Alt Flow 4 on this Story's
  Confluence page need correcting to drop the special message"**. User will cancel TB-3276 once the
  Story text is updated (Mikalai agreed in the same thread to change it); the ticket itself is not
  cancelled yet as of this note, but the tests were deliberately updated ahead of that per the
  user's explicit instruction in chat ("тест уже щас актуальные были" — tests must already reflect
  the agreed behavior, ticket/Story cleanup to follow after).
  - **Tests updated, 2026-08-26, `group-3/TB-2960` (uncommitted).** `TC-09`
    (`allureCaseId(3150)`, `currency-regression.spec.ts`, both `test.step`s ~2501/2522) and the
    unlinked `RATE_TYPE=MID` case in the same file (~4088, BID/ASK-only key, no Allure id) now
    assert `Rate Not Found` instead of the old "Requested Rate Type missing..." string; the `404`
    status assertions were already correct and untouched. `currency-smoke.spec.ts` had no
    occurrence of the old message (its own uncommitted diff is unrelated `NO_OF_DECIMALS` work) —
    no change needed there.
  - **Allure case 3150 updated too, 2026-08-26, same day** — user asked for this ahead of the
    formal TB-3276 cancel/Confluence edit as well. `testops_update_testcase` (native MCP,
    confirmed reachable from a `proj-test-automation` session this time, contra the stale "not
    connected here" note in [[reference_allure-testops-rest-access-from-proj-test-automation]] —
    worth re-checking connectivity fresh each session rather than trusting that memory's verdict)
    with a full-tree `scenario` replace per `rules/allure.md` §3a (case uses a single `body` step
    with one `expectedResultSteps` entry; only that entry's text changed, from `HTTP 404;
    "Requested Rate Type missing. Spread auto-calculation is prohibited."` to `HTTP 404; "Rate Not
    Found"`). Re-fetched and diffed after write — step structure, custom fields
    (Component/Feature/Story), status (`Draft`) all intact, only the intended text changed. Test
    code and Allure case now agree; **only Confluence (AC5/Alt Flow 4 text) and the TB-3276 ticket
    status are still outstanding**, both owned by Mikalai/user per the chat thread, not this role.
- **Triangulation strategies** (confirmed matching the Story's Alt 1/Alt 2 almost exactly):
  `DIRECT_CALCULATION_WITH_FALLBACK`, `ONLY_DIRECT_CALCULATION` (transit currency equals one side
  of the pair — a plain direct lookup, no triangulation), `MANDATORY_TRANSIT_CCY_CALCULATION`.
  `transitCurrency` sent while `COMPANY.MANDATORY_TRIANGULATION=true` → `400` "transitCurrency
  conflicts with COMPANY.MANDATORY_TRIANGULATION …" (matches the Story's Alt 2 intent, opposite
  direction from AC8 which is the case where the company *itself* mandates it).
- **Triangulation arithmetic — `QUOTATION_CODE` scales only the FROM-side currency of each leg**
  (dev-provided calculation walkthrough, 2026-08-25, no commission — plain A→B via transit C; **not
  yet independently live-verified**, see caveat below). For a two-hop chain A → C (transit) → B,
  each currency carrying its own `QUOTATION_CODE` (`n_A`, `n_C`, `n_B`):
  1. Leg 1 (A→C, A is FROM): `Amount_C = (Amount_A / 10^n_A) × Rate(A/C)`, kept unrounded.
  2. Leg 2 (C→B, C is now FROM): `Amount_B = (Amount_C / 10^n_C) × Rate(C/B)`, rounded exactly once
     at the end to `NO_OF_DECIMALS(B)` — matches the Story's own "18-decimal precision, rounded
     once" architectural note above, now with the actual formula behind it.
  3. Equivalent single cross-rate: `Cross_Rate(A/B) = (Rate(A/C) × Rate(C/B)) / 10^n_C`, applied as
     `Amount_B = (Amount_A / 10^n_A) × Cross_Rate(A/B)`.
  - **The rule:** the `10^n` scale correction applies only to whichever currency sits on the
    **FROM** side of a given rate application, never to a currency that is only ever the final
    **TO** side. In an A→C→B chain, `n_B` never enters the arithmetic at all — it would only
    participate if B itself became transit in a *different* chain (`X→B→Y`), or if something were
    calculated on top of the finished `Amount_B` that takes B as its own FROM side (e.g. a
    commission tariff priced off `Amount_B` — flagged by the dev as a separate, not-yet-fully-
    captured example; revisit once that walkthrough is available in full).
  - **This explains the previously-unexplained `quoteCode` field** in the real
    `/currencies/rates` response (documented above as "isn't mentioned in the Story at all"): for
    a **direct**, non-triangulated query the engine hands back the base currency's own
    `QUOTATION_CODE` precisely so the caller can perform this same FROM-side scaling when applying
    `RATE_VALUE` to an amount — the engine only applies the correction itself internally, during
    its own in-memory triangulation.
  - `NO_OF_DECIMALS(B)` rounding at the very end is a separate, orthogonal step from the
    `QUOTATION_CODE` scale correction — the two fields serve different purposes, don't conflate
    them.
  - **Test-design implication for AC3/AC8/AC9 — confirmed by code review, 2026-08-25.** Checked
    every triangulation test in `currency-regression.spec.ts`'s `US-01.13.03` block (TC-10, TC-11,
    TC-27, TC-28, TC-29): **none** of them assign a `QUOTATION_CODE` override to base, transit, or
    quote currency — all five run on `createDedicatedCurrency`'s default `QUOTATION_CODE: 1` for
    all three currencies. The shared `TRIANGULATION_DIVISOR = 10 ** 1` constant (line ~1905,
    comment: *"Corrects the double-counted QUOTATION_CODE=1 scale... when two legs are multiplied
    together"*) is only correct by coincidence — it happens to equal `10^n_C` because `n_C` (the
    transit currency's own code) is always 1 in every existing test, never because any test proved
    the divisor is *derived from* the transit currency's actual configured code. The comment's own
    "double-counting" framing is a different, likely-incorrect mental model than the real per-leg
    FROM-side rule above. **Concrete blind spot:** these five tests cannot currently distinguish
    "the engine correctly reads the transit currency's own `QUOTATION_CODE` and computes `10^n_C`"
    from "the engine has a hardcoded `/10`, ignoring `QUOTATION_CODE` entirely" — both hypotheses
    produce identical results against all five as written today. Two follow-ups, in order:
    1. Live-verify the formula itself first (see "Not yet independently live-verified" below).
    2. Then update at least one test (TC-10 is the natural candidate — the plain explicit-
       `transitCurrency` case) to give base/transit/quote three genuinely different
       `QUOTATION_CODE`s (mirroring the dev's 2/3/4 example) and compute the expected divisor as
       `10 ** <the code actually assigned to the transit currency>` instead of the module-level
       constant — this is what would actually prove the FROM-side-only rule, not just that
       triangulation returns *some* number.
    - **Separately:** the response's `quoteCode` field (confirmed to be the base currency's own
      `QUOTATION_CODE`, see above) has **zero assertions anywhere in the test suite** (`grep
      quoteCode` across `api/` hits only the type declaration) — worth a assert in a non-
      triangulated happy-path test once its purpose is confirmed live.
  - **Independently live-verified, 2026-08-26 — formula confirmed correct.** `qa.proj.local` became
    reachable again; repeated the disposable-probe pattern used for AC4 with three dedicated
    currencies carrying deliberately different `QUOTATION_CODE`s, using the dev's own numbers for
    direct traceability: `baseCurrency.QUOTATION_CODE=2`, `transitCurrency.QUOTATION_CODE=3`,
    `quoteCurrency.QUOTATION_CODE=4` (`NO_OF_DECIMALS=6` on the quote currency, to keep enough
    precision to tell the two hypotheses apart after rounding), `Rate(A/C)=0.845000`,
    `Rate(C/B)=12.400000`. The two competing hypotheses predict values two orders of magnitude
    apart, so this is a clean discriminator, not a near-miss: dividing by the transit currency's own
    `10^QUOTATION_CODE` (`10^3=1000`) predicts `rateValue ≈ 0.010478`; a hardcoded `/10` ignoring
    `QUOTATION_CODE` entirely predicts `rateValue ≈ 1.0478`. Staged both legs through the real
    `CURRENCY.ORDER` → daemon → `CURRENCY.RATES` pipeline (force-fired, same as every other
    triangulation test in this suite), then queried `POST /currencies/rates` with an explicit
    `transitCurrency`. **Result: the live assertion `expect(body.rateValue).toBeCloseTo(0.010478, 6)`
    passed** — the engine's real behavior matches the dev's FROM-side-only formula exactly, not the
    hardcoded-`/10` alternative. The formula in this section is now a confirmed fact, not an
    unverified developer claim.
  - **Folded into TC-10 itself, 2026-08-26 (uncommitted, `group-3/TB-2960`) — not a separate test.**
    The live probe above was first added as a standalone extra test, then merged into TC-10 (id
    3153) as a third `test.step` (base=`QUOTATION_CODE 2`, transit=`3`, quote=`4`,
    `Rate(A/C)=0.845000`, `Rate(C/B)=12.4`), right after TC-10's existing two same-`QUOTATION_CODE`
    cases — per this section's own "two follow-ups" recommendation ("TC-10 is the natural
    candidate"), rather than left as an uncased orphan test duplicating TC-10's own precondition/
    action shape.
  - **All five triangulation tests (TC-10, TC-11, TC-27, TC-29, TC-30) hardened, 2026-08-26 — no
    longer derive the expected cross-rate from a shared magic constant.** All five previously
    computed `expectedCrossRate` via a module-level `TRIANGULATION_DIVISOR = 10 ** 1` constant —
    correct only because every currency in every one of these tests happened to default to
    `QUOTATION_CODE: 1` (see `buildStandardCurrencyInputData`); the constant would have silently
    produced the *wrong* expectation the moment any test's currency setup changed. `createDedicatedCurrency`
    (`currency-helper.ts`) now returns the `quotationCode` it actually used (from the caller's own
    `overrides.QUOTATION_CODE`, defaulting to `1` — same default as before, just no longer assumed)
    on the `DedicatedCurrency` object; every one of the five tests now computes
    `10 ** transitCurrency.quotationCode` (or `10 ** localCurrency.quotationCode` for TC-30, where
    the transit role is played by the LOCAL_CURRENCY-fallback currency) from that real value instead
    of the constant. TC-27 only referenced the constant in a diagnostic message (its actual assertion
    was already a hand-computed literal, `expectedRateValue = 0.21`) — fixed the message only, no
    assertion change; TC-28 doesn't use the divisor at all (asserts a literal decimal-string prefix)
    and was left untouched. **Live-confirmed, 2026-08-26**: re-ran all four tests whose *assertion*
    changed (TC-10, TC-11, TC-29, TC-30) against `qa.proj.local` after the fix — all four passed
    (`4 passed (10.6m)`), confirming the derivation change didn't alter any real expected value (all
    four still mint `QUOTATION_CODE: 1` currencies except TC-10's own new third case).
  - **Allure TestOps case 3153 updated, 2026-08-26** (`testops_update_testcase`, project id 2 "TB
    CBS") — added the divergent-`QUOTATION_CODE` scenario as the case's step 2, preserving the
    original Excel-sourced step 1 (`KES/JPY` via explicit `transit=USD`) unchanged. Step 2: stage
    `base/transit=0.845000`, `transit/quote=12.400000` for a base/transit/quote triple with
    `QUOTATION_CODE` 2/3/4 respectively, explicit `transitCurrency`; expected `HTTP 200`, cross-rate
    divides by the transit currency's own `10^QUOTATION_CODE` (`10^3=1000` here, `rateValue ≈
    0.010478`, not `≈1.0478` from a hardcoded `/10`), nothing written to `CURRENCY.RATES`. Case
    `status` is still `Draft`/`workflow: Default Manual` on the TestOps side and its `automated` flag
    reads `false` despite being linked via `allureCaseId(3153)` in code — not changed here, flag to
    Manual QA/whoever owns Allure status transitions if that also needs updating.
- **Same-currency pair** → `404 Currency reference not found` (an odd-but-confirmed edge case, not
  covered by any AC above).
- **Expired `CURRENCY.RATES` record** → `500`, not `404` (a `SEE`-hook 400 escapes to the
  catch-all) — also not covered by any AC above, worth a dedicated case if this Story is ever
  extended.
- **`RATE_VALUE` decimal scale is independent of the currency's own `NO_OF_DECIMALS`, in both
  directions — [TB-3277](https://bank-proj.atlassian.net/browse/TB-3277), Open.** Confirmed design
  (Mikalai Yudzilevich, chat 2026-08-24/25): input scale should equal the currency's own
  `NO_OF_DECIMALS`; only the triangulation *intermediate* calculation runs at 18-decimal
  `BigDecimal` precision (unrounded), with the final result rounded once back to the target
  currency's `NO_OF_DECIMALS`. Real behavior diverges on **both** ends: (a) at `NO_OF_DECIMALS: 2-3`,
  a 4-decimal `RATE_VALUE` is accepted on `INPUT` and **not rounded** on the way back out through
  the Currency Engine (TB-3277's original repro); (b) at `NO_OF_DECIMALS: 18`, an 18-decimal
  `RATE_VALUE` is still **rejected** on `INPUT` with `400 ... up to 9 decimal places` — a hardcoded
  cap, live-confirmed 2026-08-25 while automating TC-28 (see
  `docs/test-cases/TB-1989/analysis.md`'s v4 changelog entry). The 9-decimal cap is not tied to any
  currency's config — `proj-bruno-api`'s `RATE_VALUE` field-registry/schema entries (`x-type: RATE`,
  `x-config: {}`) declare no scale override at all.

---

## DB/environment reality check (2026-08-21, live `qa.proj.local`, read-only)

This is what actually blocks or unblocks each AC **today**, independent of whether the code path
itself is implemented:

- **`BUSINESS.UNIT` does not exist as a schema on this environment at all** (confirmed:
  `information_schema.schemata` has no `business_unit`/`%business_unit%` match). This matches the
  module INDEX's existing "BUSINESS.UNIT — out of scope for the current environment" note (M3,
  Dima Bogoslovsky) — **AC6 and AC7, the story's own headline "Hierarchical Rate Resolution"
  feature, cannot be automated at all right now**, not because of a test-design gap but because
  the data model dependency is unprovisioned. This is a hard blocker, not a "needs more setup"
  item.
- **`COMPANY.MOCK`** (the company this whole test suite runs under, `COMPANY_CODE=MOCK`) has
  `LOCAL_CURRENCY: "ZZC"` and `MANDATORY_TRIANGULATION: false`. No row across ~30 `COMPANY.liv`
  records (mostly test-generated junk from unrelated prior runs) has `TRIANGULATION_CCY`/
  `TRIANGULATION_CURRENCY` set. `ZZC` does exist as a real `CURRENCY` record, so it's not a
  dangling reference — but it reads as an accidental test-generated 3-letter code
  (`generateRandomCurrencyId()`'s output shape) rather than a deliberately configured local
  currency, meaning **AC3/AC9's fallback-to-`LOCAL_CURRENCY` path currently resolves to test
  pollution, not a stable, intentional value** — fragile to build a test on as-is.
- **`SYSTEM.PARAMETER.DEFAULT_TRANSIT_CCY` is `null`** on this environment — the last rung of the
  transit-currency fallback ladder isn't configured at all.
- **AC8 (mandatory triangulation, CEMAC-style) needs a dedicated company** — `MOCK` itself has
  `MANDATORY_TRIANGULATION=false`; Bruno confirms creating a company with
  `MANDATORY_TRIANGULATION=YES` + `TRIANGULATION_CURRENCY` set is possible
  (`COMPANY/proj-table-template/Operations/INPUT - Mandatory Triangulation With Currency.yml`), but
  this suite has no existing helper for standing up a second company + routing a request under it
  (`X-Company-Code` header) — new test infrastructure, not just new test data.
- AC1/AC2/AC4/AC5 (explicit pair, rank fallback, amount banding, missing-rate-type rejection) and
  the plain direct-pair happy path are all exercisable **today** with zero new infrastructure —
  `market=1, businessUnit="USD", baseCurrency="USD", quoteCurrency="EUR", rateType="MID"` is a
  live-verified, already-seeded 200 (see [[project_currency-engine-contract-findings]]); AC5's
  negative case (`rateType="ASK"` against that same key) is verified as a live `404`.
- **AC4 (amount-band boundary selection) empirically confirmed live, 2026-08-21** — previously
  only a Confluence claim with no Bruno example exercising it (none of the 4 `Resolve Rate*.yml`
  files query the same key at two different amounts). Ran a disposable probe: dedicated
  currencies, market `11` (`DIFF_AMT=true`), one order with two `MID` bands
  (`AMT_FROM=0→RATE_VALUE=1.0000`, `AMT_FROM=10000→RATE_VALUE=2.0000`), staged/authorized/
  force-fired through the real async pipeline exactly like `currency-regression.spec.ts`'s TC-02.
  Querying the Currency Engine at `amount=500` and `amount=5000` both returned `1.0000`
  (`0`-tier); `amount=15000` returned `2.0000` (`10000`-tier) — `AMT_FROM <= Amount <
  Next_Tier_AMT_FROM` holds exactly as the Story's Business Rule states. This closes the
  previously-open "band-selection algorithm unconfirmed" gap for AC4 — it's real, correct, and
  automatable on its own (needs the same heavy async setup as US-01.13.02's TC-02, ~45-60s, so
  Integration-tier not smoke-tier if automated as its own case).

---

## Cross-reference: this Story's business rules were already partially captured

Before this file existed, `US-01.13.02/CurrencyFlow-Meet.md` and `US-01.13.02/DaemonFlow.md`
(dev-sync transcripts with Artur Fonichkin, 2026-08-19) already recorded most of the Currency
Engine's triangulation rules — filed under US-01.13.02 only because no US-01.13.03 folder existed
yet at the time. Cross-check before treating either version as more authoritative than the other:
- Transcript's fallback chain (`explicit → MANDATORY_TRIANGULATION and TRIANGULATION_CURRENCY →
  TRIANGULATION_CURRENCY if set (non-mandatory) → local currency → SYSTEM.PARAMETER.
  DEFAULT_GLOBAL_CURRENCY → error`) is a 6-level chain; **this Story's Confluence page describes a
  shorter 3-level chain** (explicit → `TRIANGULATION_CCY` fallback `LOCAL_CURRENCY` → global
  `SYSTEM.PARAMETER`) and names the parameter `DEFAULT_TRANSIT_CCY`, not
  `DEFAULT_GLOBAL_CURRENCY`. Bruno's own field registry confirms the real field is
  `DEFAULT_TRANSIT_CCY` (`SYSTEM.PARAMETER/proj-field-registry/Create DEFAULT_TRANSIT_CCY
  field.yml`) — the transcript's `DEFAULT_GLOBAL_CURRENCY` name is stale/mis-recalled, the
  Confluence page's name is correct.
- Transcript's "if the transit currency equals one of the pair's own currencies, it's skipped as
  redundant" matches Bruno's `ONLY_DIRECT_CALCULATION` strategy exactly (confirmed independently
  from two sources).
- Transcript's "querying an amount below every band's threshold yields Rate Not Found even if a
  higher-`AMT_FROM` band exists" is **not** explicitly stated in this Story's own text — worth its
  own AC/case if ever revisited, currently an orphan fact.
- The dev team explicitly flagged transit-currency coverage as needing **real bank rate data for a
  specific date** to validate triangulated output against an independently-known-correct
  calculation, not just internal self-consistency — still an open ask, not yet acted on.

---

## Automation status

**2026-09-02 — all 10 new Allure cases automated, with stated caveats.** Ran the mandatory 5-step
flow: Confluence pageId 1529872396 re-read fresh — **confirmed zero mention anywhere on the page**
of same-currency handling or a `/rates/local` endpoint, so all 10 of these cases test behavior
undocumented at Story level. `proj-bruno-api` `origin/main` re-fetched — it now HAS a
`Resolve Local Rate.yml` file (commit `460ca9ec`, added after the 2026-08-31 note below was
written) confirming the request/response shape, but its `Errors/06 Same Base And Quote.yml` still
documents the OLD same-currency behavior (`404 "Currency reference not found"` for a *valid*
same-currency pair) — this **contradicts** the live-verified fact in
[Currency-Engine-QA-Verification-2026-08-31.md](../Currency-Engine-QA-Verification-2026-08-31.md)
§1 (`baseCurrency=quoteCurrency=USD` → `200`, `rate.value={units:1,nanos:0}`, re-verified *after*
the engine update Bruno's error-case file predates) — treated the fresher live re-verification as
authoritative, consistent with this module's established "Bruno beats/lags reality" pattern, not a
silent guess.

Added `CurrencyEngineApiClient.resolveLocalRate()` + `ResolveLocalRatePayload` type
(`api/types/currency-engine.types.ts`), justified by the Bruno file above. New client/test client
reads market 1 exclusively regardless of `market`/`businessUnit` sent — confirmed live in
QA-Verification §1, exercised directly by cases 3432/3433 below.

**Correction, same day:** the paragraph above was written from title+precondition only — the
`/testcase/{id}/scenario` REST endpoint returned an empty step tree for all 15 new cases, and that
was mistaken for "no steps recorded" instead of falling back to `/testcase/{id}/step` (or, the
correct path, `testops_find_testcases(expand:["scenario"])` on `allure-testops-native`, confirmed
per `rules/allure.md` §3a). Once the real Steps/Expected Result were fetched properly, several
cases turned out to need a different assertion than the paragraph above guessed. Re-verified via
the proper MCP path and fixed in `currency-regression.spec.ts` 2026-09-02, then live-run
(14/15 passed):
- **3427** (same-currency rate=1) — **the case's own stored Step/ER is a copy-paste artifact
  unrelated to its title** (`market:3, baseCurrency:"USD", quoteCurrency:"AUD"`, ER about
  "no auto-spread" — identical text to a different, unrelated case). The automated test follows the
  **title** + the independently live-verified fact (QA-Verification §1: same-currency → `200`,
  `rate.value=1`), not the stored Step/ER. Passed live. **Recommend Manual QA re-paste the correct
  Step/ER for 3427 in Allure** — its current stored content doesn't test what its title claims.
- **3428** (same-currency, unknown code, rejected) — real ER quotes an exact message:
  `"Currencies not found: [XXX]"`, `404`. Fixed to assert this exact format. Passed live.
- **3429/3430/3431** (`/local` `isBaseCurrency` true/default/false) — matched the real Step/ER
  (literal `USD`/`XAF` in Allure substituted for minted dedicated currencies, per
  [[feedback_test-case-values-are-examples]] — the mechanic under test, not the literal identity,
  is what matters here). All passed live.
- **3432** (Market-1-only sourcing) — matched. Passed live.
- **3433** (Business-Unit independence) — real Step says "repeat from contexts of different
  business units"; this suite has no mechanism to vary a caller's BU context for this endpoint (BU
  is only ever set via `CURRENCY.ORDER`'s `UNIT` field, an INPUT-time concept, not a per-request
  session concept). Adapted to sending a rogue `businessUnit` field in the request body and
  confirming it's silently ignored (the same invariant, a different concrete action than the Step
  literally describes) — flagged as an adaptation, not a literal reproduction. Passed live.
- **3434** (rejects unknown/inactive currency) — real ER is `404 "Currencies not found: [XXX]"`,
  **not** `400 "Invalid request content."` as first guessed. Fixed. Passed live.
- **3435** (rejects non-boolean `isBaseCurrency`) — real ER originally quoted
  `"isBaseCurrency must be boolean (true/false)."`, `400`. Written to match, but **failed live**:
  actual response is `{"detail":"Failed to read request","status":400,"title":"Bad Request"}` — a
  generic Spring/Jackson JSON-deserialization failure (the string `"yes"` can't parse into a
  `boolean` field, so the request fails before any custom validation runs) — status matched, message
  text didn't. **2026-09-02, updated in Allure (user-approved) rather than just fixed locally**:
  corrected step 1's ER to the real message, and added two more boundary steps to the same case
  (BVA on the same "invalid `isBaseCurrency`" theme, not a new scenario): step 2 —
  `isBaseCurrency: null` (predicted to behave the same as omission, defaulting to `true`, since
  Jackson deserializes `null` into a boxed `Boolean` field without error before any default-value
  logic runs); step 3 — `isBaseCurrency: 1` (numeric), originally predicted to fail the same way as
  the string case (no implicit 1/0→boolean coercion). Test now has 3 `test.step`s under
  `allureCaseId(3435)`, soft-asserted so one step's failure doesn't hide the others.
  **First live run, 2026-09-02: step 2's prediction held** (null → `200`, defaults to `true`,
  base=National Bank currency, quote=`COMPANY.LOCAL_CURRENCY`) **but step 3's prediction was
  wrong** — a nonzero JSON number (`1`) for `isBaseCurrency` returns `200`, not `400`. This is
  Jackson's default lenient scalar coercion: a `boolean`/`Boolean` field accepts a JSON number
  (`0`→`false`, nonzero→`true`) but rejects an arbitrary JSON string that isn't `"true"`/`"false"`
  (`MapperFeature`'s scalar-coercion default, distinct from `StringDeserializer`'s stricter token
  set) — a confirmed technical finding about the real implementation, not a test bug, since this
  was the AQA's own added BVA step rather than a BA-authored Allure ER. Fixed 2026-09-02: step 3 now
  asserts `200` with the same coerced-to-`true` base/quote shape as step 2's default case.
  **2026-09-02, later same day — scope narrowed back to step 1 only, per user decision after a team
  chat with Artur Fonichkin.** Artur reported live-observing that `isBaseCurrency` currently
  *rejects* both a string and `null` (only a numeric `0`/`1` is silently coerced) — this **contradicts
  this same file's own step 2 finding just above** (`null` → `200`, defaults to `true`, live-verified
  earlier the same day). The user's call: don't chase the numeric-coercion question ("valid that it
  accepts a number?" left open, unanswered) and don't re-verify the `null` contradiction right now —
  just drop steps 2/3 back out of the case and keep only step 1 (string → `400`). Applied: test now
  has a single `test.step` (`currency-regression.spec.ts`, `allureCaseId(3435)`), Allure case 3435's
  scenario updated to match (steps 2/3 removed). **Open/unresolved:** whether `null` is actually
  accepted (as this file verified) or rejected (as Artur reported) is not re-settled — re-verify live
  before adding any future test coverage for the `null` case on this field.
- **3436** (Rate Not Found when no Market-1 rate exists) — matched. Passed live.

Test names in the nested describe were also cleaned up 2026-09-02 per user request — dropped the
literal `/local` endpoint-path prefix from every title (e.g. `/local rate is sourced strictly from
Market 1...` → `Rate is sourced strictly from Market 1...`), since a test name should describe
behavior, not repeat the endpoint path — matches [[feedback_step-names-behavioral-not-technical]].
The nested describe itself is now named `'National Bank rate resolution via
COMPANY.LOCAL_CURRENCY'` (was `'/rates/local endpoint (...)'`).

`/rates/local` is the same new endpoint the module [INDEX.md](../INDEX.md) flagged 2026-08-31 as
reverse-engineered live — Bruno has since caught up on the happy-path shape (`Resolve Local
Rate.yml`, commit `460ca9ec`), but still documents nothing for its edge cases.

**Updated 2026-08-26 (superseding the 2026-08-25 note below).** 21 of the sheet's TCs are now
automated across `currency-regression.spec.ts` and `currency-smoke.spec.ts` (TC-01) — two new
cases pasted directly by the user (not yet in Allure): **TC-30** (triangulation falls back to
`COMPANY.LOCAL_CURRENCY` when neither an explicit `transitCurrency` nor `COMPANY.TRIANGULATION_CURRENCY`
is configured) and **TC-31** (dedicated Read-Only isolation case — `CURRENCY.RATES` row count for
the queried direct pair is unchanged before/after a triangulated request). Confirmed while
automating TC-30: **`COMPANY.LOCAL_CURRENCY` is mutable the same way `TRIANGULATION_CURRENCY` is**
(Bruno `COMPANY/proj-field-registry/Create LOCAL_CURRENCY field.yml` carries no immutability marker,
and `13 - E2E Tests/15 CO INPUT - Optional Triangulation Without Currency.yml` live-confirms
`LOCAL_CURRENCY` + `MANDATORY_TRIANGULATION: false` + no `TRIANGULATION_CURRENCY` is accepted) —
this sidesteps the "MOCK's own `LOCAL_CURRENCY` is test pollution" fragility noted below: TC-30
mints and points at its own dedicated currency instead of relying on `MOCK`'s ambient value, exactly
like TC-11 already does for `TRIANGULATION_CURRENCY`. **Also found and corrected**: the existing
TC-24 ("no LOCAL_CURRENCY fallback") had a setup that staged zero rate legs at all, so its `404`
never actually proved anything about a fallback mechanism's existence — rewritten to stage one real,
deliberately-incomplete leg instead; see `docs/test-cases/TB-1989/analysis.md`'s Finding 4 for the
full reasoning and the user's explicit decision to keep both TC-24 and TC-30 rather than merge them.

**Live-confirmed, 2026-08-26, same day.** User ran both tests live — both pass. This is the first
real confirmation that the Story's documented `LOCAL_CURRENCY`-fallback chain (Alt Flow 1 / AC3 /
AC9) is actually implemented, not just documented. TC-24 was renamed to `"An incomplete
LOCAL_CURRENCY route (missing the localCurrency/quote leg) still resolves to Rate Not Found"` —
its old title read as a direct negation of TC-30's once both existed side by side in a test report,
even though the two were never testing the same claim (incomplete route vs. complete route).

**Prior note (2026-08-25, kept for history):** 19 automated; **TC-28, is Blocked (not counted as
Automated)** — its own precondition hits the real, live-confirmed `RATE_VALUE`/`NO_OF_DECIMALS`
defect documented above ([TB-3277](https://bank-proj.atlassian.net/browse/TB-3277)). Two more (TC-15,
TC-25) are written but pending a BA answer. Full current per-TC status, verdicts, and changelog:
[[../../test-cases/TB-1989/analysis.md]] and [[../../test-cases/TB-1989/escalation-brief.md]].

**Allure TestOps linking, 2026-08-26.** TestOps cases for this Story only appeared in the tool
(project id 2, "TB CBS") on/around this date — a fresh full-project scan on 2026-08-25 found zero
cases for this Story, then a same-project scan the next day found 12, with `totalElements` visibly
growing mid-scan (2769→2772), confirming Manual QA was actively creating them live. **The Story
custom field on these cases holds only the plain title, with no `US-XX.YY.ZZ | ` id prefix** — e.g.
case 3109 (a US-01.13.02 case) has `Story = "Asynchronous Rate Order Staging, Validation, and
Scheduling"`, not `"US-01.13.02 | ..."`. Any future Allure query for a Story must filter on the
bare title, not the `docs/module-theory` folder-name-style id-prefixed form used in this repo's own
convention — the two are not interchangeable strings against the live API.

Confirmed 1:1 by comparing each Allure case's steps/payload against the matching automated test's
own assertions (not by title alone) and wired via `allureCaseId(...)` in the test file, following
this repo's established pattern of keeping the test's own descriptive title and only stripping the
`TC-N: ` prefix (not renaming to Allure's own shorter title):

| TC | Allure id | Test title (as shipped) |
|---|---|---|
| TC-01 | 3094 | A direct cross-rate resolves exactly as stored for BID, ASK and MID, with no auto-spread derivation (`currency-smoke.spec.ts`) |
| TC-02 | 3145 | An explicit base/quote pair is resolved exactly as given, not auto-inverted |
| ~~TC-04~~ | ~~3146~~ | ~~Base resolution falls back to the lower BASE_RANK when no base is declared~~ — **removed 2026-09-02, AC2 invalid (see § above)**: test deleted from `currency-regression.spec.ts`, Allure case 3146 deleted |
| TC-06 | 3147 | A 15,000 transaction selects the 10,000 tier, not the 0 tier |
| TC-07 | 3148 | An amount exactly at AMT_FROM (10,000) selects that tier (inclusive lower bound) |
| TC-08 | 3149 | An amount below the lowest band resolves as generic Rate Not Found |
| TC-09 | 3150 | A missing RATE_TYPE is rejected instead of deriving a spread |
| TC-10 | 3153 | Triangulation via an explicit API transitCurrency computes a cross-rate in-memory and persists nothing |
| TC-11 | 3154 | Triangulation via COMPANY.TRIANGULATION_CURRENCY when no explicit transit is given |
| TC-15 | 3157 | An expired rate is treated as absent and resolves to no rate found |
| TC-16 | 3158 | A rate staged with a future START_DATETIME is not yet returned |
| TC-21 | 3160 | rateValue resolved through the Currency Engine is scaled to the quote currency's NO_OF_DECIMALS |
| TC-22 | 3162 | Validate Transparency of Applied Volume Band Corridor Boundaries for Tiered Rates |
| TC-24 | 3206 | An incomplete LOCAL_CURRENCY route (missing the localCurrency/quote leg) still resolves to Rate Not Found |
| TC-27 | 3208 | Triangulated cross-rate combines full-precision leg rates and rounds once at the final step, not per-leg before combining |
| TC-28 | 3209 | Triangulated cross-rate preserves at least 18 decimal digits of internal precision, not silently degrading to IEEE double |
| TC-29 | 3210 | MANDATORY_TRIANGULATION=YES bypasses an existing direct rate and forces triangulation via COMPANY.TRIANGULATION_CURRENCY |
| TC-30 | 3211 | Triangulation falls back to COMPANY.LOCAL_CURRENCY as transit when no explicit transitCurrency and no COMPANY.TRIANGULATION_CURRENCY are configured |
| TC-31 | 3212 | Dynamic triangulation never inserts a CURRENCY.RATES row for the queried direct pair (Read-Only isolation) |

**Wired 2026-08-26, same day as the exhaustive re-scan above** (`currency-regression.spec.ts`,
uncommitted on `group-3/TB-2960`): TC-24/27/28/29/30/31 above — `tsc --noEmit`, `eslint`, `prettier
--write`, and `npm run allure:verify-ids` all clean (653 linked ids, no unexpected duplicates) after
the edit. **19 of the Story's 20 Allure cases now have a linked automated test.** The 20th (3207) is
blocked on Manual QA/BA input, not on missing test code — see the entry above. TC-12 (`BASE_RANK`
must never be used as transit) remains automated locally with no Allure case yet — left unlinked
per this repo's own "new test, no case in TestOps yet" convention.

**TC-12: case 3228 created, 2026-08-26, precondition deliberately corrected from the Excel draft —
confirmed with the user, not a silent substitution.** Excel's original precondition ("no BU default
transit") reads as `COMPANY.LOCAL_CURRENCY = null`. **This is not an achievable system state**:
`proj-bruno-api` `origin/main`'s `COMPANY/proj-table-template/Create COMPANY~MASTER projection.yml`
lists `LOCAL_CURRENCY` in the projection schema's own `"required"` array, and a live `SEE
COMPANY~MASTER/MOCK` on `qa.proj.local` confirms `LOCAL_CURRENCY` is always populated (`"XAF"` at
check time, was `"ZZC"` on 2026-08-21 — the shared `COMPANY.MOCK` record's value visibly drifts
between sessions because several tests in this Story mutate-then-restore it; `TRIANGULATION_CURRENCY`
by contrast is genuinely optional — absent from the schema's `required` list and from live data,
confirmed nullable). This matches manual QA's (Viktoryia Burak's) own live-chat doubt about this
exact precondition. The existing local test (`currency-regression.spec.ts`, no code change needed)
already used the only achievable equivalent — freshly-minted, never-before-seen `base`/`quote`
currencies, so whatever `LOCAL_CURRENCY` actually holds has no route to them regardless of its
value — and additionally stages a **real, working** two-hop route through a lower-`BASE_CCY_RANK`
"bait" currency, so the `404` assertion proves the engine actually refuses the rank-based shortcut
rather than coincidentally finding nothing.

**Three field-format corrections, all caught by the user, all fixed by reading real sibling cases'
actual stored content instead of guessing from the tool's generic schema:**
1. First draft put a paragraph of session rationale ("corrected because X, confirmed via Y...") into
   the case's `description` field — rejected: no analysis/verdicts belong in a TestOps case, same bar
   as a commit message.
2. **This project's real field layout** (confirmed by reading 3206/3094/3145/3162's actual stored
   `description`/`precondition`/`scenario` content, not the tool's generic example): `description` =
   `"Preconditions:\n<prose>"` — the precondition text itself lives here, not in the tool's separate
   `precondition` field, which every sibling case leaves empty (as does `expectedResult`). And
   `scenario.steps` holds exactly **one** step per case — the single actual API call — with that
   step's own `expectedResultSteps` carrying the ER; setup/data-minting detail is folded into the
   `description`'s prose, not broken into its own scenario steps. First draft got both wrong (empty
   `description`, content in `precondition`, 3 scenario steps for mint/stage/request) — corrected to
   match siblings exactly.
3. **`tags` left empty on first draft.** Every sibling carries exactly 3: `"API"` plus either
   `"Regression"`+`"regression_m2"` or `"Smoke"`+`"smoke_m2"` depending on layer/tier (confirmed
   across 3094/3145/3162/3206). Fixed to `["API", "Regression", "regression_m2"]` to match TC-12's
   regression-tier home file. Full detail on all three: [[feedback_allure-case-fields-no-analysis]].

Final state: `description` = `"Preconditions:\nInternal system-integration permission... COMPANY.LOCAL_CURRENCY
has no staged route to the tested pair. A currency exists with a lower BASE_CCY_RANK... completing a
two-hop route..."`; single scenario step = the `POST .../currencies/rates` call with its ER ("HTTP 404
Rate Not Found. Engine does NOT fall back to BASE_CCY_RANK..."); tags `["API", "Regression",
"regression_m2"]`. `allureCaseId(3228)` wired in, `TC-12: ` prefix stripped; `tsc`/`eslint`/`prettier`/
`allure:verify-ids` clean (654 links, no duplicates). **20/20 of the Story's cases now have an
automated test** (3207/TC-25 is the sole exception — has a test-less case, not a case-less test; see
its own entry above).

**2026-09-02: TC-04/3146 deleted (AC2 invalidated, see § above) — Story now has 19 cases, 18 with
an automated test, 3207/TC-25 still the sole exception.**

**Pattern — creating a TestOps case via `testops_create_testcase` needs matching a real sibling's
full stored shape, not just its custom fields.** Three independent misses from the same case (3228),
all from not reading a sibling case's actual content before creating: (a) tree placement needs all
three of `Feature = "System Core"`, `Component = "Currency Definition and Logic"`, `Story = "Dynamic
High-TPS…"` — setting only `Story` (this session's first attempt) creates a case that passes every
Story-field scan/query correctly but renders at the TestOps tree root, invisible next to its 20
siblings; (b) the description/precondition/scenario field-format mismatch above; (c) `tags` left
empty instead of the sibling-standard 3 (`API` + layer/tier pair). None were caught by any automated
check this session ran — the user caught all three by eye in the UI/API response.
**Predictive rule for next time:** before calling `testops_create_testcase` for any module case, fetch
a real sibling's full stored content in one pass (`GET /testcase/{id}` for name/description/
precondition/expectedResult/tags, `/cfv` for custom fields, `/testcase/{id}/step` for scenario shape)
and mirror it exactly — not just the one field/aspect the current task already happens to know about.

**No Allure case exists yet (as of this scan) for TC-12, TC-22, TC-24, TC-27, TC-28, or
TC-29** — left with their `TC-N: ` prefix untouched, don't strip it or guess an id for them next
session; re-run the same Story-field scan first, since Manual QA was still actively adding cases
during this pass and more may exist by the next session.

**CORRECTION 2026-08-26: stale as of the same day.** TC-22 now has a case (`allureCaseId(3162)`,
"An amount inside a bounded (non-open-ended) band resolves to that band, not a neighboring one")
and its `TC-22: ` prefix has already been stripped in the working tree. TC-24, TC-27, TC-28, TC-29
still have no case as of this correction — don't assume the whole list is stale, just this one row.

**SECOND CORRECTION 2026-08-26, same day — full exhaustive re-scan (not keyword-filtered).** Fetched
every `GET /api/testcase/{id}/cfv` for ids 2967–3227 (the id range covering the whole project's most
recent cases, since Allure ids are project-wide, not per-Story) and kept every id whose `Story`
custom field value equals the bare title `"Dynamic High-TPS Execution & Hierarchical Rate
Resolution"`. Result: exactly 20 cases, no more, no fewer — the 13 already listed above plus 7 new
ones (3206–3212) that did not exist during the prior scan. Confirmed 1:1 by reading each new case's
`description`/preconditions, not by title alone:

| New Allure id | Maps to | Match basis |
|---|---|---|
| 3206 | TC-24 | Title is a near-verbatim match; precondition ("No API transit; COMPANY.TRIANGULATION_CCY empty; COMPANY.TRIANGULATION_MANDATORY = NO") matches TC-24's incomplete-LOCAL_CURRENCY-route setup. |
| 3208 | TC-27 | "rounds ONCE at the end to quote NO_OF_DECIMALS (not per leg)" is TC-27's own claim; precondition gives the same Base→Transit/Transit→Quote MID-rate shape TC-27 stages. |
| 3209 | TC-28 | Title is verbatim TC-28's own title; precondition's `NO_OF_DECIMALS = 18` on all three currencies matches TC-28's setup exactly. |
| 3210 | TC-29 | Precondition's `MANDATORY_TRIANGULATION = YES` + `TRIANGULATION_CURRENCY = XAF`, direct `USD/EUR` bypassed, is exactly TC-29/AC8's own worked example. |
| 3211 | TC-30 | Precondition's `KES/JPY`, `TRIANGULATION_CCY = null`, `LOCAL_CURRENCY = EUR` fallback is exactly TC-30's scenario. |
| 3212 | TC-31 | "leaves CURRENCY.RATES unmodified (Read-Only isolation)" on a `KES/JPY` triangulated query is exactly TC-31's own claim and test data. |

**3207 DELETED 2026-08-27 — user's explicit priority ruling: Confluence Story outranks a
conflicting TC, delete the TC as outdated rather than escalate-and-wait.** Re-read this Story's
live Confluence page (pageId 1529872396) the same day: it had been edited that same morning
(version 9, 2026-08-27T06:45 UTC) and **still explicitly lists the global `SYSTEM.PARAMETER`
record as the last rung of the transit-currency fallback chain** ("...or the global
`SYSTEM.PARAMETER` record" in Alt 1) — directly contradicting 3207/TC-25's own Expected Result
("Engine does NOT read SYSTEM.PARAMETER for transit"). The Excel source's "p.19 clarification"
comment (see the now-superseded note below) never showed up in this Confluence page despite it
being edited today, so there is no evidence the correction it referenced was ever applied here.
Per the user's explicit decision (this session, 2026-08-27): when the Story (Confluence) and a
pasted/Allure TC disagree, the Story wins and the TC is deleted as outdated, not escalated and left
open. `testops_delete_testcase(3207)` run (moved to Allure's trash, recoverable if this is ever
reversed) — see [[feedback_confluence-story-outranks-conflicting-tc]]. **This closes the Story's
last open gap: 20/20 of its remaining Allure cases now have an automated test, and TC-12 (`BASE_RANK`
must never be used as transit) still has no case at all (unrelated, unaffected by this deletion).**

**Prior note, superseded above — kept for history only.** 3207 was a genuinely new case with no
automated test yet — its precondition ("A transit is defined in
global SYSTEM.PARAMETER but NOT in COMPANY table; no API transit") tests a different scenario than
any existing local test: whether the engine's transit-resolution ladder actually reaches/honors (or,
per this case's own title, is expected to *exclude*) the `SYSTEM.PARAMETER`-level global transit
default when `COMPANY.TRIANGULATION_CCY` is absent. This is distinct from TC-30 (which tests the
`LOCAL_CURRENCY` fallback rung, one level above `SYSTEM.PARAMETER` in the Story's own 3-level chain)
and from TC-12 (`BASE_RANK` must never be used as transit — a different rung entirely).

**Live-checked, 2026-08-26 — the data blocker is gone, but the case itself is still unusable.**
Read-only `SEE SYSTEM.PARAMETER~MASTER`/`SYSTEM` against `qa.proj.local` (Keycloak password grant +
`POST tables/api/v1/projections/SYSTEM.PARAMETER~MASTER/records/operations/SEE`): the real field is
`DEFAULT_TRANSIT_CURRENCY` (this doc previously had it as `DEFAULT_TRANSIT_CCY`, matching Bruno's
field-registry filename but not the actual JSON key — corrected here), and it is now **`"USD"`**, not
`null` as the 2026-08-21 DB check found — the environment fact in the "DB/environment reality check"
section above is stale as of this date, superseded by this entry, not deleted (kept for history: it
was true on 2026-08-21). So the precondition itself ("a transit is defined in global SYSTEM.PARAMETER
but NOT in COMPANY") is buildable today.

**CORRECTION, same day — 3207 is fully authored, not Draft-empty.** `GET /api/testcase/3207/scenario`
returns `{"steps":[]}`, which is *this Allure instance's* empty-response shape for the newer
tree-scenario format — it does **not** mean the case has no content. The actual Steps/Expected
Result live in the older per-instance format at `GET /api/testcase/3207/step` (the fallback this
repo's `allure_get_test_case` MCP tool already documents trying second, for exactly this reason —
don't stop at an empty `/scenario` response). Step 1: `POST (INPUT)
{{currency-engine-url}}/api/v1/currencies/rates` — a cross-rate needing triangulation. Expected
Result: "Engine does NOT read SYSTEM.PARAMETER for transit. Priority: API > COMPANY.TRIANGULATION_CCY
> conditional LOCAL_CURRENCY." This is a verbatim match to the user's own Excel source-of-truth row
for **TC-25** (comment: "p.19 clarification (transit set ONLY in COMPANY table)") — confirming
**3207 = TC-25**, not an orphan/unnumbered case as this doc previously guessed.

This still leaves the real open question from before: TC-25's own expected result ("Engine does NOT
read SYSTEM.PARAMETER for transit") is the *opposite* of this Story's Confluence-sourced 3-level
fallback chain documented earlier in this file (explicit → `TRIANGULATION_CCY`/`LOCAL_CURRENCY` →
`SYSTEM.PARAMETER` as the last valid rung). The Excel's own "p.19 clarification" comment says this
is a deliberate, later correction to the Story text (a specific page/paragraph, not this doc's
earlier general-chain reading) — needs the Confluence page itself re-read for that exact clarifying
passage (Step 1 of the mandatory research flow) before writing the test, per "no automate on
contract mismatch." Not yet automated; this is now a well-defined next task, not a blocked one.

**TC-12 ("Transit currency resolution never falls back to BASE_RANK when no legitimate transit
source is configured") still has no Allure case after this exhaustive scan** — confirmed absent, not
just unscanned; the local test exists (`currency-regression.spec.ts`, no `allureCaseId`) but nothing
in TestOps matches it. Per this repo's own convention (`README.md`'s "New test, no case in TestOps
yet"), leave it unlinked until Manual QA creates a case for it.

**TC-26 moved to US-01.13.02, 2026-08-26.** Despite its sheet numbering, TC-26 ("Reject an order
whose RATE_BANDS repeats the same AMT_FROM/RATE_TYPE combination twice") actually validates
CURRENCY.ORDER INPUT rejection — an Order Staging & Validation concern, not Dynamic High-TPS
Execution & Rate Resolution. Manual QA's own Allure case for it (id 3170, "Reject currency rate
creation/update when RATE_BANDS contains duplicate (AMT_FROM, RATE_TYPE) combinations") carries
`Story = "Asynchronous Rate Order Staging, Validation, and Scheduling"` (US-01.13.02), confirming
the miscategorization. The test moved from this Story's `test.describe` block in
`currency-regression.spec.ts` into the `US-01.13.02` block, renamed to match the Allure case name,
and linked via `allureCaseId(3170)` — see [[../US-01.13.02/README.md]].

## Fifth live run, 2026-08-26 — full Currency regression block, 9 failed (5 expected, 4 explained by
newly-filed bugs)

**4 of the 9 failures match newly-filed Jira bugs 1:1** — confirmed by comparing each test's actual
request/response against the ticket's own repro steps, not by title alone:

| Test (as shipped) | Ticket | Match |
|---|---|---|
| "A missing RATE_TYPE is rejected instead of deriving a spread" (id 3150) | [TB-3276](https://bank-proj.atlassian.net/browse/TB-3276) | Exact — engine returns generic `404 Rate Not Found` instead of the documented "Requested Rate Type missing. Spread auto-calculation is prohibited." message; ticket's own repro payload is the same shape. |
| "An expired rate is treated as absent and resolves to no rate found" (id 3157, formerly TC-15) | [TB-3132](https://bank-proj.atlassian.net/browse/TB-3132) | Exact — `500` instead of `404`; ticket root-causes it to `TableClientImpl.getRecordIfPresent` only catching `NotFound`, not the `400` Table Template actually returns for an expired `SEE`. |
| "rateValue resolved through the Currency Engine is scaled to the quote currency's NO_OF_DECIMALS" (id 3160, formerly TC-21) | [TB-3277](https://bank-proj.atlassian.net/browse/TB-3277) (bug #1) | Exact — `1.2347` returned unrounded instead of `1.235`; matches ticket's own `LWX/AFR` repro pattern. |
| TC-28 ("preserves at least 18 decimal digits... not silently degrading to IEEE double") | [TB-3277](https://bank-proj.atlassian.net/browse/TB-3277) (bug #2, same ticket) | Exact — staging a rate at `NO_OF_DECIMALS=18` still gets `400 ... up to 9 decimal places`; this is the second, separate bug the ticket's reporter flagged in a follow-up comment on the same issue. Already documented as TC-28's blocker below ("Prior note, 2026-08-25"). |

**2026-08-27 update — TB-3132 moved to "Ready For Retest"** (was "Code Review" as of 2026-08-25,
updated 2026-08-26). Test id 3157 itself needs no change — it already asserts the ticket's
Expected (`404`), not the current-live `500` — this is the point to re-run it live and confirm the
fix landed: if it's still `500`, the fix hasn't actually reached QA yet despite the status change;
if it's `404`, the ticket can move to Done.

**TB-3267** (duplicate `AMT_FROM`+`RATE_TYPE` in `RATE_BANDS` not rejected) does **not** match any
of the 9 failures — it matches the *new* test already added in this session's uncommitted diff
(`allureCaseId(3170)`, moved to US-01.13.02, see above), which hadn't been run yet when this
failure list was captured.

**5 failures remain unexplained by these 4 tickets** — investigated by reading the current test
code, with an important caveat: the spec file was substantially restructured (allureCaseId wiring,
~1,283 lines changed) in the same session this run's output was reported, so stack-trace line
numbers in the failure output do not correspond to the current file at all (confirmed directly: one
failure's reported throw site pointed at code ~1,200 lines earlier than its own declared test
location). Root-causing from today's code is therefore unreliable for anything that depends on exact
file position — treat the below as leads for a clean re-run, not confirmed root causes:

- **"Test not found in the worker process. Make sure test title does not change"** (the bounded-band
  test, id 3162, formerly `TC-22:`) — not a product bug. This is the exact worker-restart-cascade
  mechanism already documented in [[../US-01.13.02/README.md]]'s "Third live run" section (Playwright
  restarts the worker after any failing test in the file; the restarted worker re-lists tests from
  disk). Since this test's `TC-22: ` prefix was stripped and its Allure id added in the same
  uncommitted edit batch that produced this run's output, a worker restart triggered by any of the
  4 ticket-confirmed failures above (all appear earlier in the file) landing after the title was
  already edited on disk, but before the run's reporter's original list was refreshed, reproduces
  this symptom exactly. No further investigation needed; expect it to resolve on the next clean run
  against a settled file.
- **TC-30, TC-27, TC-29 — all three fail identically**, `403 User does not have access to table:
  CURRENCY.ORDER` from `checkerClient`'s `AUTH` call inside `stageAndAuthorizeOrder`, each on their
  own test's first precondition. All three (and TC-11, TC-24, both **not** in this failure list) share
  one pattern: capture the shared singleton `COMPANY.MOCK` record's current data, mutate its
  `LOCAL_CURRENCY`/`TRIANGULATION_CURRENCY`/`MANDATORY_TRIANGULATION` fields for the test's own
  duration, then restore it in a `finally`. Comparing TC-24 (passes, identical mutate-then-AUTH
  shape) against TC-30 (fails) in today's code found no code-level difference that would explain the
  split — reinforcing that this is very likely the same worker-restart cascade as TC-22 above (a
  restart triggered by an earlier ticket-confirmed failure mid-run, landing while `COMPANY.MOCK` was
  captured/mutated by whichever test was executing at that moment, leaving it in a state the next
  test's fresh `beforeAll` context didn't account for) rather than a new, distinct product defect.
  **Not confirmed** — needs a clean, full, uninterrupted re-run to see if this cluster still
  reproduces once the file is settled and none of the 4 ticket-confirmed bugs trigger a mid-run
  restart. If it does reproduce clean, the shared-singleton-mutation pattern across TC-11/24/27/29/30
  is the next thing to harden (e.g. run them in `test.describe.serial` with no interleaving, or stop
  sharing one `COMPANY` record across this many mutating tests).

**Not yet re-run after the allureCaseId restructuring** — this run's 9 failures should be treated as
a snapshot of the *pre-restructuring* file, not the current one.

**Sixth live run, 2026-08-26 (that clean re-run, this session) — the 403 cluster reproduced again,
root cause found (not the worker-restart cascade guessed above).** See
`US-01.13.02/README.md`'s "Sixth live run" for the full write-up: `BaseApiClient`'s
`defaultIsTransientClientError` was gated on `status === 400`, but this specific "does not have
access to table" case actually returns `403`, so the retry never fired — a real, confirmed,
mechanical bug in the client, not a fixture-restart artifact. Fixed, scoped to `checkerClient` only.
The worker-restart hypothesis above can be retired for this specific symptom.

**TC-10's `QUOTATION_CODE 2/3/4` sub-case (id 3153) — also root-caused, not a triangulation-formula
regression.** `baseCurrency`/`transitCurrency` in that sub-case were never given a `NO_OF_DECIMALS`
override (only `quoteCurrency` had one, `=6`) — both defaulted to `2`. The leg-1 literal
`baseTransitRate = '0.845000'` got silently rounded to `'0.85'` on `CURRENCY.ORDER` storage (see
"RATE_VALUE decimal scale" below / `US-01.13.02/README.md`'s "Sixth live run"), and `0.85 × 12.4 /
1000 = 0.01054` matches this run's observed wrong value exactly — the triangulation formula itself
(confirmed correct on 2026-08-26, see "Independently live-verified" above) was never actually
exercised with its intended full-precision inputs. **Fixed**: `baseCurrency`/`transitCurrency` now
also get `NO_OF_DECIMALS: 6`, matching `quoteCurrency`.

**"Triangulated cross-rate combines full-precision leg rates and rounds once..." (id 3208,
round-once-vs-per-leg) — same mechanism suspected, left unfixed.** `quoteCurrency` here also defaults
to `NO_OF_DECIMALS: 2` while `baseCurrency`/`transitCurrency` were deliberately set to `3`; the
leg-2 literal `'2.044'` almost certainly gets rounded to `'2.04'` on storage the same way, which
would fully explain the observed `0.2` (`1.003 × 2.04 / 10 = 0.204612`, rounded once to 2 decimals =
`0.20`) without any per-leg-rounding defect in the engine at all. **Not fixed this pass**: bumping
`quoteCurrency`'s decimals to stop the truncation would also shift the *final* rounding target away
from the test's hardcoded `expectedRateValue = 0.21` (an exact `.toBe()`, not `toBeCloseTo`), and the
correct replacement value can't be trusted without a live run — doubly so since TB-3277's *other*,
still-open half (the Currency Engine's own resolved output not being re-rounded on the way out) could
independently affect this exact test. Needs a live re-check before touching the assertion.

**Original 2026-08-21 note, kept for history:** *"Not automated as of 2026-08-21. The pasted
manual TC-01 ("GET direct cross-rate happy path") predates discovery of this Story's real
Confluence page and Bruno contract"* — see [[project_currency-engine-contract-findings]] for that
initial gap list.

## 2026-09-02 — TC-28/Allure 3209 resolved as structurally not provable via this API; dev-confirmed CURRENCY.NO_OF_DECIMALS validation; shared-COMPANY race from the 2026-08-26 TODO confirmed and fixed

**NO_OF_DECIMALS is now validated 0-9 at CURRENCY.MASTER INPUT time, not just at RATE_VALUE
staging.** Dev-confirmed live by Yan Tayanouski/Artur Fonichkin same day: `POST` a currency with
`NO_OF_DECIMALS: 12` now gets `400 {"properties":{"errors":{"NO_OF_DECIMALS":"NO_OF_DECIMALS must
be a whole number between 0 and 9"}}}` on QA. This is a second, independent enforcement point from
the RATE_VALUE-staging cap TB-3277 bug #2 already documented above (line ~716) — that one rejects
an out-of-range decimal *rate value* at order-staging time; this one rejects an out-of-range
*currency definition* at creation time. Both cap at 9.

**TC-28/Allure 3209's "preserves ≥18 decimal digits" claim is not provable through this API at
all, independent of the NO_OF_DECIMALS validation above.** `ResolveRateResponse.rate.value` is
`{units, nanos}` (`currency-engine.types.ts`) — `nanos` is a plain integer at 1e9 granularity, i.e.
the wire format itself caps fractional precision at exactly 9 decimal digits. The original test
asserted the raw response *text* contained an 18-decimal-digit substring
(`'0.11263526798643499'`) — structurally impossible for this response shape to ever contain,
regardless of what the engine computes internally. Verified computationally (exact BigInt decimal
multiplication vs. native `double`, five 9-decimal `RATE_VALUE` pairs): at the system's real
9-decimal ceiling (both `RATE_VALUE` input and `nanos` output), IEEE double already matches exact
decimal math bit-for-bit in the rounded result every time — the double-vs-exact divergence this
case was designed to catch requires more significant digits than 9+9 decimal inputs can produce
within double's own ~15-17 significant-digit precision, so it can never manifest at any precision
this API can actually stage or return.

**Action taken:** repurposed the automated test (still `allureCaseId(3209)`) to prove the one part
of the original claim that *is* real and dev-confirmed: `NO_OF_DECIMALS=12` on a new currency gets
rejected with the exact message above, and no partial row is written. The "≥18 decimal digits"
half of the claim has no automatable replacement via this API — flagged to the user, who owns
updating the Allure case's Steps/ER to match (already in progress in dev chat with Yan/Artur) and
deciding whether that half needs a different verification layer (e.g. a raw DB inspection of
higher-precision storage, if one exists) or should be dropped from the case entirely.

**The 2026-08-26 "shared-singleton-mutation pattern... next thing to harden" TODO above (line
~761) is now confirmed and fixed.** Root cause this time wasn't a worker restart — it was N
concurrent `npx playwright test` suites (user ran 3 at once locally) each independently doing
`SEE COMPANY → mutate TRIANGULATION_CURRENCY/LOCAL_CURRENCY → restore` against the same shared
`COMPANY_CODE` record (5 call sites across this Story: TC-11/3154, the two `LOCAL_CURRENCY`
fallback tests/3206+3211, TC-29/3210, and the `National Bank rate resolution via
COMPANY.LOCAL_CURRENCY` describe). Two processes' snapshot/restore windows overlapped: process A
captured, mutated to its own dedicated currency; process B's own "capture original" snapshot read
process A's *temporary* currency and later restored the shared record back onto it; that currency
was deleted by process A's own cleanup shortly after, permanently corrupting
`COMPANY.TRIANGULATION_CURRENCY` for every subsequent run (including today's single-suite,
non-concurrent run — CBS validates the whole record on every `INPUT`, so one dangling reference
blocks *every* future update to the shared record until cleared). **Fix:**
`sanitizeCompanyCurrencyReferences` (`currency-helper.ts`) — `SEE`s any `TRIANGULATION_CURRENCY`/
`LOCAL_CURRENCY` reference in a freshly-captured snapshot and strips it if the referenced currency
no longer exists, applied at all 5 call sites before the snapshot is reused as an `INPUT` base.
Self-heals the currently-corrupted QA state on the next run with no manual data fix needed, and
hardens every call site against this same corruption class regardless of cause. **Confirms the
concurrent-load theory in [[reference: docs/common-issues/keycloak-and-auth/keycloak-transient-login-401.md]] too**
— see that file's own 2026-09-02 update for the matching Keycloak-side data point from the same
incident.

**Same-day follow-up: the race also stuck `MANDATORY_TRIANGULATION: true` on `COMPANY/MOCK`,
alongside the dangling `TRIANGULATION_CURRENCY='GKI'` — this, not the fix's own bug, is what took
down the Story's first 4 previously-reliable tests on the next full run** (direct base/quote
pairs, amount-band boundaries — nothing triangulation-related). With `MANDATORY_TRIANGULATION`
stuck `true`, the Currency Engine is forced through the dead `TRIANGULATION_CURRENCY` on *every*
resolve call for that company, not just triangulation-specific ones. A live `SEE COMPANY/MOCK`
confirmed both fields; a one-off diagnostic `INPUT` cleared `MANDATORY_TRIANGULATION` to `false`
and removed `TRIANGULATION_CURRENCY` (`LOCAL_CURRENCY='XAF'` left untouched — it was never
actually corrupted, ruling out an earlier same-day hypothesis that it had been blanked). Separately,
the `sanitizeCompanyCurrencyReferences` fix itself had a real bug (used its sanitized snapshot for
restore, not just for the mutate base, risking silently clearing a field on cleanup) — fixed the
same session before it caused further live damage. Full mechanism and fix for both:
[[reference: docs/common-issues/db-and-concurrency/shared-record-snapshot-restore-race-under-concurrency.md]]'s
2026-09-02 update.

**Separately, `generateRandomCurrencyId()` (3 random A-Z letters, 17,576 combos) can collide with a
real pre-seeded ISO currency** — TC (Allure 3428, "Same-currency request with an inactive/unknown
currency is rejected") drew `'COU'` (a real ISO 4217 code, Colombian Unidad de Valor Real) as its
"never created" fixture and got a genuine `200`/`rate=1` instead of the expected `404`. Same root
cause hit a second call site (Allure 3434, `/rates/local` "Rejects an unknown/inactive currency").
**Fix:** new `generateUnknownCurrencyId(client)` helper — generates a candidate, `SEE`s it, retries
if it already exists (bounded at 10 attempts) — used at both call sites in place of the bare
generator.

## 2026-09-17 — `grantCheckerAccessToCurrencyOrder`'s `UNIT` override is provably dead at runtime, not just flaky

Found triaging `vm-results-regression-m2-20260917-004121` / `vm-results-smoke-m2-20260916-202906`
via real attachment archaeology (per-test request/response JSON, not memory/analysis). 4 failures —
regression `US-01.13.03` ("A 15,000 transaction selects the 10,000 tier") + `US-01.13.04` ("A pair
with no MID staged"), smoke `US-01.13.03` ("A direct cross-rate resolves...") + `US-01.13.04`
("Front-Office retrieves the pure MID rate") — all threw the same
`grantCheckerAccessToCurrencyOrder` timeout: `"checker user's access to CURRENCY.ORDER never
propagated within 30s: CURRENCY.ORDER probe INPUT was rejected (not an AUTH-propagation issue):
status 400: ... UNIT must be empty because market 1 does not differentiate by Business Unit
(DIFF_UNIT is false)"`. This is a **separate root cause from the reconciler-cascade** in
[[reference: docs/common-issues/infra-and-environment/reconciler-offline-flag-poisons-rest-of-worker-run.md]]
— confirmed by a genuinely different message, and **not yet fixed**.

**Mechanism, confirmed line-by-line:** `currency-helper.ts`'s `grantCheckerAccessToCurrencyOrder`
builds its probe payload as `{ ...buildProbeOrderData(), UNIT: undefined, UNIT_INCLUDE: false }`
specifically so the probe (always targeting reference "market 1", which has `DIFF_UNIT: false`)
never sends `UNIT` — that override was added 2026-09-03 (`43a9d2e5`) for exactly this reason. **In a
plain Node repro of that exact expression, `UNIT` is correctly stripped by `JSON.stringify` both in
the direct call and through `maskSensitiveData`/`Object.fromEntries` in `allure-exchange-reporter.ts`
(verified both paths independently).** Yet the actual captured request bodies in both runs' Allure
attachments (e.g. `045af540-...-attachment.json`, first probe attempt too, not just the last) show
`"UNIT": "HVM"` (the dynamically-created `probeBaseCurrency.recordId` from `currency-regression.spec.ts:2568`'s
`buildCurrencyOrderInputData({ ..., UNIT: probeBaseCurrency.recordId })` call) present on **every**
polling attempt, so the override never took effect at runtime — the probe was doomed from its first
attempt, not flaky.

**2026-09-17 follow-up — why it's intermittent, and the leak reconfirmed a 3rd time.** A same-branch
re-run the same day (`vm-results-smoke-m2-20260917-114615`) failed identically on the same two tests
(`"UNIT": "IPM"` and `"UNIT": "AOQ"` in the captured requests this time — still leaking, still on
the first polling attempt), while a standalone `currency-smoke`-only run earlier that morning
(`vm-results-api-20260917-101628`) **passed**. Root-caused via fresh log/attachment archaeology
across all 3 runs (not memory) plus two Gather subagents confirming: all 3 runs used exactly 1
worker (no parallelism/cross-worker race), and no module outside Currency's own files ever touches
`CURRENCY.MARKET~MASTER` (grep-confirmed across the whole `api/` tree) — ruling out both a
cross-worker race and a cross-module conflict as the intermittency's cause.

**The actual intermittency source: `currency-regression.spec.ts` itself pollutes the shared,
persistent-across-runs Market "1" and never restores it.** Its "National Bank rate resolution via
COMPANY.LOCAL_CURRENCY" block (`currency-regression.spec.ts:4463-4477`) deliberately sets Market "1"
to `DIFF_UNIT=false, DIFF_AMT=false` as its own precondition — correct for that block's own tests —
but no later step in the entire file ever sets Market "1" back to `DIFF_UNIT=true` (grepped the whole
file for `buildCurrencyMarketInputData(..., true, ...)` against `CCY_ORDER_TEST_MARKET_ID`: zero
matches). Since bankstg is shared and not reset between runs, Market "1" stays at whatever this block
last left it — `false` after any regression run reaches this block, until something unrelated
coincidentally flips it back (which is what must have happened before the 10:16 standalone pass).
**This means the `UNIT`-leak bug (below) is silent whenever Market "1" happens to be `true`, and only
becomes a visible failure when a regression run has recently pushed it to `false`** — both defects
have to coincide for the symptom to appear, which is exactly why it looks intermittent/environmental
rather than a deterministic code bug.

**The `UNIT`-leak mechanism itself is still not mechanically explained**, but is now empirically
confirmed a 3rd independent time (regression 00:41, smoke 20:29, smoke 11:46 — 3 different runs, 3
different dynamically-generated currency codes leaking through as `UNIT`, same code line each time).
Ruled out so far: plain JS/TS spread-then-`undefined`-override semantics (triple-checked, including a
literal Node repro of the exact expression), `Object.assign`-based transpile lowering (equivalent
semantics), and `maskSensitiveData`/`Object.fromEntries` in the Allure attachment path (separately
Node-verified). Attempted a live check of the VM's actual synced `currency-helper.ts` via SSH per
`azure-test-runs`' `.env.bankstg-local` — **could not reach `10.190.0.31` from this session (no VPN
here)**, so VM/local drift — see
[[reference: docs/common-issues/infra-and-environment/vm-sync-whitelist-silently-stranded-fixes.md]]
— remains unconfirmed but is now the leading (not just one-of-two) hypothesis, since a JS-semantics
explanation has been thoroughly ruled out.

**Fixed, same day, both layers, in `grantCheckerAccessToCurrencyOrder` only (no test-file changes
needed — every call site already just wants "a valid market", not market "1" specifically):**
1. The helper now idempotently `INPUT`s a fixed `CHECKER_PROBE_MARKET_ID = '10'` (the same id
   `currency-regression.spec.ts`'s own `diffAmtMarketId` already reuses everywhere) to
   `DIFF_UNIT=true, DIFF_AMT=true` before polling, and forces `CCY_MKT` to that id in the probe
   payload — the probe no longer depends on shared Market "1"'s ambient state at all.
2. `UNIT: undefined` replaced with `delete probeDataWithoutUnit.UNIT` — actual key omission instead
   of an assignment that (for a reason still not mechanically pinned down) wasn't surviving to the
   wire. This closes the leak regardless of whether the old mechanism was ever VM drift.

Verified statically only (`tsc --noEmit`, `eslint`, `prettier --check` all clean) — **not yet
confirmed by a live re-run**. Next Azure smoke/regression run against this branch is the real test:
if `currency-smoke`'s `US-01.13.03`/`US-01.13.04` checker-probe still fails with the same "UNIT must
be empty" message after this fix, the VM-drift hypothesis above is live after all and the fix needs
to be re-verified as actually deployed, not just committed.

**Correctness check, same day (user asked directly): does routing the probe through Market "10"
weaken any real test-case assertion?** Read every test body behind the 4 originally-failing tests
line by line. None of them assert anything about the probe's own market — `grantCheckerAccessToCurrencyOrder`'s
probe record is fully internal (`probeId` is never returned to the caller), and CBS permissions are
table-scoped (`{TABLE: 'CURRENCY.ORDER', FUNCTION: 'ALL'}`), not market-scoped, so which market the
readiness-probe used never affected what the checker could actually authorize afterward. Every
affected test's own business assertion already targets `diffAmtMarketId='10'` directly (smoke `:368`/
`:515`, regression `:2675`) except regression `:4876` (Allure 3230), which references Market "1" only
as a stable pre-existing market id for a "never-staged pair → 404" lookup — unrelated to `DIFF_UNIT`.
The one place that genuinely needs Market "1" at `DIFF_UNIT=false` (`"National Bank rate resolution
via COMPANY.LOCAL_CURRENCY"`, line ~4442) sets that up itself, in its own nested `beforeAll`, entirely
independent of the probe. Fix confirmed non-interfering with any actual ТС requirement.

**Second, related bug found and fixed the same pass: that "National Bank" block's own Market "1"
mutation was never restored.** Its `beforeAll` (line ~4463) blindly `INPUT`s Market "1" to
`DIFF_UNIT=false, DIFF_AMT=false` with no prior `SEE`, and its `afterAll` (line ~4597) already
restored the shared `COMPANY` record it also mutates but had no equivalent restore for Market "1" —
this is the actual root cause of Market "1" being stuck at `DIFF_UNIT=false` on bankstg between runs,
described above. **Fixed to mirror the existing `COMPANY` capture/restore pattern exactly**: the
`beforeAll` now `SEE`s Market "1" into `originalMarketOneData` before overwriting it, and the
`afterAll` now restores that captured data the same way it already restores `originalCompanyData`.
This closes the pollution at its source — independent of, and in addition to, layer 1 above (which
only stopped the checker-probe from depending on Market "1", not the pollution itself). Also
statically verified only, not yet confirmed live.

**2026-09-17, later same day — layer 1's own "Market 10" fix was self-contradictory; corrected.**
`vm-results-api-20260917-133559` (the live re-run of layer 1 above) failed 5 tests with the mirror
error: `"UNIT is required because market 10 differentiates by Business Unit (DIFF_UNIT is true)"`.
Root cause: layer 1 idempotently set `CHECKER_PROBE_MARKET_ID='10'` to `DIFF_UNIT=true` (reusing
`currency-regression.spec.ts`'s own `diffAmtMarketId='10'` convention id) **but the probe still
unconditionally `delete`d `UNIT`** — a market requiring `UNIT` and a payload that never sends it.
User caught this directly: *"если у Маркета DIFF_UNIT=false то UNIT передавать не надо, а если true
то надо обязательно"*. It also re-used an id already claimed by 8+ other tests'
`diffAmtMarketId`/`boundedBandMarketId` convention for a semantically unrelated purpose (probe
self-containment), which was never a real conflict for those tests but was needless overloading of
one id for two purposes.

**Corrected fix (superseding layer 1's market choice, keeping its self-containment goal and its
`delete`-based UNIT removal):** the probe now idempotently `INPUT`s **Market "1"
(`CCY_ORDER_TEST_MARKET_ID`) itself** to `DIFF_UNIT=false, DIFF_AMT=false` — its own established
"Interbank Market" identity, which is the only state any code in this suite ever intentionally sets
it to — immediately before every poll attempt, and forces `CCY_MKT` to that id in the probe payload.
This keeps layer 1's actual goal (the probe never depends on whatever ambient state Market "1"
happens to be in when the probe runs — it always re-asserts the state it needs first) without
inventing a second market, without touching the `diffAmtMarketId='10'` convention at all, and
without a DIFF_UNIT/UNIT mismatch: `DIFF_UNIT=false` pairs with the still-`delete`d `UNIT`
consistently. Layer 2 (the National Bank block's own restore of Market "1") is unaffected and still
correct — the probe's forced reset and the National Bank block's capture/restore of Market "1" both
converge on the same "Interbank Market" (`false`/`false`) resting state, so neither interferes with
the other. Verified statically only (`tsc --noEmit`, `eslint`, `prettier --check` clean) as of this
edit; not yet confirmed by a live re-run.

**The "isolated `currency-smoke` run passes / full suite run fails, same code, UNIT appears despite
`delete`" question (asked again this session) — first answered wrong (dirty-tree-sync), corrected
with harder evidence the same day.** Initial hypothesis (below, now demoted): this is
[[reference: docs/common-issues/infra-and-environment/vm-sync-whitelist-silently-stranded-fixes.md]]'s
4th incident, since `currency-helper.ts` stayed uncommitted across every referenced run. **User
refuted this directly with a controlled sequence**: `smoke_m2` (fail) → standalone `currency-smoke`
(pass) → `smoke_m2` (fail) again, same branch, no edits between the three — if the on-disk code were
constant across all three, dirty-tree sync cannot explain a result that flips based on *which suite*
was chosen. Re-investigated from `run-suite.sh`/`playwright.config.ts` git history instead of
theorizing further:
- **Ruled out cross-worker concurrency entirely for every run referenced in this file.** Before
  `aa8261b7` (TB-3874, committed 07:41 UTC 2026-09-17 — same day, and its `run-suite.sh` command line
  is *exactly* what every historical `smoke-m2` run.log actually shows: `--project=API-tests --grep
  @smoke_m2`, one project only), there was no `API-tests-singleton` project at all —
  `API_TESTS_MAX_WORKERS` was hardcoded to `1` with a runtime assertion in `base-api-client.ts`
  refusing any other value (its in-process token cache isn't cross-process-safe). So `smoke_m2` and a
  standalone `currency-smoke` run both executed fully serially, one worker, one process, both before
  and after that commit landed for these specific historical runs. No parallel-worker race is
  possible here.
- **`CURRENCY.MARKET~MASTER` is a fixed CBS system table, not a per-run dynamically-created one** —
  grepped `currency-helper.ts`: it's only ever touched via `performRecordOperation` (`INPUT`/`SEE`),
  never `createTableAndWait`. Its records (Market "1", Market "10", …) are **not** scoped to a run's
  own disposable table group; they persist on the shared `bankstg` environment across completely
  separate, unrelated runs.
- **Corrected explanation**: Market "1"'s `DIFF_UNIT` value the checker-probe encounters is whatever
  the *most recent prior activity on bankstg* left it as — not a function of which suite you type next.
  Combined with the still-mechanically-unexplained bug (below) where the `UNIT`-stripping sometimes
  doesn't survive to the wire, a given run's pass/fail is really gated by two independent, both
  environment-history-dependent conditions coinciding, not by "isolated file vs. full suite" as a
  causal variable — the correlation the user (and this entry, originally) observed is real but was
  mis-attributed to run-to-run code drift instead of run-to-run *environment* state.

A Haiku Gather subagent's earlier code-path sweep (`TableRegistryApiClient.performRecordOperation`,
`buildRecordInputPayload`, `buildCurrencyOrderInputData`, `generateCustomId`, every module-level
`Map`/`WeakMap` in `api/`) still stands as evidence *against* a JS-level shared-state cache
explanation — it just doesn't, on its own, prove dirty-tree-sync either; it only narrows what's left.
**The core mechanism — why `delete probeData.UNIT` (or its predecessor, `UNIT: undefined`) does not
reliably survive to the outgoing wire payload — remains unexplained**, now confirmed unrelated to
worker concurrency and not fully explained by disk-state drift either. This session's fix (forcing
Market "1" to `DIFF_UNIT=false` idempotently immediately before every probe attempt, see above) removes
the *ambient-state* half of the problem regardless of mechanism, but does not by itself prove the
`UNIT`-survival bug is gone — **the next live re-run, both standalone and as part of a full suite, is
the actual test; don't declare this closed from static analysis alone.**
