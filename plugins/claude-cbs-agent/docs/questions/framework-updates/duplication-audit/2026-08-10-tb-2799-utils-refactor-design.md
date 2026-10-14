# TB-2799: Reorganize `utils/` into functional directories, remove duplicate logic

**Ticket:** TB-2799 (sub-task of TB-2798 "Current code condition refactoring")
**Ticket description:** "Move service, path, constants and other files into their correct
functional directories. Delete duplicate logic between files."

## Scope

Limited to `api/utils/` and `ui/utils/` only. Duplicate-logic elimination is scoped to
duplicates *among the files being reorganized here* — a project-wide duplicate audit across
every module (`api/account`, `api/system_core`, `ui/pages`, etc.) is explicitly out of scope
for this sub-task and would be a separate follow-up.

## Current state

- `api/utils/` has 33 files sitting flat, plus three subfolders already started organically:
  `constants/` (`db-query-keeper.ts`), `paths/` (`kafka-paths.ts`), `services/`
  (`kafka-service.ts`).
- `ui/utils/` has 6 files, all flat, no subfolders.
- No barrel/`index.ts` files exist anywhere in `utils/` — every consumer imports the concrete
  file directly. The new structure preserves this convention.
- 77 files across the repo import from some `utils/*` path (recounted after merging main —
  TB-2177 added one more: `playwright.config.ts` now also does a normal
  `import { API_TESTS_MAX_WORKERS } from './api/utils/api-client.constants'`).
- `playwright.config.ts` (lines 29-30 as of this merge) hardcodes
  `require.resolve('./api/utils/global-setup')` / `.../global-teardown` — these two are
  referenced as string-literal paths outside of any static `import`, so a codemod that only
  rewrites `import ... from '...'` statements will miss them; they need an explicit manual edit
  in the same commit as the `fixtures/` move. The normal `import` of `api-client.constants` in
  the same file does not have this problem — it's covered by the ordinary import-rewrite pass.

## Target taxonomy

Five buckets, applied identically under both `api/utils/` and `ui/utils/`. This extends
(rather than replaces) the `constants/` / `paths/` / `services/` subfolders already started.

| Folder | Contains | Boundary rule |
|---|---|---|
| `paths/` | Endpoint path constants | File only exports path/URL strings |
| `constants/` | Static values, enums, timeouts/retry budgets, config | No function/class with behavior — inert data only |
| `services/` | API/DB/Kafka/Keycloak clients | Makes a network or infra call |
| `helpers/` | Pure logic, generators, parsers, guards | No network call of its own; may call a `services/` client |
| `fixtures/` | Playwright `test.extend` fixtures, `globalSetup`/`globalTeardown` | Wired into Playwright's fixture or config lifecycle |

## File → folder mapping

### `api/utils/`

| Folder | Files |
|---|---|
| `paths/` | `api-paths.ts`, `auth-paths.ts`, `keycloak-admin-api-paths.ts`, *(existing)* `kafka-paths.ts` |
| `constants/` | `api-client.constants.ts`, `constants-keeper.ts`, `constants-waiter.ts`, `http-status.ts`, `validation-engine.values.ts`, `kafka-ui.values.ts`, `plugin-manager.values.ts`, `user-group.values.ts`, `user-profile.values.ts`, *(existing)* `db-query-keeper.ts` |
| `services/` | `auth-service.ts`, `base-api-client.ts`, `keycloak-admin-api-client.ts`, *(existing)* `kafka-service.ts` |
| `helpers/` | `date-helper.ts` + `date-converter.ts` + `day-helper.ts` → merged into one `date-time-helper.ts` (see Duplicate logic below); `audit-fields-helper.ts`, `response-parser.ts`, `api-assertions.ts`, `dynamic-name-generator.ts`, `health-check-helper.ts`, `group-helper.ts`, `group-cleanup-helper.ts`, `kafka-cleanup-helper.ts`, `db-helper.ts`, `resource-tracker.ts`, `test-polling-helper.ts`, `test-ownership.ts` |
| `fixtures/` | `api-fixtures.ts`, `global-setup.ts`, `global-teardown.ts` |

### `ui/utils/`

| Folder | Files |
|---|---|
| `constants/` | `field-registry.values.ts` |
| `helpers/` | `selector-helpers.ts`, `first-login-flow.ts`, `dashboard-user.ts` |
| `fixtures/` | `ui-fixtures.ts`, `field-registry-setup.ts` |

Bucket assignment for a handful of borderline `helpers/` files (`resource-tracker.ts`,
`test-polling-helper.ts`, `group-helper.ts` vs. `group-cleanup-helper.ts`) was confirmed by
reading their contents during design; no further reclassification is expected during
implementation, but should be re-checked if a file's actual content disagrees with its name.

## Duplicate logic

Confirmed duplicate: `DateHelper.getToday()` (in `date-helper.ts`) and `getTodayDateString()`
(in `date-converter.ts`) both compute `new Date().toISOString().split('T')[0]`.

Policy: the more complete implementation wins, the duplicate file is deleted, and every caller
of the deleted function is switched to the surviving one. Concretely: `DateHelper` (extended
with `day-helper.ts`'s weekday-name methods) becomes `helpers/date-time-helper.ts`;
`date-converter.ts` is deleted; callers of `getTodayDateString()` switch to
`DateTimeHelper.getToday()`.

Any other duplicate discovered while opening a file during implementation follows the same
policy: keep the richer implementation, delete the duplicate, repoint callers — do not invent a
third variant.

## Migration mechanics

- 76 importers repo-wide + a hardcoded config reference make manual find-and-replace
  error-prone. Moves are done as `git mv` + a scripted import-path rewrite (not hand-edited
  one file at a time), followed by `tsc --noEmit` and `eslint` to catch anything missed.
  Per project convention, no test suite is executed as part of verification — the user runs
  tests manually.
- `playwright.config.ts` is updated in the same commit as the `fixtures/` move, since it
  references `global-setup.ts` / `global-teardown.ts` by path outside of TS imports.

## Sequencing

Two separate, independently reviewable steps:

1. **Mechanical move** — file relocation and import-path fixes only, zero logic changes.
   Verified by `tsc`/`eslint`. Reviewable as a pure "no behavior change" diff.
2. **Duplicate-logic consolidation** — merges/deletions described above, layered on top of
   step 1's already-settled paths.
