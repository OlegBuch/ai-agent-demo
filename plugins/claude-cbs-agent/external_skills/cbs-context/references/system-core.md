# CBS Core Reference

Canonical reference for the CBS (Core Banking System) platform — architecture, terminology, operational model. Loaded on demand by the `proj-context` skill (see `../SKILL.md`).

**Vocabulary:** "Table" means a *business table* (a logical service unit hosted inside a Table Group pod, §6), never a *database table* (Postgres). When ambiguous, say which explicitly.

---

## 1. The Table — the fundamental unit

A **Table** is a logical service unit running on the shared `table-template` engine — one per business entity (Customer, Account, …). It is *not* a database table.

A Table *behaves* like a separate microservice (own API surface, own storage spaces, own plugins), but it is **not deployed as one**. The actual microservice — the thing that starts up as a Kubernetes pod — is the **Table Group (§6)**. A group pod hosts several Tables; each incoming request is dispatched to the right Table by the **table id in the URL**.

Every Table (and every core service, §5) exposes the **same fixed API contract**; only its **Definition**, **Projections** (with Hooks), and **Validation rules** differ.

### 1.1 Table Definition
- The schema — which **Fields** are attached. A **JSON Schema** (`type: object`, `properties: {…}`), i.e. "XSD for JSON": it defines the structure of incoming records.
- Fields are global and reusable, managed in the Field Registry (§5.1).

### 1.2 Projection
- A view over the Definition: picks a **subset** of fields and applies per-field rules (`mandatory`, `default value`, …). Single-record level — e.g. one UI form for one customer.
- A **default Projection** (named after the Table id) always exists, exposing **all** Definition fields; custom Projections narrow or adjust it.
- All operations and plugins bind to a Projection, never the Table directly.

### 1.3 Inquiry
- List-of-records level, read-only — e.g. a table view of customers (columns = fields, rows = records, with filtering). Contrast the Projection: single-record view/edit/authorize.
- **Resolved by Table Registry**: the client passes no table id, so each Inquiry must be **registered at creation**. A **default Inquiry** exists (e.g. `Company`).
- No Hooks on Inquiries yet — milestone 2, not finalized.

### 1.4 Validation rules (validation engine)
- Attached at the Projection level; each rule is **field id → condition → error result**. Currently on `INPUT` only.

### 1.5 Plugins
- Custom business logic in Java JARs. Without plugins every Table is identical (generic CRUD); plugins are what make a Customer Table differ from an Account Table. Detail in §8.

## 2. Table Types

Three classifications govern data scoping across companies:

| Type | Meaning | Data scope |
| --- | --- | --- |
| **INT** | Installation | Shared bank-wide — Company A's write is visible to Company B. |
| **FIN** | Financial / per-company | Isolated per Master Company — A's writes invisible to B. |
| **CUS** | Flexible | INT-like or FIN-like, decided globally at system parametrization. |

### Master Company vs Branch
The INT/FIN split is at the **Master Company** level. A **Branch Company** always shares its Master's data — branches roll up into the master (data, processes, accounting balance).

## 3. Main Storage Spaces (record lifecycle)

A business Table is backed by several Postgres tables called **spaces**:

| Space | Role | Cardinality per record id |
| --- | --- | --- |
| `NAU` | Drafts (unauthorized). Status `UNAU` (awaiting auth), `HOLD` (partial draft), or `RNAU` (reversal draft). | ≤ **1** per id |
| `LIV` | Authorized / active | ≤ **1** per id |
| `HIS` | History | **many** per id (sequence++ per change) |
| `DEL` | A version-1 draft deleted before it was ever authorized — its only trace. | terminal |
| `ARC` | Archive — records purged out of `HIS`. | — |

### Lifecycle flow
1. **Create** → `NAU` (or straight to `LIV` for INT, §4).
2. **4-eyes approval** → `NAU` → `LIV`.
3. **Edit** an authorized record → working copy back in `NAU`.
4. **Authorize edit** → old `LIV` shifts to `HIS` (sequence++), new version becomes `LIV`.

`HIS` thus accumulates the full version chain — the audit trail.

## 4. Main Operations

Operations target a Projection, never the raw Table. Behaviour splits on type (§2): **FIN** passes through `NAU` and needs 4-eyes authorization; **INT** writes straight to `LIV`.

### Record Intent — starting an operation
Every operation begins with a **Record Intent** (§10.1): you pass a record id, or `NEW` to auto-generate one per policy (§10). It is the basis for **record locking** — one user holds a record at a time, no collaborative editing.

### 4.1 INPUT — create a record
- **FIN**: lands in `NAU`/`UNAU`, awaiting AUTH — nothing active until a Checker authorizes.
- **INT**: written straight to `LIV`, no authorization.

### 4.2 HOLD — save a draft
Save a partial record (status `HOLD` in `NAU`) to resume later. Rejected if an `UNAU` record already exists for the same id. (FIN and INT alike.)

### 4.3 AUTH — 4-eyes authorization
A Checker promotes a draft `NAU` → `LIV`. **FIN only** (INT has no authorization step).
- **First auth (no `LIV` yet):** the Maker's INPUT draft (v1) becomes the first `LIV`; the `NAU` record is removed.
- **Edit (a `LIV` exists):** the edit sits in `NAU` as a deep copy of `LIV` (audit fields cleared, version N+1) while `LIV` stays active. On AUTH, atomically: current `LIV` → `HIS` (keeps version N), the `NAU` edit becomes `LIV` (N+1), `NAU` cleared.

### 4.4 SEE — look up a record by id
Search spaces in order `NAU` → `LIV` → `HIS` → `ARC`; return the first match. (FIN and INT alike.)

### 4.5 REVERSE — undo an active record
- **FIN**: a reversal draft (`RNAU` in `NAU`) is made from `LIV`, which stays active. On AUTH, `LIV` → `HIS` (version++) and `LIV` is left empty; deleting the `RNAU` draft instead leaves `LIV` untouched.
- **INT**: `LIV` → `HIS` (version++) directly, no authorization.

### 4.6 DELETE — remove a draft from `NAU`
- **First-time draft** (v1, never authorized): moved to `DEL` — its only trace.
- **Draft over an authorized record** (v > 1): just removed (audit already in `LIV`/`HIS`).

(FIN and INT alike.)

### 4.7 HISTORY.RESTORE — bring back a past version
- **FIN**: the chosen `HIS` version is copied to `NAU` as a `UNAU` draft, authorized like any edit.
- **INT**: restored directly to `LIV`.

## 5. Core Services / Microservices

```
UI ──> Field Registry         (manages global Fields)
   ──> Table Registry         (manages Tables + Groups; triggers k8s)
   ──> Plugin Manager         (admin UI/API for plugins; stores JARs in S3)
   ──> Table Group pods       (table-template instances, each hosting its group's Tables)
```

### 5.1 Field Registry
- Standalone microservice (**not a Table**, own repo). Fields must exist before any Table can be defined, hence a separate service.
- Fields are **global** — one Field attaches to many Tables. Types and metadata: see the **Dynamic Data Dictionary** spec.

### 5.2 Table Registry
- Standalone microservice (**not a Table**). Creates and manages **Groups** and **Tables** and triggers their Kubernetes deployments.
- Also the runtime **request router** (§6) — resolves which Group pod hosts a Table/Projection.

### 5.3 Plugin Manager
- Admin service for **Plugins** (Java JARs of business logic, e.g. validation): upload, new version via `PUT`, list all.
- JARs live in **S3**, implemented by **Ceph** (self-hosted, S3-compatible) — also used for document management and other file storage.

### 5.4 Table Template
- The engine repo — **every Table Group pod runs an instance of it**, hosting all of that group's Tables.
- On startup it queries Table Registry by group id for the Tables it hosts, their metadata, and **policies**. The only policy type today is `IDENTIFIER_GENERATION` (§10) — whether/how a Table generates record ids.

### 5.5 System / Group API (planned)
- A **private** API (e.g. cache clearing), separate from the client-facing Table API and not exposed on the UI. Planned, not yet built.

## 6. Table Groups — the deployment unit

Tables aren't deployed individually; the **Group is the true microservice** — the Kubernetes deployment unit whose pods run `table-template`. Tables are spread *logically* inside their group: the group pod serves all of them, dispatching each request by the table id in the URL.

- Create a **Group** → a Kubernetes deployment, no pods yet (replicas stay 0 until the first Table).
- Create a **Table** (always inside an existing Group) → the group's pods (re)deploy with the new Table in their hosting list; the first Table brings the pods up.

Example — Group `System Core` holding Tables `system parametrization` and `company`.

### Why groups?
Pure optimization: ~100 one-per-Table microservices collapse to **~10–15 groups**, saving an estimated **20–30%** overhead. Scaling is **per group** — so a "hot" Table can be moved into its own group for independent scaling. Groups can't nest; Tables can move between groups. Business logic always acts on a Table, never a Group. Provisional — may be revisited.

### How a Group reaches Kubernetes — async control loop
Table Registry never touches Kubernetes synchronously. A deployment-affecting change (group create/delete; table created-with-group; table **moved** — two events, old + new) writes the entity **and** an outbox event in **one DB transaction**, then returns immediately; the deployment applies asynchronously.

- **Outbox → Kafka:** a scheduled publisher sends `PENDING` events to topic `proj.table-group.change-requests`, marking them `PUBLISHED` after broker ack (at-least-once, keyed by `groupId` to preserve per-group order).
- **Reconciler** (a consumer in the same Registry) rebuilds desired state **from the DB, not the event**: `TABLES` env var = the group's tables; replicas = the configured count, or **0 when it has no tables** (a group is a shell until its first Table). It diffs a `proj/config-checksum` annotation — unchanged → skip; changed → server-side apply Deployment + Service; deleted group → remove both.
- A **control loop**: the DB is desired state, the reconciler makes Kubernetes match. Idempotent (state comes from the DB, so redelivered events are harmless); failed events retry, then dead-letter.

### How requests reach a Table — dynamic routing
URLs carry no routing info. The UI calls a normal endpoint (`/api/v1/tables/{tableId}/…` or `/api/v1/projections/{projectionId}/…`). The **Istio / Ingress Gateway** (every UI request's entry point) terminates TLS and enforces AuthN/AuthZ, then — unable to resolve these paths statically — forwards to the **Table Registry router** (`/router` + original path). The router does no auth; that stays at the mesh boundary.

- **Resolve:** match the path against Ant patterns (in `application.yml`, not code), extract the table id (projection `CUSTOMER~DETAILS` → table `CUSTOMER`, the part before `~`), then look up its Group id in the registry DB. No match, or an unregistered/ungrouped table → `404`.
- **Forward:** build the upstream URL with the reconciler's deployment naming — `<group-deployment>.<namespace>.svc.cluster.local:<port>` — and act as a **transparent proxy** (method/headers/body passed through, hop-by-hop headers filtered, 30 s timeout; unreachable → `502`, else → `500`).

Routing is currently **proxying** (confirmed by Ilya); **direct routing** (Gateway returns the group address, client calls it) might be cheaper — open question.

**Single source of truth:** table→group placement lives once in the registry DB and drives **both** deployment and routing, so moving a Table between Groups is transparent — resolved from the DB on the next request.

## 7. Table Creation Flow (end-to-end)

**Setup order:** Field Registry + Fields → upload Plugins → create Tables (Group, then Table).

```
1. Create Fields            → Field Registry
2. Upload Plugins           → Plugin Manager (JARs must exist before a Table loads them)
3. Create Group             → Table Registry → k8s deployment (no pods)
4. Create Table in Group    → Table Registry → k8s client → group pods (re)deploy
5. Pod starts → asks Table Registry for its Group/Table metadata
6. Pod runs dynamic, Java-coded Liquibase migrations → creates the Postgres
   spaces (`NAU`, `LIV`, `HIS`, …) for that Table
```

Steps 3–4 hit Kubernetes **asynchronously** via the outbox loop (§6) — the API returns before the deployment applies. So the **physical Postgres tables are created at pod startup**, from Liquibase migrations in `table-template`.

At creation you set type (INT/FIN/CUS), `auditable`, **auto-ID rules** (§10), etc. Fields are **not** attached here — that happens via the Table Definition.

## 8. Plugins

### 8.1 The contract
- Separate repo **Plugin API** — the interface (currently one unimplemented method) plus shared context types. Both the plugin and Table Template depend on it; it's the common language for invoking plugins.

### 8.2 Plugin context (Table Template → plugin)
- `dataRecord` — the incoming record (JSON being input/updated).
- `hookResult` — `description` + `hookOutcome` (sealed: `SUCCESS`, `WARNING`, `FAILED`; `FAILED` stops execution).
- `tableClient` — sync client for a plugin in Table A to call Table B (e.g. `getTableRecords`). In `table-template`, exposed via Plugin API; evolving.

### 8.3 Hooks (where a plugin attaches)
- **Hook = Plugin + Action**, attached to a **Projection** (currently, not the Table) via the **hook management API**. A binding sets: plugin, **operation** (a §4 operation — e.g. `INPUT`, `SEE`), **phase**, and **execution order** (when several share a phase).
- Three phases around an operation: **pre** (before validation/persistence), **core** (validation + DB save), **post** (after persistence). Plugins attach to **pre** or **post** — i.e. before/after the DB write.

### 8.4 Loading mechanism
At pod startup: a listener fetches all plugin metadata from Plugin Manager → filters to those this Table needs → downloads the JARs **directly from S3 (Ceph)** → caches them → **loads them into the JVM classloader** via the *Plugin Framework for Java* library, where they become live executable code.

### 8.5 Hot reload — not yet
Plugins load **only at startup**. No mid-day reload — swapping one in business hours = deploying in business hours = risky. A dynamic mechanism is being designed.

### 8.6 Known limitation — typed record access
`dataRecord` is a generic JSON/map; there's **no compile-time typing** binding a plugin to a Table's schema. Today's workaround: define a POJO for the known schema and deserialize via Jackson — but you must already know the schema, with no end-to-end check that the Table matches. Generated typed access is wanted, not yet prioritized.

## 9. Inter-Table Communication

Tables talk like normal microservices, two ways:

- **Synchronous** — `tableClient` (the Plugin API client), used in plugin logic to read another Table's records.
- **Asynchronous** — **Kafka**: Tables **publish** to topics (e.g. *account created*) and **subscribe** to others; file storage also emits events on upload. The event API is **being reworked**. (Detail: prior meeting recording in Meeting Records.)

## 10. Auto ID Generation

Mints a unique record id so callers needn't invent one. Implements the **Auto ID Engine** from the analysis spec. Two phases:

1. **Configure** (once, at Table creation) — declare an `IDENTIFIER_GENERATION` **policy** on the Table in **Table Registry**. Loaded and **cached in the pod** at startup (§5.4).
2. **Generate** (per create) — on a create-intent, if the caller wants a generated id, the next one comes from the cached policy — **no Registry call at generation time**.

### 10.1 Triggering generation — the `recordId`
The `recordId` passed to the create-intent endpoint decides the id:

```
POST /api/v1/tables/{tableId}/records/{recordId}/operations/{operation}/intent
```

| `recordId` | Behaviour |
| --- | --- |
| literal `NEW` | Id generated from the Table's policy, using the rule for the caller's company. |
| a chosen id | Used as-is — **unless** generation is enforced (`isEnforced`), in which case a custom id is rejected. |

### 10.2 What an ID rule contains
Each rule: which company it covers, and how to build the id.

| Setting | Meaning |
| --- | --- |
| `prefix` | Text in front of the id, e.g. `{TABLE}-{YYYYMMDD}`. |
| `maxLength` | Total id length (prefix + generated part). |
| `isEnforced` | If `true`, only the generated id is allowed — callers can't supply their own. |
| `strategy` | `SEQUENTIAL` — next number from a locked counter, zero-padded to length (safe, lower throughput). `HIGH_TPS_UNIQUE` — random collision-resistant string over an allowed alphabet, lock-free for high throughput. |

### 10.3 Which company a rule covers
Follows the Table's classification (§2):

| Classification | Rules |
| --- | --- |
| `INT` | One rule, shared by all companies (target `"values": ["*"]`). |
| `FIN` | One rule per company — each gets its own id sequence. |
| `CUS` | Follows the `SHARE_CUS_DATA` parameter: shared (like INT) or per-company (like FIN). |

### 10.4 Example — enforced, per-company sequential ids
```json
"policies": [
  {
    "type": "IDENTIFIER_GENERATION",
    "config": {
      "rules": [
        {
          "condition": { "key": "companyId", "operator": "EQ", "values": ["COMPANY_A"] },
          "result": {
            "isEnforced": true,
            "prefix": "{TABLE}-",
            "maxLength": 16,
            "strategy": { "type": "SEQUENTIAL", "config": { "startValue": 1000 } }
          }
        }
      ]
    }
  }
]
```

## Q&A — clarifications worth keeping

- **Field Registry is separate** because of bootstrap order: Fields must exist before Tables can be defined.
- **Bruno seeding** — Svyat's seeding requests build a Group + Tables + Definitions + Projections + Hooks + Validation rules in one recursive **Run**, making manual setup repeatable. But requests may be **stale** (APIs changed recently); prefer a stabilized environment unless running purely locally.
