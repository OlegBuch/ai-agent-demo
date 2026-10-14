# I&C (Interest & Charges) — Module 13 reference

> **What this is.** An **opt-in** `proj-context` reference for **Module 13 – Interest & Charges (I&C)**:
> the two decoupled, stateless pricing engines and their configuration model. It is **not** loaded
> automatically with the core context — the `proj-context` skill offers it after `system-core.md`
> loads, and reads it only if the user opts in.
>
> **Source.** Distilled from the **US-13.01 (Interest Calculation Engine)** and **US-13.02 (Charge
> Calculation Engine)** user stories (Confluence TB space) plus the `IC.*`/`CC.*` rows already indexed
> in `tables.md`. Treat the Confluence specs as canonical when they and this summary disagree.
>
> **Cross-references.** The storage spaces (`NAU`/`LIV`/`HIS`), the `INT`/`FIN`/`CUS` table types, the
> 4-eyes `AUTH` lifecycle, and the `RECORD_CREATED`/`RECORD_UPDATED` events referenced below are all
> defined in `system-core.md`. The concrete Table IDs (`IC.*`, `CC.*`) are indexed in `tables.md`,
> each with a link to its published spec.

---

## TL;DR — if you remember only this

1. **I&C = two separate engines.** **13.01 Interest Calculation Engine (IC)** computes accrued
   interest (yield); **13.02 Charge Calculation Engine (CC)** computes fees. They share design DNA
   but are independent services.
2. **Both are stateless, pure-math kernels.** They take a **pre-aggregated `Basis Amount`** + a rule
   id and return a number. They **never** read customer ledgers/balances, **never** decide *when* to
   charge, and **never** post accounting. Only a per-calculation **audit record** is written.
3. **Product Factory (PF) orchestrates.** PF decides the trigger, aggregates the `Basis Amount`, holds
   the rule/tariff link on the contract, calls the engine, and forwards the result to the **Soft
   Accounting Engine**, which does the actual ledger posting. The **COB Engine** (Close-of-Business
   batch) is the other main caller, for periodic accruals.
4. **Config is Tables; calculation is a service.** Rules/rates live in 4-eyes-governed `IC.*`/`CC.*`
   Tables; the math runs in the stateless `proj-interest-calculation-engine` /
   `proj-charges-calculation-engine` microservices.
5. **One tiering vocabulary, both engines:** `SINGLE` (flat), `LEVEL` (whole amount at the matched
   tier's rate — a cliff), `BAND` (slice the amount, each slice at its own rate, then sum —
   progressive/marginal). See §3.

---

## 1. Interest Calculation Engine — 13.01

### 1.1 Configuration tables

| Table (`tables.md` id)   | Bare name in stories | Purpose |
| ---                      | ---                  | --- |
| `IC.BENCHMARK.REFERENCE` | `BENCHMARK.REFERENCE`| Master list of floating-rate benchmark indices (PRIME, SOFR, EURIBOR, LIBOR). One record per benchmark. |
| `IC.FLOATING.BASE.RATE`  | `FLOATING.BASE.RATE` | Effective-dated **single live rate** for a benchmark, per currency. Fields: ID, Benchmark ID, Currency, Effective Date, Interest Rate. **4-eyes.** |
| `IC.PERIODIC.INTEREST`   | `PERIODIC.INTEREST`  | **Term-structure curve** — Bid/Offer rates per benchmark+currency, bucketed by **tenor / rest period** (Overnight, 1W, 1M, 3M, 6M, 12M). Composite key. **4-eyes.** |
| `IC.INTEREST.BASIS`      | `INTEREST.BASIS`     | **Day-count matrix** — numerator/denominator conventions (Actual/360, Actual/365, 30/360). Denominators: 360/365/366/Actual. Supplies the **day-count fraction (DCF)**. **`INT` table, no auth** (written straight to `LIV`). |
| `IC.GLOBAL.INTEREST.RULE`| `GLOBAL.INTEREST.RULE`| The reusable **interest-math profile** that products/contracts reference. Binds rate sourcing + spread + floor/cap + tiering + day-count into one definition. **4-eyes.** |

The first two form the **"Global Rate Type Registry"** (US-13.01.01): `RATE.TYPE ∈ {FLOATING, PERIODIC}`,
both effective-dated with **no overlapping date ranges** per benchmark.

### 1.2 `GLOBAL.INTEREST.RULE` — the anatomy (US-13.01.02)

- **`RATE.TYPE`** = `FIXED` (numeric rate in the rule) | `FLOATING` (→ benchmark's live rate) |
  `PERIODIC` (→ term-structure; also needs a **period method** to interpolate when the exact tenor is
  absent).
- **Spread sequence** — ordered ops `ADD | SUBTRACT | MULTIPLY`, each with a value + execution order
  (e.g. `ADD 1.50%` margin). Applied to the base rate in sequence.
- **Floor / cap** — `TIER.MIN.RATE` (floor) and `TIER.MAX.RATE` (cap) clamp the final rate.
- **`RATE.TIER.TYPE`** = `SINGLE | LEVEL | BAND` (see §3). Tiers defined by `TIER_AMOUNT` = the tier's
  **upper bound**; `null` = infinite top tier. No duplicate/overlapping tiers; continuous coverage
  required.
- **`INTEREST.BASIS`** reference — the day-count convention.

### 1.3 The stateless API (US-13.01.04)

- **In:** `Basis Amount` (pre-aggregated by PF via its `SOURCE.CALCULATION.CONDITION`),
  `GLOBAL.INTEREST.RULE.ID`, calculation period (start/end), currency, term/tenor.
- **Pipeline:** load active (effective-dated) rule → resolve base rate by `RATE.TYPE` → apply spreads
  → apply floor/cap → apply tiering → compute DCF from `INTEREST.BASIS` →
  **interest = effective-rate × Basis Amount × DCF**.
- **Out:** calculated interest amount (+ resolved periodic rate if requested).
- **Events:** `INTEREST.CALCULATION.REQUEST.RECEIVED` / `.EXECUTED` / `.FAILED`. **No ledger impact.**

## 2. Charge Calculation Engine — 13.02 (Decoupled Tariff & Fee Kernel)

### 2.1 Configuration tables

| Table (`tables.md` id)   | Bare name in stories  | Purpose |
| ---                      | ---                   | --- |
| `CC.GLOBAL.CHARGE.RULE`  | `GLOBAL.CHARGE.RULE`  | The **atomic fee rule** (the math). Attrs: ID, `CALCULATION_TYPE`, `TIER_TYPE`, `TIER_AMOUNT`, `CHARGE_AMOUNT`, `CHARGE_RATE`, `MIN_AMOUNT`, `MAX_AMOUNT`. **4-eyes.** |
| `CC.CHARGE.TARIFF.GROUP` | `CHARGE.TARIFF.GROUP` | The **tariff routing hub**. Attrs: ID, `EVALUATION_RULE`, `TARIFF_PRIORITY`, `DISCOUNT_PERCENT`, `TARIFF` (charge-rule link). **4-eyes.** |

### 2.2 `GLOBAL.CHARGE.RULE` — the math (US-13.02.01)

- **`CALCULATION_TYPE`** = `FLAT` (fixed `CHARGE_AMOUNT`, ignores Basis) | `UNIT` (`CHARGE_AMOUNT` ×
  Basis-as-quantity) | `PERCENTAGE` (`CHARGE_RATE` × Basis).
- **`TIER_TYPE`** = `SINGLE | LEVEL | BAND` (§3), same semantics as interest.
- **`MIN_AMOUNT` / `MAX_AMOUNT`** — fee floor/cap applied **after** the math, before returning.

### 2.3 `CHARGE.TARIFF.GROUP` — customer-aware routing (US-13.02.02)

- An **ordered list of evaluation rules** by `TARIFF_PRIORITY` (unique positive ints, from 1).
- Each rule = a **condition on customer context** (e.g. `CUSTOMER.SECTOR = "VIP"`) evaluated via
  **`RULE.GATEWAY`** (the Validation Rules Engine), a **`DISCOUNT_PERCENT`** (0–100%), and a linked
  `LIVE` **`GLOBAL.CHARGE.RULE`**.
- **Runtime = first-match:** evaluate top-to-bottom, the **first rule that is TRUE wins** (stop),
  applying its discount and routing to its charge rule.

### 2.4 The stateless API (US-13.02.03)

- **In:** Customer Identifier, `Basis Amount`, `CHARGE.TARIFF.GROUP` id, Currency.
- **Pipeline:** verify tariff group `LIVE` → `RULE.GATEWAY` evaluates customer context top-to-bottom →
  first TRUE picks its `LIVE` `GLOBAL.CHARGE.RULE` + discount → run tiering + calc type → apply
  discount → apply `MIN`/`MAX` → return fee.
- **Out:** Calculated Fee Amount only. **Events:** `CHARGE.CALCULATION.REQUEST.RECEIVED` /
  `CHARGE.CALCULATED` / `.FAILED`.
- **No-match handling:** all rules FALSE → "No evaluation rule matches"; no tier matches the Basis →
  error. **No ledger impact.**

**Worked example (from spec):** Basis 25,000 USD, `BAND` rule (0–10k @1%, >10k @0.5%):
`10k×1% + 15k×0.5% = 175`; `MAX_AMOUNT = 150` → final **150.00 USD**.

## 3. Tiering — the shared model (both engines)

| `TIER_TYPE` | Behaviour |
| ---         | --- |
| `SINGLE`    | One rate/amount regardless of the Basis Amount. |
| `LEVEL`     | Find the tier the **whole Basis Amount** falls into; apply that **single** rate to the **entire** amount (a cliff). |
| `BAND`      | **Slice** the Basis across tiers; charge each slice at its own tier rate; **sum** (progressive/marginal). |

`TIER_AMOUNT` = a tier's upper bound; `null` = the infinite top tier.

## Naming & status notes

- **Prefixes:** the user stories use bare names (`GLOBAL.INTEREST.RULE`); the Table catalog registers
  them under module prefixes (`IC.*`, `CC.*`). Same tables.
- **`RECORD.STATUS` dictionary** in the specs: `UNAU`, `HOLD`, `LIVE` (= `LIV`), `HNAU`, `RNAU`,
  `REVE` — maps onto the `NAU`/`LIV`/`HIS` spaces of `system-core.md`.
- **Open/TBD in specs:** numeric rate min/max limits (`TBD`); the `CHARGE.CALCULATED` event is marked
  TBD in US-13.02.01.
