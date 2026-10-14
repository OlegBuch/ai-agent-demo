# Financial Accounting — Posting, Balances & Consolidation reference

> **What this is.** An **opt-in** `proj-context` reference for the **posting chain**: how an entry is
> created (**Posting Engine**, Module 06), how it reaches customer balances (**Balance Engine**,
> Module 05.04), and how it reaches reporting (**Consolidation Engine**, Module 07). It is **not**
> loaded automatically with the core context — the `proj-context` skill offers it after
> `system-core.md` loads, and reads it only if the user opts in.
>
> **Source.** Distilled from the **CBS Workshop — "Posting Engine" (2026-08-14)** recording plus the
> `EG.JOURNAL.ENTRY.*` / `POSTING.DETAIL` / `CONSOLIDATE.*` rows indexed in `tables.md`. The functional
> specs are canonical where they and this summary disagree.
>
> **Cross-references.** The `RECORD_CREATED`/`RECORD_UPDATED`/`RECORD_DELETED` table events, the
> `NAU`/`LIV`/`HIS` storage spaces and the 4-eyes lifecycle are in `system-core.md`. The **Funds
> Transfer** flow that calls the Posting Engine is in `transfers.md` §2. The **Charge Calculation
> Engine** that produces fee amounts is in `interest-and-charges.md`. Concrete Table IDs are indexed
> in `tables.md`.

---

## TL;DR — if you remember only this

1. **Entries are immutable.** Once persisted, a journal entry is never updated or deleted. This is a
   **compliance** constraint, not a design preference. Corrections happen by reversal, never by edit.
2. **Debits must equal credits.** Within one transaction, Σ debit amounts == Σ credit amounts. The
   Posting Engine enforces it; callers normally validate before calling.
3. **Write authority is split.** The **Posting Engine** is the only writer of journal entries. The
   **Balance Engine** is the only writer of account balances. Nothing writes balances directly.
4. **Two different things are called "balance".** Callers (FT, Product Factory) move the *whole*
   balances — Working / Cleared / Available. Journal entries move the *sub-ledger buckets* keyed by
   **balance type**. Different writers, different triggers, different data.
5. **An "entry" is one leg, not the whole transaction.** The API array is `legs`; each leg is one
   `EG.JOURNAL.ENTRY` row. A complete double-entry transaction is a *set* of them.

---

## 1. The Posting Engine

A standalone microservice — not a Table — that generates and persists journal entries.

### 1.1 Entry (leg) anatomy

| Field | Notes |
| --- | --- |
| **Account ID**   | *Requied for AL.* The account the entry posts to. |
| **Direction**    | `DEBIT` or `CREDIT`. |
| **Amount**       | The value of this leg. |
| **Balance Type** | *Requied for AL.* Which sub-ledger bucket on the account this leg moves (§4.2). |

A posting request carries a **list** of these legs, plus the transaction-level fields (§1.3).

### 1.3 Transaction Reference and source system

Every leg of one transaction shares a **Transaction Reference**. It is a foreign key whose target
depends on the **source system** that initiated the posting:

| Source system | Transaction Reference resolves to |
| --- | --- |
| **Funds Transfer** | a `FUNDS.TRANSFER` record |
| **Product Factory** (via Soft Accounting) | a contract-operation record |
| **Teller** | a teller transaction record |

The source system is passed on the request and is what makes the reference resolvable — the same
reference value means nothing without it.

---

## 2. Narrative enrichment — `POSTING.DETAIL`

Before entries are persisted they are enriched with a **narrative**: a human-readable string
describing what the entry is for. `POSTING.DETAIL` holds the rules for assembling it.

Three source types can contribute to one narrative:

| Type | Source of the text |
| --- | --- |
| **Static**     | Literal text configured on the rule. |
| **Payload**    | A value read from the incoming posting request. |
| **Link table** | A value looked up from the table the transaction originated in. |

**Link-table resolution** follows the Transaction Reference outward:

```
Transaction Reference + source system
  → source record (e.g. FUNDS.TRANSFER)
    → linked record (e.g. ACCOUNT)
      → source field (e.g. ACCOUNT_TITLE)
```

A rule names the link and the source field; the engine performs the lookup and splices the result
into the narrative. Narrative assembly happens **before** persistence, so the stored entry is already
complete.

---

## 3. AL and PL entries

Journal entries come in two kinds:

| Kind | Table | What it records |
| --- | --- | --- |
| **AL** — Assets & Liabilities | `EG.JOURNAL.ENTRY` | Movements **between accounts**. Carries an account and a balance type. |
| **PL** — Profit & Loss        | `EG.JOURNAL.ENTRY` | Bank income and expense — fees, commissions. Posts to a **category**, never to a customer account, and carries no balance type. |

### Worked example — a transfer with a fee

Payer **X** and beneficiary **Y** each hold 1000. X sends 500 to Y, and the bank levies a fee of 10.
That is **three** legs, not two:

| Leg | Kind | Account / target | Direction | Amount |
| --- | --- | --- | --- | --- |
| 1 | AL | X | debit  | 510 |
| 2 | AL | Y | credit | 500 |
| 3 | PL | fee category | credit | 10 |

Debits (510) equal credits (500 + 10). Afterwards **X holds 490**, **Y holds 1500**, and 10 has gone
to the bank's P&L — the fee is charged on top of the transferred amount and does not reduce what the
beneficiary receives.

---

## 4. Balances

### 4.1 Where balances live and who writes them

The `ACCOUNT` Table holds account identity and descriptive attributes — **it holds no balances**.
Balances live in a separate store (`AM.ACCOUNT.BALANCES`), and the **Balance Engine** is the only
component that writes it. Every balance change goes through the engine's API; no caller writes the
store directly.

Callers request a change with: **account ID**, **amount**, and an **action** (e.g. `DEBIT_SETTLE`).
The action tells the engine which balances to move.

### 4.2 Whole balances vs balance-type buckets

An account does not have one amount. Two distinct layers exist, updated by **different writers**:

**Whole balances** — updated by the transaction modules (Funds Transfer, Product Factory) calling the
Balance Engine directly:

- **Working Balance**
- **Cleared Balance**
- **Available Balance**

**Balance-type buckets** — updated by the Balance Engine in response to journal entries. The bank
divides an account's money into balance types; each bucket carries:

| Field | Notes |
| --- | --- |
| **Balance Type**   | The bucket key. |
| **Balance Amount** | The bucket's current amount. **Negative values are valid.** |
| **Last Entry ID**  | The journal entry that last moved this bucket. |
| **Balance Status** | `ACTIVE` or `IN_PROGRESS` (§4.4). |

An account carries as many buckets as it has balance types in use.

### 4.3 How an entry reaches a bucket

`EG.JOURNAL.ENTRY` emits a **`RECORD_CREATED`** event on persistence. The Balance Engine consumes it and
applies the entry to the matching bucket:

1. Read the entry's account, balance type, direction and amount.
2. Apply the movement to that account's bucket for that balance type.
3. Set the bucket's **Last Entry ID** to the entry that caused the change.

Only **AL** entries reach buckets — PL entries have no account and no balance type.

### 4.4 The `IN_PROGRESS` lock

The entry → bucket update is **asynchronous**, so there is a window in which entries are persisted
but buckets are stale. To keep that window safe to read:

1. **Before** persisting entries, the Posting Engine makes a **synchronous** call to the Balance
   Engine naming the buckets about to change.
2. Those buckets are set to **`IN_PROGRESS`**.
3. The entries are persisted, the event fires, the Balance Engine applies the change and returns the
   buckets to **`ACTIVE`**.

**Reading rule:** a bucket in `IN_PROGRESS` is **not** current — an update is in flight against it.
Only `ACTIVE` buckets may be treated as authoritative.

---

## 5. Reversal

A persisted entry is never deleted. Reversal is a separate operation against the original
transaction.

**Request:** **Transaction Reference** + **source system** + **reversal reason**. The source system
must match the one used on the forward posting — the same caller that posted must reverse.

**Effect on the original entries** — three markers are set, and **no other field is touched**:

- **Reversal Marker** — `R`
- **Reversal Reason**
- **Reversal Date**

The reversal is written under a **new sequence**, and a record is created in `TRANSACTION.REVERSAL`
capturing the target and the reason.

Fees already posted to P&L are not necessarily reversed along with the underlying transaction — a
charge that has been earned stays earned.

---

## 6. Consolidation & reporting

`EG.JOURNAL.ENTRY` is a raw, append-only list. Reporting needs it aggregated, so the same
`RECORD_CREATED` event that drives the Balance Engine also drives the reporting path:

```
EG.JOURNAL.ENTRY --RECORD_CREATED--> Consolidation Engine --> ClickHouse (OLAP)
```

- **Consolidation Engine** sits between the two; entries do not go to ClickHouse directly.
- **ClickHouse** is the columnar OLAP store used for analytics and aggregation, distinct from the
  transactional PostgreSQL store.
- **Consolidation parameters** (`CONSOLIDATE.PARAMETER`) configure the engine. Each parameter defines one
  **dimension**. The functional spec expresses these as **consolidation keys** — dot-separated
  strings.
- **Data-cube model:** the dimensions are the axes of a cube (e.g. location × item × time period);
  each cell holds the data at the intersection of every dimension. The cube can have any number of
  dimensions, and the same entries can be viewed along whichever axes a report needs. This is the
  basis of financial reporting.
- A **close-of-business job** generates reports from the data accumulated in ClickHouse.

---

## 7. Vocabulary

| Term | Meaning |
| --- | --- |
| **Entry / leg** | A **single** side of a transaction — one `EG.JOURNAL.ENTRY` row. The API array is `legs`. (Russian: *полупроводка*.) |
| **Set of entries** | The complete balanced transaction — all its legs together. (Russian: *проводка*.) |
| **Account** vs **Accounting** | **Account** = customer accounts and their balances. **Accounting** = journal entries and the ledger. Two different modules; the near-identical names are a common source of confusion. |
| **AL** | Assets & Liabilities — entries against accounts. |
| **PL** | Profit & Loss — bank income and expense, posted to categories. |

---

## 8. The `Money` type

Inter-service communication uses a structured money type from the common library rather than a raw
decimal. It has three fields:

| Field | Notes |
| --- | --- |
| **Currency** | e.g. `USD`. |
| **Units**    | The whole currency units — `150` for $150.20. |
| **Nanos**    | The fractional part expressed in billionths (10⁻⁹) — the protobuf `Money` convention. |

- **Use it for service-to-service payloads and for arithmetic.** Decimal-point representations carry
  precision hazards; the units/nanos split avoids them.
- **`Amount` vs `Money`:** units + nanos alone is the *amount*; with currency it is *money*. API specs
  sometimes omit currency where it is implied by context.
- Values received from events are deserialized into this type, and recombined into a plain decimal
  string only for storage.
