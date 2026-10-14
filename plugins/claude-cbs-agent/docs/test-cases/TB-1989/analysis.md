Status: Draft
Related Ticket: TB-1989 (US-01.13.03 | Dynamic High-TPS Execution & Hierarchical Rate Resolution)
Related module-theory: [[../../module-theory/Currency Definition and Logic/US-01.13.03/README.md]]
Owner: AQA (fullstack-aqa-agent)

# TB-1989 / US-01.13.03 — Automation coverage vs. the TC-02..TC-26 sheet (2026-08-24)

Source of the TC table: the manual QA sheet pasted in chat (TC-02, 03, 04, 06-12, 15, 16, 19-22,
24-26 — TC-01/05/13/14/17/18/23 not in scope of this pass, they weren't in the pasted sheet).
Cross-checked against:
- Confluence pageId `1529872396` (US-01.13.03, v1.2) — already fully captured in the module-theory
  README, re-read here, not re-fetched (no changes expected mid-sprint without a version bump).
- `proj-bruno-api` `origin/main` @ `bb3c833e` (2026-08-24 08:34 CEST, freshly fetched today —
  supersedes the 2026-08-21 module-theory snapshot on a few points, see below).
- The actual current test code in `proj-test-automation`,
  `api/system_core/tests/currency-regression.spec.ts`, `US-01.13.03` describe block (line 1810+),
  plus the new `CurrencyEngineApiClient`/`currency-engine.types.ts` on branch `group-3/TB-2960`
  (uncommitted at analysis time).

## Already automated — correctness check against the TC sheet

| TC | Automated as | Verdict |
|---|---|---|
| TC-04 | "Base resolution falls back to the lower BASE_RANK when no base is declared" | **Matches.** Uses array mode (`currencies: [A, B]`, no `baseCurrency`/`quoteCurrency`) exactly as Bruno's "Resolve Rate (Unordered Pair)" documents; asserts the lower-`BASE_RANK` currency comes back as `baseCurrency`. Field name is `BASE_RANK`, not the sheet's `BASE_CCY_RANK` — a known, already-flagged doc/impl naming drift, not a test bug. |
| TC-06 | "A 15,000 transaction selects the 10,000 tier, not the 0 tier" | **Matches** TC-06's ER exactly (open-ended top band, 15,000 → 10,000-tier rate). |
| TC-07 | "An amount exactly at AMT_FROM (10,000) selects that tier" | **Matches** TC-07's ER exactly (inclusive lower bound). |
| TC-08 | "An amount below the lowest band resolves as generic Rate Not Found" | **Matches.** Sheet ER is literally `HTTP 404 Not Found` — test asserts `404`. Correct. |
| TC-09 | "A missing RATE_TYPE is rejected instead of deriving a spread" | **Escalated 2026-08-25, explicit user decision — no longer a silent mismatch.** Sheet ER is `HTTP 422; "Requested Rate Type missing. Spread auto-calculation is prohibited."`; the two sub-steps (rateType=ASK vs BID) previously asserted *different* statuses (404 vs 400) against each other, on top of neither matching the sheet's 422. User's decision (2026-08-25): both sub-steps now assert **404**. The error-message text ("Requested Rate Type missing. Spread auto-calculation is prohibited.") is unchanged and does match the sheet — only the status code is a deliberate, authorized departure from the sheet's `422`, not a guess. **This is a decision the user made directly, not one this role picked** — worth a follow-up note back to whoever owns the sheet that `422` isn't shipped/live, but no further escalation needed from this role. |
| TC-15 | "An expired rate resolves as a 500 through the Currency Engine" | **Still diverges from the sheet's intent — pending BA, unchanged 2026-08-25.** Sheet ER: "Rate treated as inactive; not returned (Rate Not Found / band miss)" — implies a 404-shaped rejection. Real, live-verified behavior is `500` with a generic catch-all body. User's own reaction (2026-08-25): "мы уточним у БА, но вряд ли там будет ожидаться 500, это выглядит неправильно" — agrees this looks wrong, will ask BA. **Left unchanged pending that answer** — do not flip to 404 without a BA confirmation, per [[../../../feedback_dont-equate-own-hypothesis-with-dev-confirmation.md]]. |
| TC-19 | "Each RATE_TYPE is returned exactly as stored, with no cross-type derivation" | **Matches** TC-19 exactly (BID/ASK/MID each round-trip their own stored value). |
| TC-26 (new case, different from the deleted original, 2026-08-24) | "Reject an order whose RATE_BANDS repeats the same AMT_FROM/RATE_TYPE combination twice" | **Matches.** New case delivered by the team same day the original TC-26 was deleted — different content, same id reused. Automated: stages a `DIFF_AMT`-market order with `(AMT_FROM=1000, RATE_TYPE=MID)` duplicated among otherwise-distinct bands, asserts `400`. Deliberately does not assert the exact error-message text (sheet only gives an illustrative example, no live-verified real text yet) — awaiting the real error text from a live run to tighten the assertion. |
| TC-21 (rewritten a 4th time, 2026-08-25) | "rateValue resolved through the Currency Engine is scaled to the quote currency's NO_OF_DECIMALS" | **Retargeted to match the sheet's actual Steps.** A fresh sheet export pasted by the user (2026-08-25) spells out Steps as `POST {{currency-engine-url}}/api/v1/currencies/rates` + "Inspect rateValue in the response" — i.e. verify via the Currency Engine's resolve endpoint, not via `CURRENCY.ORDER` `SEE` (the prior version's approach). User confirmed this reading explicitly: "проверять через Currency Engine, мы должны проверять что приходит правильно округлённый рейт." Rewritten to stage+authorize+force-fire+wait-PROCESSED+wait-CURRENCY.RATES, then call `resolveRate()` for base=2-decimals/quote=3-decimals: `'1.2347'→'1.235'` (rounds), `'1.234'→'1.234'` (unchanged), `'0.95'→'0.950'` (padded). Asserts on **raw response text** (`readResponseBody`, not `response.json()`) — confirmed via Bruno (`Currency Engine/Resolve Rate.yml`) that the wire format preserves trailing zeros (`"rateValue":1.0850` in their own verified-on-QA example), so a plain JSON number (which loses `0.950`→`0.95` on parse) cannot observe the padding case at all. Same raw-text technique already used by TC-28. |
| TC-27 (new, 2026-08-25) | "Triangulated cross-rate combines full-precision leg rates and rounds once at the final step, not per-leg before combining" | **Matches.** BA-confirmed 2026-08-25 (Mikalai Yudzilevich): "на входе — сколько знаков в справочнике валюты, столько и максимум; внутри триангуляции — до 18 знаков, без округления по ходу; на выходе — округление обратно до нормы справочника." Leg rates (`1.003`, `2.044`, NO_OF_DECIMALS=3 on base/transit) chosen via computed (not estimated) verification so round-once (`0.21`) and round-each-leg-first (`0.20`) provably diverge. |
| TC-28 (new, 2026-08-25) | "Triangulated cross-rate preserves at least 18 decimal digits of internal precision, not silently degrading to IEEE double" | **Test design matches the requirement; currently FAILS on live env — real, confirmed blocker, see below.** Same BA confirmation as TC-27, targeting the literal "18 decimal places" depth claim specifically (TC-27 only proves round-order, not depth — on ordinary 2-4 decimal rates, IEEE double and BigDecimal are indistinguishable). Uses NO_OF_DECIMALS=18 on base/transit/quote currencies and leg values (`0.912345678901234567` / `1.234567890123456789`) engineered so exact decimal math and double math diverge at the 17th decimal digit (verified independently via Python's `decimal` module, cross-checked against a BigInt fixed-point calculation). **2026-08-25, later same day — live run failed at the PRECONDITION step**, not the assertion: staging the first leg (`CURRENCY.ORDER~MASTER INPUT` with `RATE_VALUE: "0.912345678901234567"` against a currency created with `NO_OF_DECIMALS: 18`) still gets `400 RATE_BANDS[0].RATE_VALUE - value must be a number with up to 9 decimal places`. This directly contradicts the v2 changelog entry below ("RATE_VALUE's accepted decimal scale on INPUT is driven by the currency's own NO_OF_DECIMALS") — that claim was never actually live-verified at NO_OF_DECIMALS=18, only theorized in chat ("Должно быть так, да" — Ilona Fralova, unconfirmed by a real call). This run is the first real confirmation, and it disproves the theory: **RATE_VALUE INPUT validation is hardcoded to 9 decimal places regardless of the currency's own NO_OF_DECIMALS** — [TB-3277](https://bank-proj.atlassian.net/browse/TB-3277) (Open, unresolved) is broader than its current description suggests (it currently only documents the *output-not-rounded* half of the same root cause, at NO_OF_DECIMALS=2-3; this is the *input-rejected-even-at-NO_OF_DECIMALS=18* half). **Status: Blocked, not Automated** — the test cannot pass until TB-3277 is fixed; do not weaken TC-28's own inputs (e.g. fewer decimals) to make it pass, that would defeat the point of the case. |
| TC-22 (clarified, 2026-08-25) | "An amount inside a bounded (non-open-ended) band resolves to that band, not a neighboring one" | **Resolved and now matches the sheet's actual intent.** User clarified directly (2026-08-25): "мы проверяем bounded band и ждём что всё пройдёт гладко" — the case is only about resolving the correct tier, nothing about `amtFrom`/`amtTo` transparency. Removed the two speculative `not.toHaveProperty('amtFrom'/'amtTo')` canary asserts that were flagged as risky in an earlier code review (asserting a field's *absence* as a self-reminder, not a real contract check) and renamed the test. **Closes the "ambiguous replacement ER" item that was open since 2026-08-24.** |
| TC-29 (new, 2026-08-25 — the sheet's unnumbered "MANDATORY_TRIANGULATION=YES" row) | "MANDATORY_TRIANGULATION=YES bypasses an existing direct rate and forces triangulation via COMPANY.TRIANGULATION_CURRENCY" | **Matches.** User assigned this id to the sheet's final unnumbered row (XAF triangulation-bypass example) and asked for it to be automated. Company temporarily set to `MANDATORY_TRIANGULATION: true` + `TRIANGULATION_CURRENCY: <transit>`; a **direct** base/quote rate is staged (`9.99`) alongside both triangulation legs (`2.05`, `3.05`) under one shared business unit; `resolveRate()` with no explicit `transitCurrency` in the request must return the triangulated value (`toBeCloseTo(2.05*3.05/10, 2)`), never the direct `9.99` — proves the bypass specifically, not just that triangulation works (that's already TC-10/11/27/28's job). |
| TC-30 (new, 2026-08-26 — pasted by the user, not yet in Allure) | "Triangulation falls back to COMPANY.LOCAL_CURRENCY as transit when no explicit transitCurrency and no COMPANY.TRIANGULATION_CURRENCY are configured" | **Automated, live-confirmed passing (2026-08-26) — one confirmed contract adjustment.** Sheet ER states the response should indicate `transitCurrency: "EUR"` — the real `/currencies/rates` response has only 5 documented fields (`baseCurrency, quoteCurrency, rateType, quoteCode, rateValue`), no `transitCurrency` field exists (already established, see the "`transitCurrency` in the resolve response" row below). Verifies the fallback the same way TC-10/TC-11 already do: the calculated `rateValue` matches the base→LOCAL_CURRENCY→quote triangulation formula, plus no `CURRENCY.RATES` row is ever written for the direct pair. Mutates the shared company's `LOCAL_CURRENCY` to a dedicated transit currency (mirrors TC-11's `TRIANGULATION_CURRENCY` mutation pattern — confirmed mutable via Bruno's `COMPANY/proj-field-registry/Create LOCAL_CURRENCY field.yml`, no immutability marker, and live-example-confirmed via `13 - E2E Tests/15 CO INPUT - Optional Triangulation Without Currency.yml`). Sheet's literal `EUR`/`KES`/`JPY` currency ids are examples, not requirements, per [[../../../feedback_test-case-values-are-examples.md]] — uses dedicated minted currencies instead, per [[../../../feedback_no-hardcoded-unique-field-values.md]]. See Finding 4 for its relationship to TC-24. |
| TC-31 (new, 2026-08-26 — pasted by the user, not yet in Allure) | "Dynamic triangulation never inserts a CURRENCY.RATES row for the queried direct pair (Read-Only isolation)" | **Matches.** A dedicated, standalone case for the "Read-only — execution must never lock or insert into CURRENCY.RATES" business rule already stated in the Story text and already checked inline inside TC-10/TC-11/TC-30's own assertions — this case makes it a first-class, explicit before/after count comparison instead of a side-assertion, per the sheet's own literal two-step shape (count before, POST + re-count after). Uses `getCurrencyRatesOrderIdsForKey` (existing helper) for both counts against a dedicated base/transit/quote triple, same triangulation setup as TC-10. |

**Updated 2026-08-26:** US-01.13.02 got its first `allureCaseId(...)` links on 2026-08-25 (3
tests), and US-01.13.03 got 12 more on 2026-08-26 (TC-01/02/04/06/07/08/09/10/11/15/16/21 — see
the mapping table in `docs/module-theory/Currency Definition and Logic/US-01.13.03/README.md`'s
"Allure TestOps linking" section) once TestOps actually had cases for this Story — as of
2026-08-25 it had none at all (see `docs/common-issues/allure-testops/allure-story-field-no-id-prefix.md` for why
an earlier scan came up empty). TC-12/22/24/26/27/28/29 still have no Allure case and are still
unlinked; the paragraph below is now partly stale (kept for history):

No `allureCaseId(...)` linking exists for any US-01.13.02/US-01.13.03 test yet (unlike US-01.13.01,
where every test carries one) — Automation Status in Allure TestOps can't be flipped to `Automated`
for these until case IDs are attached.

## Findings to escalate (Manual QA / BA)

1. **TC-09's expected `422` + specific message does not exist anywhere in the Currency Engine.**
   The full 13-file `Currency Engine/Errors/` catalog has 400/404/422/500 rows, but the specific
   "Requested Rate Type missing..." message and its claimed `422` pairing are not among them —
   `13 Invalid Rate Type.yml`'s own doc note states a valid-but-unmatched type is a `404`.
   **Update 2026-08-25: user made the call directly** — both sub-steps now assert `404` (real
   behavior), matching each other and the message text, still diverging from the sheet's `422`
   status. This is a recorded, authorized decision, not an open escalation anymore — but the sheet
   itself still says `422`, so whoever owns that sheet should know `422` isn't live.
2. **TC-15's expected shape ("Rate Not Found"-style) vs. real `500`.** Still open as of 2026-08-25
   — the automated assertion is real-behavior-accurate but sheet-divergent. User's own reaction:
   "мы уточним у БА, но вряд ли там будет ожидаться 500, это выглядит неправильно" — agrees it
   looks wrong, will ask BA directly. **Do not change the test until that answer lands.**
3. **TC-28 fails at PRECONDITION on the live env — [TB-3277](https://bank-proj.atlassian.net/browse/TB-3277)
   is broader than currently described.** Staging a `CURRENCY.ORDER~MASTER INPUT` with
   `RATE_VALUE: "0.912345678901234567"` against a currency created with `NO_OF_DECIMALS: 18` still
   gets `400 RATE_BANDS[0].RATE_VALUE - value must be a number with up to 9 decimal places` — i.e.
   RATE_VALUE INPUT validation is hardcoded to 9 decimals regardless of the currency's own
   `NO_OF_DECIMALS`, contradicting the team's own confirmed design (Mikalai Yudzilevich, chat:
   "на входе — сколько знаков в справочнике валюты, столько и максимум"). TB-3277's current
   description only reproduces the *other* half of this same defect (RATE_VALUE with 4 decimals
   accepted and not rounded on output, at NO_OF_DECIMALS=2-3) — it does not yet document the
   *input rejected even at NO_OF_DECIMALS=18* half this session found. **Recommend adding this
   repro to TB-3277 as an additional case**, not filing a second ticket — same root cause
   (RATE_VALUE decimal handling is independent of NO_OF_DECIMALS in both directions). Until fixed,
   TC-28 cannot pass as designed and must not be weakened (e.g. fewer decimals) to force a green
   result — that would stop proving the 18-decimal claim the case exists to verify.
4. **TC-24's original setup couldn't actually prove its own claim — found 2026-08-26 while
   automating two new sheet cases (TC-30, TC-31); resolved same day by a live run.** TC-24
   ("No LOCAL_CURRENCY fallback...") originally staged zero rate legs at all in its precondition —
   no direct base/quote, no base/LOCAL_CURRENCY, no LOCAL_CURRENCY/quote — so its `404` result (if
   it passed) was indistinguishable from "the engine has no LOCAL_CURRENCY-fallback mechanism" vs.
   "it has one, but there was nothing to triangulate through either way." Meanwhile TC-30, a new
   case from the same sheet, states the Story's Confluence text directly (Alt Flow 1 / AC3 / AC9:
   explicit → `TRIANGULATION_CCY` → `LOCAL_CURRENCY` → global default) and expects a real fallback
   to succeed — the opposite conclusion from TC-24's original title. **Resolution step 1
   (2026-08-26, user's explicit call): rewrite TC-24's setup to be genuinely informative rather than
   delete/merge it** — changed it to stage a real `base→LOCAL_CURRENCY` leg while deliberately
   leaving `LOCAL_CURRENCY→quote` unstaged, so its `404` proves "an incomplete route fails" (true
   regardless of whether a fallback mechanism exists) — no longer the same claim as TC-30's
   complete-route/`200` case, so no longer a genuine contradiction even before either test had run.
   **Resolution step 2 (2026-08-26, same day, live run) — CONFIRMED, not a guess anymore.** User
   ran both tests live (`npx playwright test ... --grep "TC-24|TC-30"`): **both passed** — TC-24's
   incomplete route correctly `404`s, and TC-30's complete route correctly returns `200` with the
   triangulated rate via `LOCAL_CURRENCY`. This is the first live confirmation that the Story's
   documented `LOCAL_CURRENCY`-fallback chain (AC3/AC9) is actually implemented, not just
   documented. **Renamed TC-24** (same day) to
   `'An incomplete LOCAL_CURRENCY route (missing the localCurrency/quote leg) still resolves to
   Rate Not Found'` — the old title ("No LOCAL_CURRENCY fallback...") read as a direct negation of
   TC-30's title once both existed side by side, even though the two were never actually testing
   the same claim; renamed to remove that appearance of contradiction. **Both TC-24 and TC-30 are
   now live-confirmed Automated, not pending.**

## Not automated — reason and what's needed

| TC | Why not automated | What's needed |
|---|---|---|
| TC-02 (L1 explicit override) | ~~Resolved 2026-08-24~~ — team clarified the real behavior is directional, not "override wins over payload/rank": an explicit `baseCurrency`/`quoteCurrency` pair resolves only in its stored order; the reversed pair is `404`. **Automated** in `currency-regression.spec.ts`. Moved out of this table (kept here as history only). | — |
| TC-03 (L2 payload BASE_CURRENCY) | **Confirmed deleted by the user, 2026-08-25** ("ТС-03 мы удалили"). Was never automated, and the fresh sheet export pasted the same day no longer lists it — consistent with the deletion. | None — closed. |
| TC-20 (response contract: `amtFrom`/`amtTo`/`transitCurrency`) | **Deleted from the sheet by the team, 2026-08-24** — no longer a live case. The automated test that had encoded this contract mismatch was deleted from `currency-regression.spec.ts` the same day (its residual coverage — response field shape for a direct pair — is now implicitly exercised by TC-01 in `currency-smoke.spec.ts`). | None — closed. |
| TC-24 (renamed 2026-08-26, was "no `LOCAL_CURRENCY` fallback when triangulation not mandatory and no transit configured") | Team said (2026-08-24): automate now as a discovery test, decide sheet-update vs. BA-escalation after seeing the real result. **Setup corrected and live-confirmed 2026-08-26** — see Finding 4 below; original setup staged zero rate legs at all, so its `404` proved nothing about a fallback mechanism one way or the other. | **Automated, live-confirmed passing.** Now titled "An incomplete LOCAL_CURRENCY route (missing the localCurrency/quote leg) still resolves to Rate Not Found" — stages a real `base→localCurrency` leg (deliberately leaving `localCurrency→quote` unstaged) against the shared company's `LOCAL_CURRENCY` pointed at a dedicated currency, asserts `404` + "Rate Not Found". Renamed off its original title once the live run (alongside TC-30, same day) confirmed the two tests were never actually testing the same claim. |
| TC-25 (SYSTEM.PARAMETER excluded from transit resolution) | Two blockers, one data-level and one architectural: (1) `SYSTEM.PARAMETER` is a **global singleton** record (`recordId: "SYSTEM"`, one per environment, confirmed via `01 SP INPUT - Valid Record.yml`) with no `DEFAULT_TRANSIT_CCY` set today — mutating it to test this case would change fallback behavior for **every other concurrently-running test** in the suite (a shared-mutable-global-state hazard, not just missing test data). (2) The sheet's own premise directly **contradicts** this Story's own Confluence text: the Story's Alt 1 lists global `SYSTEM.PARAMETER.DEFAULT_TRANSIT_CCY` as the legitimate *third* fallback level, while TC-25 asserts the engine must **never** read it. Raised with the user 2026-08-24/25; they didn't initially see the contradiction, re-explained concretely. **Update 2026-08-25: user says they've now asked the question directly** — still awaiting the answer as of this pass. | Do not automate either direction until the BA reconciles the Story's own 3-level fallback chain against the "p.19 clarification" TC-25 cites. If resolved in TC-25's favor, mutating the global `SYSTEM.PARAMETER` record safely will also require serializing this test against the rest of the currency suite — flag to AQA Lead as a test-strategy question. |
| TC-26, original ("capped band routes to next covering band") | **Deleted from the sheet by the team, 2026-08-24** (no `AMT_TO` field exists; sheet's own open question). The TC-26 *id* was reused the same day for an unrelated new case ("Reject duplicate AMT_FROM/RATE_TYPE combinations") — see the Already Automated table above; no relation between the two. | None — closed. |
| — (`transitCurrency` in the resolve response) | User asked (2026-08-25) whether `transitCurrency`, since it's a valid optional *request* field, should also appear in the *response* when supplied. Checked `Currency Engine/opencollection.yml`'s "Response" table (origin/main) — documented shape is exactly `baseCurrency`, `quoteCurrency`, `rateType`, `quoteCode`, `rateValue`; no `transitCurrency`, and the doc explicitly flags "the response contract is provisional." **Declined to add the field** to `ResolveRateResponse` per [[../../../feedback_justify-additions-before-making-them.md]] — a plausible guess doesn't outrank a documented (if provisional) contract. | If still wanted, needs an explicit ask to the Currency Engine team to confirm/add it — not a guessed type addition. |
| TC-28 ("triangulated cross-rate preserves 18-decimal precision") | **Blocked by a real, confirmed defect, discovered 2026-08-25 later same day — not a test-authoring gap.** Test is written correctly per the BA-confirmed design, but its own PRECONDITION (staging an order leg with an 18-decimal `RATE_VALUE` against a `NO_OF_DECIMALS: 18` currency) fails live with `400 ... up to 9 decimal places` — see Finding 3 above and [TB-3277](https://bank-proj.atlassian.net/browse/TB-3277). | Fix TB-3277 (RATE_VALUE INPUT validation must key off the currency's own `NO_OF_DECIMALS`, not a hardcoded 9-decimal cap). Re-run TC-28 unchanged once fixed — no test-code change expected. |

## Summary

- **2026-08-24 update:** TC-10, TC-12, TC-16 are now automated (see Changelog) — 10/18 as of this
  update. The 9 remaining un-automated TCs are written up with full source citations in
  [[escalation-brief.md]], ready for a team walkthrough.
- **2026-08-25 update (first pass):** 18 of ~22 known sheet TCs automated: TC-02, 04, 06, 07, 08,
  09, 10, 11, 12, 15, 16, 19, 21, 22(*), 24, 26(new), 27(new), 28(new). TC-01 separately automated
  in `currency-smoke.spec.ts`.
- **2026-08-25 update (second pass, against a freshly pasted sheet export + a live user
  walkthrough):** **19 automated**, one new case added (TC-29). Concrete changes this pass:
  - **TC-09** — user's own decision: both sub-steps now assert `404` (were 404/400, mismatched
    with each other and with the sheet's `422`). No longer an open escalation, though the sheet's
    `422` still isn't live.
  - **TC-21** — retargeted a 4th time: the fresh sheet's Steps hit the Currency Engine's resolve
    endpoint directly ("Inspect rateValue in the response"), so the test now stages+authorizes+
    resolves and asserts on raw response text (base=2 decimals/quote=3 decimals: round, unchanged,
    pad-with-zero cases).
  - **TC-22** — user clarified intent directly (bounded-band resolution only, no `amtFrom`/`amtTo`
    check needed) — **closes the "ambiguous ER" item**, no longer open.
  - **TC-11-adjacent** — user's `transitCurrency`-in-response request declined; contract
    (`opencollection.yml`) documents 5 response fields only, explicitly "provisional" shape.
  - **TC-03** — confirmed deleted by the user, closed.
  - **TC-29 (new)** — the sheet's unnumbered "MANDATORY_TRIANGULATION=YES bypasses direct rate"
    row, numbered TC-29 by the user, automated same pass.
  - **TC-15** — unchanged, user will ask BA; agrees the current `500` expectation looks wrong.
- **Still open, need a BA/team answer, not a guess:** TC-15 (500 vs 404, user will ask BA), TC-25
  (Story-vs-TC contradiction — user says they've now asked, awaiting answer). TC-03, TC-20, TC-22,
  and the original TC-26 are all closed (deleted or resolved).
- **2026-08-25, later same day — TC-28 downgraded from Automated to Blocked.** A live run failed
  at PRECONDITION with a real, confirmed defect ([TB-3277](https://bank-proj.atlassian.net/browse/TB-3277),
  Open) — see Finding 3 and the new "Not automated" row above. Corrected count: **18 automated**
  (TC-02, 04, 06, 07, 08, 09, 10, 11, 12, 15, 16, 19, 21, 22, 24, 26(new), 27(new), 29) + TC-01 in
  `currency-smoke.spec.ts` = 19 total; **TC-28 is Blocked, not Automated**, pending TB-3277. TC-27
  is unaffected — its leg rates (NO_OF_DECIMALS=3) stay well under the hardcoded 9-decimal input
  ceiling, so it doesn't hit this defect.

None of the remaining open items are infrastructure gaps — the bottleneck for both is a BA/team
answer this role cannot supply on its own, consistent with
[[../../../feedback_mandatory-5-step-research-flow.md]]'s step 4 verdict gate.

- **2026-08-26 update — two new sheet cases (TC-30, TC-31) automated; TC-24 setup corrected.**
  **21 automated** (added TC-30, TC-31 to the prior 19; TC-28 stays Blocked, uncounted). TC-30
  ("LOCAL_CURRENCY fallback") required one confirmed contract adjustment (no `transitCurrency`
  field in the real response — verifies via calculated `rateValue` instead, same technique as
  TC-10/TC-11) and surfaced that TC-24's original setup staged zero rate legs, so its `404` never
  actually distinguished "no fallback exists" from "fallback exists, nothing to fall through to."
  User's explicit call: keep both tests, rewrite TC-24 to be genuinely informative (a real but
  deliberately incomplete route) rather than delete/merge it into TC-30. See Finding 4 for the full
  reasoning. TC-31 is a dedicated Read-Only isolation case, following TC-10/TC-11's existing inline
  `getCurrencyRatesOrderIdsForKey` check pattern as an explicit before/after count. Neither TC-30
  nor TC-31 has an Allure case yet (pasted directly by the user, not yet in TestOps). All changes
  verified via `tsc`/`eslint`/`prettier` only, not run (user runs tests manually).
- **2026-08-26, later same day — live run confirms TC-24/TC-30, both pass; TC-24 renamed.** User
  ran `npx playwright test currency-regression.spec.ts --grep "TC-24|TC-30"` live — both passed.
  This is the first live confirmation that the Story's `LOCAL_CURRENCY`-fallback chain (AC3/AC9) is
  actually implemented. Renamed TC-24 (its old title read as a direct negation of TC-30's once both
  existed side by side) — see Finding 4 for full detail. No further test-code changes; step-text
  polish only (removed stale "if a fallback mechanism exists" hedging now that it's confirmed real).
- **2026-08-26, later same day — fixed 12 "unwrapped request" spots across the whole US-01.13.03
  block, not just this session's own tests.** User noticed (from the live Allure report) that
  requests were showing up outside any named `test.step` — traced to two recurring patterns:
  (1) `const x = await createDedicatedCurrency(...)` called directly at the top of a test body,
  before its first `test.step`; (2) cleanup code (`deleteCurrencyRatesRowsByOrderId` loops, the
  shared-company restore call) inside a bare `finally { ... }` with no step wrapper. Found in
  **TC-11, TC-12, TC-24, TC-27, TC-28, TC-29, TC-30, TC-31** — i.e. every test written from TC-11
  onward, including three (TC-11, TC-12, TC-29) that predate this session. `US-01.13.01`,
  `US-01.13.02`, and `currency-smoke.spec.ts` were already clean (confirmed by a dedicated
  investigation pass). Fixed all 12: currency minting now happens inside a new leading
  `PRECONDITION: mint dedicated ... currencies` step; cleanup code now runs inside a
  `CLEANUP: ...` step. No assertions or business logic changed — pure Allure-reporting hygiene.
  Verified via `tsc`/`eslint`/`prettier` only, not run.

## Changelog

- **2026-08-25 — v4 (later same day) — TC-28 live run disproves the v2 chat theory.** A live
  execution of TC-28 failed at PRECONDITION (`400 ... RATE_VALUE ... up to 9 decimal places`) when
  staging an order leg with `RATE_VALUE: "0.912345678901234567"` against a currency created with
  `NO_OF_DECIMALS: 18`. The v2 entry below states the team "confirmed live in chat" that RATE_VALUE's
  accepted INPUT scale is driven by the currency's own `NO_OF_DECIMALS` — but that was only ever
  live-tested at `NO_OF_DECIMALS: 2` in the original chat repro; the `NO_OF_DECIMALS: 18` case was
  Ilona Fralova's stated expectation ("Должно быть так, да"), never actually run. This TC-28
  execution is the first real test of that expectation, and it fails: the 9-decimal cap holds even
  at `NO_OF_DECIMALS: 18`. Confirmed via `proj-bruno-api` (`origin/main`, local checkout, network
  fetch unavailable this session — SSH timeout) that `RATE_VALUE`'s field-registry/schema
  definitions (`x-type: RATE`, `x-config: {}`) carry no scale override, consistent with the cap
  being a hardcoded platform default rather than data-driven. Re-verified
  `buildStandardCurrencyInputData`/`createDedicatedCurrency` (`currency-payload-builder.ts`,
  `currency-helper.ts`) correctly forward `overrides.NO_OF_DECIMALS` to the `CURRENCY~MASTER INPUT`
  call — ruled out a test-side setup bug. TC-28 moved from Automated to **Blocked**, pending
  [TB-3277](https://bank-proj.atlassian.net/browse/TB-3277) (Open) — see Finding 3 and the "Not
  automated" table above. TC-27 (NO_OF_DECIMALS=3 legs) is unaffected. No test code changed; this
  is a documentation-only correction of TC-28's status pending a Dev fix, per
  [[../../../feedback_escalate-dont-ship-mismatched-automation.md]].

- **2026-08-25 — v3 (second pass, same day).** A fresh full sheet export was pasted by the user
  along with a live walkthrough of every open item:
  - TC-09: user decided both sub-steps assert `404` (previously mismatched 404/400).
  - TC-21: retargeted a 4th time to verify through the Currency Engine's `resolveRate()` response
    (raw text) instead of `CURRENCY.ORDER` `SEE`, per the fresh sheet's literal Steps.
  - TC-22: user clarified the case only needs the bounded-band resolution check; removed two
    speculative `not.toHaveProperty` canary asserts; closes the "ambiguous ER" item.
  - Declined to add `transitCurrency` to `ResolveRateResponse` — contract documents 5 fields only,
    calls itself provisional; user's request needs a Currency Engine team confirmation instead.
  - TC-03 confirmed deleted by the user.
  - Added TC-29 (`MANDATORY_TRIANGULATION=YES` bypasses an existing direct rate) — the sheet's
    unnumbered final row, numbered TC-29 by the user.
  - TC-15 left unchanged, pending a BA answer the user will chase.
  - All changes verified via `tsc`/`eslint`/`prettier` only, not run (user runs tests manually).
- **2026-08-25 — v2.** Team (Mikalai Yudzilevich, Ilona Fralova) confirmed live in chat: RATE_VALUE's
  accepted decimal scale on INPUT is driven by the currency's own `NO_OF_DECIMALS` (not a fixed
  9-decimal ceiling as a live 400 error text had suggested — that error text is itself wrong/
  hardcoded, filed as [TB-3277](https://bank-proj.atlassian.net/browse/TB-3277)); the Story's
  "18-decimal BigDecimal" note is specifically about the *triangulation intermediate calculation*
  (rounded once at the final step back to the target currency's NO_OF_DECIMALS), not about a
  directly-stored rate. Retargeted TC-21 to a boundary-validation test (N+1 decimals → 400; exactly
  N → 200) and designed two new cases (TC-27, TC-28) to actually exercise the triangulation-
  precision claim — TC-27 for round-order correctness (realistic 2-4 decimal rates), TC-28 for raw
  precision depth (NO_OF_DECIMALS=18 currencies, values engineered via independent `Decimal`/BigInt
  verification so exact decimal math and IEEE double math provably diverge within the 18-decimal
  window). Added `overrides` param to `buildStandardCurrencyInputData`/`createDedicatedCurrency`
  (backward-compatible) to support per-test `NO_OF_DECIMALS` configuration. Also implemented the
  team's 2026-08-24 chat resolutions from the walkthrough below: TC-01 corrected and moved to
  `currency-smoke.spec.ts`, TC-02 automated (directional pair resolution, not payload-precedence),
  TC-19/TC-20 deleted (superseded by TC-01), TC-24 automated as a discovery test, new TC-26
  (duplicate RATE_BANDS combination) automated. All changes verified via `tsc`/`eslint`/`prettier`
  only, not run (user runs tests manually).

- **2026-08-24 — v2.** Automated TC-10 (explicit `transitCurrency` triangulation, shared synthetic
  `businessUnit` across both legs per Bruno's own doc note, plus a DB check that the direct
  base/quote pair never gets a `CURRENCY.RATES` row), TC-16 (Currency-Engine-level "not yet active"
  check, reusing US-01.13.02/TC-05's staging pattern but actually calling `resolveRate`), and TC-12
  (a "bait" currency given an artificially low `BASE_RANK` plus real base/bait and bait/quote rates,
  asserting the lookup still fails rather than silently succeeding through rank-based transit
  selection). All three verified via `tsc`/`eslint`/`prettier` only, not run (user runs tests
  manually). Wrote [[escalation-brief.md]] — a citation-backed walkthrough doc for the remaining 9
  TCs, for the user to present to BA/Manual QA/Dev.
- **2026-08-24 — v1 created.** Cross-checked TC-02..TC-26 (as pasted by the user) against the
  existing 2026-08-21 module-theory README, a fresh `proj-bruno-api` `origin/main` fetch
  (`bb3c833e`, today), and the live `currency-regression.spec.ts` state on `group-3/TB-2960`.
  Confirmed the module-theory README's response-contract and triangulation findings still hold
  today (no `amtFrom`/`amtTo`, `AMT_TO` field still doesn't exist, no data-population example for
  `TRIANGULATION_CURRENCY`/`DEFAULT_TRANSIT_CCY` exists). Found two already-automated tests
  (TC-09, TC-15) that silently encode real-but-sheet-divergent behavior without a prior escalation
  — flagged per [[../../../feedback_docs-outrank-real-implementation.md]] and
  [[../../../feedback_escalate-dont-ship-mismatched-automation.md]].
