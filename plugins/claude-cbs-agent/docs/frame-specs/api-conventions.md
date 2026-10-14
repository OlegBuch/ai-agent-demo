# API Conventions

## Base URLs and services

`BASE_URL` (env var) is the root of the CBS backend. Individual services are reached by relative
paths appended to it (see `docs/frame-specs/architecture.md`'s service map):

- `{BASE_URL}/table-registry/api/v1/...` — Table Registry
- `{BASE_URL}/tables/api/v1/...` — Table Template (projections/records/definitions)
- `{BASE_URL}/field-registry/api/v1/...` — Field Registry

`createAuthenticatedApiContext` (`api/utils/services/auth-service.ts`) appends a trailing slash to whatever
base URL it's given and Playwright resolves relative request paths against it — so path constants
must **never** start with a leading `/` when used against a module base URL built this way (see the
System Core vs. Product Factory distinction in the root `README.md`'s "API client pattern" section:
System Core paths are relative-no-leading-slash; `PFApiClient.tablesUrl` builds an absolute URL from
`process.env.BASE_URL + GLOBAL_API_PATHS.TABLES` instead).

## Authentication

Keycloak, OAuth2 **Resource Owner Password Credentials** grant (`grant_type: password`) — not
authorization code, not client credentials. See `docs/frame-specs/infrastructure.md` for the
Keycloak env vars. Two authenticated-context flavors exist:

- `createAuthenticatedApiContext` — uses the shared service-account credentials
  (`KEYCLOAK_USERNAME`/`KEYCLOAK_PASSWORD`); this is what most fixtures use.
- `createUserAuthenticatedApiContext` — authenticates as a **specific named user** (e.g.
  `INTERNAL_USER_USERNAME`/`PASSWORD`, `EXTERNAL_USER_USERNAME`/`PASSWORD`), used specifically to
  test permission/RBAC boundaries between two different actors (see
  `docs/project-spec/access-control.md`).

Localhost bypass: if the target base URL contains `localhost`/`127.0.0.1`, token fetching is
skipped entirely (`[Auth Bypass]` log line) — this is for local backend development against an
unsecured local instance, not a production path.

A `401` from any CBS endpoint triggers a per-identity token refresh (`api/utils/services/token-service.ts`)
— each authenticated context re-authenticates as whichever user it was originally logged in as, so
several identities used in one test (e.g. a MAKER/CHECKER pair) refresh independently without
affecting each other. Contexts with no real login (unauthenticated/invalid-token probes) are never
refreshed, so a deliberate `401` negative test still gets its `401`. See
`docs/frame-specs/architecture.md`'s "Token lifecycle and 401 handling" for the full mechanism.

## Standard headers

Set by `createAuthenticatedApiContext`/`createUserAuthenticatedApiContext` on every request context:

| Header | Value | Purpose |
|---|---|---|
| `Authorization` | `Bearer <keycloak-access-token>` | Omitted only on the localhost bypass |
| `Accept` / `Content-Type` | `application/json` | |
| `X-Company-Code` | `COMPANY_CODE` env var (default `MOCK` in CI) | Multi-tenant company scoping — see `docs/project-spec/business-rules.md`. Individual tests override this per-request via `customHeaders` to act as a different company (`MOCK_1`, etc.) |
| `proj-user-context` | `CBS_USER_CONTEXT_HEADER` env var (optional) | Forwards an explicit user-context identity; omitted entirely if unset, never sent empty |
| `X-Correlation-ID` | `randomUUID()`, one per test | Cross-service log correlation (`proj-correlation-id-starter` on the backend, added ~2026-09). One id per Playwright test, propagated two ways: (1) explicitly — `api/utils/fixtures/api-fixtures.ts`'s `testCorrelationId` fixture (now `auto: true`, so it runs for **every** test whether or not the test references it) passes it straight into `authenticatedApiContext` (HTTP) and the browser `context` fixture (UI); (2) ambiently — the same fixture also calls `setCurrentCorrelationId(id)` (`api/utils/helpers/correlation-context.ts`), a per-worker module-level "current test id" that `createAuthenticatedApiContext`/`createUserAuthenticatedApiContext` (`auth-service.ts`) and `KafkaService`'s constructor (`kafka-service.ts`) all fall back to whenever no explicit `correlationId` is passed — so any of the dozens of call sites that create a context or a producer directly (a helper, a second/third actor in a MAKER/CHECKER or RBAC test, a custom fixture) still gets the header without having to thread `testCorrelationId` through every function signature by hand. `KafkaService.send()` still defaults the `correlationId` (camelCase) message header the same way when the caller doesn't set one. Also attached to the Allure result as a top-level `allure.parameter('X-Correlation-ID', ...)`, visible on the test overview without opening any step — include it when filing a bug against a failing test. A test that needs to control the value itself (e.g. proving `X-Correlation-ID` is independent of `X-Idempotency-Key`, `idempotency-regression.spec.ts`) still can: an explicit value passed via `customHeaders`/`extraHTTPHeaders`/a Kafka message's own `headers.correlationId` always wins over both the explicit and the ambient default, at every layer (`hasHeader`/`withCorrelationId` in `api/utils/helpers/header-helper.ts`). **Note:** the Kafka message header key is `correlationId` (camelCase, no `X-` prefix) — this is this repo's own pre-existing test-side "mail yourself a letter" convention (`byCorrelationId`/`byHeader` in `kafka-service.ts`), separate from how the backend logs it. **Confirmed 2026-09-24** (via backend/platform team): `proj-correlation-id-starter` logs the inbound `X-Correlation-ID` under OpenSearch field `app.correlationId`, index pattern `proj-<env>` — but as of that date only `proj-dev`/`proj-uat` actually had recent data; `proj-stg` (and reportedly other envs) appeared empty, an open platform-side gap, not a client/test issue — see `docs/common-issues/infra-and-environment/opensearch-correlation-id-index-not-populated-non-dev.md`. A handful of raw `apiRequest.newContext()`/`playwright.request.newContext()` call sites that bypass both helper functions entirely (deliberately unauthenticated/invalid-token negative tests, e.g. `ice-regression.spec.ts`'s TC-2175/2176, `currency-regression.spec.ts`'s admin-scope-403 case, `user-group-helper.ts`'s `createUnauthenticatedContext`) were patched individually to wrap their `extraHTTPHeaders` in `withCorrelationId(...)` since the ambient ally only helps code that goes through `auth-service.ts`/`kafka-service.ts`. |

**Resolved on review (2026-09-24):**
- Confirmed live via Playwright's own compiled source (`node_modules/playwright-core/lib/coreBundle.js`, `APIRequestContext._defaultOptions()`): it reads `this._context._options.extraHTTPHeaders` directly, so `context.setExtraHTTPHeaders()` (used by the UI-side `context` fixture) *does* reach `context.request`/`page.request()` calls, not just real page navigation/fetches.
- `createUserAuthenticatedApiContext` not receiving a correlation id when called directly (bypassing the `authenticatedApiContext` fixture) is now fixed by the ambient-default design above rather than by threading `correlationId` through every one of the ~50 call sites a full-repo scan found (`access-administration-helper.ts`, `ap-fixtures.ts`, `cce-fixtures.ts`, every `create*ApiContextWithRetry` caller, etc.) — the fallback in `auth-service.ts` covers all of them without editing any of them.
- The triplicated "is there already an explicit correlation-id header" check is now the single `hasHeader()` helper in `api/utils/helpers/header-helper.ts`, used by both `auth-service.ts` functions and the `context` fixture.
- `new KafkaService()` constructed without `defaultCorrelationId` (found at `consolidation-engine-regression.spec.ts:5169`) is likewise covered automatically now that the constructor falls back to the ambient value.

**Accepted, not a bug:** `transfer-execution-helper.ts`/`payment-order-helper.ts` produce Kafka event
messages with their own business `correlation_id` header (snake_case,
`TRANSFER_CONSTS.EVENT.HEADER.CORRELATION_ID`, a fresh `randomUUID()` per event) that now coexists
with the test-tracing `correlationId` (camelCase) `kafkaService.send()` defaults in — different key,
no collision, just two similarly-named headers on the same message if someone reads a raw Kafka
message dump.

**Second full-repo audit (2026-09-24, later same day) — every module's fixtures-derivation chain:**
The ambient design only works for a test file whose `test` ultimately traces back to
`api-fixtures.ts` (directly, or via a chain of `base.extend()` calls that itself started there) —
if a spec file imports `test`/`expect` straight from `@playwright/test` instead, `testCorrelationId`
never runs for it and the whole file silently gets no correlation id at all, framework-wide. Audited
every fixtures file and a representative sample of specs in both `api/` and `ui/`:
- All 6 `api/` fixtures files (`ap-fixtures.ts`, `ice-fixtures.ts`, `ice-regression-fixtures.ts`,
  `cce-fixtures.ts`, `validation-engine-fixtures.ts`, plus `api-fixtures.ts` itself) and all 5 `ui/`
  fixtures files (`base-ui-test.ts` → `auth-ui-test.ts` → `field-registry-ui-test.ts` /
  `override-dispo-ui-test.ts` / `table-registry-ui-test.ts`) correctly chain back to
  `api-fixtures.ts`.
- **Found and fixed:** `ui/customization/tests/customization-smoke.spec.ts` and
  `customization-regression.spec.ts` imported `test`/`expect` directly from `@playwright/test`,
  bypassing the entire fixtures chain — every test in both files ran with zero `X-Correlation-ID`
  anywhere (HTTP or UI). Repointed both to `ui/base/fixtures/base-ui-test.ts`; `type APIRequest` stays
  imported from `@playwright/test` directly (type-only, doesn't affect fixture wiring). No other
  spec file in the repo does this.
- **Reviewed, deliberately not patched:** 9 raw `playwrightRequest.newContext()`/`apiRequest.newContext()`
  calls in `document_management` helpers (`dm-helper.ts`, `dm-image-helper.ts`,
  `dm-image-regression-helper.ts`, `dm-regression-helper.ts`) and `system_core/helpers/enquiry-helper.ts`'s
  `downloadReport`. These all send/fetch directly against a `PRE_SIGNED_POST`/`REPORT_REF` URL — a
  presigned object-storage (S3-style) URL the CBS backend itself generated, not a `proj-*` service —
  so they intentionally send no standard headers at all (not even `Authorization`). Adding
  `X-Correlation-ID` here would log nowhere useful and risks interfering with a strict presigned-URL
  contract for zero tracing benefit; left as-is on purpose, not an oversight.
- No UI Page Object or helper creates a second/independent `browser.newContext()` or `page` for a
  multi-actor/multi-tab flow — the only browser-context creation point is the `context` fixture
  itself, so there is no UI-side equivalent of the API-side MAKER/CHECKER gap.

## Request/response shape

- **Record operations** (Table Template): `POST {base}/tables/api/v1/projections/{projectionId}/records/operations/{OPERATION}`,
  body `{ recordId, data: { FIELD: value, ... } }`. `OPERATION` is one of `INPUT`, `SEE`, `AUTH`,
  `HOLD`, `REVERSE`, `HISTORY_RESTORE`, `DELETE` (`TEST_CONSTS.OPERATION` in
  `api/utils/constants/constants-keeper.ts` is the canonical list observed in tests).
- **`SEE` response**: `{ recordId, data: { FIELD: value, ... }, ... }` — field values are read from
  `response.data[FIELD_NAME]`.
- **`INPUT`/validation failure response** (422): includes `errorIds`/`overrideIds` arrays
  referencing the triggering rule's `id` — see `docs/project-spec/business-rules.md`'s rule-engine
  section.
- **Error responses**: shape is inconsistent across services — tests defensively read
  `errorBody.detail ?? errorBody.message ?? errorBody.error ?? errorBody.title`
  (`api/types/table-registry.types.ts`'s `ErrorResponse`). Don't assume one canonical error field
  when writing a new assertion; check the observed field defensively the same way.
- **Status codes observed in use**: `200` (read/see, most auth'd mutations against Table Template),
  `201` (resource creation — groups, tables, fields, rules), `400` (validation failure /
  transient-during-provisioning — see retry logic in `architecture.md`), `401` (unauthenticated),
  `403` (forbidden — RBAC denial, or a structurally disallowed operation like `INPUT` on a `SYS`
  table), `404` (not found / cross-company access to an isolated `FIN` record), `422` (business-rule
  engine `ERROR`/`OVERRIDE` result).

## Real API contract source of truth

**This repository does not check in a local Bruno collection** — `docs/api-bruno-spec/`,
referenced by some older docs in this repo, does not exist on disk inside `proj-test-automation`.
The real, authoritative API contract lives in a **separate git repository**, `proj-bruno-api`
(Bruno / OpenCollection YAML format), cloned as a sibling checkout on the machine doing the work
— confirmed present at `C:\Users\user\BrunoApi\proj-bruno-api` on this machine, remote
`git@10.0.102.50:bankokam-research-center/tefo-bank/tefo-proj/tefo-proj/proj-bruno-api.git` (self-hosted
GitLab). The exact local path is per-machine, not a repo convention — if you don't have it cloned,
ask rather than assuming a path or inventing a contract from a case's prose description.

- **Workspace** (`workspace.yml`) lists 7 collections: **Field Registry**, **Plugin Manager**,
  **Table Registry**, **Table Template**, **Tables**, **Charge Engine**, **Interest Engine** — a
  materially larger service surface than what `proj-test-automation` currently automates. See
  `docs/project-spec/domain-model.md`'s "Services in the Bruno contract not yet automated" for the
  gap.
- Each collection is a tree of `.yml` request files (`info`/`http`/`docs`/`examples` blocks) plus
  `folder.yml`/`opencollection.yml` metadata — the installed `bruno` Claude Code
  plugin/skill knows this format; read the request files directly (or via the plugin) for the
  real method/URL/headers/body/example-response of any endpoint before implementing or reviewing
  a test against it, rather than guessing.
- **Environments** (`environments/{local,dev,qa,stg,uat}.yml`) hold real per-target service base
  URLs **and real secrets** (e.g. a Keycloak client secret is present in `qa.yml`) — never copy a
  value out of an environment file into a doc, commit, test fixture, or chat message; reference
  the variable name only (e.g. `keycloak-client-secret`), never its value.

## `authOperationRequired` — check before assuming a `AUTH` call is needed (or copying one)

Not every projection has a NAU (unauthorized-draft) stage. A projection's Bruno "Create X
projection" example carries `"authOperationRequired": true|false` — `true` means `INPUT` only
stages a NAU draft and a separate `AUTH` call by a **different** user (4-eyes) is required to
commit it to LIV; `false` means `INPUT` alone commits straight to LIV, and calling `AUTH` on such a
record returns a structurally invalid `404 "NAU record not found"`.

**Before writing or copying an `INPUT`-then-`AUTH` sequence for a table/projection your test
doesn't already exercise via a passing, status-asserted case, grep `proj-bruno-api` for that exact
projection's `authOperationRequired` value first** — existing helper code that performs an AUTH
call without asserting its response status is not evidence the call is needed or correct. See
`docs/common-issues/keycloak-and-auth/auth-operation-required.md` for the full rule and the incident (an unasserted,
silently-failing AUTH call copied across several helpers) that established it.

## Kafka (not an HTTP request/response contract)

Kafka tests don't go through `BaseApiClient`/an `*-api-paths.ts` registry at all — see
`docs/frame-specs/architecture.md`'s "Kafka layer" and the root `README.md`'s "Kafka Testing"
section for the `kafkaService` fixture API, topic naming, and CI wiring.

## Naming conventions (endpoints, entities, operation codes)

See the root `README.md`'s "Conventions" section (folder naming, file naming, `UPPER_SNAKE_CASE`
entity/path-constant naming, API client pattern, API paths maintenance) — that section is the
canonical, actively-enforced reference and is not duplicated here to avoid drift. The short version:
PKF-CBS table/entity names use dot notation (`PF.CLASS`, `SM.USER~INTERNAL`) and are represented in
code as `UPPER_SNAKE_CASE` with dots/tildes replaced by underscores; operation codes are always
`UPPER_SNAKE_CASE`; path registries are grouped in `UPPER_SNAKE_CASE`-keyed factory objects per
module, never hardcoded inline in a client or spec.
