# Product Factory — contracts and operations reference

This is an **opt-in** reference covering the CBS **Product Factory (PF)** module —
specifically the **product-operation** half: how a catalogued product is sold to a
customer as a **contract**, and how every subsequent change to that contract is executed
by the **Contract Operations Engine (COE)**. It is **not** loaded automatically with the
core context — the `proj-context` skill offers it after `system-core.md` loads, and reads
it only if the user opts in.

> **Scope.** PF has two halves: **product creation** (defining a product and getting it
> into the catalog) and **product operation** (creating a contract from a product and
> running its lifecycle). **This reference covers product operation only.** The
> building-block hierarchy, the Builder → Product + Manager → `VALIDATED` → Catalog flow,
> and parent-product inheritance are the creation side and live in
> **`product-factory.md`** — read that first; this reference assumes it.

> **Cross-references.**
> - **`product-factory.md`** — attribute classes, attributes, product classes/types,
>   conditions, attribute types (`CCY`, `DATED`, `MULTIPLE`, `MERGE`, `TRACKING`,
>   `FORWARD.DATED`, …), the Catalog record and product versioning.
> - **`system-core.md`** — the INPUT/SEE/HOLD/**AUTH** operations, `NAU`/`LIV`/`HIS`
>   spaces, pre/core/post hooks, plugins and Tables. §5 below explains where contract
>   operations *deviate* from the plain record lifecycle.
> - **`financial-accounting.md`** — where a contract operation's **movements** end up:
>   Soft Accounting turns them into a double entry, the Posting Engine records it, the
>   Balance Engine updates balances.
> - **`interest-and-charges.md`** — the stateless IC/CC engines a contract's interest and
>   charge conditions point at. PF orchestrates the trigger; the engines do the math.
> - **`tables.md`** — the Table index for §04.05 Action Processing, §04.06 Contract
>   Lifecycle, §04.07 Soft Accounting, §04.08 Apply Transactions, §04.09 Eligibility.
> - **Authoritative specs (Confluence).** This guide is a curated summary distilled from
>   two workshops — the **2026-08-07 Product Factory v2** workshop (the model: contract vs
>   product, negotiation, twinned conditions, resolved→active, tracking) and the
>   **2026-09-04 Contract Operation** workshop (the runtime: operation-class config, child
>   operations, payload, status ladder, concurrency, the authorization preconditions, and a
>   worked end-to-end example). The canonical specs live in the CBS Confluence spaces; if
>   the **Atlassian MCP** is connected, fetch those pages for fuller and more current
>   detail.

> **Current scope.** The only product class that exists today is **`accounts`** — no loans
> or deposits yet, though the model is built to carry them. There is **no dedicated
> contract UI yet**: contracts are driven through Table INPUT directly, with the operation
> payload typed by hand as JSON. A purpose-built contract-operation UI — building the
> payload from user input rather than raw JSON — is planned for L3 and is expected to be
> predominantly a UX layer over the same backend mechanics.

---

## TL;DR — if you remember only this

1. **Product = blueprint, contract = the sale.** A **contract** binds a catalogued product
   to a specific **customer** on agreed terms. All real-time activity — transfers,
   interest accrual, condition changes — happens **on contracts**, never on products.
2. **Negotiation is bounded at the product level.** A product condition carries
   **negotiation rules** (default / min / max) declaring *which* fields an officer may
   deviate and *how far*. Anything not opened up by the product manager is not negotiable.
3. **Conditions are twinned.** `PF.PRODUCT.*.CONDITION` and `PF.CONTRACT.*.CONDITION` are
   near-identical Tables. The contract copy is written at contract creation and **drops
   the negotiation-rules fields** — those only matter while negotiating.
4. **Contract conditions are never edited directly.** Once written, the only way to change
   them is a **contract operation**. All calculations (accrual, fees) read the *contract*
   conditions, never the product's.
5. **Resolved → Active.** The Catalog record carries **resolved conditions** — a JSON of
   *every* condition variation with its effective date. At contract creation the system
   reduces that to **active conditions** on the contract: only what is in force now.
6. **Active conditions change by exactly two routes**: **tracking** (a new product version
   cascades down) and **`FORWARD.DATED`** (a schedule relative to contract start). Absent
   those, they are effectively static.
7. **Operations are vendor-defined and hardcoded.** An **operation class** (e.g.
   `ACCOUNT-CREATE-CONTRACT`) is a list of **(attribute class + class action type)** pairs;
   the logic behind each pair is hardcoded in the **Contract Operations Engine**
   microservice. Banks **cannot** create operation classes — they extend via **plugins**
   bound to an existing class.
8. **`PF.CONTRACT.OPERATION` is both the input surface and the log.** Writing a record
   *is* requesting the operation; the same record carries its status afterwards.
9. **Authorization is on the operation, not the record.** Changes go live when the
   *operation* is authorized — one AUTH covering everything that operation touched. It is
   **manual**, it needs a **second user**, and every **required document must be
   `verified`** first.
10. **Movements flow outward.** Operation → `PROCESS.DETAILS` (what changed, what money
    moved) → Soft Accounting (which double entry) → Posting Engine (the ledger).
11. **One operation at a time per contract**, enforced by a unique index — and there is no
    completion callback, so a caller that needs the result **polls** the operation record.
12. **Before authorization, an operation is cheap to undo; after, it is not.** A delete in
    `NAU` walks `PROCESS.DETAILS` and unwinds every projection the operation wrote. Once
    live, unwinding needs a reverse — **a planned feature that does not exist yet**.

---

## 1. What a contract is

A **contract** is a catalogued **product bound to a customer** — the system's record of the
agreement actually signed. The real-world analogue: you walk into a bank for a card, an
account is opened alongside it, and you sign a document. The signed document is the
contract; scanned paperwork is handled separately by Document Management.

The division of labour:

| | **Product** | **Contract** |
| --- | --- | --- |
| Nature | blueprint / template | the concrete instance |
| Scope | bank-wide | one customer |
| Holds | default conditions + negotiation rules | agreed conditions (negotiation rules stripped) |
| Changed by | Builder → Manager → re-catalog (new version) | **contract operations only** |
| Read by calculations | no | **yes** — accrual, fees, restrictions all read contract conditions |

A bank may hold thousands of products with only a handful catalogued, and millions of
contracts against those few.

### 1.1 The contract record

The contract is split across two Tables in a one-to-one pair.

**`CONTRACT`** — the master-state entity. It is deliberately small, holding the bindings
that define *what was sold to whom* and nothing that changes at high frequency:

| Field | Meaning |
| --- | --- |
| product | the catalogued product the contract was created from (`PF.CATALOG`) |
| customer | mandatory — a contract always has exactly one owning customer |
| currency | the contract currency, **immutable** once set |
| account | the generated `ACCOUNT` reference this contract is bound to |
| **active conditions** | the conditions in force now (§4) — the runtime terms |

The mental model to carry: the product is the class, the contract is the **instance**, and
`product` is the instance's pointer back to its type.

**`CONTRACT.DETAILS`** — the derived lifecycle hub, one record per contract. It carries no
terms, only lifecycle state: the master **status**, calculated dates (start, last activity,
maturity) and the worst active aging status. It is *derived* — nothing writes it directly.

**Statuses.** `CONTRACT.DETAILS` tracks `CURRENT`, `EXPIRED`, `MATURED`,
`PENDING.CLOSURE` and more. `CURRENT` is the operable state; the inactivity states
(`INACTIVE`, `DORMANT`, escheatment) are configured by **`DORMANCY.CONDITION`** — month
thresholds, the transaction codes that do *not* reset the inactivity clock, and the
**posting restriction applied on breach**, which is the mechanism by which a non-current
contract stops accepting operations. Delinquency aging (`GRA`/`DEL`/`NAB`) comes from
**`OVERDUE.CONDITION`**, closure from **`CLOSURE.CONDITION`** — all catalogued under
`tables.md` §04.06.

> **Maturity.** The full status-transition machinery is **not finished** — completing it
> depends on **COB** functionality. Treat the transition graph as unsettled and check the
> spec; the status *set* above is canonical, the transitions between them are not yet all
> implemented.

**Balances live elsewhere.** Deliberately: `ACCOUNT` holds only immutable and descriptive
attributes, and all high-velocity financials sit in **`CONTRACT.BALANCES`** (the Working /
Cleared / Available figures plus per-balance-type sub-ledger buckets). See
`financial-accounting.md`.

---

## 2. Negotiation

Most product settings are fixed at product level. **Negotiation** is the controlled
exception: the mechanism by which a bank officer may agree different terms with an
individual customer at contract-creation time.

**Where the bounds live.** Every **product** condition (`PF.PRODUCT.*.CONDITION`) carries
a set of **negotiation-rules** fields alongside each negotiable value. They declare:

- **which fields** are negotiable at all — a field with no negotiation rules is fixed; and
- **the permitted envelope** — e.g. a `periodic rate` defaulting to 3%, negotiable within
  a 1%–10% band.

The comparison operators (`MAXIMUM`, `MINIMUM`, `TOLERANCE`, …) come from the
**`COMPARISON.TYPE`** Table, each routed to a comparison plugin — see `tables.md` §04.02.

**Who sets them, who uses them.** The **product manager** (a bank role) sets the
negotiation rules when configuring the product. The **contract officer** consumes them
when creating a contract: for a long-standing customer opening their tenth account, they
may offer a better rate — but the envelope caps how far.

**Where the result lands.** The negotiated value does **not** overwrite the product. The
product keeps its default; the **contract** condition records the agreed value.

```
PF.PRODUCT.INTEREST.CONDITION      periodic rate 3%   + negotiation rules (min 1 / max 10)
                │  contract creation — officer agrees 5%
                ▼
PF.CONTRACT.INTEREST.CONDITION     periodic rate 5%   (no negotiation-rules fields)
```

---

## 3. Twinned condition Tables

For every product condition Table there is a **contract** counterpart:
`PF.PRODUCT.INTEREST.CONDITION` ↔ `PF.CONTRACT.INTEREST.CONDITION`,
`PF.PRODUCT.CHARGE.CONDITION` ↔ `PF.CONTRACT.CHARGE.CONDITION`, and so on across the
attribute classes catalogued in `tables.md` §04.04.

The pairs are **structurally near-identical**, with one systematic difference: **the
contract Table has no negotiation-rules fields.** Those exist only to constrain the
creation-time conversation; once the contract exists they are dead weight, and the officer
consults them on the *product* side while negotiating.

Two rules follow, and they matter:

1. **All contract-level processing reads contract conditions.** Interest accrual, charge
   application, restriction checks — every calculation on a live contract sources its
   terms from `PF.CONTRACT.*.CONDITION`, never from the product. The product is not in the
   runtime path.
2. **Contract conditions are never written by a user directly.** There is no "edit the
   contract's rate" INPUT. Every contract-related Table — `CONTRACT`, `CONTRACT.DETAILS`,
   the `PF.CONTRACT.*.CONDITION` set — carries a plugin that **rejects direct writes**, so
   the only route in is a **contract operation** (§5).

   The precise rule is *no direct user interaction* — not *no writer but the operation
   record*. The **Contract Operations Engine itself writes these Tables**, and so do
   **system actions** (COB-driven accrual, tracking cascades, scheduled operations). What
   the plugin blocks is a human — or any caller — reaching past the operation layer. That
   distinction is what makes the audit trail complete: every change to live terms has an
   operation record, a process-details snapshot, and an authorization behind it.

---

## 4. Resolved conditions → active conditions

A product may hold **several variations** of the same condition, distinguished by
effective date (and, for `CCY` attribute classes, by currency) — see the condition-ID
anatomy in `product-factory.md` §6.

**Resolved conditions** (`resolved_conditions`) is a JSON field on the **Catalog** record
listing **every** variation a catalogued product has, each with the date it starts to
apply. It is a *technical* field — hidden from the default projection, so seeing it in the
UI needs a projection change.

Its purpose is to be the single place the contract-creation flow can consult to answer
"what terms does this product actually offer, and which of them apply?" — including the
non-obvious ones, such as which conditions drive the accounting rules used to shape
postings for this contract.

**Active conditions** are the reduction of that set onto the contract. Before the create
request reaches the Contract Operations Engine, the resolved-conditions list is walked and
only the variations **in force for this contract, now** are written as the contract's
active conditions.

```
Catalog.resolved_conditions        all variations   (rate v1 from 01-Jan, rate v2 from 01-Nov, …)
        │  contract creation — pick what applies today
        ▼
Contract active conditions         only what is in force
```

So a contract created in, say, June picks up the January variation; one created in
December picks up the November variation — same product, different starting terms.

**Active conditions are mostly static.** After creation there are exactly two routes by
which they change:

- **Tracking** (§6) — the product is re-catalogued and the change cascades down.
- **`FORWARD.DATED`** — a schedule fixed relative to the contract's own start date (3% for
  the first month, 1% from the second). This is *relative* dating, unlike `DATED`, which
  versions a condition on absolute calendar dates.

---

## 5. Contract operations and the Contract Operations Engine

Every change to a contract — including creating it — is a **contract operation**.

### 5.1 Operation classes are vendor-defined

An **operation class** names a business event: `ACCOUNT-CREATE-CONTRACT`,
`ACCOUNT-CHANGE-INTEREST`, `ACCOUNT-CHANGE-PRODUCT`, lock, expiry, and many more.

Structurally, **an operation class is a list of (attribute class + class action type)
pairs** — e.g. *attribute class `interest` + action `ACCRUE`*. The executable logic hangs
off each pair (`PF.ATTRIBUTE.CLASS.ACTION`), not off the operation as a whole.

That logic — which Tables to read, what to write, where to source values — is **hardcoded
in the Contract Operations Engine (COE)**, a dedicated microservice. This is the reason
both attribute classes and operation classes must be **vendor-defined**: a bank creating
its own would need to reach into the vendor's source. The rule of thumb across CBS —
**anything named `*.CLASS` is vendor-defined.**

**Extension point.** Banks extend behaviour through **plugins bound to an existing
operation class** (`ACTION.PLUGINS.CONDITION`, pre-hook before commit / post-hook after
success — see `tables.md` §04.05). They cannot add an operation class.

**What an `OPERATION.CLASS` record declares**, beyond the (attribute class + action) pairs:

| Field | Meaning |
| --- | --- |
| `allowedInitiationTypes` | which initiation channels (§5.2) may raise this operation. An operation restricted to the child channel can only ever be spawned by another operation |
| `keepHistory` | whether this operation is written to `OPERATION.HISTORY` |
| `isContractCreation` | marks this operation as one that **creates** a contract |

**`isContractCreation` carries real weight.** It is not "may this run at creation time" —
it declares *this operation is a contract-creating operation*, and a body of
creation-specific logic keys off it: transferring product conditions onto the new contract,
and **generating the contract id**. The auto-ID plugin reads the flag: creation ⇒ generate
an id; not creation *and* no contract id supplied ⇒ raise an error, because a contract id
is mandatory for any operation against an existing contract.

The flag exists **specifically so that logic is not keyed on hardcoded operation-class
record ids**. `ACCOUNT-CREATE-CONTRACT` is the only contract-creating operation today, but
internal accounts, credits and deposits will each bring their own — and they inherit the
creation logic by setting the flag, not by being added to a list in the engine.

> **Writing a spec that introduces a new operation?** It must be registered in
> `OPERATION.CLASS` with its initiation types, history flag, creation flag and its
> (attribute class + class action type) pairs. And note the consequence of §5.1: the logic
> behind a *new* action type is **engine work, not configuration**. Reusing existing pairs
> is configuration; inventing one is a vendor code change.

### 5.2 The operation record

`PF.CONTRACT.OPERATION` is **both the request surface and the log**. Writing a record *is*
requesting the operation; the same record carries the outcome. Key fields: contract id,
operation class, effective date, **initiation type**, status.

**Initiation types** — who or what raised the operation:

| Type | Trigger |
| --- | --- |
| `USER` | an officer clicking e.g. *Create contract* in the UI |
| `TRANSACTION` | a Funds Transfer (FT) driving a change on the contract |
| `COB` / `SCHEDULED` | the nightly Close-of-Business run (e.g. daily accrual) |
| `API` / external | an external system |
| `CHILD` / `SECONDARY` | not an external initiator — an operation spawned *by another operation* |

> **Naming.** The workshop used `USER` / `TRANSACTION` / `COB` / `EXTERNAL` / `CHILD`;
> the spec index in `tables.md` §04.05 records them as `USER` / `TRANSACTION` /
> `SCHEDULED` / `API` / `SECONDARY`. Same five concepts — confirm the literal enum against
> the Confluence spec before relying on the exact strings.

**The payload.** `operationPayload` carries the data specific to *this* operation. It is
typed **`any`** — transported as a string and parsed as JSON — because its shape varies by
operation class. For `ACCOUNT-CREATE-CONTRACT` it holds the product, currency, customer and
the negotiated conditions; those are exactly the fields that end up on the `CONTRACT`
record (§1.1), which is why the payload and the contract look alike at creation.

> **Validation is thin.** The payload is checked for JSON validity and for **field
> mandatoriness per operation class**. There is **no cross-table business validation in the
> payload layer** — a check that needs to read another Table (does this product id exist?)
> lives in the engine's own logic, which raises a dedicated exception carrying a custom
> error id. Whether the mandatoriness check is implemented as a plugin or as hardcoded
> validators was **not settled** at the time of the workshop; verify before relying on it.

**Status ladder.** `pending` on write → `in progress` once the COE picks it up → then one
of:

| Terminal status | Meaning |
| --- | --- |
| `done` | the operation executed; its changes sit in `NAU` awaiting authorization |
| `error` | execution failed |
| `override` | executed, but a soft block was breached and needs confirmation (`ACTION.RESTRICTION.CONDITION`) |

**Processing is asynchronous and event-driven** — the record is written, the COE consumes
the event, the status on the record advances. Note that `done` means *executed*, **not
live**: everything is still in `NAU` until the operation is authorized (§5.5).

> **There is no completion callback.** A caller that must wait for the result — a consumer
> that inputs an operation and then needs the contract — **polls** the
> `CONTRACT.OPERATION` record until the status leaves `pending`/`in progress`.

### 5.3 Child operations

An operation can **spawn other operations**. The canonical case: creating a contract on a
product that charges an account-opening fee spawns `ACCOUNT-ISSUE-CHARGE` as a child.

**Static vs dynamic.** A child can be declared in the operation-class config so it *always*
runs, or **spawned dynamically** when a condition on the contract calls for it. The charge
case is dynamic: the engine checks whether the product carries an
`ACTION.CHARGERS.CONDITION` whose trigger action matches contract creation, and only then
raises the child. This is the point of the design — the fee is not hardcoded into contract
creation, it appears because the product was configured to charge one.

**Payload inheritance.** A child inherits the parent's payload by default, and the spawning
logic may add fields for cases that need more.

**Parent and child are not fixed roles.** The same operation class can run either way if its
`allowedInitiationTypes` permits both — `ACCOUNT-CHANGE-PRODUCT` runs as a **child** when a
periodic eligibility review forces a product change, and as a **parent** when an officer
invokes it directly.

**Nesting is capped at one level.** A parent may hold a **flat list** of children; a child
may not have children of its own. This is enforced by explicit checks — operation *chains*
are impossible by construction.

### 5.4 One operation at a time

**A contract may have only one operation in flight.** While an operation is unfinished — not
yet through to `LIV` — no second operation can be raised against the same contract; the
attempt is rejected.

The enforcement is a **partial unique index** (unique on the contract where the
"authorized" marker is null), created through Table Template's per-table SQL script
mechanism: a resources folder where a specific Table can be given its own migration
scripts. The same mechanism is available for any index a Table needs — including Postgres
**JSONB field indexes**, since Table records are stored as `jsonb`.

> **Known debt.** Table Template currently ships *all* of these per-table scripts and
> dependencies into *every* jar, rather than distributing them per Table. There was no
> ticket for this at the time of the workshop.

**Undoing before authorization.** An operation whose changes are still in `NAU` can simply
be **deleted**, and the unwind is automatic: the delete reads `PROCESS.DETAILS`, finds every
projection the operation touched, and deletes each one. Nothing financial is affected,
because **no postings exist before authorization** (§5.6). Contrast the per-record
semantics in `system-core.md` §4.6 — this is the operation-level cascade layered on top.

### 5.5 Authorization is on the operation

This is the notable deviation from the plain `NAU` → `LIV` lifecycle in `system-core.md`.
A contract operation is authorized as an **operation**, not record by record: one AUTH
covers **every change that operation made**. Only then do those changes become live and
readable.

Concretely, on AUTH the engine walks `PROCESS.DETAILS` and authorizes **every projection
listed in `changes`**, plus the history record — and releases the operation's `movements`
to Soft Accounting (§5.6). Authorizing the **parent** authorizes its children with it; you
do not authorize a child separately.

**Three preconditions to know:**

1. **It is manual.** There is no auto-authorization for contract operations — an operation
   reaching `done` does not promote itself. The intent is deliberate: the user is expected
   to inspect the operation's movements in `NAU`, confirm the result looks right, and only
   then authorize. `FUNDS.TRANSFER` has an `auto-auth` flag (see `transfers.md`) and a
   comparable flag for contract operations is expected to follow that model, but does not
   exist yet.
2. **It needs a second user.** Standard 4-eyes: the authorizing user is not the maker, and
   carries an operation-authorizer role.
3. **Required documents must be `verified`.** A contract operation cannot be authorized
   while a required **`DM.TRANS.DOCUMENT`** obligation is outstanding — an invalid required
   status **structurally blocks the contract from going `LIV`**. The obligation appears as
   `missing`, is satisfied through `DM.DOCUMENT.UPLOAD` (which mints a pre-signed S3/Ceph
   URL, so files never pass through Tables) moving it to `received`, and must then be moved
   to `verified` by a **deliberately manual** clerk review — `received` alone does not
   unblock. Which documents are required is derived by `DM.DOC.RULE`. This is the
   contract-side twin of the customer-document gate in `customer.md` §3.

> **Open items.**
> - A fifth-team extension adds the ability to carry an **override** through the operation
>   and confirm it afterwards (the soft-block path of `ACTION.RESTRICTION.CONDITION`).
>   Treat the exact model as unsettled and check the spec.
> - **Authorization is not atomic across a parent and its children.** If a parent and two
>   children are authorized and the second child fails, the first child's changes stay in
>   `LIV` while the second's do not — there is no rollback. A two-phase commit (or a single
>   local transaction where the writes share a group) is the expected fix; it is not built.

### 5.6 Where the results go

```
PF.CONTRACT.OPERATION   the request + status log
        │
        ▼
PROCESS.DETAILS         what this operation changed — which condition versions were
                        altered, and what MOVEMENTS of money occurred
        │
        ▼
Soft Accounting         applies its own rules to decide the actual double entry
                        (ALLOCATION.RULE, BALANCE.TYPE, ACCOUNTING.CONDITION)
        │
        ▼
Posting Engine          records the journal entries → Balance Engine updates balances
```

A contract operation therefore never writes the ledger itself. It declares *movements*;
Soft Accounting decides which accounts are debited and credited; the Posting Engine is the
sole writer of entries. See `financial-accounting.md` for the rest of that chain.

**Movements are declared at execution, posted at authorization.** The engine writes them
into `PROCESS.DETAILS` while the operation runs, but they are only handed to Soft
Accounting on AUTH — so **no postings exist for an unauthorized operation**. That is what
makes a pre-authorization delete (§5.4) safe, and it is also the asymmetry that matters
most operationally:

| | Before authorization | After authorization |
| --- | --- | --- |
| Where the changes are | `NAU` | `LIV` |
| Postings | none | journal entries written, balances moved |
| How to undo | **delete** — cascades through `PROCESS.DETAILS` | **reverse** — see below |

> **Reverse is a planned feature, not a current one.** The platform has the per-record
> `REVERSE` operation and `RNAU` reversal drafts (`system-core.md` §4.5), and journal
> entries carry reversal markers (`financial-accounting.md`) — but **reversing a contract
> operation** is not built. What is missing is the *composition*: cascading a reverse
> across every Table one operation touched, and generating the counter-postings. Design was
> open at the time of the workshop, with a counter-posting ("a movement in the other
> direction") named as the likely approach. Until it lands, treat an authorized contract
> operation as not undoable through the product, and do not write specs that assume a
> reverse path exists.

---

## 6. Tracking — cascading a product change into live contracts

Contract conditions are copies, so a product change does not reach live contracts by
itself. **Tracking** is the mechanism that makes it reach them.

The flow:

1. A product manager edits a product condition (e.g. the default periodic rate) via the
   **Builder**, then re-validates and re-catalogs. The Catalog record gets a **new product
   version** — the same product id, a later version.
2. For each attribute whose class supports tracking, the change is queued for propagation
   (`PRODUCT.TRACKER` — a system-generated, read-only mass-maintenance queue).
3. **COB** processes the queue, updating the corresponding **contract** conditions on every
   linked live contract.

Net effect: one edit plus one re-catalog updates every contract on that product.

**Per-attribute control.** Whether an attribute participates is governed by its attribute
type (`product-factory.md` §4) plus the **contract link type** set on the product link:

- **`TRACKING`** — participates; product changes cascade in.
- **`NON.TRACKING`** — the contract's copy is frozen at instantiation; later catalog
  versions do not reach it.
- **`TRACKING.ONLY`** — the contract may never diverge; it perpetually mirrors the product.
- **`CONTRACT`** — used almost exclusively by `BALANCE.MAINTENANCE`; locks values to the
  live contract so future catalog versions cannot overwrite historical data.

This is also why product **versioning** matters: the version is what identifies a
cascade-worthy change while keeping every affected contract pointed at the same product.

---

## 7. Putting it together — creating a contract end to end

```
1. Officer picks a catalogued product and a customer.
2. System reads Catalog.resolved_conditions → determines which condition
   variations apply today.
3. Officer negotiates: product conditions' negotiation rules bound which fields
   may deviate and by how much.
4. Officer submits → a PF.CONTRACT.OPERATION record with operation class
   ACCOUNT-CREATE-CONTRACT and initiation type USER.
5. COE consumes the event, runs each (attribute class + action) pair:
   writes the contract's PF.CONTRACT.*.CONDITION records — product defaults,
   overridden by whatever was negotiated, minus the negotiation-rules fields —
   as the contract's ACTIVE CONDITIONS.
6. PROCESS.DETAILS records what changed and what moved. Operation status → done.
   Everything so far is in NAU; no postings yet.
7. Required DM.TRANS.DOCUMENT obligations are uploaded and verified.
8. A SECOND user AUTHORIZES the operation → all of it becomes live, children
   included; movements go to Soft Accounting → Posting Engine → balances.
9. From here on: every calculation reads the CONTRACT conditions, and every
   further change goes through another contract operation.
```

---

## 8. A worked example — create an account contract with an opening fee

From the 2026-09-04 workshop demo. Useful as the canonical shape of a contract operation,
end to end, with the numbers.

**Product setup.** An `accounts` product in currency **XAF**, carrying Customer, Account,
Accounting, Charge and Action Charges conditions. The fee is wired in three hops:

```
PF.PRODUCT.CHARGE.CONDITION   →  CC.CHARGE.TARIFF.GROUP    →  CC.GLOBAL.CHARGE.RULE
                                 rule: retail customer         type FLAT, maximum 10
                                 (customer sector 1001)
```

`ACTION.CHARGERS.CONDITION` sets **when** and **how**: trigger action = contract creation,
application method = **`CAPITALISE`** (post straight to the balance, as opposed to `DUE` or
`PAY`). The math itself is done by the stateless `proj-charges-calculation-engine`, not by
Product Factory — see `interest-and-charges.md`.

**Input.** One `CONTRACT.OPERATION` record: class `ACCOUNT-CREATE-CONTRACT`, effective date
today, initiation type `USER`, payload `{product, currency, customer}`. Contract id
autogenerated (§5.1). Status `pending`.

**After execution — everything in `NAU`:**

| | |
| --- | --- |
| Parent operation | status `done`, contract id written |
| Child operation | `ACCOUNT-ISSUE-CHARGE`, spawned dynamically off the Action Charges condition, parent link set, initiation type child, status `done` |
| `PROCESS.DETAILS` `changes` | the account record and its projection, contract, contract details, `SCHEDULED.OPERATION`, then the contract conditions — account, accounting, charge, action-charges, customer |
| `PROCESS.DETAILS` `movements` | one movement on the **child**: 10 units in contract currency, with its balance action, attribute class and action type |

**Document gate.** A required `DM.TRANS.DOCUMENT` obligation appears as `missing`; upload
moves it to `received`; manual clerk review moves it to `verified`. Authorization is blocked
until then.

**Authorization.** A second user authorizes the **parent**; the child goes with it.

**After authorization — everything in `LIV`:**

| Object | Result |
| --- | --- |
| Contract | `LIV`, with customer, account, product and active conditions (account, accounting, charge, action charges, customer) |
| Account | category 1001, linked to contract, customer and currency |
| `CONTRACT.BALANCES` | cleared / working / available = **−10** — the new account is in **overdraft**, because the fee was capitalised against a zero opening balance |
| Journal entries | **one debit** on the new account (`JOURNAL.ENTRY.AL`) and **one credit** to Profit & Loss (`JOURNAL.ENTRY.PL`), base amount 10, balance type action-charges, transaction reference = the operation id |

> **Why the overdraft went through.** The demo product configured **no funds-verification**
> — no `BALANCE.AVAILABILITY.CONDITION`, no `POSTING.RESTRICT`, no `LIMIT.CONDITION`. A
> product that *does* configure them would not let a capitalised opening fee drive the
> balance negative. Do not read the −10 as the expected outcome of charging a new account;
> read it as what happens when nothing is set to stop it.

Note the two ledgers: `JOURNAL.ENTRY.PL` **structurally prohibits** a physical account or
balance type, which is why the credit leg is a P&L category and not an account. See
`financial-accounting.md`.

---

## 9. Open items and cautions

- **Enum literals** for initiation types differ between the workshop and the spec index
  (§5.2) — verify against Confluence.
- **Override propagation** through an operation (§5.5) was described as a recent extension;
  the model may still move.
- **Attribute-class coverage is incomplete** — the *Vendor Attribute Class Registry*
  tracking page (under *Architecture and Technical Design*, split by spec) was missing the
  **Apply Transactions Engine** attribute classes at the time of the workshop.
- **The `accounts` product class is still marked draft** and will be revisited during model
  banking; its default settings are not final.
- **No contract UI yet** — the flows above are exercised through Table INPUT, so
  screen-level behaviour (`ACTION.PRESENTATION.CONDITION`) is largely unproven. The L3
  rebuild is expected to construct the operation payload from user input; treat it as UX
  over unchanged mechanics unless the spec says otherwise.
- **Reverse of a contract operation does not exist** (§5.6). Planned; no design settled.
  Nothing downstream should assume a reverse path.
- **Parent/child authorization is not atomic** (§5.5). Partial promotion to `LIV` is
  possible today.
- **Payload validation ownership is unsettled** (§5.2) — plugin vs hardcoded validators was
  not known to the presenters.
- **Contract status transitions are incomplete** (§1.1), pending COB.
- **`ACTION.CHARGERS.CONDITION` triggering is only wired to contract creation.** The other
  trigger actions the Table declares (e.g. account close) need engine work before a child
  charge will spawn for them.
- **Table naming is inconsistent across this bundled skill.** This reference uses the `PF.`-
  prefixed forms heard in the workshops (`PF.CONTRACT.OPERATION`,
  `PF.CONTRACT.*.CONDITION`); `tables.md` indexes several of the same Tables unprefixed
  (`CONTRACT.OPERATION`, `PROCESS.DETAILS`, `OPERATION.CLASS`), and `CONTRACT` itself is
  catalogued under **Accounts** (§05.01), not Product Factory. Confirm the literal
  registry id against Confluence before writing it into a spec.
