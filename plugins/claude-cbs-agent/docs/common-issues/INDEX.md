# docs/common-issues/ — cross-module recurring problems and fixes

Unlike `docs/module-theory/<module>/`, this folder holds knowledge that isn't specific to any one
CBS business module — a pattern, gotcha, or bug in `proj-test-automation`'s own framework code,
`proj-bruno-api`'s API contract conventions, or a QA-process pitfall that has already cost real
debugging time on more than one module and will keep costing it again unless it's written down
somewhere every role checks first.

**Read this folder before starting non-trivial work whenever a problem doesn't look tied to one
specific module** — an unexpected 403/404 on an AUTH call, a four-eyes/permission question, a
duplicated helper doing the same thing two different ways, a status-code mismatch between Bruno and
Allure. Skim the topic list below, open the matching topic's own `INDEX.md`, and check there before
re-deriving the fix live.

## Structure — topic folders, not a flat pile

Each broad topic below is its own subfolder (`<topic>/`), with its own `INDEX.md` listing that
topic's entries — see `commands/team/context-resolution.md`'s "Topic-folder hierarchy" section for
the full convention this mirrors (the same shape as `docs/module-theory/<Module Name>/INDEX.md`).
Folder names are broad and durable (`keycloak-and-auth/`, not a ticket or a single incident's
name) so a new fact almost always has an existing folder to land in.

**Before adding anything here:**
1. Identify the topic (does this belong to an existing folder below, or is it genuinely new?).
2. Open that topic's own `INDEX.md` and check whether an existing file already covers the same or a
   closely related symptom/pattern — if so, extend that file with a new dated bullet/section
   instead of creating a new one. Only create a new file for a genuinely new pattern.
3. New file convention (unchanged): named for the pattern itself (kebab-case), not for the ticket
   that surfaced it. Each file covers the **symptom**, the **rule** (stated so it predicts the
   *next* occurrence, not just describes the one that happened), and at least one dated
   **incident**.
4. If a fact recorded here turns out stale (the framework changed, the bug got fixed upstream),
   correct it in place and note the date — don't leave a future session reading a stale rule as if
   it still applied. Compact rather than only append — see `context-resolution.md`'s "Compact this
   knowledge base" guidance.
5. Format any new/extended file per `context-resolution.md`'s "Docs Authoring Standard" — TL;DR
   first, tables over repeated per-entry prose, ~400-500 line soft ceiling before splitting.

## Topics

- [`allure-testops/`](allure-testops/INDEX.md) — Allure TestOps REST/MCP quirks and case-field
  conventions (3 entries).
- [`keycloak-and-auth/`](keycloak-and-auth/INDEX.md) — Keycloak login/lockout behavior and
  AUTH/permission-check gotchas (7 entries).
- [`test-user-service/`](test-user-service/INDEX.md) — `test-user-service` helper behavior and gaps
  (7 entries).
- [`db-and-concurrency/`](db-and-concurrency/INDEX.md) — database/shared-state races, cleanup, and
  precondition-chain gotchas (7 entries).
- [`playwright-execution/`](playwright-execution/INDEX.md) — Playwright test-runner behavior,
  reporting, and step-wrapping conventions (11 entries).
- [`test-data-and-assertions/`](test-data-and-assertions/INDEX.md) — test-data generation, payload
  shape, and assertion-writing conventions (12 entries).
- [`framework-migration-and-git-workflow/`](framework-migration-and-git-workflow/INDEX.md) — this
  plugin/repo's own delegation discipline plus git/merge/migration-scoping workflow gotchas
  (5 entries).
- [`infra-and-environment/`](infra-and-environment/INDEX.md) — VM sync, env-var, and third-party
  (Kafka) infra gotchas (10 entries; two Vault-pipeline entries are marked superseded).

## Path note for dated incident entries

Entries in the topic folders record file paths as they were on the incident date. The `ui/` tree
was reorganized several times since (current layout: `docs/frame-specs/architecture.md`, "UI layer";
verified 2026-10-07 on branch `group-3/TB-4295`). Mapping of the old folders that appear in entries:

| Path in an old entry | Where it lives now |
|---|---|
| `ui/auth/pages`, `ui/auth/helpers`, `ui/auth/fixtures` | `ui/base/auth/{pages,helpers,fixtures}/` |
| `ui/auth/tests/*.spec.ts` | `ui/security_management/sub_modules/user_profile/tests/` |
| `ui/schedule/tests/company-timezone-enforcement.spec.ts` | `ui/security_management/sub_modules/user_profile/tests/` |
| `ui/health-check/tests/ui-health-check.spec.ts` | `ui/base/tests/ui-health-check.spec.ts` |
| `ui/field-registry/{components,helpers,fixtures,constants}` | `ui/system_core/{components,helpers,fixtures,constants}/` |
| `ui/shell/`, `ui/base/pages/dashboard-shell-page.ts` | `ui/base/shell/` |
| `run-on-vm.sh`, `run-suite.sh`, `find-test.ts` (once flat under `scripts/`) | `scripts/test-scripts/shell-scripts/` and `scripts/test-scripts/npm-scripts/` |

## Root-level entries (not yet moved into a topic folder)

Two older entries still sit directly in this folder. They were left in place on purpose: other
documents (`docs/module-theory/Security Management/`, `docs/chat-history/`) link to these exact
paths, so moving them needs those links updated in the same change.

- [`fin-table-schema-naming.md`](fin-table-schema-naming.md) — `LIV`/`NAU`/`HIS` physical Postgres schema location differs by table `classification` (`INT` vs `FIN`); read before writing any direct DB verification in `db-helper.ts` (2026-09-01, `US-02.03.04`). Candidate topic: `db-and-concurrency/`.
- [`table-registry-permission-for-intents.md`](table-registry-permission-for-intents.md) — Create/Refresh/Release Record Intent endpoints need a separate `TABLE_REGISTRY` permission on top of the data table's own, for any restricted (non-admin) user (2026-09-01, `US-02.03.04`). Candidate topic: `keycloak-and-auth/`.
