---
name: nfr
description: CBS Non-Functional Requirements Register — the binding quality requirements (NFR-01-01 … NFR-17-02) for the CBS platform plus the classification model that interprets them (critical flows CF-1..CF-10, criticality Tiers 0/1/2, data classes Public/Internal/Confidential/Restricted, service windows) and the 5 Architecture Significant Requirements (ASR-1..5: Security, Availability, Scalability, Observability, Configurability) that give the rationale behind them. Activates on "NFR", "ASR", "architecture significant requirement(s)", "non-functional requirement(s)", a concrete NFR ID (NFR-xx-yy), a Tier-N / CF-N / data-class reference, or CBS quality-attribute questions — availability or RTO/RPO targets, p95 latency budgets, retention periods, key rotation/encryption mandates, audit-trail immutability, SLO/error budgets, capacity volumetrics (RPS/DAU/storage), reconciliation/exactly-once/event-ordering guarantees, zero-code-change configurability, payment-rail interoperability (ISO 20022/SWIFT), deployment/rollback constraints, test-coverage gates, cost/FinOps targets, regulatory compliance drivers (BoSS, COBAC, BCEAO/UEMOA, CBL). Also user-invocable as `/claude-proj-agent:nfr`.
user-invocable: true
---

# CBS — Non-Functional Requirements (NFR) Register

Provides the CBS system's NFR Register — 116 binding SHALL-requirements across 16 quality attributes — together with the classification model needed to interpret them. Full content lives in `references/nfr-register.md`, kept separate so this entrypoint stays cheap to auto-load.

## When to load

Load whenever a design, review, estimate, or spec touches a quality attribute of CBS: **availability/uptime**, **RTO/RPO/DR**, **latency/p95 budgets**, **capacity/volumetrics** (RPS, DAU, storage growth), **security controls** (authn/authz, MFA, key rotation, secrets, pentest cadence), **retention/purge**, **audit trail/immutability**, **SLO/error budget/alerting**, **reconciliation/exactly-once/event ordering**, **zero-code-change configurability**, **payment-rail/protocol interoperability**, **deployment/rollback**, **test coverage gates**, **localization**, **cost/FinOps** — or on any explicit mention of **NFR**, an **NFR ID**, **Tier-0/1/2**, **CF-1..CF-10**, or the data classes **Public/Internal/Confidential/Restricted**.

Skip for: quality-attribute talk about systems other than CBS, and for CBS functional behavior with no quality/compliance angle (the sibling `proj-context` skill covers platform mechanics: Tables, Projections, hooks, 4-eyes lifecycle).

Load once per session, then stay loaded — don't reload on follow-ups.

## How to use

On first activation, `Read` **`references/nfr-register.md`** in full. It has three parts:

- **§0 Architecture Significant Requirements (ASR)** — the 5 rationale-level quality attributes (Security, Availability, Scalability, Observability, Configurability) with business justification. Use this when a question is "why does CBS require this" rather than "what does CBS require."
- **§1 Interpretation model** — critical flows CF-1..CF-10 (with tier, ownership/SLA boundary, availability, RTO/RPO), the Tier 0/1/2 summary, the four data classes, and service windows. Resolve every Tier-N / CF-N / data-class term against this section.
- **§2 The register** — all requirements verbatim, grouped by quality attribute and area, each with its regulatory/compliance drivers.

When applying the register:

- **Cite requirements by ID** (e.g. NFR-05-04) so statements are traceable to the register.
- **Treat SHALL text and numbers as binding acceptance thresholds**, not guidance — flag designs that violate them rather than silently accommodating.
- **Respect the SLA boundary**: for split-ownership flows (CF-1, CF-4, CF-6, CF-8, CF-9) CBS targets apply only to the CBS-owned segment (NFR-02-06).
- **Mind the ID gaps**: there is no NFR-07 attribute and NFR-04-11/04-12 are unassigned — these are gaps in the source register, not missing data.

## Quality-attribute map

| ID range | Attribute | Covers |
| --- | --- | --- |
| NFR-01 | Security | authn/session, authorization, crypto & secrets, pentest, uploads, privacy, data-class logging |
| NFR-02 | Availability | per-tier availability targets, maintenance windows, degradation, regulatory connectivity, SLA boundary |
| NFR-03 | Reliability | RTO/RPO, DR drills, fault isolation, backups, idempotency, retention, data-loss handling |
| NFR-04 | Scalability | rollout-phase capacity, volumetrics (users/RPS/reads/writes/storage/events/logs), overload behaviour |
| NFR-05 | Performance | p95 budgets: search, history, authorization, posting, screening, identity, reporting |
| NFR-06 | Observability | structured logs, correlation IDs, SLO dashboards, error budgets, alert routing, audit evidence, reporting freshness, incident tracking |
| NFR-08 | Data Integrity | balanced GL, record locking, doc gating, audit trail, reconciliation, exactly-once, event ordering/durability/isolation, report reproducibility |
| NFR-09 | Durability | per-data-class durability nines, bit-rot verification, loss reporting |
| NFR-10 | Configurability & Extensibility | zero-code-change config: products, forms, endpoints, AML/KYC and regulatory rule sets, multi-tenancy |
| NFR-11 | Interoperability | REST/ISO 20022/SWIFT MT/SOAP, integration versioning, file exchange, payment rails |
| NFR-12 | Deployability | progressive delivery, schema compatibility, migration waves |
| NFR-13 | Maintainability | required documentation set (architecture, API, manuals, security, DR, ops) |
| NFR-14 | Testability | coverage targets, SAST/SCA/DAST, merge gates, load/soak/contract tests |
| NFR-15 | Usability & Accessibility | browser support, EN/FR localization |
| NFR-16 | FinOps & Cost | TCO, licensing, cost-per-transaction, cost reporting |
| NFR-17 | Portability | on-prem/private cloud, bank-provided boundary out of scope |

## Source & sync

Mirrors Confluence pages [Architecture Significant Requirements (ASR)](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1454637075/Architecture+Significant+Requirements+ASR), [NFR Definitions and Classification](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1454931991/NFR+Definitions+and+Classification), and [Non-Functional Requirements Register](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1454571540/Non-Functional+Requirements+Register) — all children of [NFR Documentation](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1116962846/Non-Functional+Requirements+NFR+Documentation) (TB space, bank-proj.atlassian.net; all v1.0, synced 2026-07-14). If those pages change, re-sync `references/nfr-register.md` from them via the Atlassian MCP (`atlassian-bank` connection).
