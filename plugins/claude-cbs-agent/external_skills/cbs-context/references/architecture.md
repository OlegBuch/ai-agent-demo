# CBS — Architecture, infrastructure & compliance reference

This is the **opt-in** deep reference for the CBS platform's *target deployment shape*,
*technology stack*, *Temenos-inspired business service modules*, and *regulatory
jurisdiction scope*. It is **not** loaded automatically with the core context — Claude
offers it after `system-core.md` loads, and reads it only if the user opts in.

> **Vocabulary note.** This document uses Temenos Transact framing (`$NAU`/`$HIS`,
> *Application Registry*, *Activity Orchestrator*, *Application*). That is a different
> lens on the same platform than `system-core.md`'s `table-template` framing
> (`nau`/`live`/`his`, *Table Registry*, *Projections*, *Table*). Treat both as valid
> descriptions of CBS; do not assume one supersedes the other.

---

### 1. INFRASTRUCTURE & DEPLOYMENT CONSTRAINTS
**Target Environment:** 
Virtual Machines (VMs) deployed in multiple regions (within a single county or allowed group of countries), tailored to the specific on-premise capabilities of onboarding client banks.

**In-Scope Infrastructure Tools:**
- **Orchestration & Compute:** Kubernetes, RKE2, Rancher
- **Networking:** Istio (Service Mesh; Hybrid mode of sidecars and Ambent mode; API Gateway not Ingress), Canal CNI, CoreDNS
- **Disaster Recovery / Backup:** Velero

**Out-of-Scope (Provided by Client Banks):**
*Do not architect or suggest internal solutions for the following, assume the bank provides them:*
- WAF, Network Firewalls, and API security (between public internet and K8s)
- Public DNS and External Certificate Management (e.g., public HTTPS)
- External Load Balancers (routing traffic between K8s clusters)
- Virtualization layer / Bare-metal servers / VMs.

### 2. TECHNOLOGY STACK
- **Backend:** Java (Microservices architecture)
- **Frontend & BFF:** Next.js (Hosted in containers managed by K8s)
- **Databases:** PostgreSQL (Relational/Transactional), Redis (Cache), Clickhouse (OLAP/Analytics)
- **Storage:** Ceph (Block and S3 Object Storage)
- **Identity:** Keycloak
- **Auth:** An Istio external-authorization (`ext_authz`) service. It validates incoming JSON Web Tokens (JWTs), extracts identity identifiers, retrieves authorization details from `SM.USER`, and verifies access rules before requests are forwarded by Istio.
- **Observability:** Prometheus (Metrics), Grafana (Dashboards), Jaeger + Opensearch (Distributed Tracing), Opensearch + Logstash + Filebeat (Centralized Logging)
- **Event Streaming / Broker:** Apache Kafka
- **Secrets & Internal Certs:** Hashicorp Vault Community

### 3. SERVICES
The backend architecture relies heavily on Temenos Transact philosophies, categorized into specific domain modules:

### 3.1. Orchestration & Lifecycle Core
- **Field Registry:** Manages global, reusable Fields. Separate because Fields must exist before any Table can be defined.
- **Table:** The central definition record for tables (Fields, Types [String/Amt], Validations [Lookup/Regex]). Multiple tables are merged into a table group service, and treated / hosted as a modular monolith, where each table is a module.
- **Table Registry:** Manages Table Groups and Tables, triggers their k8s deployments, and is the runtime request router.
    - **Table Orchestrator:** OFS-like orchestration. Manages batch imports (files, REST) and handles multi-table querying and modification. Part of the Table Registry.
- **Contract Operation Engine:** The central orchestration point for all financial arrangements, modeled on the Temenos Arrangement Architecture (AA) concept. All account-level interactions, transaction validation, and locks route through this service. It processes incoming activities, maps them to actions, and executes the business logic.
- **COB (Close of Business):** Manages the COB phases, batch processes, multi-instance parallelization, and execution of bank-specific custom code.
- **Plugin Manager**: Admin surface for plugin JARs (upload, version, list); JARs live in S3 (Ceph).
- **Interest Calculation Engine:** A stateless interest calculation engine. Given transaction details, target interest rules (`IC.GLOBAL.INTEREST.RULE`), currency parameters, and date boundaries, it calculates accrued interest and yield values.
- **Charge Calculation Engine:** A stateless engine that calculates transaction fees and service charges. Given a transaction amount, customer profile, and charge category, it resolves the applicable rules (linking `CC.CHARGE.TARIFF.GROUP` to `CC.GLOBAL.CHARGE.RULE`) to output the computed charge.
- **Posting Engine:** Orchestrates accounting entries and maintains financial ledger balances.

#### 3.2. Table Modules
This section describes tables grouped under business context. Exact tables are not defined at the moment.

- System Core: This module governs installation-wide properties, topologies, validations, currencies, delivery mechanisms, and dynamic user interface metadata.
- Security Management System (SMS): Controls and configures identity mapping, authorization roles, and fine-grained data access.
    - User Profile: Maps credentials to internal authorization and organizational profiles.
        - `SM.USER`: User identity record. Maps authenticated identities from Keycloak to their respective core banking context, defining default companies, language preferences, and business unit memberships.
    - User Groups & Roles, Data Access Control: Governs functional permissions and ABAC setups.
        - `SM.USER.GROUP`: Functional role profiles. Groups functional transaction permissions, authorized override clearance levels, and field-level access boundaries into reusable job profiles.
        - `SM.DATA.ACCESS`: Attribute-Based Access Control (ABAC) rules. Specifies field-level access conditions and filters for target tables, evaluating criteria to enforce ALLOW or DENY outcomes.
        - `ST.ROLE`: External role classifications (e.g., `PROXY`, `GUARANTOR`). Defines business capacities for external parties linking to accounts, including flags indicating if additional documentation is required.
    - Access Administration: Handles transient password and signing resets.
        - `PASSWORD.RESET`: Administrative action ledger. Manages transient password-reset instructions passed to Keycloak (e.g., issuing one-time credentials with mandatory reset-on-login flags) without storing passwords in the database.
        - `SIGN.ON.RESET`: Security officer action record. Authorizes the unlocking of user profiles after failed login attempts, capturing mandatory audit justifications for key security changes.
    - Logging User Action: Maintains strict, immutable platform-wide audit pathways.
        - `PROTOCOL`: Central security audit ledger. Chronologically records security events, data modifications, sensitive queries, and policy violations. Records contain client IPs, session identifiers, timestamps, and classification tags.
    - Override and Dispo Processing (Exception Management): Governs approval overrides, thresholds, limits, and items.
        - `OVERRIDE.CLASS`: Approval authority classes. Groups specific operational warnings and risk-based overrides under named approval profiles (e.g., `OVR.MANAGER`) to define who can authorize transactions.
        - `OVERRIDE.CLASS.DETAILS`: Escalation rule configurations. Evaluates real-time values (e.g., transaction amount thresholds) to dynamically elevate the required `OVERRIDE.CLASS` for authorization.
        - `DISPO.OFFICER`: Individual approval limits and delegation settings. Registers designated risk officers with specific transactional sign-off limits, reporting structures, and temporary delegation paths.
        - `DISPO.ITEM`: Outstanding exception tracking. Monitors individual pending transaction approvals, locking target actions in a non-authorized state (`NAU`) until resolved.
    - Department Structure (Organizational Chart): Declares branch-office structural hierarchies.
        - `BUSINESS.UNIT`: Organizational unit definitions. Represents branches, departments, divisions, or cost centers, containing reporting parent links and mapped profit/cost center assignments.
        - `ACCOUNT.OFFICER`: Relationship manager registry. Maps customer accounts to dedicated business units, team members, or specific system users for performance tracking and portfolio grouping.
        - `BUSINESS.UNIT.HISTORY`: Append-only organization ledger. Tracks structural realignments and changes to the corporate reporting tree to enable accurate historical auditing.

- Customer (Party): Governs customer master records, lifecycle states, relationships, and non-financial counterparties.
    - Customer Master Management: Manages profiles, relationships, and state mappings.
        - `CM.CUSTOMER`: Master customer database. Acts as the Single Source of Truth for retail, corporate, and institutional clients, holding validated identity attributes, contact details, segments, and lifecycle indicators.
        - `CM.MISC.PARTY`: Lead and proxy registry. Holds prospects, beneficial owners (UBOs), and external transaction signees. These entries can be promoted to standard `CM.CUSTOMER` records with audit trails.
        - `CM.CUSTOMER.RELATIONSHIP`: Relationship linkage registry. Establishes legal or logical connections between two customer records or prospects, identifying relation categories and tracking effective dates.
        - `CM.CUSTOMER.STATUS`: Customer lifecycle states. Defines state-machine configurations (e.g., Active, Closed, Dormant) and associated transitions, including reason codes and operational constraints.
        - `CM.RELATION.TYPE`: Relationship metadata classification. Registers allowed relationship classifications (e.g., joint-owner, trustee) and auto-applies inverse directional relationships (e.g., ward-to-guardian) to linked profiles.

- Product Factory: Systemizes abstract capabilities, parameters, and authoring tools to construct and publish bank products.
    - Product Factory (Product Architecture): Defines core architectures, catalog drafts, and lifecycle stages.
        - `PF.CLASS`: Root product classes. Declares the baseline functional capabilities and attribute sets that define core financial instruments (e.g., Retail Deposits, Term Loans).
        - `PF.TYPE`: Intermediate product families. Specializes root classes into specific functional families (e.g., High Yield Savings within Retail Deposits) by narrowing permitted attribute boundaries.
        - `PF.PRODUCT`: Compiled system-level product records. Generated by product building blocks and plugins, representing operational configurations.
        - `PF.BUILDER`: Product authoring and modeling environment. Used to draft product designs, validate attribute compatibility, and synchronize changes with active systems.
        - `PF.MANAGER`: Product lifecycle manager. Orchestrates draft states, validation sequences, approval steps, and final transitions into the active catalog.
        - `PF.CATALOG`: Published product catalog. Maintains active, version-controlled product specifications available for customer contract origination.
    - Negotiation Rules and Tracking Engine: Handles rule checks and batch update propagations.
        - `COMPARISON.TYPE`: Operator validation registry. Defines logical operators and margin rules (e.g., minimum thresholds, maximum caps, tolerances) allowed during contract negotiation.
        - `PRODUCT.TRACKER`: Product propagation queue. Tracks updates to catalog products that are pending batch application to active customer contracts during the COB run.
    - Product Attribute Classes (Core Engine): Houses baseline definitions for attributes and event actions.
        - `PF.ATTRIBUTE.CLASS`: System attribute primitives. Lists functional parameters and capabilities supported by the core engine (e.g., core interest accrual, posting rules) used to construct attributes.
        - `PF.ATTRIBUTE`: Bank-configured attributes. Combines core attribute classes with specific types and validations to define reusable behaviors (e.g., interest rate tiers, billing terms).
        - `PF.ATTRIBUTE.CLASS.ACTION`: Operational action hooks. Binds events to specific attribute classes, mapping financial operations directly to ledger processing.
    - Product Attribute Classes (Modular Building Blocks): Defines components used to parameterize agreements.
        - `ACCOUNT.CONDITION`: Ledger alignment rules. Sets account number/IBAN generation profiles, general ledger categorization rules, posting limitations, and the primary date tracking reference.
        - `CUSTOMER.CONDITION`: Party ownership specifications. Determines ownership structures, signatory authorities, and secondary role obligations (e.g., guarantor or joint account holder requirements).
        - `OFFICERS.CONDITION`: Portfolio assignment definitions. Assigns primary relationship managers, sales personnel, and department allocations to the originated contract.
        - `INTEREST.CONDITION`: Account interest mapping. Links contracts to calculation methods, basis definitions, and accrual schedule parameters.
        - `CHARGE.CONDITION`: Account fee configuration. Maps the contract to specific transaction fees, account fees, and charge rules configured in the Charge Engine.
        - `ACTION.CHARGERS.CONDITION`: Event-driven fee schedules. Automatically triggers specific fee types on particular transactional events (e.g., account closing, non-sufficient funds).
        - `SOURCE.CALCULATION.CONDITION`: Balance calculation sources. Configures how average, daily, or tier-based balances are measured for interest calculation.
        - `LIMIT.CONDITION`: Credit exposure linkage. Connects contracts to credit line limits, enabling overdraft thresholds, netting capabilities, and collateral linkages.
        - `BALANCE.MAINTENANCE.CONDITION`: Core migration balances. Handles migration-period balances, historical transactions, and legacy book takeovers without generating duplicate accounting movements.
        - `BALANCE.AVAILABILITY.CONDITION`: Funds check rules. Sets balance criteria (e.g., Working Balance, Cleared Balance, Available Balance) for transactional authorization.
    - Action Processing (Contract Operations Engine): Processes contract modifications, operation classes, and hooks.
        - `CONTRACT.OPERATION`: Runtime operation instance. Records operational requests against contracts, tracking initiating channels, processing sources, and dependent operations.
        - `OPERATION.CLASS`: Operation blueprints. Defines permissible system operations (e.g., interest updates, loan adjustments), mapping mandatory steps, safety limits, and validation steps.
        - `ACTION.PRESENTATION.CONDITION`: Interface layout rules. Determines dynamic screen presentations, layouts, and input requirements based on the current contract state.
        - `ACTION.PLUGINS.CONDITION`: Validation plugin hook mappings. Extends transaction processing by registering synchronous pre-commit check steps or asynchronous post-commit event brokers.
        - `ACTION.RESTRICTION.CONDITION`: Transaction volume and value limits. Defines limits (e.g., monthly withdrawal limits) and triggers error blocks or overrides when exceeded.
        - `OPERATION.HISTORY`: Append-only transaction timeline. Provides a complete, chronological record of all operational and structural changes to a contract.
        - `PROCESS.DETAILS`: Snapshot state records. Logs the precise values and settings of all modified contract parameters, linked to the `CONTRACT.OPERATION` record.
    - Contract Lifecycle: Tracks active execution states, maturities, aging and closure workflows.
        - `CONTRACT.DETAILS`: Current state of active contracts. Tracks overall contract execution state, maturity targets, last processing events, and current aging categories.
        - `CHANGE.PRODUCT.CONDITION`: Contract rollover parameters. Defines automatic or manual contract renewal terms, rollover product targets, and review intervals.
        - `DORMANCY.CONDITION`: Account dormancy profiles. Sets thresholds for inactive and dormant states, including exclusion lists and transaction locks.
        - `OVERDUE.CONDITION`: Delinquency aging tracking. Configures late-payment stages, provisioning impacts, non-accrual triggers, and aging calendars.
        - `CLOSURE.CONDITION`: Termination workflows. Defines conditions for contract closure, settlement options, dynamic fee applications, and termination processes.
        - `SCHEDULED.OPERATION`: Processing schedule. Manages upcoming contract activities (e.g., interest payouts, planned reviews) evaluated during the nightly COB.
        - `ACCT.ACTIONS`: Monthly transaction volume indicators. Maintains transactional volumes, monthly transaction counts, and activity metrics used for pricing reviews and audits.
    - Soft Accounting (Rules & Balance Types): Directs operations to ledger setups and balances.
        - `ACCOUNTING.CONDITION`: General ledger routing paths. Directs attribute and action combinations (e.g., interest accrual transactions) to general ledger rules and consolidation setups.
        - `BALANCE.TYPE`: Balance component definitions. Establishes granular balance sub-types (e.g., Cur, Accrued, Outstanding, Uncleared) and their balance-sheet treatment.
        - `ALLOCATION.RULE`: Double-entry templates. Outlines the debit and credit accounts, transaction narratives, and financial classifications used when posting ledger transactions.
        - `CONTRACT.BALANCES`: Real-time arrangement balance ledger. Stores real-time balances for all active balance sub-types in both local and original transaction currencies.
    - Apply Transactions Engine and Allocation Hierarchy: Sets rules for routing and distributing funds.
        - `TRANSACTION.MAPPING.CONDITION`: External-to-internal transaction mapper. Translates incoming transaction codes (e.g., ISO-8583 codes) into core operations and baseline posting rules.
        - `PAYMENT.ALLOCATION.RULE`: Payment allocation priority. Sets order rules (e.g., principal first, then interest, then charges) for distributing incoming funds across outstanding items.
        - `PAYOUT.ALLOCATION.RULE`: Outbound balance allocation priority. Dictates which balance sub-types are drawn from first during customer withdrawals.
        - `SETTLEMENT.INSTRUCTION`: Settlement routing configurations. Maps preferred settlement accounts and fallback procedures for clearing pending contract actions.
    - Eligibility Engine (Product Qualification & Variation): Defines target rules to validate client product matches.
        - `ELIGIBILITY.CONDITION`: Customer eligibility matrices. Configures validation rule sets to assess customer eligibility for specific products and catalog options.

- Accounts: Facilitates arrangement instantiation, ledgers, restrictions, amount-holding actions, and balance-sheet position calculations.
    - Account Creation and Maintenance (Contract Instantiation): Binds customers to catalog choices and handles ledger records.
        - `CONTRACT`: Core master arrangement registry. Connects individual customers to product templates, currencies, and account identifiers to form the basis of all contracts.
        - `ACCOUNT`: Core ledger account details. Records immutable account parameters (e.g., account numbers, titles, IBAN allocations) linked directly to the contract.
    - Support Internal and Special (Non-Customer) Accounts: Configures Nostro, Vostro, and Suspense accounts.
        - `ACCOUNT.CLASS`: System internal account classifications. Defines specialized operational properties for internal accounts (e.g., NOSTRO, VOSTRO, Suspense accounts).
        - `RECONCILATION.CONDITION`: Transaction reconciliation criteria. Configures auto-matching rules, tolerance limits, and outstanding item tracking for clearing accounts.
        - `EXPECTED.RECEIPT.CONDITION`: Pending transaction tracking. Monitors incoming funds expectations, managing actions (e.g., hold actions) on mismatch or failure.
        - `INTERCOMPANY.BALANCING.CONDITION`: Inter-branch settlement rules. Automatically manages balancing entries and clearing allocations between separate operating company branches.
    - Account Restrictions & Locked Amounts: Houses freeze triggers and specific amount blocks.
        - `POSTING.RESTRICT`: Global account restrictions. Manages specific transaction blocks (e.g., debit freezes, credit blocks) and sets authorized override procedures.
        - `LOCKED.EVENT`: Active amount locks. Records amount-holding actions on accounts (e.g., judicial blocks, debit card holds) with specific start and end parameters.
        - `ACCOUNT.PARAMETER`: Core account engine parameters. Configures core system options, such as whether locked amounts should impact credit-limit calculations.
    - Balance Management & Position Keeping: Tracks daily balances and turnover details.
        - `CONTRACT.BALANCES`: Real-time position tracking. Aggregates and maintains working, cleared, and book balances across active contracts.
        - `ACCOUNT.TURNOVER`: End-of-Day balance movements. Records daily credit/debit movements and closing balances per balance type to support historical auditing.

- Financial Accounting: Provides double-entry balancing across business events, ledgers, and transaction codes.
    - Entry Generation (Posting): Tracks double-entry transaction assets, liabilities, profit-and-loss entries, and reversals.
        - `SET.OF.ENTRIES`: Double-entry balance registry. Group records of balanced debits and credits generated by a single business transaction.
        - `JOURNAL.ENTRY.AL`: Asset & Liability sub-ledger. Stores append-only asset and liability entries, including customer, internal, and off-balance-sheet items.
        - `JOURNAL.ENTRY.PL`: Profit & Loss sub-ledger. Stores append-only income and expense transaction entries, which post directly to consolidation categories without using customer accounts.
        - `POSTING.DETAIL`: Transaction narrative templates. Generates localized payment and transaction description narratives based on system variables.
        - `TRANSACTION.REVERSAL`: Transaction reversal registry. Authorizes and manages reversing entries, maintaining complete transactional audit histories.
    - Financial Accounting Parameterization: Establishes virtual categories, mode parameters, and transaction codes.
        - `CATEGORY`: General ledger account tree. Represents the chart of accounts structure, maintaining parent-child relationships and validation pathways.
        - `ACCOUNT.PARAMETER`: General ledger parameters. Configures options such as trade-date vs value-date ledger recording, and manages default suspense accounts.
        - `TRANSACTION`: System transaction codes. Defines operational transaction codes, mapping basic debit/credit expectations and description templates.

- Financial Reporting: Manages multidimensional general ledger data, balance consolidation, and regulatory reporting capabilities.
    - Consolidation Engine & Virtual General Ledger: Manages dimensions, bands, and aggregated reporting cubes.
        - `CONSOLIDATE.COND`: Virtual General Ledger layouts. Configures dimensions (e.g., IFRS, Local GAAP) and properties (e.g., currencies, branches) for reporting.
        - `DIMENSION.BANDING.RULE`: Dynamic reporting dimensions. Groups granular records into defined reporting categories (e.g., aggregating sector codes) to support consolidated reports.
        - `CONSOLIDATE.ASST.LIAB`: Asset & Liability multidimensional data. Aggregates balances across reporting dimensions to provide virtual asset and liability views.
        - `CONSOLIDATE.PRFT.LOSS`: Profit & Loss multidimensional data. Aggregates profit and loss balances across reporting dimensions to support virtual earnings reporting.

- Transfers: Manages payment orders, execution pipelines, card integrations, and channel processing instructions.
    - Payment Order (Initiation & Routing): Tracks payment intents, routing selections, and validations.
        - `PAYMENT.ORDER.PARAMETER`: Core payment routing configurations. Determines transaction processing paths, routing payments to internal systems or external clearers.
        - `PAYMENT.ORDER.PRODUCT`: Payment product configurations. Sets parameters for specific payment types (e.g., SEPA, domestic transfers), including validation rules and fee arrangements.
        - `PAYMENT.ORDER`: Active payment orders. Tracks payment instructions from initiation through processing status to final settlement or rejection.
    - Transfer Execution (Internal FT & Settlement): Governs transfer conditions and core transactional logs.
        - `FT.TXN.TYPE.CONDITION`: Internal transfer rules. Sets validations, duplicate transaction parameters, future-dating limits, and default fee codes for internal transfers.
        - `FUNDS.TRANSFER`: Funds transfer transaction records. Tracks transfer transactions from initiation and validation to completion or reversal.
    - Card Management (Lifecycle & Issuance): Governs card profiles, statuses, and card entities.
        - `CARD.TYPE`: Card product configurations. Sets BIN ranges, card properties, validity lengths, and fee structures for card offerings.
        - `CARD.STATUS`: Card status definitions. Maps operational statuses (e.g., Active, Suspended, Lost) and sets processing parameters for each state.
        - `CARD.ISSUE`: Customer card records. Links individual card properties, tokenization details, and statuses to primary customer contracts.

- Limits: Monitors credit limits, collateral, and group exposures.
    - Limit Hierarchy, Group Limits: Manages parameters, references, limits, and shared structures.
        - `LIMIT.PARAMETER`: Core credit limit parameters. Sets global rules for credit limits, including options for handling group limits.
        - `LIMIT.REFERENCE`: Credit product references. Defines hierarchical structures and risk categories for credit products.
        - `LIMIT`: Active credit lines. Tracks approved limits, active utilization, and parent links for hierarchical limits.
        - `LIMIT.SHARING.GROUP`: Shared credit facility records. Manages joint liability groups and credit line allocations across multiple customer accounts.

- Teller: Manages branch cash drawers, branch vault systems, and related transactions.
    - Till & Vault Management: Defines vault configurations and active workspace cash drawers.
        - `TELLER.PARAMETER`: Branch cash settings. Defines branch vault profiles, currency overage/shortage accounts, and FX calculations.
        - `TELLER.ID`: Cash drawer states. Monitors cash drawer statuses (e.g., Open, Closed), currency volumes, limits, and linked internal cash accounts.

- Document Management: Orchestrates customer document requirements, transactional documents, upload links, and image directories.
    - Document Management (DM) & Compliance Engine: Governs taxonomy, upload steps, and obligations.
        - `DM.DOCUMENT.CLASS`: Document classifications. Groups document types (e.g., Corporate Legal, KYC ID) into high-level categories.
        - `DM.DOCUMENT.TYPE`: Document type definitions. Configures specific requirements for document types (e.g., passport formats), including validation rules and tracking schedules.
        - `DM.DOCUMENT.UPLOAD`: Document upload sessions. Tracks transaction-level upload activities, providing pre-signed S3 links for document storage.
        - `DM.CUST.DOCUMENT`: Customer document compliance tracker. Monitors customer-level compliance statuses and expiration dates to prevent compliance blocks.
        - `DM.TRANS.DOCUMENT`: Transactional document tracker. Tracks transaction-specific document completions, blocking transaction completion if requirements are unmet.
    - Image Capture & Digital Evidence Repository: Manages blueprints and image file locations.
        - `DM.IMAGE.TYPE`: Image type configurations. Sets storage directories, size limits, and allowed image formats for image categories (e.g., signatures, photos).
        - `DM.IMAGE.DOCUMENT`: Image metadata index. Connects stored image files in S3 storage to respective customer and account entities.

- Interest & Charges: Defines calculations, benchmarks, and fee structures.
    - Interest Calculation Engine: Manages benchmark rates, day counts, and rule matrices.
        - `IC.BENCHMARK.REFERENCE`: Reference interest rates. Declares benchmark rate definitions (e.g., SOFR, EURIBOR) used across core products.
        - `IC.INTEREST.BASIS`: Day-count calculation bases. Defines standard calendar calculations (e.g., Actual/360, 30/360) used to calculate interest.
        - `IC.FLOATING.BASE.RATE`: Floating rate values. Tracks effective interest values for benchmark rates by date.
        - `IC.PERIODIC.INTEREST`: Periodic rate curves. Tracks rate indexes and terms for multi-period credit contracts.
        - `IC.GLOBAL.INTEREST.RULE`: Global interest rules. Integrates calculation bases, benchmarks, margins, and tiering limits into reusable calculation rules.
    - Charge Calculation Engine (Decoupled Tariff & Fee Kernel): Manages calculation matrices and tariff hubs.
        - `CC.GLOBAL.CHARGE.RULE`: Global charge configurations. Sets fee calculations (e.g., flat fees, percentage scales, tiered fees) with defined minimums and maximums.
        - `CC.CHARGE.TARIFF.GROUP`: Customer pricing categories. Groups charge rules with customer profile filters to apply waivers, discounts, or promotional fees.

- **Custom Table:** Framework for banks to build arbitrary internal modules.

#### 3.3. Integration & Reporting

- **Financial Reporting Engine:** Data collection and generation for internal/external audits (e.g., IFRS).
- **FCM (Financial Crime Management):** Integration layer for Unified AML, Sanctions, Fraud, OFAC/UN real-time screening, fuzzy matching, behavioral fraud.
- **Delivery:** Kafka consumer executing delivery to SWIFT, Payment Hubs, Printers, etc.
- **External Event Publisher:** Kafka consumer powering webhooks for external subscribers.
- **Notification:** Email/SMS dispatch (integrates via SMTP, Trello, etc.).

---

### 4. Compliance & Regulatory Scope

The system must be designed to support the regulatory, localization, and compliance
requirements of the following jurisdictions:

- **Ethiopia, Tunisia, South Sudan, Liberia**
- **CEMAC** (Central African Economic and Monetary Community)
- **UEMOA** (West African Economic and Monetary Union)

CEMAC and UEMOA imply strict adherence to **OHADA** accounting standards, **multi-currency
support including XAF/XOF**, and **French/English/Arabic** localization requirements.
