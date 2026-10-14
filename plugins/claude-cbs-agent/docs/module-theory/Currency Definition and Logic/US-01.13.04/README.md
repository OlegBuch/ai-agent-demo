Story: US-01.13.04 (TB-1990) — part of the [Currency Definition and Logic](../INDEX.md) module.
Last updated: 2026-08-21

Read the module [INDEX.md](../INDEX.md) first for module-wide facts. This file covers only what's
specific to MID-rate access and GL/COB revaluation.

Confluence source (read in full): `bank-proj.atlassian.net`, pageId `1543372808`, "US-01.13.04 |
Universal Mid-Rate Applicability & GL Revaluation.", v1.1 (2026-08-10). **Note on the title
mismatch that caused confusion earlier in this session**: Jira's own `summary` field for TB-1990
currently reads "General Ledger Revaluation Rate Isolation" — a *different* title than this linked
Confluence page's actual title ("Universal Mid-Rate Applicability & GL Revaluation."). This is a
Jira/Confluence title drift on the ticket's own metadata, not a sign the story's scope shifted —
the linked Confluence page (the real source of truth per `getJiraIssueRemoteIssueLinks`) matches
what the user originally pasted, word for word close in places. Don't trust the Jira `summary`
field alone for this ticket; always open the linked page.

---

## Story text (full)

**AS A** Core Execution Module (e.g., Front-Office Teller) or the Accounting Engine (EP-06)
**I WANT TO** access and utilize the pure `MID` exchange rate without legacy isolation constraints
**SO THAT** I can process standard non-commercial transactions at official rates, and accurately
execute daily Mark-to-Market (MTM) revaluations of foreign currency assets and liabilities into
the company's `LOCAL_CURRENCY` during Close of Business (COB).

**Pre-conditions:** `CURRENCY.RATES` populated with explicit `MID` rates for the required pairs;
the designated accounting market (e.g., Market 1) active and populated; `COMPANY` records carry a
configured `LOCAL_CURRENCY`. **Access rule**: front-office execution modules and the Accounting
Engine (EP-06) must have internal system-integration permissions to query the Pricing Engine for
`MID` rates — again the literal, traceable source of the manual TC's precondition text.

**Happy path (7 steps) — two actors, two purposes, same rate:**
1–5. **Accounting Engine (EP-06)** runs the daily COB routine → queries `RATE_TYPE=MID` for the
designated accounting market + the calling company → resolves the company's `LOCAL_CURRENCY` →
retrieves the *explicit* `MID` rate (no spread/margin math) → executes the MTM revaluation,
translating FX Asset/Liability buckets into `LOCAL_CURRENCY`.
6–7. **Front-Office Teller** initiates a standard non-commercial transaction (e.g. an official
Central Bank rate exchange, no spread applicable) → system returns the `MID` rate directly,
**"bypassing legacy 'accounting-only' isolation rules."**

**Alt 1 — Missing MID rate for accounting:** if the Accounting Engine's COB run needs a `MID` rate
that isn't in `CURRENCY.RATES` for the accounting market: (1) the system is **strictly prohibited**
from synthesizing MID by averaging/halving `BID`/`ASK`; (2) the MTM revaluation for that pair
halts; (3) a Treasury exception is flagged and the **entire COB run for that ledger is blocked**
until a valid rate is ingested via a new `CURRENCY.ORDER`.

**Business rules:**
- **Universal MID Access** (`RATE_TYPE=MID`): the Pricing Engine must grant MID access to *all*
  authorized front-office and back-office modules — "legacy system constraints that restricted MID
  strictly to accounting queries are completely removed."
- **Revaluation Isolation**: the Posting Engine (EP-06.01) must *exclusively* depend on the active
  MID rate of the designated accounting market (usually Market 1) for daily MTM — it **cannot
  fall back to BID or ASK**. This is the "isolation" the story's title half-names — isolating the
  *source* of the revaluation rate to one specific market/type, not isolating *who* can call the
  endpoint (the opposite of the "universal access" half of the same title).
- **Explicit MID Value**: MID must be an explicit value ingested via `CURRENCY.ORDER`, never a
  synthetic BID/ASK average; if missing, the lookup fails (no silent fallback).

**4 Acceptance Criteria:**
1. Front-Office (Teller) queries `RATE_TYPE=MID` → gets the exact explicit MID rate, "proving that
   legacy accounting-only isolation restrictions are removed."
2. Posting Engine's daily COB routine exclusively fetches MID from the accounting market (e.g.
   Market 1) and revalues into `LOCAL_CURRENCY`.
3. MID requested but not explicitly staged → `"Rate Not Found"`, and the system **must not**
   auto-calculate MID from BID/ASK.
4. Accounting Engine's COB run, MID missing for an active FX position → MTM translation blocked,
   critical ledger exception flagged to the Treasury dashboard, COB halted for that pair until a
   valid rate is provided.

---

## Real implementation & what's actually testable

- **AC1 (the pasted manual TC's exact target) is genuinely testable, and simply — this session's
  earlier verdict that "front-office isn't a representable API dimension, therefore untestable"
  was too strong and has been corrected** (see [[project_currency-engine-contract-findings]]).
  There is no caller-identity/channel field anywhere in the Currency Engine's request schema
  (confirmed against `proj-bruno-api`'s `Currency Engine/opencollection.yml`) — and that absence
  *is* the proof AC1 asks for: since nothing in the contract distinguishes a "front-office" caller
  from an "accounting" one, a plain successful `rateType=MID` request already demonstrates there is
  no remaining isolation to violate. AC1 does not need (and cannot use) a distinct request
  parameter to prove itself.
- **AC2/AC4 (COB/Posting Engine revaluation) are a different system entirely** — not the Currency
  Engine's rate-lookup endpoint at all. The bank-proj Confluence page "Revaluation of accounts"
  (`pageId 5308545`, space `PC`) independently documents this as a real, distinct EOD batch
  process: pulls `Accounting.[FX rate type]` (a MID-type rate) from an internal `Exchange rate`
  entity, generates GL journal entries (Revaluation gain/loss) per account. **Neither current TC
  exercises this path**, and it isn't automatable via a Currency Engine API test regardless of how
  TC-01 is rewritten — it needs its own test against whatever service/table actually runs COB
  revaluation (EP-06, not EP-01.13's scope).
- **AC3 (no synthetic BID/ASK averaging)** is plausible given Bruno's documented error catalog
  (missing rate type or missing record both terminate in `404 Rate Not Found`, never a computed
  fallback) but has no dedicated Bruno test proving the engine *doesn't* silently average — worth a
  negative-path case once AC1 is settled.
- **Same endpoint/response-shape caveats as US-01.13.03 apply** — see that story's file and
  [[project_currency-engine-contract-findings]] for the full three-way contract disagreement
  (BA-illustrative GET spec / manual TC / real POST implementation).
- **Zero-setup happy path for AC1**: `market=1, businessUnit="USD", baseCurrency="USD",
  quoteCurrency="EUR", rateType="MID"` is the same already-seeded, live-verified 200 used for
  US-01.13.03's basic case — reusing it here isn't circular, since each test proves a different
  acceptance criterion (US-01.13.03's is about direct-pair resolution mechanics; US-01.13.04's AC1
  is about the *absence* of an accounting-only gate) even though the underlying HTTP call is
  identical. Differentiate in code via request mode (`baseCurrency`/`quoteCurrency` explicit pair
  for one, `currencies[]` array mode for the other) so the two tests aren't literal duplicates —
  both modes are independently Bruno-confirmed-200, so this isn't an invented distinction.

---

## Automation status

**Updated 2026-08-27 (superseding the "No allureCaseId(...) yet" note below).** Manual QA created
this Story's first 3 Allure cases on 2026-08-27 (ids `3229`/`3230`/`3231`, all `Draft`,
`Feature = "System Core"`, `Component = "Currency Definition and Logic"`, `Story = "Universal
Mid-Rate Applicability & GL Revaluation"`) — matching TC-01/TC-03/TC-05 below almost exactly by
name/scenario. `allureCaseId(...)` wired same day (`db569cb8`, "Added new allureCaseId"): TC-01 →
3229 (`currency-smoke.spec.ts`, test title "Front-Office retrieves the pure MID rate with no
legacy accounting-only isolation"; Allure's own case name is "Front-office retrieves pure MID
rate"), TC-03 → 3230 (`currency-regression.spec.ts`, test title "A pair with no MID staged
resolves as Rate Not Found, never auto-calculated"), TC-05 → 3231 (`currency-regression.spec.ts`,
test title "An explicit BID/ASK pair with no MID band is not resolved by halving the spread") —
both TC-03/TC-05 titles kept as-is per this repo's convention of not renaming to Allure's own
shorter case title. **3/3 of this
Story's current Allure cases now have an automated test** — confirmed via a full live re-fetch of
the Component (2026-08-27), no other case exists under this Story yet. `TC-N: ` prefixes stripped
from the three test names per this repo's own convention once linked.

**Prior note, 2026-08-26 (superseded above).** TC-01, TC-03, and TC-05 (pasted
directly by the user, not yet created in Allure) are now automated, reusing the existing
`CurrencyEngineApiClient.resolveRate` client/types 100% — no new client method, path, or type was
added. No `allureCaseId(...)` yet (inline-pasted mode); still needs `allure-create-test-case` to
formalize.

- **File split by `Type`, corrected same day.** All three were initially filed as one
  `test.describe` block in `currency-regression.spec.ts`. The user flagged that TC-01's own sheet
  row is `Type: Smoke` — this module already has a dedicated `currency-smoke.spec.ts` and every
  Smoke-typed case belongs there, per file-level convention. User confirmed TC-03/TC-05 are
  `Regression`. Fix: TC-01 moved into `currency-smoke.spec.ts`'s own new `US-01.13.04` describe
  block (own `checkerContext`/`checkerClient`/`producedRatesOrderIds`, reusing that file's outer
  `client`/`db`/`dbClient`); TC-03/TC-05 stayed in `currency-regression.spec.ts` under the original
  shared `beforeAll`/`afterAll` (TC-05 still needs `checkerClient` there). Generalized as a
  cross-module pattern in `docs/common-issues/test-data-and-assertions/smoke-case-filed-wrong-suite-file.md` — check every
  case's own `Type` before filing, don't inherit the ticket's dominant file.

- **TC-03 status-code decision.** The pasted TC text said `HTTP 422; "Rate Not Found"` for an
  unstaged MID pair, but the real endpoint returns `404` for this condition (confirmed via Bruno
  and the same pattern as this Story's sibling `US-01.13.03`'s TC-09/`allureCaseId(3150)`, which
  was itself corrected to `404` — see that file). Flagged to the user as a docs-vs-real-behavior
  mismatch per this repo's own contract-mismatch protocol; user explicitly chose `404`
  (recommended option) over the pasted-literal `422`. TC-03 asserts `404` + a `"Rate Not
  Found"`-containing body, mirroring the never-staged-pair pattern already used elsewhere in this
  file (e.g. the reversed-pair case in `allureCaseId(3145)`'s STEP 2).
- **TC-05 inherits a live, already-ticketed bug — [TB-3276](https://bank-proj.atlassian.net/browse/TB-3276).**
  TC-05 (BID+ASK staged, no MID band, requesting `rateType=MID`) is the exact mirror of
  `US-01.13.03`'s `allureCaseId(3150)` test (only MID staged, requesting `rateType=ASK`/`BID`) —
  same code path, same assertion shape: `404` + body containing `"Requested Rate Type missing.
  Spread auto-calculation is prohibited."`. Per `US-01.13.03/README.md`'s "Fifth live run,
  2026-08-26" section, `allureCaseId(3150)` is **currently failing live** because TB-3276 makes the
  engine return the generic `404 Rate Not Found` message instead of that specific one. TC-05 was
  written to assert the *documented/intended* message (matching its sibling test's existing
  convention in this same file), so **expect TC-05 to fail live for the same reason until TB-3276
  is fixed — this is the known bug reproducing again, not a new defect in TC-05 itself.**
- **TC-02 and TC-04** from the pasted sheet were not included in this batch — the user only pasted
  TC-01/TC-03/TC-05; per this repo's own "never invent scenarios beyond what the case describes"
  rule, no test was written for the skipped rows.

**Original 2026-08-21 note, kept for history:** *"Not automated as of 2026-08-21."* See
[[project_currency-engine-contract-findings]] for the step-4 gap analysis this file's findings fed
into at the time.
