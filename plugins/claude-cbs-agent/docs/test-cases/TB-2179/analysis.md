Status: Draft
Related Ticket: TB-2179
Related Epic: TB-8 | Currency Definition and Logic
Source Project: TB (bank-proj.atlassian.net) — spec/stories primarily on the `TB` Confluence space;
an older, less-detailed mirror of the Epic spec also exists on `innowise-group.atlassian.net`
(`CBSA` space) — see "Gaps & Conflicts Found", G0.
Owner: Manual QA

# Requirement Analysis: Test impl: Currency Definition and Logic - Smoke

## Ticket Summary

TB-2179 is a **Task** (label `AQA`, status **To Do**, due 2026-08-03 — already past due as of
today 2026-08-13, sitting in the active Sprint `TB-Team-3 Sprint-6`), parented directly under Epic
**TB-8 — "Currency Definition and Logic"**. Its description reads "Make the Smoke TC set
implementation" and links to two sources:

1. Spec: `EP-01.13 | Currency Definition and Logic` (Confluence, `TB` space, page `1485635602`,
   Status **Review**, v1.0, last modified 2026-08-10, author Andrei Sech).
2. Stories: `US-01.13 | User Stories` (Confluence, `TB` space, page `1484783640`) — a **container**
   page (body is only "Child Pages:") whose four children are analyzed as four separate modules
   below, per this command's own protocol for container pages.
3. "Link to TC:" — left **empty** in the ticket description. No test-case artifact (Allure, sheet,
   or otherwise) is linked from TB-2179 itself.

The ticket has no Acceptance Criteria field of its own, no comments, no subtasks, and no
`issuelinks`. TB-2179 is one of several sibling Tasks/Spikes under Epic TB-8 that split the
Currency Definition and Logic QA lifecycle; the others are named explicitly in "Gaps & Conflicts
Found" (G7) below, because they materially bound this ticket's own scope.

## Modules Touched

| # | Module (native title) | Jira Story | Confluence page | Status |
|---|---|---|---|---|
| 1 | `US-01.13.01 \| Static Currency & Market Configuration Registry` | TB-1987 (In review) | page `1529610247`, v1.2 | Registers `CURRENCY`, `COMPANY`, `CURRENCY.MARKET` |
| 2 | `US-01.13.02 \| Asynchronous Rate Order Staging, Validation, and Scheduling` | TB-1988 (In review) | page `1529872386`, v1.1 | `CURRENCY.ORDER` ingestion → `CURRENCY.RATES` |
| 3 | `US-01.13.03 \| Dynamic High-TPS Execution & Hierarchical Rate Resolution` | TB-1989 (In review) | page `1529872396`, v1.2 (per Change History; page header shows v1.1) | Pricing Engine rate lookup, triangulation |
| 4 | `US-01.13.04 \| Universal Mid-Rate Applicability & GL Revaluation` | TB-1990 (In review) | page `1543372808`, v1.1 | `MID`-rate access + COB/MTM revaluation |

All four Stories are still **In review** in Jira — none has reached a final/approved state as of
this analysis.

## Per-Module Analysis

### US-01.13.01 | Static Currency & Market Configuration Registry (page `1529610247`)

**User Story:** AS A Core Banking System Administrator, WANT TO define the foundational dictionary
of global currencies, establish company-specific parameters and set up distinct trading market
channels, SO THAT the core banking system acts as a centralized, mathematically reliable source of
truth for rounding rules, multi-tenant ledger isolation and rate applicability before any live
trading or automated integration begins.

#### Business Flows

1. Administrator creates a new `CURRENCY` record: `ID` (3-letter alpha code, e.g. `USD`), `NUMERIC_CODE`,
   `NO_OF_DECIMALS`, `INTEREST_DAY_BASIS`, `DECIMALS_NAME`, optional `PRECIOUS_METAL` flag.
2. Administrator sets `BASE_CCY_RANK` on the currency (fallback priority for Base/Quote resolution).
3. Administrator sets `QUOTATION_CODE` for low-value currencies (mathematically the exponent *n* in 10ⁿ).
4. System validates `ID` uniqueness and saves to `CURRENCY`.
5. Administrator configures the operational `COMPANY` entity: `COMPANY.ID`, `LOCAL_CURRENCY` (linked
   to `CURRENCY`), `MANDATORY_TRIANGULATION` flag, `TRIANGULATION_CCY` (defaults to `LOCAL_CURRENCY`
   if blank).
6. System validates and commits the `COMPANY` record.
7. Administrator defines a `CURRENCY.MARKET` channel: `ID` (1–99), multi-language `DESCRIPTION`,
   `DIFF_UNIT`, `DIFF_AMT` boolean flags.
8. System commits the market configuration.

#### Business Rules (BR) — quoted verbatim

- **BR (Market ID Limit):** "The system restricts the creation of currency markets to a maximum of
  99. Save is rejected: **'Market ID must be between 1 and 99'**." Target field: `CURRENCY.MARKET.ID`.
- **BR (Quotation Logic):** "The `QUOTATION_CODE` must format the quotation mathematically as *n* in
  10ⁿ. Any input that is not a whole number representing the exponent is rejected: **'Invalid
  quotation format'**." Target field: `CURRENCY.QUOTATION_CODE`.
- **BR (Boolean Market Flags):** "Flags must be strictly boolean (TRUE/FALSE). Save is rejected:
  **'Invalid flag value. Please select True or False'**." Target fields: `DIFF_UNIT`, `DIFF_AMT`.
- **BR (Base Currency Rank Fallback):** "Must be a unique numeric value. It acts strictly as a
  'System Fallback'. Duplicate ranks among active currencies are rejected: **'Base currency rank
  must be unique'**." Target field: `BASE_CCY_RANK`.
- **BR (Mandatory Triangulation Consistency):** "If `MANDATORY_TRIANGULATION` is set to `YES`, a
  valid `TRIANGULATION_CCY` must be linked. Save is rejected: **'Mandatory triangulation requires a
  valid triangulation currency link.'**" Target fields: `MANDATORY_TRIANGULATION`, `TRIANGULATION_CCY`.

#### Alternative Flows (ALT)

- **Alt 1 (Market Limit Exceeded):** Administrator attempts Market ID ≥ 100 → system rejects the save.
- **Alt 2 (Modification of Active Decimals):** Once a currency is saved and referenced in any dynamic
  transaction/active rate table, any attempt to change `NO_OF_DECIMALS` is rejected (immutability,
  to protect historical ledger/accounting).

#### Acceptance Criteria (AC) — quoted verbatim

| AC | Description |
|---|---|
| 1 | GIVEN an administrator is setting up the US Dollar WHEN they input ID `USD`, NUMERIC_CODE `840`, NO_OF_DECIMALS `2`, day-basis `A` THEN the system successfully saves the record in `CURRENCY`, making it available globally. |
| 2 | GIVEN JPY is being registered as a low-value currency WHEN administrator assigns `QUOTATION_CODE` `2` (10²=100 units) THEN the system saves and applies mathematical block logic downstream, so 50,000 JPY at 0.75 USD/JPY yields exactly (50,000/100)×0.75=375 USD. |
| 3 | GIVEN administrator configures a new retail market channel WHEN they attempt Market ID `100` THEN the system blocks creation with "Market ID must be between 1 and 99". |
| 4 | GIVEN a valid market configuration (Market ID `10`) WHEN administrator sets `DIFF_UNIT`/`DIFF_AMT` to `TRUE` THEN the system saves and enables branch/volume-tiered rate ingestion for this market in `CURRENCY.RATES`. |
| 5 | GIVEN administrator defines a currency's global profile WHEN they input `BASE_CCY_RANK` THEN the system saves it as a pure system-fallback mechanism for Base/Quote resolution. |
| 6 | GIVEN administrator sets up the Cameroon subsidiary WHEN they link local currency `XAF`, set `MANDATORY_TRIANGULATION` `YES`, and `TRIANGULATION_CCY` `XAF` THEN the system registers the company metadata, enabling strict regulatory triangulation routing. |

### US-01.13.02 | Asynchronous Rate Order Staging, Validation, and Scheduling (page `1529872386`)

**User Story:** AS AN Integration Adapter (middleware/gateway on the ESB), I WANT TO map, enrich,
and asynchronously submit bulk currency exchange rates via a single, nested JSON payload
(`CURRENCY.ORDER`) associated with a single currency pair, SO THAT CBS can atomically validate,
schedule, and unpack these rates for live trading without database lockups.

#### Business Flows

1. Integration Adapter receives raw exchange-rate feeds (Bloomberg, Reuters, Central Bank).
2. Adapter maps the feed into CBS schema: `CCY_MKT`, target `UNIT`, `CCY_BASE`/`CCY_QUOTE`,
   `SOURCE_SYSTEM`, and bundles multiple `RATE_TYPE`/`AMT_FROM` tiers into one nested array for
   exactly ONE currency pair.
3. Adapter submits the payload to `CURRENCY.ORDER`; System stages it with `STATUS = NEW`.
4. Background daemon (1-minute poll) validates `SOURCE_SYSTEM` traceability and the
   `START_DATETIME` Time-Lag constraint.
5. Daemon evaluates `UNIT_INCLUDE`; if `TRUE`, resolves descendant Business Units.
6. Daemon flattens the nested array under an ACID transaction, replicating for descendant units if
   `UNIT_INCLUDE` is set, and writes to `CURRENCY.RATES` under key `MM.UUUUUUU.BBB.SSS`
   (Market.BusinessUnit.BaseCurrency.QuoteCurrency); sets `CURRENCY.ORDER.STATUS = PROCESSED`.
7. Daemon purges expired `CURRENCY.RATES` whose `END_DATETIME` has passed.

#### Business Rules (BR) — quoted verbatim

- **BR (Atomic Save/ACID):** "Any validation failure within any nested tier discards the entire
  `CURRENCY.ORDER`. Status is set to `ERROR`, live rates are unchanged."
- **BR (Explicit Rate Typology):** "Every rate must be explicitly labeled as `BID`, `ASK`, or `MID`.
  Ingestion of independent types ... is valid, but auto-spread calculation is strictly prohibited."
- **BR (Source Tracking):** "Payload must include a valid `SOURCE_SYSTEM`. Missing/untraceable
  source results in rejection: **'Untraceable rate feed ignored'**."
- **BR (Validation Time-Lag):** "Evaluates: `Current_Time + Time_Lag_Buffer > START_DATETIME`. If
  true, the order is rejected: **'START_DATETIME violates the configured execution lag buffer'**."
- **BR (Staged In-Flight Cancellation):** "An administrator can update the status of an order to
  `CANCELLED` strictly while it is in `NEW` state. Once processed (`PROCESSED` or `ERROR`), manual
  cancellation is blocked."

#### Alternative Flows (ALT)

- **Alt 1 (Partial Data Failure – ACID Rollback):** one invalid nested tier → whole order rejected
  (`ERROR`), `CURRENCY.RATES` untouched.
- **Alt 2 (Superseding Active Rates):** a new valid order for the same market/unit/pair with
  overlapping dates overwrites the existing active rates.

#### Acceptance Criteria (AC) — quoted verbatim

| AC | Description |
|---|---|
| 1 | GIVEN Adapter submits a valid `USD/EUR` payload with 3 amount bands WHEN daemon polls THEN flattens into a single composite PK (`MM.UUUUUUU.USD.EUR`) with all three tiers in `CURRENCY.RATES`. |
| 2 | GIVEN inbound order with `UNIT_INCLUDE=TRUE` WHEN daemon processes THEN rates propagate to parent + all child `BUSINESS.UNIT` branches. |
| 3 | GIVEN a staged rate with `START_DATETIME` tomorrow 08:00 WHEN daemon polls today THEN rate stays `NEW` in `CURRENCY.ORDER`, not active until 08:00. |
| 4 | GIVEN an active rate with `END_DATETIME` 17:00 WHEN daemon processes at 17:01 THEN it purges the expired rate immediately. |
| 5 | GIVEN a nested payload where one tier has a corrupted currency code WHEN daemon unpacks THEN transaction fails, order rejected (`ERROR`), live rates untouched. |
| 6 | GIVEN Adapter submits a daily Central Bank rate with ONLY `MID` WHEN daemon processes THEN it validates/stages successfully, proving all three types aren't required simultaneously. |
| 7 | GIVEN a 5-minute time-lag buffer WHEN an order's `START_DATETIME` is only 2 minutes out (or past) THEN system rejects with "START_DATETIME violates the configured execution lag buffer". |
| 8 | GIVEN a `NEW` order WHEN administrator cancels before execution THEN status → `CANCELLED`, daemon ignores it. |

### US-01.13.03 | Dynamic High-TPS Execution & Hierarchical Rate Resolution (page `1529872396`)

**User Story:** AS A Core Execution Module (Funds Transfer, Treasury/FX, Teller), I WANT TO
dynamically query currency exchange rates from the live cache with real-time fallback resolution
across Business Unit hierarchies and synthetic triangulation paths, SO THAT I can execute high-TPS
cross-currency operations with absolute mathematical precision, in strict compliance with sovereign
exchange control regulations.

**Architectural note (quoted):** triangulation is transient/in-memory only, never persisted; the
intermediate converted amount is held at **18-decimal (BigDecimal) precision** and rounded strictly
once, at the final step, to the target currency's native scale.

#### Business Flows

1. Actor requests a conversion: `Market ID`, `Business Unit ID`, `CCY_BASE`, `CCY_QUOTE`, `Amount`,
   `RATE_TYPE`.
2. System links the requesting Business Unit to its `COMPANY` record.
3. System verifies `MANDATORY_TRIANGULATION = NO`.
4. System resolves Base/Quote via the hierarchy: (1) Explicit API Override, (2) Transaction Payload
   `BASE_CURRENCY`, (3) `BASE_CCY_RANK` fallback (lowest rank wins).
5. System builds key `MM.UUUUUUU.BBB.SSS` and queries `CURRENCY.RATES` for a direct match.
6. System filters strictly to the requested `RATE_TYPE` — no auto-spread.
7. System selects the `AMT_FROM` band where `AMT_FROM ≤ Amount < next tier`.
8. System returns the raw `RATE_VALUE`.

#### Business Rules (BR) — quoted verbatim

- **BR (Base vs. Quote Resolution):** "If the base currency cannot be resolved via API, payload, or
  fallback rank, the transaction is aborted: **'Base currency cannot be resolved'**."
- **BR (No Auto-Spread):** "If only MID is present when BID/ASK is requested (or vice versa), the
  lookup fails: **'Requested Rate Type missing. Spread auto-calculation is prohibited.'**"
- **BR (Transit Currency Restriction):** "Under no circumstances shall `BASE_CCY_RANK` be evaluated
  to resolve a transit currency for triangulation."
- **BR (Banding Boundary):** "Rates must be queried using the boundary rule: `AMT_FROM ≤ Transaction
  Amount < Next_Tier_AMT_FROM`. If no matching band covers the amount, lookup fails."
- **BR (Read-Only Lock Isolation):** "Execution of rate queries (including dynamic triangulation) is
  strictly read-only and must not generate lock states or insert records."

#### Alternative Flows (ALT)

- **Alt 1 (Triangulation Routing – Memory Only):** no direct pair → resolve transit currency from
  (a) explicit API param, (b) `COMPANY.TRIANGULATION_CCY` fallback `LOCAL_CURRENCY`, (c) global
  `SYSTEM.PARAMETER` record; `BASE_CCY_RANK` is explicitly never used for transit selection;
  intermediate held at 18-decimal precision; result never persisted.
- **Alt 2 (Mandatory Regulatory Triangulation Bypass):** `MANDATORY_TRIANGULATION = YES` →
  system ignores any existing direct cross-rate and forces a two-step triangulation through
  `TRIANGULATION_CURRENCY`, rounding once at the end.
- **Alt 3 (Business Unit Fallback – Recursive Search):** no rate at the requested branch → walk up
  the `BUSINESS.UNIT` hierarchy to the nearest active parent rate; if none found anywhere, abort
  with "Rate Not Found".
- **Alt 4 (Missing Explicit Rate Type):** requested `BID`, table holds only `MID` → reject: "Requested
  Rate Type missing. Spread auto-calculation is prohibited."

#### Acceptance Criteria (AC) — quoted verbatim

| AC | Description |
|---|---|
| 1 | GIVEN a Treasury deal explicitly states `BASE_CURRENCY=EUR`/`Quote=USD` WHEN processed THEN system overrides ranking fallback and retrieves `EUR/USD` directly. |
| 2 | GIVEN a frontend request omits base currency for `GBP`/`JPY` WHEN evaluated THEN system compares `BASE_CCY_RANK` and designates the lowest-rank currency as base. |
| 3 | GIVEN a `KES→JPY` request with no direct pair and no transit specified WHEN processed THEN system uses the Business Unit's default transit (e.g. `USD`), triangulates in-memory, returns the rate, persists nothing. |
| 4 | GIVEN `AMT_FROM` bands at `0` and `10,000` WHEN a `15,000` USD transfer is requested THEN system selects the `10,000` tier. |
| 5 | GIVEN `RATE_TYPE=ASK` requested WHEN only `MID` exists THEN system rejects: "Requested Rate Type missing. Spread auto-calculation is prohibited." |
| 6 | GIVEN no direct rate for `MM.BR-NORTH-01.USD.EUR` WHEN queried THEN system recursively walks `BR-NORTH` → `Head Office` and returns the nearest available rate. |
| 7 | GIVEN no rate at branch, parent, or Head Office WHEN the recursive search completes THEN lookup aborts with "Rate Not Found". |
| 8 | GIVEN company `US0010001` has `MANDATORY_TRIANGULATION=YES`, `TRIANGULATION_CURRENCY=XAF`, and direct `USD/EUR`, `USD/XAF`, `EUR/XAF` rates all exist WHEN converting 10,000 USD→EUR THEN system bypasses the direct rate, triangulates USD→XAF→EUR (18-decimal intermediate), rounds once to 2 decimals. |
| 9 | GIVEN `MANDATORY_TRIANGULATION=NO` and no `KES/JPY` rate WHEN no transit specified THEN system uses the Business Unit's default transit, triangulates, returns the rate, persists nothing. |

### US-01.13.04 | Universal Mid-Rate Applicability & GL Revaluation (page `1543372808`)

**User Story:** AS A Core Execution Module (Front-Office Teller) or the Accounting Engine (EP-06),
I WANT TO access and utilize the pure `MID` exchange rate without legacy isolation constraints, SO
THAT I can process standard non-commercial transactions at official rates, and accurately execute
daily Mark-to-Market (MTM) revaluations into the company's `LOCAL_CURRENCY` during COB.

#### Business Flows

1. Accounting Engine (EP-06) starts the daily COB revaluation routine.
2. System queries the Pricing Engine for `RATE_TYPE=MID` at the designated accounting market
   (e.g. Market 1) for the company.
3. System retrieves the company's `LOCAL_CURRENCY` from `COMPANY`.
4. System retrieves the explicit `MID` rate from `CURRENCY.RATES` — no spread/margin calculation.
5. Accounting Engine executes the MTM revaluation into `LOCAL_CURRENCY`.
6. (Alternate actor) Front-office Teller requests a standard client transaction at the official
   rate.
7. System returns the `MID` rate directly, bypassing any legacy "accounting-only" isolation.

#### Business Rules (BR) — quoted verbatim

- **BR (Universal MID Access):** "The Pricing Engine must grant `MID` rate access to all authorized
  front-office and back-office modules. Legacy system constraints that restricted MID strictly to
  accounting queries are completely removed."
- **BR (Revaluation Isolation):** "The Posting Engine (`EP-06.01`) must exclusively depend on the
  active `MID` rate of the designated accounting market (usually Market 1) for daily MTM
  calculations. It cannot fallback to `BID` or `ASK`."
- **BR (Explicit MID Value):** "The `MID` rate must be retrieved strictly as an explicit value
  ingested from `CURRENCY.ORDER`. The system is prohibited from calculating a synthetic MID rate by
  halving the spread between BID and ASK. If missing, the lookup fails."

#### Alternative Flows (ALT)

- **Alt 1 (Missing MID Rate for Accounting):** explicit `MID` missing during COB → system is
  strictly prohibited from synthesizing it from BID/ASK; MTM halted for that pair; exception flagged
  to Treasury; daily COB run blocked for the affected ledger until a valid rate is ingested.

#### Acceptance Criteria (AC) — quoted verbatim

| AC | Description |
|---|---|
| 1 | GIVEN a Teller module queries `RATE_TYPE=MID` for official-rate processing THEN system returns the exact explicit `MID` rate, proving legacy accounting-only isolation is removed. |
| 2 | GIVEN the Posting Engine (EP-06.01) runs daily COB THEN it exclusively fetches `MID` from the accounting market (e.g. Market 1) and revalues into `LOCAL_CURRENCY`. |
| 3 | GIVEN a module requests `MID` for a pair WHEN it was never explicitly staged THEN system returns "Rate Not Found" and refuses to auto-calculate from BID/ASK. |
| 4 | GIVEN Accounting Engine runs daily COB and the required `MID` is missing THEN system blocks the MTM translation, flags a critical ledger exception to Treasury, and halts COB for that pair. |

## Gaps & Conflicts Found

- **G0 (Confluence source conflict — CBSA master vs. TB mirror, EP-01.13 only):** an older mirror of
  the Epic spec exists on `innowise-group.atlassian.net` (`CBSA` space, page `5071831124`,
  **Status: DONE**, v1.0, last modified 02.07.2026, same author Andrei Sech). It is **less complete**
  than the `TB`-space copy read above (page `1485635602`, Status **Review**, last modified
  2026-08-10): the CBSA page has no "Multi-Tenant Jurisdiction Isolation" objective, no `SYS-06`
  (Company-Level Multi-Tenant Triangulation), and its transit-currency fallback list has only **two**
  levels ("Explicit API Parameter" → "System Default") versus the TB page's **four** ("Explicit API
  Parameter" → "Company/Tenant Parameter (`TRIANGULATION_CCY` fallback to `LOCAL_CURRENCY`)" →
  "Global System Fallback (`DEFAULT_TRANSIT_CCY` in `SYSTEM.PARAMETER`)" → a fourth item struck
  through as removed). This is the **reverse** of the usual pattern for this engagement (CBSA is
  normally the BA-authored master that PKF/TB mirrors, sometimes lagging) — here the TB copy is
  materially ahead of the CBSA "DONE" copy. There is no CBSA-space equivalent of any of the four
  `US-01.13.0x` User Stories at all (search returned zero results) — the Story-level detail exists
  only on `TB`. Treated `TB`'s content as authoritative throughout this analysis since it is the
  newer, more detailed, and only source for the Stories — but this drift on the Epic page itself is
  worth a direct question to the author (see Open Questions, Q1).
- **G1 (Field-naming drift, Confluence vs. actual implementation — confirmed via a fresh pull of
  `proj-bruno-api`, commit current as of 2026-08-13):**
  - `BASE_CCY_RANK` (used throughout US-01.13.01/.03 and both EP-01.13 copies) is **not** the real
    field name. The implemented field is `CURRENCY.BASE_RANK` (`CURRENCY/proj-field-registry/Create
    BASE_RANK field.yml`; confirmed via Jira TB-2858, **Done**: "CURRENCY plugin: validate BASE_RANK
    uniqueness" — mandatory, amendable, unique-among-`LIV` currencies).
  - `TRIANGULATION_CCY` (used in US-01.13.01 AC 6 body text and US-01.13.03's Pre-Conditions/Alt 1
    prose) is **inconsistent even within the same Story** with `TRIANGULATION_CURRENCY` (used in
    EP-01.13 `SYS-06` and US-01.13.03's own AC 8). The real, implemented field is
    `COMPANY.TRIANGULATION_CURRENCY` (confirmed in the live `COMPANY` schema and via Jira TB-2859,
    **Done**: "COMPANY: add MANDATORY_TRIANGULATION and TRIANGULATION_CURRENCY, make LOCAL_CURRENCY
    mandatory"). `TRIANGULATION_CCY` does not exist anywhere in the schema.
  - `DEFAULT_TRANSIT_CCY` (EP-01.13 Assumptions) is likewise not the real name — the implemented
    field is `SYSTEM.PARAMETER.DEFAULT_TRANSIT_CURRENCY` (confirmed live + Jira TB-2861, **Done**).
  - The generic "`STATUS`" field on `CURRENCY.ORDER` (US-01.13.02) is actually named
    `CCY_ORDER_STATUS` in the schema — the four enum values (`NEW`/`PROCESSED`/`CANCELLED`/`ERROR`)
    themselves match the Story exactly.
  - Recommend the Business Analyst correct these four field names on the Confluence pages before
    Allure test cases are authored against them — otherwise every case citing the documented name
    will need a silent correction at automation time.
- **G2 (Confirmed missing implementation — CURRENCY.MARKET ID range, BR + Alt 1 + AC 3 of
  US-01.13.01):** no validation rule of any kind restricting `CURRENCY.MARKET`'s id to 1–99 exists
  anywhere in `proj-bruno-api` — the table-registry creation body carries no id-pattern constraint,
  and the table's `proj-table-template` folder contains **zero** rule files (unlike `CURRENCY`, which
  does have a `NUMERIC_CODE`-positive rule file). `CURRENCY.MARKET`'s own `recordId` in the sample
  Operations is a free-text label (`"INTERBANK"`), not a numeric id at all. AC 3/Alt 1's "Market ID
  must be between 1 and 99" rejection cannot currently be exercised against a real endpoint.
- **G3 (Confirmed missing implementation — Business Unit hierarchy, Alt 3 + AC 6/AC 7 of
  US-01.13.03; AC 2 of US-01.13.02):** no `BUSINESS.UNIT` table exists anywhere in `proj-bruno-api`.
  Jira **TB-2344** ("Resolve CURRENCY.RATE via arbitrary-depth parent Business Unit fallback in SEE
  pre-hook plugin", status **Ready for development**, not started) confirms this directly: its own
  description states "`BUSINESS.UNIT` ... does not exist yet, so this work also requires a stub for
  it," and explicitly flags an **undecided design question** — whether an exhausted hierarchy walk
  should report `hookOutcome: FAILED` or fall through to core `SEE`'s native 404 — meaning even AC
  7's exact "Rate Not Found" error shape is not yet fixed at the implementation level.
  **Confirmed 2026-08-14 (team Currency chat):** `BUSINESS.UNIT` is explicitly **M3** scope (Dima
  Bogoslovsky, answering Dmitry Kirzhanov's (a)/(b) questions directly: "a) M3"). For the current
  M2 scope, the team's own interim stance is to let a Business Unit lookup simply behave as if no
  rate was found ("Пока ничего, представим, что рейта не нашлось") rather than special-casing it —
  i.e. AC 7's plain "Rate Not Found" is the right target behavior for M2 even without the real
  hierarchy walk, not a blocker requiring a mock. Rate resolution is confirmed to always require
  all 4 key components (market, business unit, base, quote currency) — "either from transaction
  data or set programmatically" (Andrei Petkevich) — there is no code path where fewer than 4 are
  known.
- **G4 (Confirmed missing implementation — the CURRENCY.ORDER → CURRENCY.RATES daemon, Main Success
  Scenario steps 5–10 and AC 1/2/3/4/7/8 of US-01.13.02):** the background poller that flattens
  `CURRENCY.ORDER` into `CURRENCY.RATES`, activates rates at `START_DATETIME`, and purges them at
  `END_DATETIME` has **no implementation yet**. Jira **TB-2027** ("Implements scheduler + event
  pushing", status **To Do**) states explicitly: "What does not exist yet is the consumer side ...
  This is a new capability," and scopes exactly this table-to-table event-driven mechanism as its
  first concrete use case. This is the single largest blocker for TB-2179's own Smoke scope: none of
  US-01.13.02's activation/expiry/propagation ACs can be executed end-to-end against a live
  environment until TB-2027 ships.
- **G5 (In-flight, not yet merged, shape may still change):**
  - **TB-2489** ("CURRENCY.ORDER: add two projections — manual input (auth required) and bulk input
    (no auth)", **In Code Review**) will split the current single `CURRENCY.ORDER~MASTER` projection
    into two; Bruno currently only has the one projection. Any Smoke case authored today against
    `CURRENCY.ORDER~MASTER` will need re-pointing once this merges.
  - **TB-2901** ("Register proj-currency-engine in proj-devops deployment and library-update CI", **In
    Code Review**) — the dedicated Pricing/Currency engine service (`proj-currency-engine`, created
    per **TB-2823**, Done) is not yet wired into a deployed environment. No Bruno request/response
    trace was found for a dedicated Pricing Engine query API distinct from the raw `CURRENCY.RATES`
    table `SEE` operation — US-01.13.03's Main Success Scenario (steps 1–9) may be describing an API
    surface not yet published anywhere this analysis could confirm (see Open Questions, Q4).
  - **TB-2934** ("Design investigation: urgent manual currency rate updates via CURRENCY.ORDER", **In
    progress**) is actively designing an "urgent manual rate update" path through `CURRENCY.ORDER`
    that has **no owning AC in any of the four Stories analyzed here** — a new alternate flow, not
    yet documented, in active design.
- **G6 (BRs/Alt Flows with no dedicated AC — untested-by-design gaps):**
  - US-01.13.01: BR "Boolean Market Flags" negative case (invalid non-boolean value), BR "Quotation
    Logic" negative case (non-integer exponent), BR "Base Currency Rank Fallback" negative case
    (duplicate rank — though this specific rule **is** independently E2E-tested in `proj-bruno-api`
    per TB-2858, just not cited as an AC on this Story's own page), BR "Mandatory Triangulation
    Consistency" negative case (`YES` without a linked currency — likewise independently covered in
    Bruno per TB-2859's own operations, but absent from this Story's AC table), and Alt 2
    ("Modification of Active Decimals" rejected once referenced) all have no corresponding AC on the
    Story page itself.
  - US-01.13.02: BR "Staged In-Flight Cancellation" negative case (attempting to cancel an order
    already `PROCESSED`/`ERROR`) and Alt 2 ("Superseding Active Rates") have no dedicated AC.
  - US-01.13.03: BR "Read-Only Lock Isolation" (proving a rate query, including triangulation,
    creates no lock/insert) has no dedicated AC — this is a meaningful behavioral guarantee with zero
    AC-level proof today.
  - US-01.13.03: the third level of the transit-currency fallback (global `SYSTEM.PARAMETER.
    DEFAULT_TRANSIT_CURRENCY`, used only when neither an explicit API param nor a Company-level
    `TRIANGULATION_CURRENCY`/`LOCAL_CURRENCY` is available) has no dedicated AC — AC 3/AC 9 both
    test only the Company/Business-Unit-level fallback (level 2), never the global-parameter level.
- **G7 (Sibling QA-lifecycle tickets under Epic TB-8 that bound this ticket's own scope):** TB-2179
  is explicitly scoped to **Smoke** implementation only. Sibling tickets under the same Epic include
  **TB-2184** "Test-design: EP-01.13 | Currency Definition and Logic" (Spike, In progress, no
  description yet) and **TB-2185** "Feature testing: Currency Definition and Logic" (Story, Open, no
  description yet) — these appear to be where broader (non-Smoke) test design/coverage for this Epic
  is intended to live, but neither has any content yet to confirm the split. TB-1480 ("BA Analysis:
  Currency Definition and Logic", Spike, In review) and TB-996 ("TA: EP-01.13", Spike, In progress)
  are the underlying BA/Technical-Analysis spikes and are themselves still open — meaning the
  requirement/technical baseline this analysis extracted could still change before TB-2179 executes.

- **G8 (New — `CB_SPREAD` on `CURRENCY.MARKET` contradicts a later BA decision, inverse of
  G1–G4):** `proj-bruno-api` already has a `CB_SPREAD` field registered on `CURRENCY.MARKET` and an
  E2E test enforcing it as mandatory (`CURRENCY.MARKET/proj-table-template/Operations/INPUT - Reject
  Missing CB_SPREAD.yml`). But per the team's Currency chat (Ilona Fralova asking Andrei Petkevich,
  2026-07-27), Andrei Petkevich stated he would **not** introduce this field currently — he'd
  flagged it in FS review comments to Andrei Sech, who "hasn't gotten to processing the comments
  and issuing an updated spec version yet." Unlike G1–G4 (Bruno/code ahead of the Confluence Story
  text), this is the **opposite** drift: the implementation/Bruno collection is ahead of a BA
  decision that later walked the field back. Any Smoke/Feature case citing `CB_SPREAD` as mandatory
  on `CURRENCY.MARKET` should be flagged to Manual QA/BA for reconciliation before being written —
  don't trust the Bruno E2E test as authoritative here without re-confirming the FS was actually
  updated to drop or keep this field.

## Open Questions

- **Q1 (to Andrei Sech, author of both EP-01.13 copies):** Which `EP-01.13` page is authoritative —
  the `TB`-space copy (Review, materially more detailed) or the `CBSA`-space copy (marked **DONE**,
  but missing the Multi-Tenant/`SYS-06` content and the 4-level transit-currency fallback)? Should
  the CBSA copy be updated to match, or retired in favor of the TB copy? (See G0.)
- **Q2 (to the Business Analyst — TB-8's reporter, Dima Bogoslovsky, or Viktoryia Burak, assignee of
  TB-2184/TB-2185):** Please confirm/correct the four documented-vs-implemented field-name
  mismatches in G1 (`BASE_CCY_RANK`→`BASE_RANK`, `TRIANGULATION_CCY`→`TRIANGULATION_CURRENCY`,
  `DEFAULT_TRANSIT_CCY`→`DEFAULT_TRANSIT_CURRENCY`, generic `STATUS`→`CCY_ORDER_STATUS`) on the
  Confluence pages themselves.
- **Q3 (to the AQA Lead / Solution Architect):** Given G3/G4 (Business Unit hierarchy fallback and
  the `CURRENCY.ORDER`→`CURRENCY.RATES` daemon are both **not yet implemented**, per TB-2344 and
  TB-2027), which of US-01.13.02's and US-01.13.03's ACs are realistically executable as **Smoke**
  cases today, versus which should be deferred until those dependencies ship? Recommend explicitly
  marking AC 2/AC 6/AC 7 of US-01.13.03 and AC 1–4/7/8 of US-01.13.02 as blocked-pending-dev in the
  coverage matrix rather than writing Smoke cases that cannot pass in the current environment.
- **Q4 (to the Solution Architect, re: `proj-currency-engine`):** Is the Pricing Engine's own
  query API (US-01.13.03's Main Success Scenario, steps 1–9) published in `proj-bruno-api` or a
  separate collection? None was found under `System Core` — only the raw `CURRENCY.RATES` table
  `SEE` operation.
  **Partially resolved (2026-08-14, per the team's Currency chat, timestamps through "Yesterday"
  relative to that chat, i.e. essentially concurrent with this analysis):** a dedicated Pricing
  Engine rate-lookup API is being actively designed by Mikalai Yudzilevich/Artur Fonichkin/Dima
  Bogoslovsky — not yet published anywhere in `proj-bruno-api` as of this analysis. Agreed response
  shape: `{ base_currency, quote_currency, quotation_code, amount_from, amount_to, rate_value }`.
  The `amount_from`/`amount_to` pair is the deliberately-added "corridor" the requested amount fell
  into (justification: rate-grid transparency for showcase/no-amount queries, and explaining which
  volume tier produced the returned rate). Transit currency is explicitly **excluded** from the
  response by team decision (Dima Bogoslovsky: consumers "take the rate and move on"; visibility
  into which transit currency was used is logs-only, not an API field) — do not author a test case
  asserting a `transitCurrency`/similar field in this response. No caching at the FT/PF consumer
  side is planned; if introduced later it would live inside `proj-currency-engine` itself.
- **Q5 (to the Business Analyst, re: G7):** Is the split of Smoke (TB-2179) vs. broader Feature
  Testing (TB-2185) vs. Test-Design (TB-2184) coverage for this Epic already decided anywhere, so
  this analysis's "Required Test Types" can be scoped precisely instead of flagged as an assumption?
- **Q6 (to the Business Analyst, re: G6):** Should each BR/Alt Flow identified in G6 with no
  dedicated AC get one added to the Story pages themselves (several of these — duplicate
  `BASE_RANK`, `MANDATORY_TRIANGULATION` consistency — are already independently proven in
  `proj-bruno-api`'s own E2E suite per TB-2858/TB-2859, just never cited back to the Story's own AC
  table)?
- **Q7 (to the integrating team, re: TB-2934):** Should TB-2179's Smoke scope anticipate the
  "urgent manual currency rate update" flow under design in TB-2934, or is that explicitly out of
  scope until its own Story/AC exists?
  **Still open, but now concretely in-flight (2026-08-14, per the team's Currency chat):**
  Mikalai Yudzilevich's newest message in that chat (posted "3 min" before the chat export, i.e.
  effectively live) proposes the actual mechanism — an `Urgent` checkbox on `CURRENCY.ORDER`
  creation that, when set, drops the `START_DATETIME` requirement entirely so the order applies
  ASAP once authorized (working around the fixed authorization time-lag buffer that otherwise
  causes a "Groundhog Day" reject-resubmit loop when an authorizer misses the narrow window before
  the requested start time). This is explicitly pending Andrei Sech/Andrei Petkevich sign-off, not
  yet approved or documented on any Story page. Confirms the original recommendation: do not write
  a Smoke case for this flow yet.

## Required Test Types

Per the Test Type Selection Matrix (`manual-qa-agent.md`):

| Test Type | Triggering Signal |
|---|---|
| **API** | Every module is REST-driven against confirmed `proj-bruno-api` endpoints (`table-registry`/`tables`/`field-registry` INPUT/AUTH/SEE operations on `CURRENCY`, `CURRENCY.MARKET`, `CURRENCY.ORDER`, `CURRENCY.RATES`, `COMPANY`, `SYSTEM.PARAMETER`) — "New or changed REST endpoint" signal. |
| **Positive** | Every Story, no exception; each module has a documented happy-path AC. |
| **Negative** | Every Story, no exception; each module has documented rejection Business Rules — though several lack a dedicated AC today (see G6). |
| **Edge/Boundary** | US-01.13.01's Market-ID 1–99 boundary and `AMT_FROM` band boundaries in US-01.13.03 ("Business rule or domain invariant enforced" signal). |
| **Integration** | US-01.13.02's `CURRENCY.ORDER`→`CURRENCY.RATES` handoff, US-01.13.03's `COMPANY`↔`CURRENCY`↔`CURRENCY.RATES` triangulation and `BUSINESS.UNIT` hierarchy walk, US-01.13.04's dependency on the Accounting Engine (EP-06.01) — "Cross-entity or persistence side effect" signal. |
| **Regression** | US-01.13.01 makes `LOCAL_CURRENCY` mandatory and adds `MANDATORY_TRIANGULATION`/`TRIANGULATION_CURRENCY` to the existing `COMPANY` table (per TB-2859) — a behavior change to an entity other, already-shipped modules already create/consume; existing `COMPANY` creation flows elsewhere in the suite need regression coverage for the new mandatory fields. |
| **E2E** | US-01.13.01's 3-screen setup journey (Currency → Company → Market configuration) — "Multi-step or critical user-facing journey" signal. |
| **Smoke** | Currency Definition is foundational to all FX operations across the CBS platform — "Part of a core/critical business journey" signal, and is this ticket's own explicit scope. |

**Explicit scope note:** TB-2179's own title narrows this Task's execution to **Smoke** only. Per
the matrix's override rule, the Integration/Edge/Regression/E2E/full-Negative coverage the matrix
would otherwise require is not silently dropped here — it is flagged as a **risk pending
confirmation** (Open Question Q5) that it is owned by TB-2185 ("Feature testing") and/or TB-2184
("Test-design"), neither of which has content yet to confirm the split.

## Changelog

- **2026-08-13 — v1 created.** First run of `/execution:mqa-commands:mqa-review-story TB-2179`.
  Walked TB-2179 → Epic TB-8 → Confluence `EP-01.13` spec (TB space) and its `US-01.13` container,
  reading all four child Stories (US-01.13.01–.04) in full. Cross-checked the TB-space spec against
  an older CBSA-space mirror and found the TB copy materially ahead (G0). Verified the actual current
  field/endpoint contract against a freshly pulled `proj-bruno-api` (local checkout was 59 commits
  behind `origin/main`; fast-forwarded after confirming a clean working tree), surfacing four
  field-naming mismatches (G1) and three confirmed missing-implementation gaps: the
  `CURRENCY.MARKET` 1–99 rule (G2), the Business Unit hierarchy fallback — cross-checked against
  Jira TB-2344, Ready for development (G3) — and the `CURRENCY.ORDER`→`CURRENCY.RATES` daemon —
  cross-checked against Jira TB-2027, To Do (G4). Surveyed all 38 sibling issues under Epic TB-8 to
  identify in-flight work that will change the API surface (G5) and the QA-lifecycle sibling tickets
  that bound this ticket's own Smoke scope (G7). Verdict: **Needs clarification** (see Jira comment).
- **2026-08-14 — v2, chat-context reconciliation.** The user shared the full team Currency chat
  (Mikalai Yudzilevich, Dmitry Kirzhanov, Dima Bogoslovsky, Ilona Fralova, Artur Fonichkin, Andrei
  Sech, Andrei Petkevich SME) covering roughly 2026-07-01 through the live present. Resolved Q4
  (Pricing Engine response shape agreed, not yet published) and Q7 (TB-2934's "Urgent" checkbox
  mechanism is now concretely proposed, still pending sign-off) with citations. Corroborated G1's
  `BASE_CCY_RANK`→`BASE_RANK` rename directly at the source, plus confirmed `BASE_RANK` is mutable
  but must stay unique. Clarified G3: `BUSINESS.UNIT` is explicit M3 scope; M2's interim behavior
  for an unresolved BU lookup is a plain "Rate Not Found," not a special case. Added G8: `CB_SPREAD`
  on `CURRENCY.MARKET` is implemented in Bruno but was later walked back by the BA in FS review
  comments not yet reflected in the published spec — inverse-direction drift from G1–G4. Also
  surfaced (not yet folded into a numbered gap, tangential to TB-2179's own Smoke scope): a Bulk
  INPUT feature for `CURRENCY.ORDER` (Jira TB-2025) with a new dedicated
  `.../operations/INPUT/bulk` endpoint, `bulkAllowed` table-metadata flag, and
  `SYSTEM.PARAMETER.MAX_BULK_BATCH_SIZE`, all-or-nothing batch validation, no four-eyes AUTH for
  bulk/high-volume feeds; nested arrays-of-arrays are confirmed unsupported by
  `TableJsonSchemaValidator` ("nested groups are not allowed"), which is why `CURRENCY.ORDER`'s
  real shape is flat-per-pair rather than the originally-proposed `CURRENCY_PAIRS[].RATE_BANDS[]`
  nesting; and a `COMPANY` currency field for Lead Companies is in progress under Jira **TB-1447**
  (owner Ilona Fralova), separate from TB-2859's `TRIANGULATION_CURRENCY`/`LOCAL_CURRENCY` work.
  None of this affects the two already-automated Smoke cases (Allure id 1867 USD, id 1869 XAU
  precious-metal) — both remain correct against the confirmed `CURRENCY~MASTER` contract. The full
  raw chat text this update was drawn from now lives at
  `docs/test-cases/TB-2179/currency-team-chat-log.md` — a living, appendable archive covering the
  whole EP-01.13 module (not just this Task); append new pasted chat batches there first, then
  re-sync this file's Open Questions/Gaps/Changelog from it.
