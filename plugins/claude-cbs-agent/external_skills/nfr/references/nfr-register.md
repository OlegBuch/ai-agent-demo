# CBS Non-Functional Requirements Register

Mirror of three Confluence pages (TB space, bank-proj.atlassian.net), all v1.0 of 2026-06-29 by Andrei Sialila & Oleksandr Stashenko, synced 2026-07-14:

- [Architecture Significant Requirements (ASR)](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1454637075/Architecture+Significant+Requirements+ASR) — §0 below
- [NFR Definitions and Classification](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1454931991/NFR+Definitions+and+Classification) — §1 below
- [Non-Functional Requirements Register](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1454571540/Non-Functional+Requirements+Register) — §2 below

Reading conventions:

- Requirement text is **verbatim** from the register — SHALL statements are binding; numbers (percentages, latencies, retention periods) are the acceptance thresholds.
- The bracketed tags after a requirement are its **regulatory/compliance drivers** (regulators: BoSS = Bank of South Sudan, COBAC = CEMAC banking commission, BCEAO/UEMOA = West-African monetary union, CBL = Central Bank of Liberia, ANIF/CENTIF = financial-intelligence units). No tag = internal/architectural requirement.
- **ID gaps are in the source, not sync losses**: there is no NFR-07 quality attribute, and NFR-04-11 / NFR-04-12 are unassigned (Scalability jumps from 04-10 to 04-13).
- **Two cross-references are verbatim source quirks, likely typos**: NFR-08-10 cites "per NFR-03-08" where purge-blocking is actually defined in NFR-03-06, and NFR-08-08 cites "threshold per NFR-16-05" (file-scan sizing) where NFR-16-04 (capacity-utilization reporting) is the plausible target. Kept as-is for fidelity; resolve them to the likely targets when reasoning.
- Terms **Tier-0/1/2**, **CF-1..CF-10**, and the data classes **Public / Internal / Confidential / Restricted** resolve in §1.
- §0 is the *rationale* layer — five architecture-significant quality attributes and why they matter — that the detailed NFR-01..17 register in §2 makes verifiable.

---

## §0 Architecture Significant Requirements (ASR)

The quality attributes and constraints that materially influence CBS architecture, technology decisions, integration design, security model, operational readiness, and production resilience. Each ASR is the rationale behind a cluster of the detailed NFRs in §2.

| ID | ASR | Description | Business justification |
| --- | --- | --- | --- |
| ASR-1 | Security | End-to-end security, regulatory compliance, and data integrity by design: Zero Trust access controls (strong identity, least privilege), encryption in transit/at rest, key management and separation of duties, immutable audit trails and evidence-ready logging, support for AML/KYC and data residency obligations, legal compliance, and security/compliance guardrails at integration points (authN/authZ, mTLS, data minimization). | Protects the bank's license-to-operate by reducing breach risk, fraud exposure, and regulatory penalties. |
| ASR-2 | Availability | High availability and resilience for critical flows via redundancy and failover, isolation of failures, graceful degradation, and disaster recovery — with explicit RTO/RPO targets per criticality tier and operational readiness (runbooks, DR testing). Data integrity and resilience controls: domain invariants for ledger/posting, idempotency and deduplication for critical operations, tamper-evident logs, consistency rules for master/reference data, reconciliation-ready records (traceability from API/event to accounting outcome). Delivery tactics: safe/frequent change through automated testing, progressive delivery (canary/blue-green/feature flags), zero-downtime deployment patterns, controlled schema/data migration (online migrations, rollback plans, compatibility windows). | Minimizes operational and reputational risk for banks in CEMAC/SSA, where downtime directly impacts customer trust, liquidity operations, and regulatory posture. Creates a predictable system for scaling deployments across multiple institutions without per-client engineering. Supports migration/modernization by enabling coexistence with legacy components and continuity for core banking functions. Ensures "ledger truth" and non-repudiation for disputes, audits, and investigations. Speeds onboarding by providing audit-ready controls and integrity guarantees out of the box. |
| ASR-3 | Scalability | Consistent low-latency performance and predictable throughput under peak load for transactional workloads (APIs, posting, payments, channels). Includes horizontal scaling, capacity planning, caching where appropriate (non-ledger/read-heavy paths), rate limiting/quotas, and protection from retry storms/backpressure issues (timeouts, circuit breakers, bulkheads). | Enables digital-first experiences without architectural rewrites as volume grows. Protects unit economics by scaling efficiently and preventing performance regressions that drive operational escalations. Allows fintech and new digital banks to expand rapidly while meeting user expectations and service-level commitments. |
| ASR-4 | Observability | Standardized telemetry (logs/metrics/traces), real-time alerting, SLO/SLA visibility, and traceability to business events/transactions. Includes compliance-grade logging, metrics-freshness requirements, and audit-friendly reporting and incident readiness. | Reduces mean time to detect/resolve incidents, lowering support costs and improving customer satisfaction. Converts CBS behavior into business-readable signals (transaction delays, reconciliation exceptions, AML pipeline latency), enabling faster operational decisions. Strengthens regulator interactions by providing evidence and reports without manual data hunts. |
| ASR-5 | Configurability | Ability for the system to be configured without explicit code development. | Enables regulatory agility via frequent updates without service disruption. Lowers implementation cost by standardizing delivery pipelines and reducing release processes per bank. Improves quality and reduces production risk, accelerating time-to-market for new deployments and modules. |

Rough mapping to the §2 attribute range: ASR-1 Security → NFR-01; ASR-2 Availability → NFR-02/03/08/09/12; ASR-3 Scalability → NFR-04/05; ASR-4 Observability → NFR-06; ASR-5 Configurability → NFR-10. (NFR-11/13/14/15/16/17 are not called out individually as ASRs in the source but remain part of the detailed register.)

---

## §1 Interpretation model (definitions & classification)

### Critical Flows (CF-1..CF-10)

The business/operational paths that drive availability, recovery, resilience, and auditability expectations. For split-ownership flows, CBS SLAs apply only to the CBS-owned segment — end-to-end availability may depend on external systems outside it.

| ID | Flow | Tier | Why critical | Ownership / SLA boundary | Availability (our part) | RTO / RPO |
| --- | --- | --- | --- | --- | --- | --- |
| CF-1 | Payment order → fund-availability check → ledger posting | 0 | Money movement and ledger truth — system of record | Split: ours = fund check + ledger posting + outbox / not ours = Payment Hub, external rails, SWIFT. End-to-end is not our SLA. | 99.90% — our posting path | ≤30 min / ≤5 min (async default; ~0 target on the ledger path via sync standby) |
| CF-2 | Authentication — login / token issue | 0 | Gates every other flow | Ours — Keycloak; read-only degraded mode if an external IDP is slow | 99.90% | ≤30 min / ≤5 min |
| CF-3 | Audit-log capture — every INPUTTER / AUTHORISER action | 0 | Non-repudiation and supervisory evidence — system of record | Ours — append-only, hash-chained, WORM | 99.90% | ≤30 min / ≤5 min (async default; ~0 target on the audit path via sync standby) |
| CF-4 | AML / sanctions screening on a transaction | 0 | Regulatory gate on money movement | Split: ours = integration + gate decision / not ours = screening vendor. End-to-end is not our SLA. | 99.90% — our integration | ≤30 min / ≤5 min |
| CF-5 | Channel BFF API — mobile / web read + write | 1 | Customer experience | Ours | 99.50% | ≤4 h / ≤15 min |
| CF-6 | Notification delivery — SMS / email / push | 1 | Customer experience; does not gate money movement | Split: ours = send via the provider / not ours = carrier and inbox last-mile delivery | 99.50% — our send | ≤4 h / ≤15 min |
| CF-7 | COB multi-stage batch | 2 | End-of-day processing | Ours | 99.00% | ≤24 h / ≤4 h |
| CF-8 | Regulatory reporting export | 2 | Periodic, deadline-bound, not real-time | Split: ours = generate + submit on time / not ours = regulator portal availability — BoSS / COBAC / BCEAO. End-to-end is not our SLA. | 99.00% — our generation | ≤24 h / ≤4 h |
| CF-9 | Reconciliation — CBS vs Payment Hub vs Nostro | 2 | Control, runs on a schedule | Ours — reconciliation engine; depends on external statement / Nostro feeds | 99.00% | ≤24 h / ≤4 h |
| CF-10 | DWH event publishing — Debezium / Kafka → ClickHouse | 2 | Analytics ingestion | Ours | 99.00% | ≤24 h / ≤4 h |

### Tier summary

| Tier | Description | Examples | Availability (our part) | RTO | RPO |
| --- | --- | --- | --- | --- | --- |
| Tier 0 | Critical — money movement, ledger and the authorization gates | Authentication, payment posting, audit capture, AML / sanctions screening | 99.90% | ≤30 min | ≤5 min |
| Tier 1 | Customer-facing channels | Channel BFF — mobile / web / ATM, notification delivery | 99.50% | ≤4 h | ≤15 min |
| Tier 2 | Operations and reporting | COB batch, regulatory reporting, reconciliation, DWH publishing | 99.00% | ≤24 h | ≤4 h |

### Data classification

Minimum protection and audit expectations per data category; apply consistently across architecture, security controls, access management, logging, retention, backup, reporting, and evidence collection.

| ID | Class | Examples | Encryption requirement | Audit |
| --- | --- | --- | --- | --- |
| NFR-Def-1 | Public | Product rates, branch addresses, currency tables | TLS in transit only | Basic access log |
| NFR-Def-2 | Internal | Infrastructure logs, monitoring metrics, non-customer reports | TLS + AES-256 at rest | Basic |
| NFR-Def-3 | Confidential | Customer PII, KYC documents, account master data | TLS + AES-256 at rest, key in Vault | Full access log |
| NFR-Def-4 | Restricted | Ledger postings, audit trails, regulator-bound reports | TLS + AES-256 at rest + WORM, append-only with hash-chain integrity check | Full + integrity check |

### Service windows

| Purpose | Window |
| --- | --- |
| Planned maintenance, Production | Sunday 02:00–06:00 UTC |
| Cutover window — one-off | Saturday 22:00–Sunday 06:00 UTC |
| Regulatory reporting cutoff | Per jurisdiction — BoSS / COBAC / BCEAO daily 23:00 local |

---

## §2 The NFR Register

### Security (NFR-01)

#### Authentication & Session

- **NFR-01-01** — The system SHALL authenticate and authorize every human and service request before it reaches any service, covering 100% of Tier-0 routes at go-live and 100% of Tier-1 routes within 90 days. `[BoSS governance] [COBAC R-2016/04]`
- **NFR-01-02** — The identity service SHALL enforce passwords of ≥12 characters with mixed case and a symbol and mandatory MFA for 100% of users, and SHALL require two-factor authentication on 100% of agent-banking transactions. `[CBL/SD/004/2022]`
- **NFR-01-03** — The session manager SHALL bound session lifetimes to an access-token TTL ≤5 min, a refresh-token TTL ≤8 h, an idle timeout of 20 min, and ≤1 concurrent session per principal.
- **NFR-01-04** — The channel layer SHALL keep read-only channels usable from a cached session for ≤15 min when the identity-provider round-trip exceeds 3 s.

#### Authorization Model

- **NFR-01-05** — The authorization service SHALL enforce least-privilege, deny-by-default access at table, operation, record and field granularity (effective permissions = merge of group and direct grants) on 100% of routes, and SHALL make segregation-of-duties conflicts reportable for supervisory review. `[BoSS governance] [COBAC supervisory review]`
- **NFR-01-06** — The authorization service SHALL enforce a temporal validity policy (valid-from / valid-to) on 100% of grants for which a validity window is configured.
- **NFR-01-07** — Each service SHALL mutually authenticate every east-west call with a distinct service identity and SHALL authorize 0 actions on the basis of an unauthenticated propagated context header.
- **NFR-01-08** — The system SHALL enforce four-eyes (INPUTTER / AUTHORISER) control on 100% of Restricted-class writes and SHALL permit overrides only via an audit-logged exception routed to an override-class approver. `[BoSS governance] [COBAC R-2016/04]`

#### Cryptography & Secrets

- **NFR-01-09** — The system SHALL encrypt 100% of data per the data-class matrix — Public: TLS 1.3 in transit; Internal: + AES-256-GCM at rest; Confidential: + key isolation + full access log; Restricted: + immutability + integrity verification. `[COBAC] [data-class matrix]`
- **NFR-01-10** — The system SHALL hold cryptographic keys in a FIPS 140-3-validated key store and SHALL cryptographically isolate Restricted-class keys from Confidential-class keys. `[FIPS 140-3]`
- **NFR-01-11** — The system SHALL rotate TLS/service certificates and DEK/KEK keys within ≤365 days, service tokens within ≤24 h, and database master credentials within ≤90 days.
- **NFR-01-12** — The system SHALL provide a documented break-glass key-recovery procedure under 2-of-N dual control and SHALL test it at least once per year.

#### Vulnerability & Assurance

- **NFR-01-13** — The security team SHALL conduct a penetration test at least once per year and before any release that changes the attack surface (scope: channel/BFF and partner APIs and UI), SHALL deliver the report within ≤10 business days, and SHALL retain evidence for supervisory review. `[BoSS governance] [COBAC supervisory review]`
- **NFR-01-14** — The security team SHALL remediate Critical findings within ≤14 days and High findings within ≤30 days (CVSS v3.1 bands) and SHALL re-test 100% of Critical/High findings.
- **NFR-01-15** — The security team SHALL test authentication/authorization bypass across all roles, sensitive-data leakage for PII/ledger/audit, and business-logic abuse on CF-1, CF-4, holds and overrides (OWASP Top 10 + ASVS L2).

#### Content Protection

- **NFR-01-16** — The upload service SHALL malware-scan externally sourced uploads before persistence (inline accept/reject + async deep scan in quarantine per average file) and SHALL promote a file to the clean store only on a clean verdict confirmed by a server-side storage event.

#### Data Privacy

- **NFR-01-17** — The system SHALL process customer personal data only on opt-in consent (free/informed/specific/unambiguous), SHALL maintain a record of processing and a DPIA for 100% of high-risk processing, SHALL notify the supervisory authority and affected subjects of breaches within the binding bound (Cameroon: all breaches, without undue delay), and SHALL permit 0 cross-border transfers without prior authorization and an adequacy assessment. `[Cameroon Law 2024/017 Arts 9/22/32, deadline 23 Jun 2026] [Liberia/CBL] [South Sudan/BoSS]`

#### Data Classification

- **NFR-01-18** — The system SHALL apply per-data-class access logging on 100% of classified records: Public — basic access log; Internal — basic audit; Confidential — full access log; Restricted — full access log plus integrity check.

### Availability (NFR-02)

#### Availability Targets

- **NFR-02-01** — The system SHALL maintain annual availability (excluding planned windows) of its owned part of each flow of ≥99.9% for Tier-0 flows (CF-1..CF-4), ≥99.5% for Tier-1 flows (CF-5, CF-6) and ≥99.0% for Tier-2 flows (CF-7..CF-10), and SHALL provide business-continuity coverage for payments, posting and customer data. `[BoSS DR/BCP duty] [COBAC DR/BCP duty]`
- **NFR-02-02** — The system SHALL perform planned maintenance and cutover only within agreed windows (e.g. Sun 02:00–06:00 UTC; cutover Sat 22:00–Sun 06:00 UTC) with planned downtime per cutover of ≤4 h.
- **NFR-02-03** — The channel layer SHALL degrade gracefully, permitting Tier-0 read-only operation during failover and Tier-1 degraded mode rather than hard failure.
- **NFR-02-04** — The system SHALL contain 0 single points of failure for Tier-0 components within the active site and SHALL auto-recover Tier-0 capacity within the Tier-0 RTO.

#### Regulatory Connectivity

- **NFR-02-05** — The system SHALL maintain connectivity to each regulatory settlement scheme across that scheme's published operating hours and cut-off matrix and SHALL support the national instant/RTGS service on its published schedule (SSIPSS 24/7). `[BoSS SSIPSS] [SYGMA/SYSTAC2] [STAR-UEMOA/SICA-UEMOA] [NEPS]`

#### SLA Boundary

- **NFR-02-06** — The system SHALL, for split-ownership flows (CF-1, CF-4, CF-6, CF-8, CF-9), measure and report its availability and recovery SLOs only on the owned segment up to a documented demarcation point, excluding from its SLA the Payment Hub, external rails/SWIFT, the screening vendor, carrier/inbox last-mile, the regulator portal and external Nostro/statement feeds, with the demarcation documented for 100% of split flows.

### Reliability (NFR-03)

#### Recovery Targets

- **NFR-03-01** — The system SHALL meet recovery targets of Tier-0 RTO ≤30 min / RPO ≤5 min, Tier-1 RTO ≤4 h / RPO ≤15 min, and Tier-2 RTO ≤24 h / RPO ≤4 h, applying tighter targets (e.g. RPO ≈ 0 on the ledger-posting (CF-1) and audit-capture (CF-3) paths) only where an approved DR decision records the cost trade-off. `[BoSS DR/BCP duty] [COBAC R-2016/04 PCA]`
- **NFR-03-02** — The system team SHALL conduct a full DR / site-failover drill annually with a formal report and a subset drill quarterly.

#### Fault Isolation

- **NFR-03-03** — The system SHALL isolate CPU, memory and connection resources per service such that one module cannot exhaust another module's Tier-0 capacity, and SHALL ensure that failure of a non-Tier-0 flow (e.g. notification CF-6) cannot block or gate Tier-0 money movement, verified by a blast-radius test.

#### Backup

- **NFR-03-04** — The system SHALL apply verifiable integrity checks to 100% of backups and SHALL perform a full restore drill annually (Restricted) and a subset-restore drill quarterly (Tier-0).

#### Processing Integrity

- **NFR-03-05** — The system SHALL ensure that a repeated or replayed Tier-0 money-moving request produces a single financial effect, achieving a duplicate-posting rate of 0.

#### Retention Enforcement

- **NFR-03-06** — The system SHALL enforce retention configurable per (data class × record type × jurisdiction) and version-controlled, blocking and audit-logging 100% of purge attempts before the binding statutory minimum, with every record type carrying a resolvable policy and an explicit retention-clock basis. `[BoSS Banking Act 2012 s.84; AML/CFT 2012 s.17(3)] [CEMAC AML Reg 01/2016 Art.38] [COBAC]`
- **NFR-03-07** — The system SHALL retain financial ledgers/records for ≥10 years, transaction/customer-relationship records for ≥5 years from end of relationship, AML identity/transaction records for ≥10 years (identity from end-of-relationship, transactions from execution), and other operational data for ≥90 days. The retention period may be different under different compliances applied. `[BoSS Banking Act 2012 s.84(4); AML/CFT 2012 s.17(3)] [CEMAC AML Reg 01/2016 Art.38]`

#### Data-Loss Handling

- **NFR-03-08** — The system SHALL trigger the incident and statutory-notification workflow within ≤15 min of detecting a confirmed permanent-loss or unrecoverable-corruption event on retained data, SHALL make the affected-record set 100% enumerable and integrity-attestable, and SHALL route Restricted-class loss to a P1 + RCA + supervisory log and Confidential-class loss additionally to data-breach notification of the authority and affected subjects without undue delay. `[Cameroon Law 2024/017] [COBAC] [BoSS]`

### Scalability (NFR-04)

#### Capacity Planning

- **NFR-04-01** — The system SHALL be pre-provisioned per rollout phase (1/5/10/25/50/100%) within the fixed on-premise footprint with a documented headroom margin above each phase's peak, adding capacity only by a planned procurement wave and pre-provisioning the recovery site to the required capacity.
- **NFR-04-02** — The system SHALL sustain the user-volume target of 1,000,000 total / 100,000 DAU / 15,000 peak concurrent at the 100% phase.
- **NFR-04-03** — The system SHALL sustain a request rate of 500 avg RPS and 4,500 peak RPS at the 100% phase.
- **NFR-04-04** — The system SHALL sustain a read load of ≈38.88M reads/day (≈90% of API requests) at the 100% phase.
- **NFR-04-05** — The system SHALL sustain a base write load of 4.32M API writes/day, with total-DB write amplification of 5×–10× pending per-component decomposition.
- **NFR-04-06** — The system SHALL provision the relational store to ≈7.52 TB (5×)–15.04 TB (10×)/yr and the OLAP store to ≈752 GB–1.5 TB/yr (10:1 compression), totaling ≈7.52–15.04 TB over the 10-year horizon at the 100% phase.
- **NFR-04-07** — The event system SHALL sustain ingestion of 20.6–41.2 GB/day and retain events for ≥7 days.
- **NFR-04-08** — The document store SHALL accommodate growth of 5 MB avg/record at 100 docs/day (≈182.5 GB/yr).
- **NFR-04-09** — The logging system SHALL accommodate ≈127.2 GB/day (≈46.4 TB/yr uncompressed; ≈11.45 TB at 90-day retention).
- **NFR-04-10** — The identity service SHALL provision for 15,000 peak sessions (≈150 MB session memory) and SHALL run highly available with no single node a point of failure.

#### Overload Behaviour

- **NFR-04-13** — The system SHALL, when demand exceeds the provisioned envelope, maintain Tier-0 SLOs for admitted requests with no cascading failure and SHALL reject or defer excess demand within a bounded response. *(04-11 / 04-12 unassigned in the source.)*

### Performance (NFR-05)

#### Query & Channel

- **NFR-05-01** — The system SHALL return account/customer search results at p95 ≤2 s.
- **NFR-05-02** — The system SHALL retrieve 12-month transaction history at p95 ≤7 s.

#### Money Movement (CF-1)

- **NFR-05-03** — The system SHALL complete ATM/online authorization (auth + limit/balance check) at p95 ≤500 ms (≤2 s degraded).
- **NFR-05-04** — The system SHALL complete transaction-to-ledger posting (channel + auth + posting) at p95 ≤1 s.

#### Money Movement (CF-4)

- **NFR-05-05** — The system SHALL evaluate AML/sanctions screening as a distinct gate before money moves at p95 ≤1.5 s, with end-to-end screened-payment latency equal to the CF-1 budget plus the CF-4 budget. `[BoSS AML/CFT Act 2012; ANIF; WAEMU uniform AML/CFT; CBL/SD/004/2022]`

#### Identity & Reporting

- **NFR-05-06** — The system SHALL complete an identity-verification round-trip at p95 ≤5 s, capped by the external-IdP SLA, with a defined degraded mode.
- **NFR-05-07** — The system SHALL produce a standard regulatory report in ≤30 s and an ad-hoc analyst query in ≤5 min.

### Observability (NFR-06)

#### Logging & Tracing

- **NFR-06-01** — The system SHALL emit centralized structured logs carrying the required fields (component_id, process_id, correlation_id, caller_id, timestamp) on 100% of Tier-0/1 logs, SHALL instrument services for end-to-end tracing, and SHALL contain 0 raw PII in logs.
- **NFR-06-02** — The system SHALL propagate a single correlation ID across 100% of Tier-0/Tier-1 services for end-to-end traceability.

#### SLO & Alerting

- **NFR-06-03** — The system SHALL provide per-tier SLO dashboards and SHALL achieve MTTA ≤5 min (Tier-0), ≤15 min (Tier-1), and ≤30 min (Tier-2).
- **NFR-06-04** — The system SHALL publish an SLO and monthly error budget for each Tier-0 flow (CF-1..CF-4), SHALL raise a fast-burn alert at 2% budget / 1 h and a slow-burn alert at 10% / 6 h, and SHALL freeze non-critical change on a flow whose budget is exhausted.
- **NFR-06-05** — The system SHALL route alerts by severity: P1 → on-call + CISO + paging; P2 → on-call; P3 → ticket queue.

#### Audit Evidence

- **NFR-06-06** — The system SHALL export audit evidence to regulators within ≤1 business day from immutable (tamper-evident) storage with a signed manifest. `[BoSS supervisory] [COBAC R-2016/04 Art.76 piste d'audit]`

#### Reporting Freshness

- **NFR-06-07** — The system SHALL meet reporting-freshness targets of operational data ≤1 h, regulatory ≤24 h, and real-time SLO dashboards ≤60 s.

#### Incident Tracking

- **NFR-06-08** — The system SHALL track 100% of incidents in a ticketing system with stakeholder visibility and SHALL make incident and disclosure/export logging demonstrable for supervisory review. `[BoSS governance] [COBAC R-2016/04 Art.41]`

### Data Integrity (NFR-08)

*(There is no NFR-07 attribute in the source register.)*

#### Ledger Controls

- **NFR-08-01** — The accounting engine SHALL produce a balanced GL entry (Σdebit = Σcredit) for 100% of successful postings, SHALL raise a P1 on any imbalance, and SHALL validate balance by COB reconciliation. `[COBAC PCEC] [UEMOA PCB révisé] [BoSS]`

#### Record Locking

- **NFR-08-02** — The system SHALL lock a record open for input/authorisation to a single user with the holder visible, releasing the lock on commit/session-end/TTL, for custom-ID and auto-ID records alike.

#### Pre-authorisation State

- **NFR-08-03** — The system SHALL hold pre-authorisation state with a TTL and SHALL promote it to live space only on authorisation.

#### Document Gating

- **NFR-08-04** — The system SHALL block an operation with HTTP 423 on 100% of cases where a mandatory document is missing, expired, or in the wrong state.

#### Audit Trail

- **NFR-08-05** — The system SHALL maintain a tamper-evident, append-only, immutable audit trail with verifiable monotonic ordering and payload integrity (actor_id, action, target_record_id, timestamp), SHALL make any alteration detectable, and SHALL retain it for ≥10 years. `[BoSS Banking Act 2012 s.84(9)] [COBAC R-2016/04 Art.76]`

#### Reconciliation

- **NFR-08-06** — The system SHALL perform T+0 (intraday) reconciliation for Tier-0 and T+1 reconciliation against payment hub, nostro, correspondent network and card switch, investigating breaks >$1k-equiv within ≤2 business days. `[COBAC T+0/T+1]`

#### Exactly-Once

- **NFR-08-07** — The system SHALL land each posting event in the analytical store exactly once (0 duplicate rows), verified against the source system.

#### Event Durability

- **NFR-08-08** — The system SHALL durably retain 100% of committed production events through a single-node failure and SHALL alert on capacity before exhaustion (threshold per NFR-16-05).

#### Event Ordering

- **NFR-08-09** — The system SHALL preserve per-key (account/entity) event ordering end-to-end for 100% of events.

#### Tiering

- **NFR-08-10** — The system SHALL tier data hot→warm→cold with defined transitions and SHALL block purge before the statutory minimum (per NFR-03-08).

#### Event Isolation

- **NFR-08-11** — The system SHALL maintain one event stream per table, environment-prefixed and access-controlled per environment, removing it only when the owning table is deleted and holds no records.

#### Report Reproducibility

- **NFR-08-12** — The system SHALL produce identical output for a regulatory report run over the same period, with report version control and 100% data lineage from output back to source. `[BoSS supervisory reporting] [COBAC quarterly/annual] [UEMOA]`

### Durability (NFR-09)

#### Durability Targets

- **NFR-09-01** — The system SHALL retain committed data and events to an annual durability target per data class — Restricted ≥99.9999999% (9 nines), Confidential ≥99.99999% (7 nines), Internal ≥99.999% (5 nines), Public ≥99.9% (3 nines) over a rolling 12-month window from acknowledged commit — and SHALL never silently lose an acknowledged write outside that bound. `[BoSS Banking Act 2012 s.84(9)] [COBAC/BoSS supervisory ladder]`

#### Integrity / Bit-rot

- **NFR-09-02** — The system SHALL attach verifiable integrity metadata to 100% of stored objects/events, SHALL verify integrity on a recurring cycle of ≤30 days (Restricted) and ≤90 days (other classes), SHALL restore a corrupted Restricted object to its originally committed bytes (or flag and escalate where none is intact), and SHALL keep undetected-corruption per Restricted object ≤1×10⁻¹⁵ and unrecoverable-corruption (Restricted) = 0, reported monthly. `[COBAC R-2016/04 Art.76] [BoSS]`

#### Loss Reporting

- **NFR-09-03** — The system SHALL record 0 observed permanent-loss events, SHALL report undetected-corruption and integrity-verification statistics monthly, and SHALL raise a P1 + RCA and trigger the loss/notification workflow (incl. statutory breach notification for personal data) on any permanent-loss or unrecoverable-corruption event on Restricted/Confidential data. `[Cameroon Law 2024/017] [COBAC] [BoSS]`

### Configurability & Extensibility (NFR-10)

#### Change Control

- **NFR-10-01** — The system SHALL version-control 100% of configuration and deploy it through automated, repeatable pipelines, producing one audit-log entry per change (actor, timestamp, diff, rationale).

#### Products

- **NFR-10-02** — The system SHALL allow banking products (rates, fees, eligibility) to be configured with 0 code changes.

#### Forms & Localization

- **NFR-10-03** — The system SHALL allow field visibility, layout and validation to be changed with 0 code changes (projection forms) and SHALL apply localization per region.

#### Integration Endpoints

- **NFR-10-04** — The system SHALL allow integration endpoints to be configured via metadata (data-access layer + application registry) with 0 code changes.

#### AML/KYC Rules

- **NFR-10-05** — The system SHALL allow AML/KYC rule sets to be configured per jurisdiction with 0 code changes, version-controlled. `[BoSS] [ANIF] [CENTIF / FIU] [CBL]`

#### Runtime Config

- **NFR-10-06** — The system SHALL apply runtime configuration changes with 0 downtime, validating before activation and supporting rollback (auto-ID-generation rules frozen for MVP).

#### Multi-tenancy

- **NFR-10-07** — The system SHALL isolate tenants logically (Tier-1/2) and logically + at the network level (Tier-0) such that tenant A's p95 latency is unaffected by a 5× burst from tenant B on Tier-0.

#### Portability of Config

- **NFR-10-08** — The system SHALL export and import configuration across environments with idempotent reproduction.

#### Regulatory Rule Sets

- **NFR-10-09** — The system SHALL allow jurisdiction-specific regulatory rule sets — prudential ratios (CAR/RWA, leverage, liquidity, large-exposure, net-FX position), loan classification & provisioning incl. counterparty contagion, statutory chart-of-accounts mapping, minimum share-capital phase-in, consumer pricing/TEG + amortization schedule, and FX-control/export-domiciliation — to be configured with 0 code changes, version-controlled, with 100% of overrides audit-logged and all statutory thresholds parameterized rather than hardcoded. `[COBAC R-2025/02; R-2018/01; R-2023/01] [UMAC 20 Dec 2019 / Reg 01/20] [CEMAC FX Reg 02/18] [UMOA Décision 013-24-06/2016] [PCEC / PCB révisé] [CBL prudential]`

### Interoperability (NFR-11)

#### Protocols

- **NFR-11-01** — The system SHALL support REST (channels), ISO 20022 (in production at go-live), SWIFT MT (correspondent banking) and SOAP (legacy) over HTTPS only. `[BEAC Instruction N°001/GR/2025 — ISO 20022 from 22 Nov 2025] [BCEAO]`

#### Versioning

- **NFR-11-02** — The system SHALL version integrations, introducing breaking changes only in a major version with a deprecation notice of ≥90 days.

#### File-based

- **NFR-11-03** — The system SHALL support file-based integration of ≤1 GB/file (types XLS/DOC/XML/PDF/ZIP/CSV/JSON/TXT/SWIFT MT/ISO 20022/PNG/JPG) with time-limited upload authorization, malware-scanning external files per NFR-01-16.

#### Payment-rail Connectivity

- **NFR-11-04** — The system SHALL connect per jurisdiction via the payment hub to the national RTGS, clearing and card-switch (and instant) rails with full status lifecycle, rejects/returns, cut-off handling and automated reconciliation — SSIPSS (RTGS+ACH, 24/7; connection mandatory 31 Jan 2026, non-connection penalty USD 100,000), SYGMA+SYSTAC2+GIMAC, STAR-UEMOA+SICA-UEMOA+GIM-UEMOA+PI-SPI, NEPS+CBL-settled rails — and SHALL support SSP floating-FX, XAF fixed EUR peg, dual LRD/USD and multi-currency FX-position management. `[BoSS Circular, Bank of South Sudan Act 2011 am.2023] [BEAC N°001/GR/2025] [BCEAO] [Liberia FIA; CBL E-Payment]`

### Deployability (NFR-12)

- **NFR-12-01** (Progressive Delivery) — The system SHALL keep Tier-0 available throughout deployments via progressive delivery and SHALL complete a Tier-0 rollback within ≤15 min.
- **NFR-12-02** (Schema Compatibility) — The system SHALL keep the schema backward-compatible for ≥1 release and SHALL never break the running release during cutover.
- **NFR-12-03** (Migration Waves) — The system SHALL migrate in controlled waves with a tested rollback verified before each go-live wave.

### Maintainability (NFR-13)

- **NFR-13-01** (Architecture Docs) — The system team SHALL maintain a current, version-controlled architecture documents (e.g. High-level architecture, ADRs).
- **NFR-13-02** (API Specs) — The system SHALL expose an OpenAPI 3.0+ spec for 100% of endpoints.
- **NFR-13-03** (User/Admin Manuals) — The system team SHALL maintain end-user manuals for 100% of operated features and admin manuals for operated components.
- **NFR-13-04** (Deployment Guides) — The system team SHALL maintain a per-environment deployment guide (automated provisioning + manual out-of-band checklist).
- **NFR-13-05** (Config Docs) — The system team SHALL document 100% of configuration parameters, including security configuration.
- **NFR-13-06** (Integration Docs) — The system team SHALL document external integrations.
- **NFR-13-07** (Security Docs) — The system team SHALL maintain current security-architecture, threat-model and control/compliance-mapping documentation. `[COBAC] [BoSS supervisory]`
- **NFR-13-08** (DR Docs) — The system team SHALL maintain a DR plan with recovery targets and per-component / per-data-class recovery guides.
- **NFR-13-09** (Ops Docs) — The system team SHALL document dashboard/alerting setup, maintain a troubleshooting guide from known incidents, and produce release notes per version (features/fixes/breaking changes).

### Testability (NFR-14)

- **NFR-14-01** (Coverage) — The system SHALL meet test-coverage targets of unit 80% (business logic) / 60% (infra adapters), integration on every external boundary, and e2e on 100% of critical flows (CF-1..CF-10).
- **NFR-14-02** (Pipeline Security) — The CI pipeline SHALL run SAST on 100% of critical APIs/UIs, SCA on all dependencies and secrets scanning, achieving coverage ≥95%.
- **NFR-14-03** (Merge Gate) — The CI pipeline SHALL block merge to main on any Critical security finding (0 Critical at merge).
- **NFR-14-04** (Component Integration) — The system SHALL pass 100% of component-integration tests on Tier-0 modules.
- **NFR-14-05** (Overload) — The system SHALL, under load tested to ≥2× expected peak, maintain Tier-0 SLOs for admitted requests with no catastrophic failure and no retry storms at a 5× burst, rejecting or deferring excess demand cleanly.
- **NFR-14-06** (Soak) — The system SHALL exhibit ≤10% memory/performance degradation over a 24 h sustained run.
- **NFR-14-07** (Phased Load) — The system team SHALL confirm the NFR-05 p95 targets via phased load tests per rollout phase.
- **NFR-14-08** (DAST) — The system team SHALL run DAST on the internet-exposed surface (channel/BFF APIs, UI) at least quarterly.
- **NFR-14-09** (Contract Tests) — The system SHALL pass consumer-driven contract tests for 100% of critical partner APIs (payment hub, AML, card processor) as a mandatory pre-prod gate.

### Usability & Accessibility (NFR-15)

- **NFR-15-01** (Browser) — The UI SHALL support the latest version of desktop Google Chrome.
- **NFR-15-02** (Localization) — The UI SHALL be available in English (baseline) and French (mandatory for francophone CEMAC/UEMOA markets), with Arabic on a client scope decision, and SHALL apply currency/date formats per region. `[CEMAC] [UEMOA]`

### FinOps & Cost (NFR-16)

- **NFR-16-01** (TCO) — The organization SHALL maintain a C-level-approved total-cost-of-ownership model covering footprint and licensing.
- **NFR-16-02** (Licensing) — The organization SHALL record the licensing model (commercial vs open-source) for 100% of components.
- **NFR-16-03** (Cost/Txn) — The system SHALL track cost-per-transaction per environment against a target set at cost sign-off.
- **NFR-16-04** (Cost Reporting) — The system SHALL report cost and capacity-utilization per environment (Dev/Staging/Prod/DR) monthly, modelling storage/log cost against volume.
- **NFR-16-05** (Scan Sizing) — The system SHALL size the external file-scan service to the phase scan volume, defaulting to a fixed-capacity deployment reviewed per phase.

### Portability (NFR-17)

- **NFR-17-01** (Deployment Targets) — The system SHALL run on-premise or in a private cloud.
- **NFR-17-02** (Boundary) — The system SHALL treat the bank-provided boundary (WAF/firewalls/edge API security, public DNS + external certificate management, external load balancers between clusters, virtualization/bare-metal/VMs) as out of scope.
