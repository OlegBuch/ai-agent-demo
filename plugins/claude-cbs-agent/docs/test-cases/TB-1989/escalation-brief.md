Status: Walked with the team 2026-08-24 (5 of 9 resolved same-day) + a second walkthrough
2026-08-25 against a fresh sheet export — as of 2026-08-25 (later same day), TC-15, TC-25, and
TC-28 (newly blocked by a live-confirmed defect, TB-3277) remain open (see "Team walkthrough
resolutions" at the end)
Related Ticket: TB-1989 (US-01.13.03 | Dynamic High-TPS Execution & Hierarchical Rate Resolution)
Related: [[analysis.md]] (coverage table), [[../../module-theory/Currency Definition and Logic/US-01.13.03/README.md]]
Prepared: 2026-08-24

# TB-1989 escalation brief — 9 TCs that cannot be automated without a decision

Purpose: a single document with the exact source citation for every claim, so this can be walked
through with the BA/Manual QA/Dev team without anyone having to re-derive where a fact came from.
Every claim below cites one of three sources verbatim:
- **Story** = Confluence pageId `1529872396`, "US-01.13.03 | Dynamic High-TPS Execution &
  Hierarchical Rate Resolution", v1.2 (2026-08-11).
- **Bruno** = `proj-bruno-api`, `origin/main` @ `bb3c833e2ef86b7f9125051174dea9697f27144a`
  (fetched 2026-08-24 08:34 CEST — today, current).
- **Sheet** = the manual QA test-case sheet for US-01.13.03 (TC-01..TC-26), as pasted 2026-08-24.

As of this brief, **TC-10, TC-11, TC-12, TC-16 have just been automated** (see
`currency-regression.spec.ts`, US-01.13.03 describe block) and are excluded below. TC-11 was
initially misreported as blocked — see the corrected section below for what happened and why. The
status quo before this pass was 7/18 automated; it is now 11/18. The 9 cases below are the ones
this role cannot automate without a BA/Dev decision — automating any of them today would mean
guessing.

**A methodology note applies to every claim below, not just the corrected TC-11 section:** every
"Bruno" citation in this document was re-verified on 2026-08-24 using ref-qualified commands only
(`git show origin/main:"<path>"`, `git ls-tree -r --name-only origin/main`, `git grep <pattern>
origin/main --`) against a freshly `git fetch`-ed `origin/main`, after discovering the local
checkout was 415 commits behind and mid-merge-conflict. Only the TC-11 finding changed under
re-verification; the other 9 items below held up unchanged.

---

## 0. TC-01 (Smoke — GET direct cross-rate happy path)

Unlike TC-02..TC-26 (Integration tier), TC-01 is tagged **Smoke** and belongs in
`currency-smoke.spec.ts`, not `currency-regression.spec.ts`. Raised separately here because the
user asked specifically whether it could go into the smoke suite; decision as of 2026-08-24: **Not
Automatable, escalate** — this repeats and re-confirms three questions already drafted for Manual
QA (Viktoriya) on 2026-08-21 and still unanswered as of today's pass.

**Sheet** — Steps: *"GET /pricing/rate?market=MM&unit=UUUUUUU&base=USD&quote=EUR&amount=5000&rateType=ASK"*.
ER: *"HTTP 200; returns response body `{ baseCurrency, quoteCurrency, rateType, transitCurrency:null
(direct), amtFrom, rateValue }` for the exact key & RATE_TYPE (no auto-spread); read-only,
high-TPS."* The sheet's own comment already flags this as provisional: *"Endpoint paths & exact
HTTP codes assumed pending the published API contract (OPEN Q-API)."*

**Bruno**, re-verified today (`bb3c833e`, 2026-08-24):
1. **No GET rate-lookup endpoint exists anywhere in the repository.** The real endpoint is
   `POST {{currency-engine-url}}/api/v1/currencies/rates` (`Currency Engine/Resolve Rate.yml`) — a
   JSON body, not query params. Exhaustively confirmed on 2026-08-21 (54 total GET requests in the
   whole Bruno repo, none rate-related) and unchanged today.
2. **Response shape mismatch** — same gap as items 3/4 above (TC-20/TC-22): the real, live-verified
   response is `{baseCurrency, quoteCurrency, rateType, quoteCode, rateValue}` — no
   `transitCurrency`, no `amtFrom`.
3. **`rateType=ASK` needs the full async `CURRENCY.ORDER` pipeline** (`INPUT → AUTH →
   force-schedule-fire → wait PROCESSED → wait CURRENCY.RATES row`, ~45–90s) — only `MID` is
   trivially available via any lightweight seed path on this environment. There is **no fast-seed
   path for `CURRENCY.RATES` at all** — it is populated exclusively by the same background daemon
   every Integration-tier Currency Engine test in this suite already waits on
   (`forceCurrencyOrderScheduleTaskToFireNow` in `currency-helper.ts`). This is an environment/
   architecture fact, not a gap specific to this TC: **no Currency-Engine-level rate lookup can be
   made smoke-cheap (sub-second, zero-setup) on this environment**, because there is no synchronous
   write path into `CURRENCY.RATES`.
4. **Access-permission precondition unconfirmed** — *"Internal system-integration permission to the
   Currency Engine API (EP-06/EP-08)"* — the `Currency Engine/Errors/` catalog (13 files, re-checked
   today) has no 401/403 row at all; there is nothing in Bruno to confirm this precondition is
   enforced, or how.

**Also relevant:** TC-01's core positive claim — an exact `RATE_TYPE` returned with no auto-spread
derivation — is **already proven** at the Integration tier by the newly-verified **TC-19**
(`currency-regression.spec.ts`, US-01.13.03: *"Each RATE_TYPE is returned exactly as stored, with no
cross-type derivation"*, covering BID/ASK/MID). TC-01 doesn't add new *behavioral* coverage beyond
that — its only distinct value would be exercising the *published, external* API contract exactly
as an integrator would call it, which is precisely the part that isn't confirmed yet.

**What we need:** the same three questions raised for Manual QA on 2026-08-21, still open — (1)
correct the endpoint from `GET /pricing/rate` to the real `POST` contract, (2) drop
`transitCurrency`/`amtFrom` from the expected body in favor of the real shape (add `quoteCode` if
the sheet wants it), (3) confirm whether the Smoke tier should accept `MID` (instant, matches this
smoke file's existing lightweight style) instead of `ASK` (requires the full ~45-90s async
pipeline, which would make this the first "slow" test in `currency-smoke.spec.ts` and arguably
misclassified as Smoke at all). Until answered, this stays **Not Automatable**.

---

## 1. TC-02 (Base resolution L1 — explicit API override) and TC-03 (L2 — transaction payload)

**Sheet TC-02** — Steps: *"GET rate passing explicit base=EUR & quote=USD in query parameters."*
ER: *"HTTP 200; API override wins over payload & rank; EUR/USD rate returned directly."*

**Sheet TC-03** — Steps: *"Submit a request with BASE_CURRENCY in the transaction payload (no API
override)."* ER: *"HTTP 200; payload BASE_CURRENCY used to set quote direction."*

**Story** happy path step 4: *"System resolves Base/Quote via the hierarchy: (1) Explicit API
Override, (2) Transaction Payload `BASE_CURRENCY`, (3) `BASE_CCY_RANK` fallback (lowest rank
wins)."* — three distinct levels, L1 and L2 explicitly named as separate inputs.

**Bruno**, `Currency Engine/Resolve Rate.yml` (the only "plain pair" request shape in the whole
collection):
```
http:
  method: POST
  url: "{{currency-engine-url}}/api/v1/currencies/rates"
  body:
    type: json
    data: |-
      {
        "market": 1, "businessUnit": "USD", "baseCurrency": "USD",
        "quoteCurrency": "EUR", "rateType": "MID", "amount": {...}
      }
docs: |
  Explicit pair mode — `baseCurrency` + `quoteCurrency`. The caller states which side is base,
  so `BASE_RANK` ordering is skipped and the pair is looked up as given.
```
The entire `Currency Engine` collection has exactly **4** request examples (`Resolve Rate.yml`,
`Resolve Rate (Unordered Pair).yml`, `Resolve Rate (Transit Currency).yml`,
`Resolve Rate (Transit In Pair).yml`). All four are a single flat JSON body. None carries a second,
separate "transaction payload" field or wrapper distinct from the request itself.

**The gap:** the Story's own Level 2 ("Transaction Payload `BASE_CURRENCY`") describes a concept —
a payload distinct from the API call that carries its own `BASE_CURRENCY` — that **does not exist
anywhere in the real `proj-currency-engine` API**. There is one request body, and it either carries
an explicit `baseCurrency`/`quoteCurrency` (L1) or it doesn't (falling through to L3, rank-based).
There is no way to submit "a payload with `BASE_CURRENCY` but no API override" against this
endpoint, because the API call **is** the payload. TC-02's "override wins over payload & rank"
premise needs two *conflicting* signals to prove precedence — that pair of signals doesn't exist
here either.

**What we need from the team:** is L2 ("transaction payload `BASE_CURRENCY`") meant to describe a
*different*, not-yet-published endpoint (e.g. an actual FX transaction submission API that
internally calls the Currency Engine and forwards its own payload's `BASE_CURRENCY`)? If yes,
TC-02/TC-03 belong to that endpoint's test suite once it exists, not this one. If the intent was
always "the Currency Engine's own request body *is* the payload," then L1 and L2 collapse into the
same thing and the Story's 3-level model needs a one-line correction. Either way, this cannot be
automated by guessing which reading is correct.

---

## ~~2. TC-11 (Triangulation via `COMPANY.TRIANGULATION_CCY`)~~ — CORRECTED 2026-08-24, no longer blocked

**Superseded finding, kept for the record:** the first pass of this brief claimed *"no request
example anywhere in Bruno demonstrates actually setting [`TRIANGULATION_CURRENCY`] on a live
`COMPANY` record"* and that the one worked example it had previously cited "no longer exists." **That
was wrong.** The local `proj-bruno-api` checkout used for that search was **415 commits behind
`origin/main`** and sitting in an unrelated unresolved merge conflict (`environments/qa.yml`) — the
search ran as a plain `grep`/`find` on that stale working tree instead of a ref-qualified `git grep
... origin/main`/`git show origin/main:...`. Re-run correctly against a freshly fetched
`origin/main` (`bb3c833e`, 2026-08-24), the real picture is the opposite of what was first reported:

- `COMPANY/proj-table-template/Operations/INPUT - Mandatory Triangulation With Currency.yml` —
  **exists**, live-verified `200`, creates company `BNK-TR1` with `MANDATORY_TRIANGULATION: true,
  TRIANGULATION_CURRENCY: "EUR"`.
- `.../Operations/INPUT - Reject Missing Triangulation Currency.yml` — negative counterpart.
- `01 - Company & System Parameter Seeding/13 - E2E Tests/16 CO INPUT - Optional Triangulation
  With Currency.yml` — **the exact TC-11 shape**: `MANDATORY_TRIANGULATION: false,
  TRIANGULATION_CURRENCY: "EUR"` → live-verified `200`, docs literally say *"optional triangulation
  with a currency is accepted."*
- `COMPANY~MASTER`'s own projection (`COMPANY/proj-table-template/Create COMPANY~MASTER
  projection.yml`) has **`authOperationRequired: false`** — creating a company needs no AUTH/checker
  step at all, simpler than `CURRENCY.ORDER`. Required fields: `COMPANY_NAME, LEAD_COMPANY,
  DEFAULT_AUTH, TIME_ZONE, OFFICIAL_HOLIDAY, BRANCH_HOLIDAY, LOCAL_CURRENCY,
  MANDATORY_TRIANGULATION` (`TRIANGULATION_CURRENCY` is optional, exactly matching the "optional but
  configured" TC-11 scenario). `LEAD_COMPANY` may self-reference (`LEAD_COMPANY == recordId`, per
  `INPUT - Create Lead Company.yml`'s own doc note), so a dedicated test company needs no dependency
  on a pre-existing lead. `OFFICIAL_HOLIDAY`/`BRANCH_HOLIDAY` reference a real, globally-seeded
  `HOLIDAY` record (`GB#EUROPE#2026`, from the `Date and Holiday Management` module's own seeding,
  not a company-specific value) — reused as-is since it's shared infrastructure, not a business
  value under test.
- The `X-Company-Code` scoping mechanism this brief called "unconfirmed" **already exists and is
  already used** in this exact codebase — `createAuthenticatedApiContext({ companyCode })`
  (`api/utils/services/auth-service.ts`) sets it automatically on every request through that
  context, and `grantCheckerAccessToCurrencyOrder` (`currency-helper.ts`) already takes an arbitrary
  `companyCode` parameter.

**The one real (narrower) blocker found during implementation:** `grantCheckerAccessToCurrencyOrder`
grants access by **overwriting** (not merging) the shared `CHECKER_USER` Keycloak identity's
`GROUPS`/`COMPANY_CODES` — and that same identity is reused by unrelated suites
(`audit-fields-regression.spec.ts`, `audit-fields-smoke.spec.ts`, `table-registry-helper.ts`).
Fixed 2026-08-24 by making the helper `SEE`-then-merge those two arrays instead of overwriting them,
so granting a new company/group can never silently drop another suite's existing grant.

**Status: automated 2026-08-24**, no BA/product decision was ever needed here — this item is
removed from the "needs an answer" list below. Kept in this brief only as a documented correction,
per the user's explicit instruction to always verify against the actual current Bruno branch before
reporting an absence as fact.

---

## 3 & 4. TC-20 (response contract) and TC-22 (band corridor transparency)

**Sheet TC-20** ER: *"body contains `baseCurrency`, `quoteCurrency`, `rateType`,
`transitCurrency`, `amtFrom`, `amtTo`, `rateValue`; `rateType` equals the requested type;
`transitCurrency` = null for a direct rate."*

**Sheet TC-22** ER: *"response returns `amtFrom` and `amtTo` of the applied corridor... `amtTo` =
null for an open-ended top band."*

**Bruno**, `Currency Engine/Resolve Rate.yml` docs, re-verified against today's fetch:
```
Verified on QA: 200
{"baseCurrency":"USD","quoteCurrency":"EUR","rateType":"MID","quoteCode":1,"rateValue":1.0850}
```
Exactly **5** fields. No `amtFrom`, no `amtTo`, no `transitCurrency`, anywhere — confirmed
identically across all 4 `Resolve Rate*.yml` examples, including the triangulation ones (where a
`transitCurrency` field in the *response* would be most expected, if it existed).

**Prior team decision** (captured 2026-08-14, `TB-2179/analysis.md` Open Question Q4, Dima
Bogoslovsky): *"Transit currency is explicitly excluded from the response by team decision...
consumers 'take the rate and move on'; visibility into which transit currency was used is
logs-only, not an API field."* Same source also recorded an **agreed** shape that included
`amount_from`/`amount_to`: *"Agreed response shape: `{ base_currency, quote_currency,
quotation_code, amount_from, amount_to, rate_value }`."*

**The gap — two different problems bundled into these two TCs:**
1. `transitCurrency` was **deliberately decided against** by the team, and TC-20 still asserts it
   (as `null`, which is itself inconsistent with a deliberately-*absent* field — asserting a key is
   `null` is a different check than asserting it doesn't exist). This TC line item should simply be
   removed, not automated as `null`.
2. `amtFrom`/`amtTo` **were agreed** by the team on 2026-08-14 but are **not present in the live
   response today**, re-confirmed by a fresh Bruno pull this same day (2026-08-24). This is a real
   ~6-week-old gap between an agreed contract and what shipped — either it's still on Dev's
   backlog, or the decision was quietly walked back and Bruno/the Story were never updated to
   reflect that.

**What we need:** (a) a definitive correction to TC-20 dropping the `transitCurrency` assertion,
(b) a ticket/ETA for `amtFrom`/`amtTo`, or an explicit BA call to drop them from the ACs entirely if
the June/July decision no longer holds. Until one of these lands, automating either TC means
asserting a field the live API doesn't return.

**Update 2026-08-25 — TC-22 resolved, item 2 is now half-closed:** the user clarified TC-22's
actual intent directly ("мы проверяем bounded band и ждём что всё пройдёт гладко") — the case only
needs the bounded-band resolution check, nothing about `amtFrom`/`amtTo`. The speculative
`not.toHaveProperty('amtFrom'/'amtTo')` canary asserts were removed from the existing test.
**TC-22 is closed.** TC-20 was already closed (deleted from the sheet, 2026-08-24). Item 2's
remaining open question — whether `amtFrom`/`amtTo` ship at all, per the 2026-08-14
`TB-2179/analysis.md` agreement — is now moot for *this* Story's TCs specifically, since neither
live TC asserts those fields anymore; it may still be worth chasing as a standalone contract
question if another consumer needs it.

Separately, the user asked (2026-08-25) whether `transitCurrency` — a valid optional *request*
field — should also appear in the *response* when supplied. Re-checked
`Currency Engine/opencollection.yml`'s "Response" table: still exactly the same 5 fields, still
explicitly "provisional." **Declined to add it** to `ResolveRateResponse` without a Currency
Engine team confirmation — a plausible guess doesn't outrank a documented contract, per
[[../../../feedback_justify-additions-before-making-them.md]].

---

## 5. TC-21 (`rateValue` precision independence from currency decimals)

**Sheet** — self-flagged as unresolved: *"OPEN Q-PRECISION: max scale -> @Mikalai."* This is not
this role's finding — the sheet itself already marks this TC as pending a BA answer.

**Story** architectural note: *"the calculated cross-rate is... held at 18-decimal `BigDecimal`
precision and rounded exactly once, at the final step, to the target currency's
`NO_OF_DECIMALS`."* (Note: this note is about the *triangulation intermediate*, not necessarily
about a directly-stored `RATE_VALUE` — TC-21's precondition, "a rate whose stored value has high
scale," is about the latter; the Story doesn't separately promise precision behavior for a plain
stored rate, only for the in-memory triangulation step. That distinction itself is worth putting to
the BA — TC-21 may be testing a guarantee the Story never actually made for this exact case.)

**Bruno field registry**, `CURRENCY.ORDER/proj-field-registry/Create RATE_VALUE field.yml`:
```
{
    "id": "RATE_VALUE",
    "title": "RATE.VALUE",
    "type": "RATE",
    "config": {},
    "origin": "CORE"
}
```
`config: {}` — **no scale/precision constraint is declared at the field-registry level at all.**
Combined with the fact that every live-verified Currency Engine response in Bruno shows `rateValue`
as a plain JSON number (e.g. `1.0850`, `1.5000`), and this branch's own `ResolveRateResponse` type
(`api/types/currency-engine.types.ts`) declares `rateValue: number` — a JSON/JS double, which
cannot losslessly round-trip 18-decimal `BigDecimal` values by construction.

**What we need:** Mikalai's answer on max scale, *plus* — regardless of that answer — a direct
confirmation of whether `rateValue` is serialized on the wire as a JSON number or a string. If it's
a number, this AC may be unsatisfiable as literally written (JS/JSON numeric precision tops out
around 15-17 significant decimal digits) and needs a Dev conversation before any test is written,
not just a "what's the max scale" answer.

---

## 6. TC-24 (no `LOCAL_CURRENCY` fallback when triangulation is not mandatory and no transit is set)

**Sheet** — self-flagged: *"p.19 clarification. OPEN Q: exact result when triangulation cannot run
(Rate Not Found / Base cannot be resolved?) -> @Mikalai."*

**Good news documented here:** unlike TC-11, this one needs **no new infrastructure** — the
default `COMPANY.MOCK` this entire suite already runs under matches the precondition exactly
(confirmed live via a 2026-08-21 DB read, recorded in the module-theory README:
`COMPANY.MOCK` has `MANDATORY_TRIANGULATION: false` and no `TRIANGULATION_CCY`/
`TRIANGULATION_CURRENCY` set on any of ~30 `COMPANY.liv` rows).

**What we need:** purely Mikalai's answer on the exact terminal error. The moment that lands, this
is a same-day write reusing 100% of existing helpers — flagging it here mainly so it isn't lost
in the noise of the harder items above.

---

## 7. TC-25 (SYSTEM.PARAMETER excluded from triangulation transit resolution)

**Sheet** — Precondition: *"A transit is defined in global `SYSTEM.PARAMETER` but NOT in `COMPANY`
table; no API transit."* ER: *"Engine does NOT read `SYSTEM.PARAMETER` for transit. Priority: API >
`COMPANY.TRIANGULATION_CCY` > conditional `LOCAL_CURRENCY`."* Cited source: *"p.19 clarification
(transit set ONLY in `COMPANY` table)."*

**Story** Alt 1, verbatim: *"no direct pair → resolve transit currency from (a) explicit API
param, (b) `COMPANY.TRIANGULATION_CCY` fallback `LOCAL_CURRENCY`, (c) global `SYSTEM.PARAMETER`
record."* — `SYSTEM.PARAMETER` is explicitly listed as the **third, legitimate** fallback level.

**This is a direct contradiction between two sources of truth for the same Story:** the Story's
own text (Alt 1) says the engine *should* read `SYSTEM.PARAMETER` as a last resort; TC-25 (citing
a separate "p.19 clarification," not the Story page itself) says it *never should*. This is not a
Bruno-vs-Story drift (this role's usual kind of finding) — it's a **Story-vs-TC** drift, i.e. two
QA-facing documents disagreeing with each other about the product's intended behavior.

**Additional operational risk, independent of the above:** `SYSTEM.PARAMETER` is a **global
singleton record** — `recordId: "SYSTEM"`, confirmed via Bruno's `01 SP INPUT - Valid Record.yml` —
one row per environment, not one per test/company. `DEFAULT_TRANSIT_CCY` is not populated in that
example, and (like `TRIANGULATION_CURRENCY`) no request anywhere in Bruno demonstrates setting it.
Mutating this record to test TC-25 would change fallback behavior for **every concurrently running
test** in the suite — a shared-mutable-global-state hazard on top of the open contract question.

**What we need:** BA reconciliation of the Story's Alt 1 against "p.19"'s clarification — which
one is current? Do not automate either direction by picking a side. If TC-25's reading wins, this
also needs an AQA Lead conversation about safely mutating a global singleton (serialize this test
away from the rest of the suite, or use an isolated environment) — a test-strategy question, not
just a data-setup one.

---

## 8. TC-26 (capped band routes to the next covering band)

**Sheet** — Precondition: *"Band 10,000-14,999 is **capped**; a higher band covers 15,000."* ER:
*"15,000 does NOT use the 10,000-14,999 band; it uses the higher band covering 15,000 (its
`amtFrom`/`amtTo` returned)."* Self-flagged: *"OPEN Q: explicit `AMT_TO` vs next-tier model ->
@Mikalai."*

**Story** BR (Banding Boundary), verbatim: *"Rates must be queried using the boundary rule:
`AMT_FROM <= Transaction Amount < Next_Tier_AMT_FROM`."* — this defines bands **only** by the next
tier's `AMT_FROM`; it never mentions an explicit upper-bound field on a band itself.

**Bruno, confirmed today, repo-wide search, exactly one hit and it's not what TC-26 needs:**
```
$ git ls-tree -r origin/main --name-only | grep -iE "AMT_TO|AMT_FROM"
collections/Tables/System Core/02 - Currency Seeding/04 - Create Currency Fields/25 Create AMT_FROM field.yml
collections/Tables/System Core/CURRENCY.ORDER/proj-field-registry/Create AMT_FROM field.yml
```
**No `AMT_TO` field exists anywhere in the schema.** A rate band has exactly one boundary,
`AMT_FROM`; "capping" a band with an explicit upper limit distinct from "the next tier's own
`AMT_FROM`" is not a field that can be populated today.

**What we need:** Mikalai's answer, which the sheet already asks for. If the answer is "next-tier
model only, no explicit cap" (which is what both the Story's BR text and the current schema
already imply), TC-26 is very likely **redundant with the already-automated TC-06** (which proves
exactly "an amount routes to the higher of two open-ended tiers") and should be merged/retired,
not automated as a second case. If the answer is "an explicit `AMT_TO` is coming," this is a
dev-not-yet-shipped blocker — **Not Automatable** until the field exists.

---

## 9. TC-28 (triangulated cross-rate preserves 18-decimal internal precision) — newly blocked 2026-08-25

**Not a design/authoring gap — a live-confirmed real defect.** This case was designed and
automated same-day (2026-08-25, per BA confirmation from Mikalai Yudzilevich on the
input/triangulation/output precision model). A live run of the automated test failed, but not at
the assertion — at its own **PRECONDITION**: staging the first order leg
(`CURRENCY.ORDER~MASTER INPUT`, `RATE_VALUE: "0.912345678901234567"`) against a currency created
with `NO_OF_DECIMALS: 18` returned

```
400 { "detail": "RATE_BANDS[0].RATE_VALUE - value must be a number with up to 9 decimal places (e.g. 3.14)" }
```

**Why this matters beyond this one test:** the team's own confirmed design (chat, 2026-08-24/25,
Mikalai Yudzilevich) is *"на входе — сколько знаков в справочнике валюты, столько и максимум"* —
input decimal scale should equal the currency's own `NO_OF_DECIMALS`. That claim was only ever
live-tested at `NO_OF_DECIMALS: 2` (the original bug repro); the `NO_OF_DECIMALS: 18` case was
never actually run before — Ilona Fralova's answer ("Должно быть так, да") was an expectation, not
a confirmed result. TC-28's run is the first real test of it, and it fails: the 9-decimal cap holds
regardless of the currency's configured scale.

**Ruled out as a test bug:** `createDedicatedCurrency`/`buildStandardCurrencyInputData`
(`currency-helper.ts` / `currency-payload-builder.ts`) correctly forward `overrides.NO_OF_DECIMALS`
into the `CURRENCY~MASTER INPUT` call — verified by reading both functions directly. `proj-bruno-api`
(`origin/main`, local checkout — network fetch unavailable this session, SSH timeout) shows
`RATE_VALUE`'s field-registry/schema entries (`x-type: RATE`, `x-config: {}`) carry no
scale/decimals override at all, consistent with a hardcoded platform-level cap rather than a
currency-driven one.

**Relation to [TB-3277](https://bank-proj.atlassian.net/browse/TB-3277) (Open):** same root cause,
opposite symptom. TB-3277's current description reproduces the *output* half (a 4-decimal
`RATE_VALUE` is *accepted* and *not rounded* on the way out, at `NO_OF_DECIMALS: 2-3`). This
finding is the *input* half (an 18-decimal `RATE_VALUE` is *rejected* even at `NO_OF_DECIMALS: 18`,
where per the confirmed design it should be accepted). Recommend adding this repro to TB-3277
rather than filing a second ticket — both symptoms trace back to "RATE_VALUE decimal handling is
independent of NO_OF_DECIMALS."

**What we need:** Dev to fix RATE_VALUE INPUT validation to key off the currency's own
`NO_OF_DECIMALS` (per the already-confirmed design), closing TB-3277. **Do not** weaken TC-28's own
test data (fewer decimals) to force a green result — that would stop proving the "18-decimal
precision" claim the case exists to verify, per
[[../../../feedback_escalate-dont-ship-mismatched-automation.md]]. TC-27 is unaffected (its leg
rates use `NO_OF_DECIMALS: 3`, well under the 9-decimal cap either way).

---

## One-page summary for the walkthrough

| # | TC(s) | Blocker type | Who needs to answer | One-line ask |
|---|---|---|---|---|
| 0 | TC-01 (Smoke) | Endpoint/response contract mismatch, same 3 questions open since 2026-08-21 (Viktoriya) + CURRENCY.RATES has no fast-seed path at all | Manual QA (Viktoriya) | Correct endpoint/response body; confirm MID vs ASK for the Smoke tier |
| 1 | TC-02 ~~, TC-03~~ | TC-02 automated 2026-08-24 (directional resolution). TC-03 confirmed **deleted** by the user 2026-08-25 — closed. | — | Closed. |
| 2 | TC-20 ~~, TC-22~~ | TC-20 deleted 2026-08-24. TC-22 **resolved 2026-08-25** — user clarified intent, no `amtFrom`/`amtTo` check needed; test now passes without asserting either field. | — | Closed. |
| 3 | TC-21 | Sheet's own open question, plus a possible JSON-number precision ceiling | BA (Mikalai) + Dev | Max scale answer, and confirm wire format (number vs string) |
| 4 | TC-24 | Sheet's own open question only — zero infra blockers | BA (Mikalai) | Exact terminal error for "triangulation impossible" |
| 5 | TC-25 | Story (Alt 1) directly contradicts the TC's own cited "p.19 clarification" | BA | Which is current — Story's 3-level chain, or "never read SYSTEM.PARAMETER"? |
| 6 | TC-26 | No `AMT_TO` field exists; sheet's own open question | BA (Mikalai) + Dev | Next-tier-only vs explicit cap — and if the latter, when does the field ship? |
| 9 | TC-28 | Live-confirmed real defect (TB-3277) — RATE_VALUE INPUT hardcoded to 9 decimals regardless of the currency's own NO_OF_DECIMALS | Dev | Fix TB-3277; re-run TC-28 unchanged once fixed |

**All remaining open items are BA/Dev decisions or a confirmed Dev defect, not engineering gaps.**
TC-11 (the one item previously listed here as "just infrastructure") turned out to be fully
buildable once Bruno was checked correctly — see the corrected section above — and is now
automated. Everything left requires either an actual answer the sheet/Story/a prior team chat has
already flagged as unresolved, or (TC-28) a Dev fix to a defect this session live-confirmed; none
of it should be guessed or worked around in the test.

---

## Team walkthrough resolutions (2026-08-24, updated 2026-08-25)

| # | TC(s) | Resolution | Status |
|---|---|---|---|
| 0 | TC-01 | Sheet corrected to the real POST contract, now checks BID/ASK/MID; TC-19 deleted as a duplicate of it | **Automated** — `currency-smoke.spec.ts`, US-01.13.03 describe (first slow/pipeline test in that file) |
| 1 | TC-02 | Real behavior is directional, not "override wins over payload/rank": explicit pair resolves only in its stored order; reversed pair is 404 | **Automated** — `currency-regression.spec.ts` |
| 1 | TC-03 | **2026-08-25: user confirmed it was deleted from the sheet.** | **Closed** — was never automated, no action needed |
| 2 | TC-20 | Deleted from the sheet outright | **Removed** — matching automated test deleted, no longer traceable to a case |
| 2 | TC-22 | **2026-08-25: user clarified the intent directly** — the case only needs the bounded-band resolution check, nothing about `amtFrom`/`amtTo`. Removed the two speculative "field not returned yet" canary asserts from the existing test and renamed it. | **Automated / resolved** — no longer open |
| 3 | TC-21 | Team confirmed no open question remains (store holds 18-decimal places). **2026-08-25: retargeted a 4th time** — a fresh sheet export's Steps literally hit the Currency Engine's resolve endpoint ("Inspect rateValue in the response"), so the test now verifies through `resolveRate()`'s raw response text instead of `CURRENCY.ORDER` `SEE`. | **Automated** — asserts against raw response text, not `JSON.parse`+number equality (a plain JSON number can't distinguish `0.95` from `0.950`, needed for the padding sub-case) |
| 4 | TC-24 | Team: automate now, decide sheet-update vs. BA-escalation after seeing the actual result | **Automated as a discovery test** — asserts 404 + "Rate Not Found" (matches sibling TC-12's pattern); user will run it and decide |
| 5 | TC-25 | User did not see the contradiction when first asked. **2026-08-25: user says they've now asked the question directly.** | **Still open** — awaiting the answer on which source wins, Story's Alt 1 (3-level fallback incl. `SYSTEM.PARAMETER`) or TC-25's cited "p.19 clarification" (never read it). |
| 6 | TC-26 | Deleted from the sheet | **Removed** — was never automated, no action needed |
| 9 | TC-09 | **2026-08-25: user's own decision** — both rateType sub-steps (ASK, BID) now assert `404` (previously mismatched 404/400 against each other and against the sheet's `422`). | **Automated** — status decision made by the user directly, not guessed; sheet's `422` still not live |
| 15 | TC-15 | **2026-08-25: user agrees the current `500` expectation looks wrong**, will ask BA directly. | **Still open** — left unchanged pending that answer |
| — | `transitCurrency` in resolve response | **2026-08-25:** user asked if it should appear in the response since it's a valid request field. Contract (`opencollection.yml`) documents exactly 5 response fields, calls the shape "provisional." | **Declined** — not added without a Currency Engine team confirmation |
| 29 | TC-29 (new) | The sheet's unnumbered "MANDATORY_TRIANGULATION=YES bypasses direct rate" row (XAF example), numbered TC-29 by the user, 2026-08-25. | **Automated** — `currency-regression.spec.ts`; direct rate + both triangulation legs staged together, proves the mandatory-triangulation path wins over an existing direct rate |
| 28 | TC-28 | **2026-08-25, later same day — live run failed at PRECONDITION** with a real, confirmed defect (see item 9 above, [TB-3277](https://bank-proj.atlassian.net/browse/TB-3277)). Test design itself is correct and BA-confirmed; not weakening the test to hide the defect. | **Blocked, not Automated** — pending Dev fix to TB-3277 |

Current automated count for US-01.13.03: 18 in `currency-regression.spec.ts` (TC-02, 04, 06, 07,
08, 09, 10, 11, 12, 15, 16, 21, 22, 24, 26, 27, 29) + 1 in `currency-smoke.spec.ts` (TC-01) =
**19**. TC-28 is written but **Blocked** (not counted as Automated) pending TB-3277. Remaining
open: TC-15 (500 vs 404, pending BA), TC-25 (Story-vs-TC contradiction, pending BA), TC-28 (pending
Dev fix to TB-3277). Everything else from the original 9-item blocker list is now closed or
automated.
