# docs/frame-specs/

This folder is the **technical source of truth** for this repository's stack: language, framework,
build tool, architecture style, API/interface conventions, testing conventions, infrastructure
target. Every role reads from here instead of assuming a stack — nothing in `${CLAUDE_PLUGIN_ROOT}/commands/`
should hardcode "this project uses Java" or "this project runs on AWS Lambda." If a command needs
to know that, it belongs here.

This repository (`proj-test-automation`) is a **Playwright + TypeScript** test-automation framework
covering API and UI suites for the **PKF-CBS core banking platform**. The files below
were populated by direct analysis of the actual code — treat them as current, not aspirational, and
update them if the code moves on without them.

| File | Covers |
|---|---|
| [`tech-stack.md`](./tech-stack.md) | Language/runtime, test runner, HTTP/DB clients, lint/format tooling, what this repo deliberately does *not* use |
| [`architecture.md`](./architecture.md) | Folder layout, the `BaseApiClient` → module-client → spec layering, fixtures, global setup/teardown (K8s table-group provisioning), direct-DB verification pattern, UI layer state, API service map |
| [`api-conventions.md`](./api-conventions.md) | Base URLs, auth headers, request/response shapes, status codes, where the real API contract actually lives (the `bruno` plugin's `proj-bruno-api` collection — **not** a local `docs/api-bruno-spec/` folder, which does not exist in this repo) |
| [`coding-standards.md`](./coding-standards.md) | ESLint/Prettier/Husky enforcement, TypeScript strictness rules and what they mean in practice, type-safety patterns |
| [`testing-standards.md`](./testing-standards.md) | Tag taxonomy, **per-module automation maturity** (`cob` is still stub-only — read this before assuming a module is implemented), fixture/spec structure pattern, test data sources, known gaps |
| [`infrastructure.md`](./infrastructure.md) | Target environments (CI and Azure tools-VM runs), Keycloak, Postgres, Allure, Kafka, GitLab CI/CD pipeline structure |
| [`build-and-run.md`](./build-and-run.md) | Setup, run commands, maintenance scripts, troubleshooting |
| [`api-architecture-debt.md`](./api-architecture-debt.md) | Known cross-cutting architecture debt in `api/` (God files, layering inversions, duplicated Table Template routing, etc.) confirmed by a full-repo audit — read before starting a new module or a large refactor in an area this file flags |
| [`parallelization-readiness.md`](./parallelization-readiness.md) | The single definition of the worker/parallelism state (current values table at the top) plus the audit history of what blocked 2-4 workers (`fullyParallel`, shared `DYNAMIC_GROUP_ID`, hardcoded reference identities, singleton-record races) — read before touching worker count in `playwright.config.ts` |

For folder/file/entity naming conventions specifically, the root `README.md`'s "Conventions"
section remains the canonical, most detail-dense reference — the files above point to it rather
than duplicating it.

## What does NOT belong here

- Business domain, requirements, business rules — that's `docs/project-spec/`.
- One-off implementation notes for a single ticket — those belong in that ticket or in
  `docs/test-cases/`, not here.

## A note on the real API contract

Some other docs in this repo (`docs/INDEX.md`'s history, `${CLAUDE_PLUGIN_ROOT}/commands/team/context-resolution.md`)
reference `docs/api-bruno-spec/` as if it were a checked-in Bruno collection. **It does not exist on
disk inside this repo.** The real, authoritative API contract is the `proj-bruno-api` Bruno
(OpenCollection YAML) workspace, a **separate git repository** cloned as a sibling checkout — see
`api-conventions.md`'s "Real API contract source of truth" section for the remote URL and what it
covers (a wider service surface than this repo currently automates). Don't go looking for a local folder that isn't there.
