# Currency Definition and Logic (EP-01.13 / TB-8) — Business Logic Overview

Plain-language explainer, not a technical fact sheet — read `INDEX.md` and the per-story
`README.md` files in this folder for schemas/incidents/automation status. Sources: `INDEX.md` and
`US-01.13.0{1..4}/README.md` in this folder (technical facts, incident history, Story-vs-
implementation discrepancies) + Confluence EP-01.13 (bank-proj, pageId 1485635602) and each story's
own dedicated page (pageId 1529610247 / 1529872386 / 1529872396 / 1543372808) — gathered and
reconciled 2026-08-26. If this drifts from `INDEX.md`/the story READMEs over time, trust those —
this file doesn't maintain its own currency guarantee.

---

## Why this module exists

**Currency Definition and Logic (EP-01.13)** is the bank's central "brain" for everything
currency- and rate-related (BIAN's *Currency Exchange* domain). Dozens of CBS modules (transfers,
deposits, accounting, treasury) need to know "how much is this in another currency" — if every
module decides rounding/rate/spread on its own, the bank ends up with desync, arbitrage gaps, and
accounting mismatches. This module centralizes that logic into one place: **a single currency
registry + a single rate-resolution engine** that every other module calls into.

### Legacy problems this module solves

| Legacy problem | What used to happen | How it's solved here |
|---|---|---|
| DB locking on rate updates | One shared table for static definitions and "hot" rates — a bulk rate update locks the whole table during active trading | Split: static data in `CURRENCY`, volatile time-stamped rates isolated in `CURRENCY.RATES` |
| Forced triangulation through local currency | Legacy always routes conversion through the bank's own currency → micro-penny rounding errors on cross-currency pairs | Direct BASE/QUOTE pairs in `CURRENCY.RATES`; triangulation is only a fallback when no direct pair exists |
| One price for every branch | Same rate applied to HQ and a small branch — kills profitability | `BUSINESS_UNIT` is part of the rate key, can be overridden per subdivision |
| Auto-calculated spread (bid/ask from mid) | Deriving buy/sell from mid+spread compounds inaccuracies | Rates are ingested explicitly and separately: `BID`/`ASK`/`MID` — auto-spread calculation is deliberately prohibited |
| Rigid volume-based pricing | Hard to offer a better rate for large volume | `AMT_FROM` — rate is natively tied to amount tiers/bands |
| Distortions on "cheap" currencies (JPY, IDR) | Floating-point breaks down when quoting low-denomination currencies against high-value ones | `QUOTATION_CODE` — an explicit multiplier (rate per 100/1000 units), not "per unit" |
| Rigid sovereign peg compliance | Multi-country rollout (BEAC/BCEAO hard-pegged to EUR, BCC with a floating middle) needs different regulatory logic per country | Triangulation and "home" currency are configured at the company (tenant) level, not globally |

Business value: a mathematically reliable, regulatory-compliant, high-performance rate engine —
with pricing flexibility (channel/volume/branch) and hard accuracy guarantees for accounting.

## Architecture: 4 tables + a dedicated service

- **`CURRENCY`** — static global currency registry.
- **`CURRENCY.MARKET`** — up to 99 pricing "channels" (Market 1 = interbank, Market 10 = cash,
  ...) — defines whether a channel is allowed to differentiate by business unit / amount.
- **`CURRENCY.ORDER`** — the intake gateway: bulk rates from external sources
  (Reuters/Bloomberg/treasury) land here, get validated asynchronously, and are unpacked into the
  live table.
- **`CURRENCY.RATES`** — the live, read-only cache of active rates.
- **`COMPANY`** — not part of the currency domain itself, but critical: tenant-level settings
  (local currency, whether triangulation is mandatory, and through which currency).
- **Currency Engine** (`proj-currency-engine`) — a dedicated microservice that actually resolves a
  rate on the fly, applying every fallback chain. Not a CBS table — an API on top of
  `CURRENCY.RATES`.

---

## US-01.13.01 — Static registry (currencies, markets, companies)

**Role:** CBS administrator. **What it does:** lays the foundation before any live trading or
integration begins.

Key business decisions baked in here:
- **`NUMERIC_CODE`, `NO_OF_DECIMALS`, `QUOTATION_CODE`, `INTEREST_DAY_BASIS` become immutable**
  once a record is authorized (TB-1351, extended to `DECIMALS_NAME`/`PRECIOUS_METAL` by TB-2979).
  Not a bug — a deliberate safeguard: once a currency is "in circulation," changing its core
  mathematical characteristics would retroactively corrupt the history of every transaction and
  accounting entry already posted against it.
- `CURRENCY` records **can never be deleted or reversed** (`REVERSE` deliberately returns 500) —
  a currency, once registered, lives forever as a reference unit even after it falls out of use.
- `BASE_RANK` is a fallback mechanism: if a transaction doesn't explicitly say which currency is
  the base, the system picks the currency with the lower rank as the base.
- `COMPANY` — this is where it's configured whether a company/jurisdiction is required to always
  convert through a specific transit currency (a regulatory requirement in zones like CEMAC/WAEMU).

**Business meaning:** without this story, the system has no dictionary at all — nothing to tell it
"USD is 2 decimal places" or "this company must route everything through XAF."

---

## US-01.13.02 — Asynchronous rate ingestion (`CURRENCY.ORDER` → `CURRENCY.RATES`)

**Role:** Integration Adapter — middleware on the ESB that receives raw feeds from
Reuters/Bloomberg/treasury and converts them into CBS's own format.

Solves a very concrete operational pain point: **how to update thousands of rates without locking
the live table under load.**

Mechanism:
1. An external source submits a single `CURRENCY.ORDER` = exactly one currency pair, but with a
   nested array of different rate types (BID/ASK/MID) and amount bands.
2. The order is staged as `NEW` (a draft) and requires **4-eyes authorization** — someone other
   than the person who created it must approve it. This is a classic banking control: one person
   alone can never inject an arbitrary rate into the system.
3. A background daemon (a genuinely running scheduler — `db-scheduler`, ticking roughly every
   ~30 seconds, plus an individual one-shot timer keyed to each order's own `START_DATETIME`)
   atomically "unpacks" the order into the live `CURRENCY.RATES` table at the right moment.
4. If even one nested element is invalid, the **entire order** is rolled back (ACID) — this avoids
   a situation where "half the rates updated, half didn't," which would otherwise open an
   arbitrage window between old and new rates across different pairs.
5. Rates carry `START_DATETIME`/`END_DATETIME` — a rate can be staged for tomorrow 08:00 and stays
   invisible/inapplicable until then. There's also a cutoff buffer (currently 5 minutes) — you
   can't inject a rate that activates right now or in the past, to avoid racing against
   transactions already in flight.

**Business meaning:** this is the pipeline that lets the bank safely and massively synchronize
with the market (rates change constantly), while keeping control (4-eyes), atomicity (no
half-applied updates), and predictability (rates switch on/off on a schedule, not instantly and
chaotically).

---

## US-01.13.03 — Real-time rate resolution (Currency Engine)

**Role:** any executing module — transfers, treasury/FX, teller — that needs to compute, on the
fly, how much X is worth in currency Y.

This is the module's "brain" — a separate service, because rate resolution needs to be fast
(high-TPS) and must never put load or locks on `CURRENCY.RATES` (read strictly read-only, no
write/lock during resolution).

Core logic:
1. **Base/quote resolution** — a three-level fallback: explicit request parameter → transaction
   payload field → `BASE_RANK`.
2. **Direct pair first.** If a ready-made USD/EUR rate exists, it's used directly.
3. **Triangulation — in-memory only, never persisted.** If no direct pair exists (e.g. KES→JPY),
   the system computes on the fly through a transit currency (explicitly given / from company
   settings / global default). This is a purely transient calculation for a single request — it's
   never written back to `CURRENCY.RATES`, to avoid polluting the live cache with synthetic rates.
4. **Precision:** the intermediate triangulation result is held at 18-decimal precision
   (BigDecimal), and rounding to the currency's actual decimal count happens exactly once, at the
   very end of the chain. This matters — rounding at every step compounds error, and at scale that
   is real money.
5. **Mandatory regulatory triangulation** — if the company has `MANDATORY_TRIANGULATION=YES` (a
   CEMAC/WAEMU zone), the engine **ignores** the direct rate even if it exists in the cache and
   forces the calculation through the required transit currency. This directly implements the
   "Rigid Sovereign Peg Compliance" row above — the bank must comply with the law even when a
   shorter technical path exists.
6. **No auto-spread.** If ASK was requested but only MID exists, the engine rejects with
   "Requested Rate Type missing. Spread auto-calculation is prohibited." rather than guessing.
   This protects against the system inventing an unconfirmed rate.
7. **Hierarchical business-unit fallback** (a branch has no rate of its own → check the parent →
   check HQ) — designed, but the `BUSINESS.UNIT` table doesn't physically exist yet on the QA
   environment (M3 scope) — not a bug, just a part of the system not yet built.

**Business meaning:** this is where the bank actually makes or loses money on fractions of a
cent — rounding precision, triangulation order, and never applying the wrong rate type are all
what makes every FX operation correct at volume.

---

## US-01.13.04 — Universal MID rate & GL revaluation

**Role:** teller (regular operations) and the Accounting Engine (end-of-day close).

Removes a historical restriction where the MID rate (the "official"/central-bank rate) was
available only to internal accounting, and front-office couldn't use it for regular non-commercial
operations.

Two independent scenarios under one story:
1. **Teller:** a customer does an operation not at the bank's commercial (marked-up) rate but at
   the official MID rate — previously blocked by legacy isolation, now allowed for every module.
2. **Close of Business — balance revaluation.** Once a day, the Accounting Engine takes every
   foreign-currency asset/liability the bank holds and revalues it into the local currency using
   the current MID rate (standard Mark-to-Market practice). Critical rule: **if no explicit MID
   rate exists, the system is not allowed to compute one itself** as an average of BID/ASK.
   Revaluation for that pair halts, a critical exception is raised to treasury, and **the entire
   COB run for that ledger is blocked** until someone manually feeds in a rate via
   `CURRENCY.ORDER`.

**Business meaning:** a direct tie to the bank's regulatory/accounting reporting — revaluing at a
"made-up" rate could distort the balance sheet and cause audit problems, so the system deliberately
prefers to halt the day-close rather than risk an inaccurate figure in the GL.

---

## How all of this affects the product as a whole

The module doesn't process transactions itself — it's the infrastructure's **source of truth**
for the rest of the system:

- **Transfers/Treasury/FX (EP-08)** — before authorizing a cross-currency payment, the system must
  query this module for a rate to compute `WORKING_BALANCE`.
- **Accounting (EP-06)** — the daily revaluation of foreign-currency positions in the GL depends
  entirely on this module's MID rate.
- **Multi-country rollout** — the same engine can be deployed for different jurisdictions
  (Cameroon/CEMAC, the WAEMU zone, DRC) with entirely different regulatory triangulation
  requirements — just by configuring `COMPANY`, with no code changes.
- **External integration** — the asynchronous gateway (`CURRENCY.ORDER`) is the single entry point
  for market data (Reuters/Bloomberg), with 4-eyes control and atomicity built in.

---

## Notable technical nuances (confirmed during automation — treat these as known product behavior, not test bugs)

- **TB-3277** — the engine currently does *not* round `rateValue` strictly to the currency's
  `NO_OF_DECIMALS` in one direction (accepts and doesn't round extra digits), while in the other
  direction it hard-caps input at 9 decimal places regardless of the currency's own configuration
  (even at `NO_OF_DECIMALS=18`). Diverges from the documented design.
- **TB-3276** — requesting a rate type that doesn't exist for a pair (e.g. ASK when only MID is
  staged) returns a generic `404 Rate Not Found` instead of the documented specific message about
  spread auto-calculation being prohibited.
- **TB-3132** — reading an expired rate (`END_DATETIME` in the past) returns `500` instead of the
  expected `404` — root cause: the table client's exception handling only catches `NotFound`, not
  the `400` the Table Template actually returns for an expired record on SEE.
- **The daemon/scheduler** genuinely runs on the environment (confirmed by direct DB
  inspection — `db-scheduler`), even though the associated ticket TB-2027 is still formally "In
  Code Review" — a Jira ticket's status doesn't always reflect what's actually deployed.
- **Triangulation** — the `QUOTATION_CODE` scaling formula applies only to the currency on the
  "FROM side" of the current leg of the calculation, never to the final currency — confirmed by a
  developer **and independently live-verified** (2026-08-26): a probe with three currencies
  carrying different `QUOTATION_CODE`s (2/3/4) got a result matching "divide by the transit
  currency's own `10^QUOTATION_CODE`" and ruling out a hardcoded `/10` (the two hypotheses predicted
  values 100x apart, so this isn't a near-miss). A dedicated regression test for this now exists in
  `currency-regression.spec.ts`.

For table schemas, incidents, and per-story automation status, see
`US-01.13.0{1..4}/README.md`; for cross-cutting patterns and predictive rules, see this folder's
`INDEX.md`.
