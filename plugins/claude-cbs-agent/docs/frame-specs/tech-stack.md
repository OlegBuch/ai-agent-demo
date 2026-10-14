# Tech Stack

Observed directly from `package.json`, `tsconfig.json`, `playwright.config.ts`, `eslint.config.mjs`
as re-verified 2026-10-07 on the working-tree branch `group-3/TB-4295`. This is the actual current stack of **this** repository (`proj-test-automation`) —
not a generic recommendation.

| Layer | Choice | Version (package.json) | Notes |
|---|---|---|---|
| Language | TypeScript | `^6.0` | `strict: true`, `target: ES2022`, `module`/`moduleResolution: NodeNext` (see `tsconfig.json`) |
| Runtime | Node.js | — (no `engines` pinned in `package.json`) | CI image is `<internal-registry>/.../proj-ci-scripts/playwright-tools:v1.62.1-jammy` (`.gitlab-ci.yml`'s `.default_job`) |
| Test runner / automation | Playwright Test | `^1.62.1` | Drives both API (`APIRequestContext`) and UI (`page`) tests from one runner/config |
| HTTP client (API tests) | Playwright's `APIRequestContext` | — | No axios/fetch/supertest — all API calls go through Playwright's own request context, wrapped by `BaseApiClient` |
| DB access (verification + fixtures) | `pg` (node-postgres) | `^8.21` | Tests connect **directly to the CBS Postgres database** to assert on `LIV`/`NAU`/`HIS` schema rows and to clean up test-owned schemas — this is not a mocked DB, see `docs/project-spec/business-rules.md` |
| Auth | Keycloak (OAuth2 Resource Owner Password Credentials) | — | No auth SDK; a hand-rolled `fetch`-via-`APIRequestContext` call to `{keycloakBaseUrl}/realms/{realm}/protocol/openid-connect/token` (`api/utils/services/auth-service.ts`) |
| Messaging (Kafka tests) | `kafkajs` | — | Wrapped by the `kafkaService` fixture (`api/utils/services/kafka-service.ts`) — no test instantiates a `kafkajs` client directly, see `architecture.md`'s "Kafka layer" |
| Env config | `dotenv` | `^17` | Loaded in `playwright.config.ts`, `global-setup.ts`, `global-teardown.ts` (both under `api/utils/fixtures/`) — `.env` is never committed, `.env.example` documents every variable |
| Linting | ESLint + `typescript-eslint` + `eslint-plugin-playwright` | `^10.1` / `^8.59` / `^2.10` | Flat config (`eslint.config.mjs`); type-aware rules enabled (`parserOptions.project: true`) |
| Formatting | Prettier | `^3.9.6` | `eslint-config-prettier` disables ESLint's own stylistic rules so Prettier is the single source of formatting truth |
| Git hooks | Husky | `^9.0.0` | Pre-commit: `prettier --check`, `lint:ci`, `typecheck`, plus `allure:verify-ids` when a staged file is a spec; see `.husky/pre-commit`, `.husky/pre-push` |
| Reporting | Playwright HTML reporter + `allure-playwright` | `^3.10.2` | `allure-exchange-reporter.ts` (`api/utils/helpers/`) attaches masked API request/response exchanges to Allure results; `allure-commandline` (`^2.43.0`) generates the local `allure-report/` — see `docs/frame-specs/infrastructure.md`. Report Portal integration has been removed from this repo — do not reintroduce it from an older doc's description |
| Runtime schema validation | `zod` | `^4.3.6` | **Declared as a dependency but not imported at runtime anywhere in the codebase as of this writing** (confirmed via full-repo search; the only reference is a type-only `import type { z } from 'zod'` in `api/utils/services/kafka-service.ts`). Do not assume response payloads are runtime-validated with zod schemas today — typing is done with plain TypeScript `interface`/`type` declarations in `api/types/*.types.ts` and asserted with `as <Type>` casts. If you introduce zod validation, this is new work, not a pattern to follow from existing code |
| CI/CD | GitLab CI | — | `.gitlab-ci.yml` — see `docs/frame-specs/infrastructure.md` |

## What this is NOT

- Not a Jest/Mocha/Vitest project — Playwright Test is the only test runner, for both API and UI.
- Not using Supertest/axios/node-fetch for HTTP — always `APIRequestContext` (native to Playwright),
  wrapped by `BaseApiClient` (`api/utils/services/base-api-client.ts`).
- Not using an ORM (Prisma/TypeORM/Knex) — raw parameterized SQL via `pg.Client.query(...)`.
- No frontend framework in this repo — `ui/` drives a browser via Playwright's `page` fixture
  against whatever CBS UI/website is configured; it does not host or build a frontend app itself.

## Module system

`package.json` declares `"type": "commonjs"` while `tsconfig.json` targets `NodeNext` module
resolution — TypeScript is compiled/executed as CommonJS via `ts-node` (see the `db:cleanup`,
`group:cleanup` npm scripts) and Playwright's own TS transform for test files. Use `import`/`export`
syntax in source; do not write `require()` in new code.
