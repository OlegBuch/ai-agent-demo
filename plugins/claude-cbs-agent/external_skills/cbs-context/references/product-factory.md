# Product Factory — product creation reference

This is an **opt-in** reference covering the CBS **Product Factory (PF)** module —
specifically the **product-creation** half: how a bank defines a financial product out
of reusable building blocks and publishes it to the catalog customers are sold from. It
is **not** loaded automatically with the core context — the `proj-context` skill offers it
after `system-core.md` loads, and reads it only if the user opts in.

> **Scope.** PF has two halves: **product creation** (defining a product and getting it
> into the catalog) and **product operation** (creating a contract from a product and
> running its lifecycle). **This reference covers product creation only.** Contracts,
> negotiation, the **Contract Operations Engine** and the tracking cascade are the
> product-operation side and live in the companion reference
> **`product-factory-contracts.md`**; they are named below only where the creation side
> touches them.

> **Current scope.** The only product class that exists today is **`accounts`** — no loans
> or deposits yet, though the model is built to carry them. It is still marked **draft**
> and will be revisited during model banking.

> **Cross-references.**
> - The **INPUT** operation, **pre-hook / post-hook** phases, **plugins**, **Tables**,
>   and the `NAU`/`LIV`/`HIS` record model that PF is built on are all defined in
>   `system-core.md`. PF adds no new infrastructure — it is ordinary CBS Tables, with
>   ordinary operations and hooks, arranged into a product builder.
> - PF depends on a **large number of other modules**: Interest & Charges, Account,
>   Customer, Transfer, Accounting, Limits, and SM (users). A product is assembled by
>   referencing capabilities those modules provide.
> - **Authoritative specs (Confluence).** This guide is a curated summary. The canonical
>   PF specifications live in the CBS Confluence spaces; if the **Atlassian MCP** is
>   connected, fetch those pages for the fuller, more current detail.

The product builder mirrors **object-oriented programming** — **inheritance**,
**abstraction**, and **polymorphism** all apply, and a product is **assembled from small
reusable blocks**.

---

## TL;DR — if you remember only this

1. **A product is built from blocks, OOP-style.** Attribute **class** → attribute →
   product **class** → product **type** → **product** → **conditions**. Each layer
   narrows the abstract into the concrete.
2. **Vendor vs bank.** **Attribute classes** and **product classes** are
   **vendor-defined** — the fixed vocabulary. **Attributes**, **product types**, and
   **concrete products** are **bank-defined**, built on that vocabulary. Banks cannot
   create classes.
3. **Abstract vs concrete.** An **attribute** is abstract (*"works with interest"*); a
   **condition** is concrete (*"10% per year, on this schedule"*). A product is, in
   effect, **the set of conditions under which it is signed**.
4. **One INPUT, two records.** An INPUT on the **Builder** Table does **not** create a
   sellable product — it creates a **DRAFT** and writes two records at once: one in
   **Product** (the draft) and one in **Manager** (meta for validation/cataloging).
5. **Status ladder: `DRAFT` → `VALIDATED` → `CATALOG`.** **Validate** and **Catalog** run
   via INPUT on **Manager**. Catalog **always requires VALIDATED** — there is no path that
   skips validation. Only at `CATALOG` is the product for sale.
6. **Product ≠ Catalog.** They share an id but are independent: **Product** holds the
   working state, **Catalog** is the list offered for sale. A bank may hold thousands of
   products while only a few are sellable.
7. **Inheritance.** A product may name a **parent** and selectively change it —
   **override** a condition by default, or **merge** it (add rather than replace) when the
   attribute class allows.
8. **Cataloguing again makes a new version, not a new product.** Same id, later version —
   and that is what drives the **tracking** cascade into live contracts
   (`product-factory-contracts.md` §6).

---

## 1. The building-block hierarchy

A product is assembled from small reusable blocks. Each block specializes the one above
it — vendor primitives at the top, the concrete sellable product at the bottom.

```
Attribute Class    (vendor-defined)  →  what CAN be in a product ("works with interest")
  └─ Attribute     (bank-defined)    =  Attribute Class + a type
       │
Product Class      (vendor-defined)  =  a set of attribute classes (some mandatory)
  └─ Product Type  (bank-defined)    =  bank's category built on a Product Class
       │
Product            (built via Builder) → DRAFT → VALIDATED → CATALOG
  └─ Conditions    concrete terms (the rate, dates, customer, account)
```

**Vendor-defined** (banks **cannot** create them): **attribute classes** and **product
classes** — the fixed vocabulary banks build *within*.

**Bank-defined** (built on the vendor primitives): **attributes**, **product types**, and
**concrete products**.

---

## 2. Attribute Class

An **attribute class** declares **what *can* be in a product** — e.g. *working with
interest*. Attribute classes are **vendor-defined**; banks cannot create them and instead
build **attributes** on top of the shipped list.

| Field            | Meaning                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `id`             | e.g. `interest`                                                          |
| `name`           | display name                                                            |
| `types`          | behavior flags governing the attribute — see §4                         |
| **bank prefix**  | used for accounting — separates *where* postings are recorded           |
| **logical group**| a grouping such as `business` or `technical`                            |

Each attribute class has **specific actions bound to it**, whose logic is **hardcoded in
the Contract Operations Engine** (product-operation side, out of scope here) — *this is
why attribute classes must be vendor-defined*: the engine has to know, at compile time,
what each class does.

**Immutability.** Once an attribute class (or an attribute) is created it **cannot be
changed except for its description** — a **plugin enforces this**.

> **Where the shipped list is tracked.** A *Vendor Attribute Class Registry* page (under
> *Architecture and Technical Design* in Confluence) collects every vendor-defined
> attribute class in one place, split by functional spec. It was **not yet complete** at
> the time of the v2 workshop — the **Apply Transactions Engine** attribute classes were
> missing — so treat it as indicative, not exhaustive.

---

## 3. Attribute

An **attribute = an attribute class + a type**. Banks **create attributes** from the
vendor's attribute classes and attach them to a product (via the **Builder**, §6). The
attribute is still abstract — it says the product *works with* interest, not yet at what
rate.

In record terms an attribute carries little more than a **human-readable name and
description** plus its **attribute class** link — it is the bank's own vocabulary
(`REGULAR.INTEREST`, `PENALTY.INTEREST`, `MONTHLY.FEE`) laid over the vendor's classes.
That is what makes the `MULTIPLE` type (§4) useful: several distinctly-named attributes
can share one attribute class within a single product.

---

## 4. Attribute types

The `types` flags on an attribute (class) govern how its values behave across currency,
time, inheritance, and the product→contract link. An attribute may carry several.

| Type             | Behavior                                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CCY`            | Values are strictly **siloed by currency** — a product must have separate conditions for USD, EUR, etc.                                                                                                  |
| `OPT.CCY`        | Currency is **optional** (mostly for flat-percentage CHARGES).                                                                                                                                          |
| `DATED`          | Fully **version-controlled over time** via `EFFECTIVE.DATE`.                                                                                                                                            |
| `MULTIPLE`       | A single product can inherit **multiple properties** of this class (e.g. `REGULAR.INTEREST` and `PENALTY.INTEREST`).                                                                                     |
| `MERGE`          | Inheritance **does not overwrite** parent data — the system fuses the child's rules with the parent's base rules (see §7).                                                                               |
| `NON.TRACKING`   | Once instantiated onto a contract, **changes to the master catalog do not cascade** to that contract.                                                                                                    |
| `TRACKING.ONLY`  | The user **cannot change** this at the contract level; it **perpetually mirrors** the master product.                                                                                                    |
| `TRACKING`       | Enables **dynamic updates**: the attribute is linked to the master product so a **re-catalogued (new-version) product** cascades its changed conditions into every live contract — then fine-tuned (`TRACKING` / `CUSTOM.TRACKING` / `NON.TRACKING`) **at the product-link level**. Propagation is queued in `PRODUCT.TRACKER` and applied by **COB**. |
| `CONTRACT`       | Used almost exclusively by `BALANCE.MAINTENANCE`: **locks values tightly to the live contract** so future catalog versions cannot overwrite historical data.                                             |
| `FORWARD.DATED`  | Lets users **negotiate and schedule** a condition (e.g. a rate change) to take effect automatically later — on a schedule **relative to the contract's own start date** (3% for month 1, 1% from month 2). Contrast `DATED`, which versions on **absolute calendar** dates. |

---

## 5. Product Class and Product Type

A **product class** is a **product line** — a set of base, abstract products the vendor
provides (e.g. *lending*). Concretely, **a product class is a set of attribute classes**,
some **mandatory** and some **optional**. To build a concrete product a bank uses the
mandatory attribute classes and may omit the optional ones (e.g. lending **requires**
interest, but **charges** is optional). Product classes are **vendor-defined**. **One
product class ships currently: `accounts`.**

A **product type** is a **bank-created category** built on a product class (e.g. a
*personal loan* built on *lending*). The bank **reuses** the product class's attribute
classes, **may remove optional** attributes, but **cannot remove mandatory** ones. A
**validation plugin** checks at creation that added attributes are **allowed** and all
**mandatory** attributes are **present**.

The product type is also where the bank declares, **per attribute**, whether it is
**mandatory** in products of this type — e.g. an *account parameters* attribute mandatory,
a *charge fee* attribute optional so a fee-free product is legal. That flag is what
**Validate** (§6) enforces on the draft.

> A product type is **not yet a sellable product** — it is the category; the sellable
> thing is the **product** built from it (§6).

---

## 6. Building a product — Builder, Product, Manager, Catalog

A product is created through the **Builder** Table. A Builder record specifies:

| Field                 | Meaning                                                          |
| --------------------- | --------------------------------------------------------------- |
| `id`                  | the product id                                                  |
| `type`                | the **product type** (not the class) — mandatory                |
| **parent product**    | optional — for inheritance (§7)                                 |
| **currencies**        | the currencies the product may be sold in                       |
| `attributes`          | the attributes the product is made of (e.g. principal interest) |
| `conditions`          | the **concrete terms** under which a contract is signed — one condition id per attribute |
| **effective date**    | per attribute entry — for `FORWARD.DATED` scheduling relative to contract start (§4) |
| **contract link type**| per attribute entry — the tracking behaviour of that link (§4)  |

An **attribute is abstract** (*works with interest*); a **condition is concrete** (*10%
per year, on this schedule*). **A product is, in effect, the set of conditions under which
it is signed.**

Attributes are listed **repeatedly** to express a schedule: the same attribute appearing
twice with different effective dates (e.g. blank and `1 month`) is how a promotional
first-month rate is configured.

### Condition record IDs

A condition's record id is **composite**, not opaque:

- it embeds the **date from which the condition is globally available** in the system —
  the same date that appears in the Catalog's resolved conditions; and
- it embeds a **currency segment** when the condition's attribute class is currency-bound
  (`CCY`, §4), so each currency carries its own terms.

In the Builder you may either **name the full id** or **name only the base name** and let
the system resolve the full id of the variation currently active. (The id-composition
rules are documented separately and are rarely something you author by hand.)

**An INPUT on Builder does not create a sellable product.** It creates a **DRAFT** and
writes **two records at once**:

- a record in **Product** — the draft product (status `DRAFT`) with its attributes and
  base info; and
- a record in **Manager** — meta-information about the product, used to **validate** and
  **catalog** it.

### Validate and Catalog

**Validate** and **Catalog** are actions run via **INPUT on Manager**. A Manager record is
deliberately small: the **record id** (the shared product id), the **action** (`validate`
or `catalog`), a **`combine actions`** flag (below), and options such as the product's
**expiry date**.

```
INPUT on Builder ──> DRAFT      (writes Product + Manager records)
INPUT on Manager ──> Validate   ──> VALIDATED   (conforms to its product type)
                     Catalog    ──> CATALOG      (requires VALIDATED; writes Catalog)
```

- **Validate** — checks the product conforms to its **product type** (no stray
  attributes, all mandatory attributes present). On success the status becomes
  `VALIDATED`.
- **Catalog** — **requires `VALIDATED`**, then sets status to `CATALOG` and writes the
  product into the **Catalog** Table — the list of products the bank offers for sale.

**Both in one INPUT.** The two actions can be combined by selecting `validate` and setting
the **`combine actions`** flag: **Validate runs on the pre-hook** and **Catalog on the
post-hook** — if the pre-hook sets `VALIDATED`, the post-hook catalogs. If validation
fails (a stray attribute, a missing mandatory one), nothing is catalogued. **Catalog
always requires `VALIDATED`** — there is no path that skips validation.

> **Terminology.** *Validate and Catalog* is the CBS name for what Temenos calls
> **Proof and Publish** — the same two-step promotion.

### Product vs Catalog

**Product** and **Catalog** share the **same id** but are otherwise **independent**:

- **Product** holds the **working/temporary** state. The product exists in the catalog
  only once its status is `CATALOG`.
- A bank may hold **thousands of products** while only a **small subset** is for sale.

The **Catalog** record holds: a **description**, **status**, **product type**, the
**product**, **date available**, **expiry date**, **currencies**, a **product version**,
and **resolved conditions**.

- **Date available** — the date from which the product may actually be sold. It is
  currently set automatically to the publication date; the model allows any future date.
- **Product version** — re-entering the Builder, changing something and re-cataloguing
  produces a **new version of the same product** (same id). Versioning is what drives the
  **tracking** cascade into live contracts — see `product-factory-contracts.md` §6.
- **Resolved conditions** — a **hidden technical JSON field** (add it to the projection to
  see it) listing **every** condition variation the product carries, each with the date it
  starts to apply. It is what the contract-creation flow reads to decide which terms apply,
  including the accounting-rule settings that shape the contract's postings. Its reduction
  onto a contract — **active conditions** — is covered in `product-factory-contracts.md` §4.

---

## 7. Parent product and inheritance

A product may specify a **parent product** and selectively change parts of it — this is
where the OOP framing pays off.

- **Override (default).** The child declares an attribute with the **same id** as one in
  the parent but with a **different condition**; the attribute is kept and its condition is
  **overridden** by the child's (e.g. inherit a 20% loan, override the interest condition
  to 18%).
- **Merge.** If the attribute class has the **`MERGE`** type (§4), the child's condition is
  **added rather than replacing** the parent's — **two conditions coexist**, typically
  distinguished by **effective date** (with the **`MULTIPLE`** flag).
