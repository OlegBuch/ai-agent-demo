# CBS Table Catalog — Tables and other services

This is an **opt-in** reference: the **catalog (registry index) of concrete business
Tables** — plus the supporting non-Table services — organized by the functional module
they belong to. It is **not** loaded automatically with the core context — the
`proj-context` skill offers it after `system-core.md` loads, and reads it only if the
user opts in.

> **What this is — and isn't.** The other references teach the *model* (what a Table is,
> the lifecycle, SMS, Product Factory). **This one is the directory of actual named Table
> instances** — use it to answer "what is `SM.USER`?", "which Tables live in System Core?",
> or "where's the spec for `PF.BUILDER`?". Each row keeps only a one-line purpose plus the
> spec link (where one exists) so it stays a fast lookup, not a duplicate of the deep
> references.
>
> **Vocabulary.** Every ID below is a **business / service Table** (a logical service
> unit hosted in a `table-template` Group pod — `system-core.md` §1, §6), *not* a
> database table. IDs use a dotted
> convention (`SYSTEM.PARAMETER`, `SM.USER`, `PF.CLASS`). The final section, **Other
> services**, lists supporting microservices that are *not* Tables.
>
> **Source & freshness.** Mirrors the Confluence **Tables and other services** index
> (https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4969693433).
> It is a **living index** — most rows are indexed *ahead of* their specification
> (Spec **—** below means no spec page yet), and the set grows as modules are specified.
> Treat the linked Confluence pages as canonical when this file and they disagree.

**Structure.** The `##` domains and numbered `###` chapters mirror the functional-spec
chapters of the index. Where the index links a chapter to its functional-spec page on the
**client instance** (`bank-proj.atlassian.net`, TB space), that link is on the chapter
heading; individual Table specs live on the internal instance (`innowise-group`, CBSA).
SMS, Product Factory, and Customer (Party) have a companion model reference in this skill
(`references/sms.md`, `references/product-factory.md`, `references/customer.md`); every
other domain is index-only here.

## System Core

The installation-wide foundation Tables. Chapter 01.09's two Tables are the literal
`System Core` Table Group used as the example in `system-core.md` §6.

### [01.02 Dynamic Data Dictionary](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1415577770)

| ID              | Purpose                                                                                                                                                                                                                          | Spec                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `VIRTUAL.TABLE` | Reusable, data-driven enumerated value sets for the Dynamic Data Dictionary — each record is one named list of allowed values (e.g. EB.STATUS → ACTIVE, DORMANT, CLOSED), backing the `VIRTUAL_TABLE` field type so a field's permitted values resolve from this Table rather than a hard-coded ENUM. | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4982407635 |

### [01.05 Languages & Translations](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1484423184)

| ID               | Purpose                                                                                                                                                                        | Spec |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `LANGUAGE`       | Language master table — defines each display language (ID 1 reserved for English) with its ISO mnemonic (e.g. de_DE), date and amount formats and a link to allowed character sets. | —    |
| `DICTIONARY`     | Central label repository — stores multilanguage field labels and tooltip descriptions per term key (e.g. ACCOUNT.TITLE) that override projection labels when USE.DICTIONARY is enabled. | —    |
| `CHARACTERS.SET` | Allowed-character-range registry — defines named character sets (e.g. LATIN.BASIC, CHINESE.UTF8) as start/end code ranges used to validate input per language.                    | —    |

### [01.08 Validation engine](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1415446681)

| ID               | Purpose                                                                                                                                                       | Spec |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `BUSINESS.RULES` | _Listed in the index; description and specification not yet published._                                                                                          | —    |
| `OVERRIDE`       | Registry of non-fatal warnings — defines override codes (e.g. AC-OD) with multilanguage message text, a Dispo-allowed flag and the security class required to approve the exception. | —    |
| `ERROR`          | Registry of fatal error blocks — defines error codes (e.g. AC-BLOCKED) with multilanguage message text supporting {} replacement variables injected at runtime.   | —    |

### [01.09 System Parameterization (Enterprise Configuration)](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1415446730)

| ID                 | Purpose                                                                                                                                                                              | Spec                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `SYSTEM.PARAMETER` | Installation-wide configuration singleton — one `SYSTEM` record holding global, cross-cutting rules (session timeout, pagination & report limits, UI toggles, customer-data storage strategy). | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4956815370 |
| `COMPANY`          | Defines the bank's operational units and their topology — each record is a **Lead Company** (owns its ledgers) or a **Branch Company** (writes into its lead's ledger). Backs the Master/Branch split in `system-core.md` §2. | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4957241350 |

### [01.10 Date & Holiday Management](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1484226581)

| ID              | Purpose                                                                                                                                                   | Spec |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `DATES`         | Business date ledger — holds one record per company with TODAY, last/next working day and value-date boundaries, rolled forward only by the COB batch.        | —    |
| `HOLIDAY`       | Calendar definition table — one record per country, region and year listing weekend days and monthly holiday dates, compiled into fast W/H/X lookup strings.  | —    |
| `EB.TIME.ZONES` | Time zone registry — catalogues IANA zones (e.g. America/New_York) with description and UTC offset, linked to COMPANY profiles to localize date-time values across the system. | —    |

### [01.11 System Tables (Static Dictionaries)](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1428848649)

| ID                 | Purpose                                                                                                                                                        | Spec |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `SECTOR`           | Highest-level party classifier — defines the legal/economic category of a customer (e.g. 1001 Retail, 3001 Bank) with a Basel risk exposure mapping.               | —    |
| `INDUSTRY`         | Economic activity classifier — defines granular industry codes for risk concentration with mapping to external taxonomies (e.g. ISIC J6201).                       | —    |
| `TARGET`           | Marketing segment classifier — defines the customer priority segment (e.g. High Net Worth, Mass Market) used in onboarding and defaulting rules.                   | —    |
| `RATING`           | Credit rating dictionary — catalogues external agency or internal credit scores (e.g. S&P-AAA) with the issuing agency.                                            | —    |
| `LEGAL.DOC.TYPE`   | KYC identity-document dictionary — defines document types (e.g. PASSPORT, TAX_ID) with issuing-country restrictions, mandatory-expiry flag and a regex mask validating the document number. | —    |
| `COUNTRY`          | ISO country master list — drives nationality and residence with a region grouping and a HIGH_RISK flag that automatically triggers AML/KYC oversight.              | —    |
| `COUNTRY.GROUP`    | Country grouping table — bundles multiple ISO countries into arbitrary groups (e.g. EEA, OPEC) for regional reporting, tax residency assessment or sanction screening. | —    |
| `CUSTOMER.DEFAULT` | Auto-defaulting rule table — keyed by SECTOR ID, injects predefined values (e.g. default Industry, Target) into new customer payloads during onboarding.           | —    |

### [01.13 Currency Definition and Logic](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1485176864)

| ID                | Purpose                                                                                                                                                       | Spec |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `CURRENCY`        | Static currency dictionary — defines each ISO currency's immutable properties (numeric code, decimals, quotation code, precious-metal flag) for rounding and FX resolution. | —    |
| `CURRENCY.MARKET` | Trading market definition — configures up to 99 currency markets (e.g. Interbank, Cash/Notes) with flags allowing rate differentiation by Business Unit or Amount Band. | —    |
| `CURRENCY.RATES`  | Live exchange-rate cache — volatile registry keyed by Market.Unit.Base.Quote holding time-bounded BID/ASK/MID rates segmented by amount bands.                       | —    |
| `CURRENCY.ORDER`  | Asynchronous rate ingestion gateway — staging queue for bulk rate uploads from external feeds (e.g. Reuters, Bloomberg) with activation/expiry timestamps.           | —    |

### 01.14 Delivery Foundation (Notification, Document Hub)

| ID                        | Purpose                                                                                                                                                      | Spec |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `DE.ADDRESS`              | Communication endpoint registry — stores each customer's verified delivery vectors (e.g. 10050.PRINT.1), synced one-way from Customer Master, with a HOLD.OUTPUT flag to divert physical mail. | —    |
| `DE.BIC`                  | Global SWIFT routing directory — validates and enriches outbound message destinations (e.g. BOFAUS3N) with institution details and an RMA flag confirming authorization to exchange messages. | —    |
| `DELIVERY.MAPPING`        | Transformation rule store — holds JSONata scripts keyed by domain event type (e.g. PAYMENT_SETTLED) that reshape raw Core events into flat ViewModels or ISO 20022 XML. | —    |
| `DOCUMENT.TEMPLATE`       | Presentation blueprint repository — stores multi-lingual HTML/Handlebars and SWIFT XML templates per channel, with an XSD version binding for SWIFT_MX validation.   | —    |
| `DELIVERY.CHANNEL.CONFIG` | Carrier routing gateway config — maps each delivery channel to its carrier protocol (SMTP, IPP, REST, USSD_GW, SWIFT_MQ) and endpoint URI.                            | —    |
| `DELIVERY.QUEUE`          | Immutable outbound spooler — tracks every delivery job with status lifecycle (PENDING, SENT, ACK_RECEIVED…), automated retries and a SHA-256 document hash for non-repudiation. | —    |

### 01.15 Basic customization

| ID                 | Purpose                                                                                                                                                       | Spec |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `WORKSPACE.MENU`   | Hierarchical navigation registry — defines nestable, role-pruned menu trees with localized titles whose items launch a PROJECTION, ENQUIRY or nested MENU by target ID. | —    |
| `CONTEXT.WORKFLOW` | Reactive UI intelligence rules — links a data-entry field on a projection (e.g. DEBIT_ACCOUNT) to target Enquiries auto-launched on blur, rendered as a side panel, modal or tooltip. | —    |

## SMS (Security Management System)

Identity, roles, access control, audit, and exception handling. Model: `references/sms.md`.

### [02.01 User Profile (Identity & Access Governance)](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1415282693)

| ID        | Purpose                                                                                            | Spec                                                |
| --------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `SM.USER` | Core identity entity — maps an authenticated user (via Keycloak) to their CBS authorization context. | https://innowise-group.atlassian.net/wiki/x/e4BqIgE |

### [02.02 User Groups & Roles, Data Access Control](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1415053373)

| ID               | Purpose                                                                                                                                                  | Spec                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `SM.USER.GROUP`  | Reusable role definition — bundles functional permissions, data-access rules, and override classes into a "job type" users belong to.                      | https://innowise-group.atlassian.net/wiki/x/HgDvIgE        |
| `SM.DATA.ACCESS` | Attribute-level (**ABAC**) access rules — each targets one Table with an ordered set of field conditions and an `ALLOW` or `DENY` result.                  | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4892786699 |
| `ST.ROLE`        | Static catalogue of external capacity roles (e.g. `PROXY`, `GUARANTOR`) — `OTHER_INFO_REQ` flag controls whether a linking party must supply additional documentation. | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4995383535 |

### [02.03 Access Administration (Password Governance & Lifecycle)](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1455554567)

| ID               | Purpose                                                                                                                                                    | Spec |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `PASSWORD.RESET` | Transient admin action record — instructs Keycloak to issue a one-shot temporary password with a mandatory change-on-next-login flag, never persisting the credential in CBS. | —    |
| `SIGN.ON.RESET`  | Account unlock action record — lets a security officer clear a user's IdP failed-login violations and restore ACTIVE status, with a mandatory UNLOCK.REASON captured for audit. | —    |

### [02.04 Logging User Action (Protocol & Audit Service)](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1485406253)

| ID         | Purpose                                                                                                                                                     | Spec |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `PROTOCOL` | Immutable central audit log — records user sign-ons, table access, functions and security violations, watermarked with user ID, timestamp, terminal IP and event category (SECURITY, TECHNICAL, AUDIT). | —    |

### [02.05 Override and Dispo Processing (Exception Management)](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1485144082)

| ID                       | Purpose                                                                                                                                                  | Spec |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `OVERRIDE.CLASS`         | Authorization class registry — defines named approval authority profiles (e.g. OVR.MANAGER) restricting which users may approve specific override warnings.      | —    |
| `OVERRIDE.CLASS.DETAILS` | Dynamic threshold rules — per-override conditions (field, operand, value, e.g. amount GE 10000) that escalate the required OVERRIDE.CLASS when the condition evaluates true. | —    |
| `DISPO.OFFICER`          | Escalation hierarchy record — defines each officer's competence and dispo review limits, a REPORTING.TO chain for auto-escalation and date-bounded substitution during absences. | —    |
| `DISPO.ITEM`             | Exception lifecycle tracker — one record per routed override that locks the parent transaction in NAU until its status (NEW, PENDING, APPROVED, DECLINED) reaches APPROVED. | —    |

### 02.06 Department Structure (Org Chart)

| ID                      | Purpose                                                                                                                                                   | Spec |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `BUSINESS.UNIT`         | Organizational hierarchy node — defines each unit by type (BANK, DIVISION, REGION, BRANCH, DEPARTMENT, TEAM) with a self-referencing parent link, company book, manager and cost/profit center mappings. | —    |
| `ACCOUNT.OFFICER`       | Relationship manager registry — defines each RM as a leaf node linked to exactly one BUSINESS.UNIT and optionally to an SM.USER login profile.                  | —    |
| `BUSINESS.UNIT.HISTORY` | Append-only reorganization ledger — chronologically records every unit move with old parent, new parent and effective date, enabling historical tree rebuilding for audits. | —    |

## Customer (Party)

Party-master and relationship Tables. Model: `references/customer.md` (the create →
document → authorize lifecycle, prospect promotion, relationships, and external-user
attachment).

### [03.01 Customer (Party) Master Data Management](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1452113935)

| ID                         | Purpose                                                                                                                                                       | Spec                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `CM.CUSTOMER`              | Master party entity — one record per active financial customer (Retail, Corporate, Bank, Prospect), holding all identity, contact, classification, status, and relationship data. | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4880793837 |
| `CM.MISC.PARTY`            | Pre-customer party register — prospects, UBOs, and external signatories as non-financial parties; each record is reversed out to history once promoted into a full `CM.CUSTOMER`. | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4898422982 |
| `CM.CUSTOMER.RELATIONSHIP` | Relationship matrix — links two parties (customer-to-customer or customer-to-misc-party) with a relation code and date, recording the direct and reverse cross-references.        | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4897768759 |
| `CM.CUSTOMER.STATUS`       | Lifecycle reference Table — the customer state machine (Active, Closed, Inactive…) with an optional inactivity reason and description.                                            | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4899045378 |
| `CM.RELATION.TYPE`         | Relation-code reference Table — the available linkage types, each carrying a forward description and the reciprocal reverse code auto-applied to the related party.               | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4898947076 |

## Product Factory

Product creation *and* operation. Models: `references/product-factory.md` (the creation
half — building-block hierarchy, the Builder → Product + Manager → `VALIDATED` → Catalog
flow) and `references/product-factory-contracts.md` (the operation half — contracts,
negotiation, the Contract Operations Engine, resolved vs active conditions, tracking).
Chapters 04.04–04.09 index the condition building blocks and the contract-side Tables.

> **Condition Tables come in pairs.** Each attribute-class condition below exists twice —
> `PF.PRODUCT.<X>.CONDITION` (carries the **negotiation rules**) and
> `PF.CONTRACT.<X>.CONDITION` (the per-contract copy, **without** them). Rows are listed
> once by their unprefixed condition name.

### [04.01 Product Factory (Product Architecture)](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1415282768)

| ID           | Purpose                                                                                          | Spec                                                |
| ------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `PF.CLASS`   | Top of the hierarchy — declares the Attribute Classes a product class may carry.                  | https://innowise-group.atlassian.net/wiki/x/YQBaJwE |
| `PF.TYPE`    | Middle tier — a product type within a class, refining its attribute set.                          | https://innowise-group.atlassian.net/wiki/x/a4BgJwE |
| `PF.PRODUCT` | System-owned materialized product record (written by plugins).                                    | https://innowise-group.atlassian.net/wiki/x/ZQBmJwE |
| `PF.BUILDER` | Authoring surface — product drafts; validates and syncs on save.                                  | https://innowise-group.atlassian.net/wiki/x/wgBXJwE |
| `PF.MANAGER` | Action surface — drives the validate → catalog lifecycle.                                         | https://innowise-group.atlassian.net/wiki/x/ZoBhJwE |
| `PF.CATALOG` | System-owned published catalog of versioned, cataloged products.                                  | https://innowise-group.atlassian.net/wiki/x/1gBXJwE |

### [04.02 Negotiation Rules and Tracking Engine](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1459781662)

| ID                | Purpose                                                                                                                                                  | Spec |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `COMPARISON.TYPE` | Validation operator registry — defines the comparative logic functions for negotiation rules (e.g. MAXIMUM, MINIMUM, TOLERANCE), each restricted to valid data types and routed to a comparison plugin. | —    |
| `PRODUCT.TRACKER` | Mass maintenance queue — system-generated, read-only registry of product updates awaiting COB propagation to linked live contracts, tracking changed attributes and a processing status. | —    |

### [04.03 Product Attribute Classes (Core Engine)](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1454931970)

| ID                          | Purpose                                                                                                                                   | Spec                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `PF.ATTRIBUTE.CLASS`        | Vendor-defined attribute-class vocabulary — the abstract capabilities a product can be built from; referenced by the other attribute Tables.  | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4972085516 |
| `PF.ATTRIBUTE`              | Bank-defined attribute — an attribute class plus a type — attached to products through the Builder.                                           | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4969693930 |
| `PF.ATTRIBUTE.CLASS.ACTION` | Actions bound to an attribute class, with an accounting flag — logic hardcoded in the Contract Operations Engine.                             | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4970578460 |

### [04.04 Product Attribute Classes (Modular Building Blocks)](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1458929741)

| ID                               | Purpose                                                                                                                                            | Spec |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `ACCOUNT.CONDITION`              | Core identity component — defines the contract's ledger category, account number/IBAN generation rules, default posting restrictions and the base date type (CONTRACT or START). | —    |
| `CUSTOMER.CONDITION`             | Involved-parties component — mandates the primary owner and links third-party customers to the contract with specific roles (e.g. Guarantor, Joint).       | —    |
| `OFFICERS.CONDITION`             | Staff responsibility component — assigns the lead Relationship Manager plus additional officer IDs for visibility, departmental reporting and portfolio management. | —    |
| `INTEREST.CONDITION`             | Interest orchestration bridge — holds no math itself, mapping the contract to a basis-amount sourcing rule and a central IC Engine matrix with schedule triggers. | —    |
| `CHARGE.CONDITION`               | Atomic fee definition — the definition of a fee applied to the contract, pointing to a unified CHARGE.TARIFF.GROUP evaluated in the CC Engine.             | —    |
| `ACTION.CHARGERS.CONDITION`      | Event-driven fee trigger — links a business action (e.g. ACCOUNT-CLOSE) to a charge attribute with an application method (DUE, CAPITALISE, PAY).           | —    |
| `SOURCE.CALCULATION.CONDITION`   | Data aggregation rule — defines how the Basis Amount is derived for the IC Engine from a balance or action, with an aggregation method (DAILY, AVERAGE, HIGHEST, TXN.AMOUNT). | —    |
| `LIMIT.CONDITION`                | Credit exposure control — links the contract to the global Limits Engine, dictating whether it gets an exclusive SINGLE.LIMIT record and whether balance netting is allowed. | —    |
| `BALANCE.MAINTENANCE.CONDITION`  | Migration takeover component — captures and adjusts historical balances during legacy takeovers without triggering standard accounting events.             | —    |
| `BALANCE.AVAILABILITY.CONDITION` | Funds verification rule — defines which balance the credit check validates against (AVAILABLE, WORKING, FORWARD, AVAILWORK, AVAILFWD).                     | —    |

### [04.05 Action Processing (Contract Operations Engine)](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1459191857)

| ID                              | Purpose                                                                                                                                             | Spec |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `CONTRACT.OPERATION`            | Runtime execution record *and* input surface — the active transaction instance of an operation against a contract, stamped with initiation type (`SCHEDULED` = COB, `SECONDARY` = child; the v2 workshop called these `COB` and `CHILD`) and cross-linked to master and child operations. | —    |
| `OPERATION.CLASS`               | Vendor operation blueprint — defines a business event (e.g. ACCOUNT-CHANGE-INTEREST) by mapping atomic actions to target attribute classes, allowed initiation channels and mandated secondary operations. | —    |
| `ACTION.PRESENTATION.CONDITION` | Dynamic UI governor — resolves the screen projection via a three-level fallback hierarchy (Operation, Attribute, Attribute Class) and strips non-input fields via SUPPRESS.SEE.MODE. | —    |
| `ACTION.PLUGINS.CONDITION`      | Microservice hook mapping — attaches external logic to specific operations, running PRE_HOOK plugins (e.g. EXT-AML-CHECK) before the commit and POST_HOOK plugins after success. | —    |
| `ACTION.RESTRICTION.CONDITION`  | Behavioral limit rule — restricts an operation by COUNT or AMOUNT thresholds (e.g. max 3 withdrawals per month) and on breach triggers an ERROR hard block or an OVERRIDE soft block. | —    |
| `OPERATION.HISTORY`             | Immutable audit timeline — append-only, chronologically sorted log of every operation processed against a contract with its class and historic status.       | —    |
| `PROCESS.DETAILS`               | State snapshot record — captures exactly which attribute condition versions were altered during an operation, keyed by the CONTRACT.OPERATION ID.            | —    |

### 04.06 Contract Lifecycle

| ID                         | Purpose                                                                                                                                                    | Spec |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `CONTRACT.DETAILS`         | Derived lifecycle hub — tracks the master contract status (CURRENT, EXPIRED, MATURED, PENDING.CLOSURE…) alongside calculated dates and the worst active aging status. | —    |
| `CHANGE.PRODUCT.CONDITION` | Rollover blueprint — defines the renewal action (ROLLOVER, RESET or CHANGE.PRODUCT), AUTO or MANUAL initiation, the target product and the recurring change cycle (e.g. 1Y). | —    |
| `DORMANCY.CONDITION`       | Inactivity blueprint — sets month thresholds for INACTIVE, DORMANT and escheatment, lists transaction codes that do not reset the inactivity clock, and the posting restriction applied on breach. | —    |
| `OVERDUE.CONDITION`        | Aging blueprint — defines the sequential delinquency statuses (GRA, DEL, NAB) with thresholds in DAYS or BILLS, plus flags to move balances to delinquent prefixes and suspend P&L accrual. | —    |
| `CLOSURE.CONDITION`        | Termination blueprint — sets the closure trigger (MATURITY or BALANCE), automatic or manual method, a buffer period before physical closure and the posting restriction at PENDING.CLOSURE. | —    |
| `SCHEDULED.OPERATION`      | System-maintained schedule per contract — lists each scheduled operation with its last and next run dates, exposing NEXT.RUN.DATE for the nightly COB engine.        | —    |
| `ACCT.ACTIONS`             | System-maintained turnover aggregation — per account and month, records daily credit/debit turnover values and transaction counts used to evaluate thresholds for periodic fee billing. | —    |

### 04.07 Soft Accounting (Rules & Balance Types)

| ID                     | Purpose                                                                                                                                                    | Spec |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `ACCOUNTING.CONDITION` | Accounting routing matrix — maps a product attribute plus atomic action (e.g. CRINTEREST + ACCRUAL) to an allocation rule, with optional amortization and ITEMISED or BULK consolidation. | —    |
| `BALANCE.TYPE`         | Granular balance component definition — a balance prefix code (e.g. CUR, ACC, DUE, UNC) with a reporting type (NON-CONTINGENT, CONTINGENT, INTERNAL, VIRTUAL) dictating its GL treatment. | —    |
| `ALLOCATION.RULE`      | Soft accounting mapper — for an accounting event, defines the debit and credit leg targets (balance type, P&L category, customer or internal account) plus the narrative and transaction code. | —    |
| `CONTRACT.BALANCES`    | Real-time position store — holds the current amount of every active balance type on a contract in local and contract currency, updated on each accounting movement. | —    |

### 04.08 Apply Transactions Engine and Allocation Hierarchy

| ID                              | Purpose                                                                                                                                                  | Spec |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `TRANSACTION.MAPPING.CONDITION` | Translation matrix — maps external transaction codes to internal operation classes with the allocation rule to inject, plus default credit and debit fallback rules for unmapped codes. | —    |
| `PAYMENT.ALLOCATION.RULE`       | Inbound allocation waterfall — dictates how incoming funds satisfy dues, sorted by bill date (OLDEST.FIRST) or a strict balance sequence, with a remainder rule for overpayments. | —    |
| `PAYOUT.ALLOCATION.RULE`        | Outbound allocation waterfall — dictates which contract balances are drained first when the bank pays the customer, with a fallback rule for shortfalls.        | —    |
| `SETTLEMENT.INSTRUCTION`        | Funding source matrix — maps a payment type (e.g. PRINCIPAL) to the physical pay-in account or Direct Debit mandate, with a pay-in rule (FULL, PARTIAL, NONE) governing insufficient-funds behavior. | —    |

### 04.09 Eligibility Engine (Product Qualification & Variation)

| ID                      | Purpose                                                                                                                                                    | Spec |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `ELIGIBILITY.CONDITION` | Product qualification blueprint — links a Drools rule via RULE.GATEWAY with evaluation triggers (ORIGINATION, PERIODIC.REVIEW, STATIC.CHANGE) and failure handling, including automatic CHANGE.PRODUCT fallback to a default product. | —    |

## Accounts

Account/contract instantiation and position keeping.

### 05.01 Account Creation and Maintenance (Contract Instantiation)

| ID         | Purpose                                                                                                                                                       | Spec |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `CONTRACT` | Central master-state entity — binds the customer, the PF.CATALOG product blueprint, the immutable currency and the generated ACCOUNT reference for each instantiated account arrangement. | —    |
| `ACCOUNT`  | Static ledger facade — holds only immutable and descriptive attributes (account number, title, IBAN, posting restrictions), with all high-velocity financials isolated in CONTRACT.BALANCES. | —    |

### [05.02 Support internal and special (non-customer) accounts](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1470169089)

| ID                                 | Purpose                                                                                                                                                | Spec |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `ACCOUNT.CLASS`                    | System account classifier — maps groups of categories to mandatory operational behavior (e.g. NOSTRO, VOSTRO, SUSPENSE) with reserved SYS_BEHAVIOR values (INTERNAL, INSTITUTIONAL, CONTINGENT). | —    |
| `RECONCILATION.CONDITION`          | Product Attribute Class for matching rules — defines the reconcile mode, matching criteria (value date, currency, amount), amount tolerance and open-item lettering for Nostro and suspense accounts. | —    |
| `EXPECTED.RECEIPT.CONDITION`       | Anticipated cover-funds tracker — monitors expected incoming receipts with a day tolerance and a COVER_LIMIT_ACTION (BLOCK, OVERRIDE, USE_LIMIT) governing dependent outbound payments. | —    |
| `INTERCOMPANY.BALANCING.CONDITION` | Multi-entity bridge component — identifies which sister branch an internal wash account bridges and the settlement method (AUTOMATIC_MIRROR or MANUAL_SETTLEMENT) for auto-raised Due-To/Due-From entries. | —    |

### 05.03 Account Restrictions & Locked Amounts

| ID                 | Purpose                                                                                                                                                  | Spec |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `POSTING.RESTRICT` | Global restriction dictionary — defines DEBIT/CREDIT/ALL transaction blocks with ERROR or OVERRIDE enforcement, transaction exception lists and governed block/unblock reason codes (e.g. AML-FRZ). | —    |
| `LOCKED.EVENT`     | Time-bound fund lock registry — a chronological ladder of reserved amounts per account with start and optional expiry dates, whose ACTIVE/RELEASED/EXPIRED status preserves an immutable audit trail. | —    |
| `ACCOUNT.PARAMETER` | Global rule singleton — one SYSTEM record whose LOCKED_WITH_LIMIT flag sets the bank-wide default for whether locked-amount checks factor in the active credit limit. | —    |

### 05.04 Balance Management & Position Keeping

| ID                  | Purpose                                                                                                                                                | Spec |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `CONTRACT.BALANCES` | Real-time position-keeping store — system-maintained materialized view of a contract's Working, Cleared and Actual balances plus per-balance-type sub-ledger buckets. | —    |
| `ACCOUNT.TURNOVER`  | Daily movement snapshot table — append-only EOD history of debit/credit turnover and closing balance per balance type, written only for buckets flagged ACTIVITY_UPDATE = YES. | —    |

## Financial Accounting

Double-entry posting and its parameterization.

### [06.01 Entry Generation (Posting)](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1459945527)

| ID                     | Purpose                                                                                                                                                   | Spec |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `SET.OF.ENTRIES`       | Master transaction block — the unifying record proving double-entry balancing across a single business event, linking all AL and PL entry legs with total debit and credit sums. | —    |
| `JOURNAL.ENTRY.AL`     | Assets & Liabilities ledger — append-only system-maintained entries unifying customer, internal and off-balance-sheet contingent movements with account, category, balance type and reversal markers. | —    |
| `JOURNAL.ENTRY.PL`     | Profit & Loss ledger — append-only income and expense entries posted directly to CATEGORY consolidation keys, structurally prohibiting any physical account or balance type. | —    |
| `POSTING.DETAIL`       | Narrative enrichment rule table — installation-level mapping rules (static text, payload values, linked-table lookups) that assemble the localized narrative strings on journal entries before persistence. | —    |
| `TRANSACTION.REVERSAL` | Reversal orchestration proxy — captures the target table, transaction ID, mandatory reason and date, and on authorization triggers a POST hook that executes the append-only contra-entry reversal. | —    |

### 06.02 Financial Accounting Parameterization

| ID                  | Purpose                                                                                                                                                  | Spec |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `CATEGORY`          | Virtual GL dimension — graph-based taxonomy node with a parent-category link and a system-maintained hierarchy path (e.g. /ASSETS/LOANS/RETAIL/) driving ledger-boundary validation. | —    |
| `ACCOUNT.PARAMETER` | Ledger constitution singleton — one SYSTEM record setting the global ACCOUNTING_MODE (TRADE.DATED or VALUE.DATED) and the default SUSPENSE_CATEGORY for broken wash allocations. | —    |
| `TRANSACTION`       | Financial action code dictionary — defines atomic accounting movements with a strict DEBIT or CREDIT marker and a default statement narrative mapped to POSTING.DETAIL. | —    |

## Financial Reporting

### EP-07.01 Consolidation Engine & Virtual General Ledger

| ID                       | Purpose                                                                                                                                                | Spec |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `CONSOLIDATE.COND`       | Virtual GL schema configuration — defines per reporting view (e.g. IFRS, LOCAL_GAAP) the baseline dimensions (MODULE, MARKET, CURRENCY) plus variable dimensions with optional banding rules. | —    |
| `DIMENSION.BANDING.RULE` | Reusable dimension grouping matrix — maps granular value ranges (e.g. sectors 1000-1999) to a combined reporting bucket code (e.g. RETAIL) applied when building the Virtual GL. | —    |
| `CONSOLIDATE.ASST.LIAB`  | N-dimensional assets & liabilities fact table (CAL cube) — stores aggregated Virtual GL balances in base and original currency, keyed by a synthetic hash of the dimension intersection. | —    |
| `CONSOLIDATE.PRFT.LOSS`  | N-dimensional profit & loss fact table (CPL cube) — aggregates the day's P&L journal movements into Virtual GL balances under the same synthetic-hash structure as CAL. | —    |

## Transfers

Payment initiation, execution, and cards.

### [08.01 Payment Order (Initiation & Routing)](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1474723859)

| ID                        | Purpose                                                                                                                                                | Spec |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `PAYMENT.ORDER.PARAMETER` | Installation-level routing configuration — defines the connection method (INTERNAL.FT or EXTERNAL.HUB) and default queue that decide where each payment order is sent for execution. | —    |
| `PAYMENT.ORDER.PRODUCT`   | Payment product rule set — defines per payment type (e.g. SEPA.CREDIT) the allowed direction, future-dating, FX and mandate constraints plus the default charge bearer. | —    |
| `PAYMENT.ORDER`           | ISO 20022 payment intent payload — captures debtor, creditor, agent BIC and remittance details and tracks the order lifecycle (RECEIVED, WAREHOUSED, AWAITING_ACK, COMPLETED, REJECTED). | —    |

### [08.02 Transfer Execution (Internal FT & Settlement)](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1475280899)

| ID                      | Purpose                                                                                                                                                 | Spec |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `FT.TXN.TYPE.CONDITION` | Transfer type governance matrix — defines per transaction code (e.g. AC, OT) the duplicate-check rule, forward-dating permission, default charge code and base accounting event. | —    |
| `FUNDS.TRANSFER`        | Immutable master execution record — captures each fund movement's debit and credit accounts, amounts, value dates, exchange rate and fees, progressing from UNAU through to LIVE or REVERSED. | —    |

### 08.03 Card Management (Lifecycle & Issuance)

| ID            | Purpose                                                                                                                                                 | Spec |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `CARD.TYPE`   | Card product blueprint — defines a card family's BIN prefix, PAN length, expiry period (e.g. 3Y), renewal lead time and the tariff group for issuance and maintenance fees. | —    |
| `CARD.STATUS` | Card state dictionary — each physical or logical status (e.g. Active, Stolen, Scrap) dictates whether authorizations are allowed and whether automated COB renewal applies. | —    |
| `CARD.ISSUE`  | Live card instance — the customer-specific card record (tokenized PAN, name on card, expiry, status) linked to one primary account plus optional secondary accounts for multi-currency routing. | —    |

## Limits

### 09.01 Limit Hierarchy, Group Limits

| ID                    | Purpose                                                                                                                                                  | Spec |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `LIMIT.PARAMETER`     | Installation-wide limits singleton — one SYSTEM record whose GRP_CREDIT_LIMIT toggle enables or disables Group Limit processing across the environment.          | —    |
| `LIMIT.REFERENCE`     | Risk product taxonomy — defines the hierarchical blueprint of limit products (Global, Product, Sub-product) whose child links form the immutable risk tree.      | —    |
| `LIMIT`               | Sanctioned credit line — the actual risk boundary holding internal, advised and available amounts, with exclusivity and balance-netting flags and a parent link for upward utilization cascading. | —    |
| `LIMIT.SHARING.GROUP` | Corporate group liability pool — binds multiple customers and allowed limit products to a shared master credit line, with a self-referencing parent group enforcing nested sub-group caps. | —    |

## Teller

### 12.01 Till & Vault Management

| ID                 | Purpose                                                                                                                                                     | Spec |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `TELLER.PARAMETER` | Branch cash configuration — per-company record registering semantic vault IDs (e.g. MAIN-SAFE) and defining the shortage/overage GL categories, transaction codes and FX profit method. | —    |
| `TELLER.ID`        | Till instance and state registry — a till or vault workspace with assigned user, OPEN/CLOSED status, per-currency holding limits, stock-control flag and strictly isolated linked internal accounts (one per currency). | —    |

## Document Management

Document- and image-lifecycle Tables — the taxonomy (class → type), transient uploads,
and the live per-customer / per-contract compliance registries. Index-only here (the
customer-document flow is covered in `references/customer.md`).

### [10.01 Document Management (DM) & Compliance Engine](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1454178409)

| ID                   | Purpose                                                                                                                                                  | Spec                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `DM.DOCUMENT.CLASS`  | Top of the document taxonomy — the highest-level grouping of document types (e.g. KYC, LEGAL) that types are filed under.                                  | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4917952517 |
| `DM.DOCUMENT.TYPE`   | Second tier — a specific artifact blueprint (e.g. PASSPORT, POA) within a class, setting per-transaction vs per-customer tracking and default-required behavior. | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4917003470 |
| `DM.DOCUMENT.UPLOAD` | Transient upload transaction — orchestrates the async file-upload flow (filename trigger, pre-signed S3 URL, status) that satisfies a `DM.CUST.DOCUMENT`/`DM.TRANS.DOCUMENT` obligation. | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4920606734 |
| `DM.CUST.DOCUMENT`   | Live compliance registry — customer-level (non-contract) document obligations per party/role, with lifecycle status and expiry that can block authorization or flip COB status. | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4920246305 |
| `DM.TRANS.DOCUMENT`  | Live compliance registry — contract/transaction-specific document obligations per contract; an invalid required status structurally blocks the contract from going LIVE.        | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4920246313 |

### 10.02 Image Capture & Digital Evidence Repository

| ID                  | Purpose                                                                                                                                                    | Spec                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `DM.IMAGE.TYPE`     | Image-category blueprint — defines groups of related images (e.g. SIGNATURE, PHOTO).                                                                          | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4923031625 |
| `DM.IMAGE.DOCUMENT` | Centralized image metadata registry — one record per stored digital asset, typed by `DM.IMAGE.TYPE` and linked to its owning CBS entity (customer/account/user), holding the S3 pointer and lifecycle status. | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4921884765 |

## Interest & Charges

Interest- and charge-pricing Tables: 13.01 models interest (benchmarks, day-count bases,
live and term-structured rates, reusable interest rules); 13.02 models charges
(fee-calculation rules and tariff groups).

### [13.01 Interest Calculation Engine](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1458929705)

| ID                       | Purpose                                                                                                                                       | Spec                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `IC.BENCHMARK.REFERENCE` | Interest master record — the static floating-rate benchmark indices (e.g. SOFR, EURIBOR, LIBOR) used globally, one record per benchmark.        | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4894721672 |
| `IC.INTEREST.BASIS`      | Interest day-count matrix — the numerator/denominator conventions (e.g. Actual/360, US 30/360) that supply the fractions for daily interest accruals. | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4893804196 |
| `IC.FLOATING.BASE.RATE`  | Interest live-rate store — the effective-dated percentage value of each benchmark per currency, resolving the exact floating rate for a contract by date. | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4893870220 |
| `IC.PERIODIC.INTEREST`   | Interest term-structure curve — wholesale bid/offer rates per benchmark and currency bucketed by tenor (1M, 3M, 1Y) for term-structured pricing. | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4894131284 |
| `IC.GLOBAL.INTEREST.RULE`| Interest common-math matrix — each reusable interest rule, binding day-basis, tiering, and fixed/floating/periodic rate sourcing plus margin into one definition. | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4894949638 |

### [13.02 Charge Calculation Engine (Decoupled Tariff & Fee Kernel)](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1458470929)

| ID                       | Purpose                                                                                                                                       | Spec                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `CC.GLOBAL.CHARGE.RULE`  | Charges common-math matrix — each atomic fee rule's flat, percentage, or unit/tiered calculation, with min/max caps; one record per rule.       | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4946067527 |
| `CC.CHARGE.TARIFF.GROUP` | Charges tariff hub — ordered runtime rules that read customer context to apply the first-matching segmented discount or full waiver and route to a charge rule. | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4945084548 |

## Other services (not Tables)

Supporting microservices — **not** `table-template` instances. Repo links point to the
project GitLab (`10.0.102.50`, reachable only from the project network/VPN).

| Name | Purpose | Spec | Repo |
| ---- | -------- | ---- | ---- |
| `proj-auth-context-provider` | Istio external-authorization service (`ext_authz`) — validates the JWT, extracts the `sub`, fetches and caches the user's authorization context from SM.USER, and decides table/operation/company access before Istio forwards the trusted request to a Table. | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4870438931 | http://10.0.102.50/bankokam-research-center/tefo-bank/tefo-proj/tefo-proj/proj-auth-context-provider |
| `proj-charges-calculation-engine` | Stateless charges calculation engine — given a basis amount, charge property, tariff group, currency, and customer context, resolves the tariff group and its charge rule (CC.CHARGE.TARIFF.GROUP → CC.GLOBAL.CHARGE.RULE) to compute the applicable fee (flat / percentage / unit-tiered, with min-max caps and segmented discounts or waivers). | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4941676574 | http://10.0.102.50/bankokam-research-center/tefo-bank/tefo-proj/tefo-proj/proj-charges-calculation-engine |
| `proj-interest-calculation-engine` | Stateless interest accrual engine — given a basis amount, a global interest rule (IC.GLOBAL.INTEREST.RULE), an accrual start/end date range, currency, and term, resolves the applicable tiered and effective rates to compute the accrued interest (yield) for the period. | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4866245401 | http://10.0.102.50/bankokam-research-center/tefo-bank/tefo-proj/tefo-proj/proj-interest-calculation-engine |
| `proj-contract-operations-engine` | Product Factory's product-operation side — instantiates a cataloged product into a live contract and runs its lifecycle, executing the actions hard-coded per attribute class (where each attribute class's behavior is defined at compile time). | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4870504467 | http://10.0.102.50/bankokam-research-center/tefo-bank/tefo-proj/tefo-proj/proj-contract-operations-engine |
| `proj-field-registry` | Standalone service managing the global, reusable Field catalog that every Table Definition draws from; Fields must exist before any Table can be defined. | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4867555601 | http://10.0.102.50/bankokam-research-center/tefo-bank/tefo-proj/tefo-proj/proj-field-registry |
| `proj-plugin-manager` | Admin service for Plugins (Java JARs of business logic) — upload, versioning (`PUT`), and listing; stores the JARs in S3 (Ceph) for Tables to download and load into the JVM at startup. | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4867555803 | http://10.0.102.50/bankokam-research-center/tefo-bank/tefo-proj/tefo-proj/proj-plugin-manager |
| `proj-table-registry` | Standalone service that creates and manages Groups and Tables, triggers their Kubernetes deployments via an outbox→reconciler control loop, and acts as the runtime request router resolving which Group pod hosts a Table/Enquiry. | https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/4866245206 | http://10.0.102.50/bankokam-research-center/tefo-bank/tefo-proj/tefo-proj/proj-table-registry |
