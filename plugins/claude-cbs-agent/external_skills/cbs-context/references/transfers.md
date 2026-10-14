# Transfers — Payment Order & Funds Transfer (Module 08) reference

> **What this is.** An **opt-in** `proj-context` reference for **Module 08 – Transfers**: the two
> payment mechanisms in CBS — **Payment Order** (08.01, initiation) and **Funds Transfer** (08.02,
> execution) — their config Tables, statuses, processing flows, and the plugin chain that drives
> them. It is **not** loaded automatically with the core context — the `proj-context` skill offers it
> after `system-core.md` loads, and reads it only if the user opts in.
>
> **Source.** Distilled from the **CBS Workshop — "Payment Order и Funds Transfer" (2026-07-24)**
> recording, plus the `PAYMENT.ORDER.*` / `FUNDS.TRANSFER` rows already indexed in `tables.md`. The
> functional specs ([08.01](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1474723859) /
> [08.02](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1475280899)) are canonical where they
> and this summary disagree. **Implementation was in progress at the time of the workshop** — §6
> lists what was not yet built.
>
> **Cross-references.** The `NAU`/`LIV`/`HIS` storage spaces, the 4-eyes maker/checker lifecycle,
> plugins and pre/post hooks, and projections are all defined in `system-core.md`. The **Charge
> Calculation Engine** called during FT processing is in `interest-and-charges.md`. The **Posting
> Engine** called at FT authorization is in `financial-accounting.md`. The account/customer document
> obligations checked during FT are in `customer.md`. The concrete Table IDs are indexed in
> `tables.md`.

---

## TL;DR — if you remember only this

1. **Two mechanisms, one boundary.** **Payment Order (PO)** = the *request* to pay. It moves **no
   money** and writes **no postings**. **Funds Transfer (FT)** = the *execution* — real movement
   between accounts, real postings.
2. **PO is optional.** An FT can be created directly; a PO is **not** a required predecessor. But a
   PO *can* auto-create an FT.
3. **PO is the human-facing half, FT is the system element.** PO owns payment-product knowledge
   (direction, warehousing, mandates) — the "antechamber" to FT. A bank *may* expose direct FT
   creation, but that isn't the typical setup.
4. **Postings happen at authorization, not at input.** Everything before authorization is
   validation. On authorization the FT calls the **Posting Engine** (synchronous), which generates
   and persists the entries.
5. **Only Internal FT is real today.** `CONNECTION.METHOD = EXTERNAL.HUB` exists architecturally but
   has no live external integration. Everything in §4/§5 (RTGS, ACH, Instant, cards) is **background
   education, not CBS functionality**.

---

## 1. Payment Order — 08.01

### 1.1 Configuration tables

| Table | Purpose |
| --- | --- |
| `PAYMENT.ORDER.PRODUCT`   | **What kind of payment this is and how it behaves.** |
| `PAYMENT.ORDER.PARAMETER` | **Where the payment gets sent for execution.** |

**`PAYMENT.ORDER.PRODUCT`** fields:

- **Direction** — `CREDIT.TRANSFER` (**push**; the payer initiates, e.g. buying a coffee) or
  `DIRECT.DEBIT` (**pull**; the payee initiates against a standing consent, e.g. a subscription).
- **Allow Future Date** — may this product be dated forward? Instant-style products cannot.
- **Allow FX** — may this product cross currencies?
- **Mandate Required** — meaningful **only** for `DIRECT.DEBIT`.
- **Charge Bearer** — which side pays the transfer fee.

**`PAYMENT.ORDER.PARAMETER`** fields:

- **Connection Method** — `INTERNAL.FT` (hand to our own Funds Transfer) or `EXTERNAL.HUB` (hand to
  an external payment system).
- **Routing queue** — the Kafka (or other) destination.
- "External Hub" is deliberately **generic** — any external integrator, *not* specifically the PKF
  Payment Hub.

### 1.2 `PAYMENT.ORDER` — key payload fields

| Field | Notes |
| --- | --- |
| **Instruction ID**    | Point-to-point id between two systems in the chain. **Mutable** — each hop may replace it (e.g. the Payment Hub stores ours to look the payment up, then issues its own downstream). No constraint against changing it. |
| **End-to-End ID**     | The **immutable trace id** across the whole chain of banks and payment systems. Must never change. |
| **Product ID**        | → `PAYMENT.ORDER.PRODUCT`. Also the key used against `PAYMENT.ORDER.PARAMETER`. |
| **Payment Direction** | Credit transfer / direct debit. |
| **Account**           | The source account. |
| **Instructed Amount**, **Currency** | The amount to move. |
| **Execution Date**    | Enables forward-dating → drives **warehousing** (§1.3). |
| **Counterparty Name** | The **beneficiary** (final bank + party). Relevant for SWIFT/SEPA and other external rails. |
| **Intermediary**      | Intermediary bank(s). Needed when no direct arrangement exists with the beneficiary bank — common on SWIFT, which is a decentralized network. |
| **Mandate Reference** | Proof the payer consented to being debited. Direct debit only. |
| **Charge Bearer**     | May be passed explicitly, overriding the product default. |

### 1.3 Statuses

| Status | Meaning |
| --- | --- |
| `RECEIVED`            | Order received; processing begins. |
| `WAREHOUSED`          | Execution date is in the future — parked. The **COB job** periodically scans warehoused orders and releases them once the execution date arrives. |
| `PENDING_COMPLIANCE`  | Dispatched to the **Financial Crime Management System** (AML / fraud) adapter; awaiting its event. |
| `AWAITING_ACK`        | Handed to Funds Transfer or the external hub; awaiting acknowledgement. |
| `COMPLETED`           | Success. |
| `REJECTED`            | Failure at **any** stage (compliance, acknowledgement, …). |

### 1.4 Processing flow

1. **Maker** creates the PO (input operation); **checker/supervisor** authorizes it (4-eyes).
2. Product params are read. If the product **allows future dating** *and* the execution date is in
   the future → `WAREHOUSED`, stop. The **COB job** resumes the flow on the execution date.
3. Otherwise → `PENDING_COMPLIANCE`; an event goes to the AML/fraud adapter, which drives the
   external screening system and returns an event.
4. Compliance **failed** → `REJECTED`. **Passed** → read the Connection Method.
5. `INTERNAL.FT` → create a `FUNDS.TRANSFER` record carrying a **back-reference to the PO**.
   `EXTERNAL.HUB` → dispatch to the external payment hub.
6. Await acknowledgement → `COMPLETED`. Anything wrong at any point → `REJECTED`.

---

## 2. Funds Transfer — 08.02

Two Tables: **`FUNDS.TRANSFER`** (the execution record) and **`FT.TXN.TYPE.CONDITION`** (the
transfer-type governance matrix — mentioned in the workshop but not covered in depth).

### 2.1 `FUNDS.TRANSFER` — key fields

| Field | Notes |
| --- | --- |
| **Payment Order Ref** | **Optional** back-link — present only when a PO initiated this FT. |
| **Debit Account** / **Credit Account** | References to accounts in the system. |
| **Currency**, **Amount** | The movement itself. |
| **Value Date**   | The date the movement is treated as having happened **for interest purposes**. Backdate it and the balance accrues as if the operation occurred then. |
| **Booking Date** | The date the entry actually lands in the **General Ledger**. |
| **Charges**      | Charges to be levied alongside the transfer. |
| **auto-auth**    | `true` → attempt automatic authorization; `false` → manual authorization required. |

**Value Date vs Booking Date** — the distinction that keeps getting lost: *booking date = when we
recorded it; value date = which day it counts for.* Backdating: booking = today, value = past.
Forward: booking = today, value = future.

**Postings are not limited to two legs.** The stated debit/credit legs become postings, but the
engine may generate more under the hood — **charge** postings, **FX / currency-position** postings,
and **inter-branch transit account** postings. (The debit side can also target a **P&L category**
rather than an amount, e.g. for charges.) The posting mechanism itself is covered in
`financial-accounting.md`.

### 2.2 Processing flow

Initiator = a **CBS user**, a **Payment Order**, or a **Payment Hub**.

1. **FX rate lookup** — if the currencies differ, fetch the rate to convert to the debtor's currency.
2. **Charge Calculation Engine** — if charges apply, call it and set charge amount / type / currency.
3. **Balance check** — does the debtor have enough?
4. **Account blocked check** and **account restrictions** check.
5. **Document checks** — required documents uploaded and unexpired for the accounts/contracts
   involved, and for the customer. **If the creditor is also an internal client, both sides are
   checked.**
6. **Overrides** — anything flagged (e.g. an amount needing a dispo) is surfaced and accepted.
7. Input completes; the record is written to **`NAU`** space; an event goes to the **Financial Crime
   Management System** adapter.
8. Compliance passed → status **`READY`**; failed → `REJECTED`.
9. **Authorization** — automatic (`auto-auth = true`) or manual.
10. On authorization → **synchronous call to the Posting Engine**, which generates and persists the
    postings. On success the FT is complete.

**Up to authorization no money moves** — steps 1–8 only establish that the transfer *may* proceed.

---

## 3. External payment schemes — background only, NOT implemented in CBS

Presented in the workshop as context so the terms are recognizable. Asked directly how relevant this
is to CBS today, the answer was: **"right now, not at all."** CBS operates **Internal FT only**.

| Scheme | Direction | Batching | Value | Fees | Speed |
| --- | --- | --- | --- | --- | --- |
| **RTGS** (Real-Time Gross Settlement) | Credit transfer only | One-by-one | High-value | High (**$50+**) | Same day; may roll to the next day if the window is missed |
| **ACH** (Automated Clearing Houses)   | Credit transfer **and** direct debit | **Batched** | Many small payments (e.g. payroll) | Low | **Cut-off windows** during the day (e.g. 10–11, 13–14, 15–16) |
| **Instant** | Credit transfer only | Single only | Lower limits than RTGS | Moderate | Seconds (~10s SLA) |

- **ISO 20022** is the common contract for inter-bank messaging. *Inside* the bank anything goes;
  crossing the bank boundary requires it. **`pacs.008`** (heard in the recording as "PAX-008")
  initiates a credit transfer.
- **ACH direct debit** requires the **creditor to hold a signed mandate** from the debtor. A
  creditor cannot pull funds without one.
- **Correspondent banking** — cross-bank movement needs bilateral agreements plus **nostro/vostro**
  accounts. Without a direct relationship the payment routes through **intermediary banks**, each
  taking a fee. Two methods: **serial** (message passed hop to hop) and **cover** (message on one
  route, the funds movement settled directly between correspondents).
- **Clearing & settlement** — the central bank holds all member banks' accounts. At end of day
  positions are summed and **netted** (1,000 one way against 900 the other → only the difference is
  posted), then **reconciled** against each bank's statements. Settlement is often **deferred** —
  the customer is paid first, the banks square up later. **Locking/blocking** reserves funds in the
  interim so the balance can't be spent twice or drop into overdraft.

## 5. Cards — background; not processed inside CBS

- **In CBS a card is an alternative key to an account.** Money moves **between accounts, never
  between cards**; a card number is a mapping to an account, nothing more.
- Card processing uses **ISO 8583** — a positional flat-file format with numerically-identified
  dynamic fields, unrelated to ISO 20022.
- **Flow:** **authorization** (funds *blocked*, **no postings**) → **clearing** (end of day; the
  merchant batches to the **acquirer** → Visa/Mastercard → **issuer**; *this* is when the account is
  actually debited, though the merchant still has no money) → **settlement** (bulk settlement
  messages; the acquirer pays the merchant, typically days later).
- **Acquirer** = the bank behind the merchant's terminal. **Issuer** = the cardholder's bank.
  Visa/Mastercard act as the centralized switch between them — the card-world analogue of ACH/RTGS.
- Typical processor commands: query the account balance → place a lock → convert locked amounts into
  real transactions (often via a bulk end-of-day file). The gap between lock and real debit is
  expected. Large merchants can negotiate individual tariffs.
- **CBS does not implement card processing.** CBS has Card Management, but processing would run
  through the Payment Hub and external systems.