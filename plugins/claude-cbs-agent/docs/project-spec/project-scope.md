# Project Scope

## What this repository's testing effort targets

`proj-test-automation` automates quality gates for **PKF-CBS**, a Core Banking System platform, on
behalf of the client PKF (see `package.json`'s `"author": "PKF"` and the `bank-proj.atlassian.net`
Jira instance referenced in `docs/test-cases/`). This repo does not implement CBS itself — it is a
black-box/gray-box test suite that drives CBS's real HTTP APIs (and, sparingly, a real UI) plus its
underlying Postgres database to verify platform behavior end-to-end against live QA/STAGE
deployments.

For the generic CBS platform architecture and terminology (Tables, Projections, the four core
services, NAU/LIV/HIS record states, 4-eyes approval, multi-marker fields, Plugin API, etc.), defer
to the `proj-context` Claude Code plugin — it teaches that model once, project-independently. This
folder (`docs/project-spec/`) records what is **specific to this test-automation engagement**:
which modules are covered, what business rules the test suite actually asserts on, and what actor
model the RBAC tests exercise — grounded in the actual code in this repo, not a restatement of the
generic platform.

## Goals of the test suite

- Gate GitLab merge requests and `main` pushes with smoke/regression/integration API suites per
  CBS module (see `docs/frame-specs/infrastructure.md` for the CI job structure; MR pipelines run
  only lint/format/typecheck by default, a full run is a manual "Run pipeline" with `TEST_TYPE`).
- Provide a growing regression net as new CBS features (Product Factory, Security Management,
  Customization/local fields, etc.) are delivered, keyed to Jira tickets (`TB-*`) and their Allure
  TestOps test cases (see `rules/allure.md` and the QA pipeline order in `docs/INDEX.md`).
- Verify not just HTTP-visible behavior but the underlying data-lifecycle guarantees the platform
  promises (draft → authorized → historical record states, multi-company isolation, origin-based
  governance) by asserting directly against the database — see `business-rules.md`.

## Current coverage boundary (re-verified 2026-10-07 against the working tree of `proj-test-automation`, branch `group-3/TB-4295`)

Real, substantial coverage exists for: **System Core** (Table Registry, Dynamic Data Dictionary,
User Group, User Profile, Validation Engine, System Parametrization, Audit Fields, Currency
engine, Plugin Manager client), **Product Factory** (PF.CLASS/TYPE/PRODUCT/BUILDER/MANAGER/CATALOG),
**Field Registry** (field-definition), **Account**, **Customer**, **Financial Accounting**,
**Transfer**, **Document Management**, **Interest and Charges** (Charge and Interest calculation
engines), **Action Processing**, **Consolidation Engine**, **Soft Accounting**, **Teller**, **Limit
Hierarchy / Group Limits** (`api/limit/`, EP-09.01, smoke only) and cross-module **integration**
scenarios spanning those.

Still a stub: **COB** (Close of Business) — empty client class, 0-byte paths file, no specs.
**Security Management**'s own `SMApiClient` is still an empty stub (SM entities like
`SM.USER~INTERNAL`/`SM.USER.GROUP~MAIN` are exercised indirectly through System Core's user/group
clients), but the module has real, non-placeholder test surfaces of its own — see below. **UI**
automation is real, organized by module (`ui/system_core`, `ui/security_management`,
`ui/document_management`, 28 specs; see `docs/frame-specs/architecture.md`'s "UI layer"). See
`docs/frame-specs/testing-standards.md`'s maturity table before starting new work in any module —
don't assume a module's client/paths/types pattern already exists just because its folder does.

**Shipped**: **Override and Dispo Processing** (module 02.05, Jira `TB-22`/`TB-2083`, component
Security Management, MR !138) — tests live under
`api/security_management/tests/override-dispo-smoke.spec.ts` plus
`api/security_management/helpers/override-dispo-helper.ts`. All of `US-02.05.01`–`.07` (Errors &
Overrides Configuration, Hard-Block Processing, Standard Override Processing, Record Authorisation,
Disposition Officer Configuration, Disposition Processing, Disposition Approval) have live-verified
test coverage now — 53 cases (`TC-01`–`TC-53`), with one deliberate numbering gap at `TC-47` (see
`docs/frame-specs/testing-standards.md`). The suite is tested through `system_core`'s
`TableRegistryApiClient`/`FieldDefinitionApiClient`, not through `security_management`'s own
`SMApiClient` — same established pattern used elsewhere in this module.

The `proj-bruno-api` contract documents a wider surface than any one module covers. See
`domain-model.md`'s "Services in the Bruno contract and their automation status" before assuming a
service isn't covered because it isn't discussed elsewhere in this repo.

## Out of scope for this repository

- Implementing or modifying CBS backend/frontend source (this repo only tests it).
- Performance/load testing (no k6/Gatling/JMeter tooling present).
- Anything the current `docs/frame-specs/` and `docs/project-spec/` don't cover and the current
  Jira ticket/Confluence pages don't answer either — per this framework's operating model (see `proj-ai-agentic`'s `CLAUDE.md`),
  that's an open question to surface, not a default to guess.
