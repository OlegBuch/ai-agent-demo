# Coding Standards

This file records enforcement mechanics and TypeScript-specific rules. Naming conventions
(folders/files/entities/paths) are canonically documented in the root `README.md`'s "Conventions"
section — read that first; this file doesn't repeat it.

## Enforcement

- **ESLint** (`eslint.config.mjs`, flat config): `js.configs.recommended` +
  `tseslint.configs.recommended` + `eslint-plugin-playwright`'s `flat/recommended` (scoped to
  `tests/**`, `**/tests/**`) + `eslint-config-prettier` (disables stylistic rules Prettier owns).
  Type-aware linting is on (`parserOptions.project: true`).
- **Prettier** (`.prettierrc`) is the single source of formatting truth — do not fight it with
  ESLint stylistic rules.
- **Husky** pre-commit hook runs `prettier --check .`, `npm run lint:ci` (`eslint . --max-warnings=0`),
  and `npm run typecheck` (`tsc --noEmit`) on every commit, plus `npm run allure:verify-ids`
  whenever the diff touches a `*.spec.ts` file (`.husky/pre-commit`) — fails the commit if a case
  id passed to `allureCaseId(...)` is reused by more than one test outside that script's own
  allowlist. Pre-push re-runs `prettier --check .` + `lint:ci` (`.husky/pre-push`).
  `lint:ci` uses `--max-warnings=0` — a rule set to `'warn'` below still fails CI/the commit hook,
  it is not merely advisory.
- Auto-fix (`eslint --fix`) is **intentionally not** run by the pre-commit hook — lint errors must
  be fixed by hand so changes stay reviewable; only `prettier --write` (`npm run format`) is safe to
  run blindly.

## TypeScript strictness (`tsconfig.json`)

`strict: true`, target `ES2022`, `NodeNext` module resolution. Key ESLint rules layered on top
(`eslint.config.mjs`):

| Rule | Level | Practical effect |
|---|---|---|
| `@typescript-eslint/consistent-type-imports` | error | `import type { Foo }` for type-only imports — always, everywhere |
| `@typescript-eslint/no-floating-promises` | error | Every Promise must be `await`ed or explicitly handled (`void`/`.catch`) |
| `@typescript-eslint/no-misused-promises` | error | No passing an async function where a sync one is expected (e.g. an event handler) |
| `@typescript-eslint/no-explicit-any` | warn (→ fails CI via `--max-warnings=0`) | No `any` — see "Type safety" below for the pattern used instead |
| `@typescript-eslint/no-non-null-assertion` | warn (→ fails CI) | No `!` — narrow with an explicit check or `as <Type>` cast instead |
| `@typescript-eslint/prefer-optional-chain`, `prefer-nullish-coalescing` | warn (→ fails CI) | Use `?.` / `??` over manual `&&`-chains / `\|\|` where semantically equivalent |
| `playwright/no-wait-for-timeout` | error (in `tests/**`) | No `page.waitForTimeout(...)` — wait on a real condition |
| `playwright/expect-expect` | error (in `tests/**`) | Every test must contain at least one `expect(...)` call |

## Type safety and declarations (from the root README, restated for emphasis)

- **Separation of concerns**: all shared request/response models live in `api/types/*.types.ts`,
  one file per entity family (`table-registry.types.ts`, `pf-class.types.ts`, `hook.types.ts`, ...).
  Client classes and specs `import type` from there — they do not declare ad-hoc inline interfaces
  for anything reusable.
- **Lean payload builders**: `test-data/payload-builder.ts` and the other `test-data/*-payload-builder.ts` files
  do not declare their own types. Callers type an override object against the target entity's type
  (e.g. `Partial<RuleResponse>`), not against a type declared inside the builder file itself.
- **No `any`, no `!`**: where a response body's shape is only known at runtime (e.g. after
  `response.json()`), cast with `as <SpecificType>` rather than `any`/`as any`, and narrow with an
  explicit `if (!x) throw/return` rather than asserting non-null with `!`.
- **`unknown` over `any` at real boundaries**: `BaseApiClient.post<T = unknown>` types payloads
  generically at the HTTP boundary — callers supply the concrete type as the response is parsed and
  cast, not by widening the client itself.

## Retry and timing

- Never a bare `setTimeout`-based sleep as a substitute for actually waiting on a condition when a
  polling helper already exists (`pollDatabaseForSchemas`, `createTableAndWait`, and friends in
  `api/system_core/helpers/`, `api/utils/helpers/db-helper.ts`). A few existing specs still use a fixed
  `setTimeout(..., 5000-10000)` after an async operation as a pragmatic wait for eventual
  consistency where no polling helper exists yet — prefer adding/using a polling helper for new
  tests rather than copying the fixed-sleep pattern forward.
- `playwright/no-wait-for-timeout` only blocks `page.waitForTimeout` (UI); it does not police
  Node-level `setTimeout` in API helpers — that's a design judgment call, not something the linter
  enforces today.

## Comments

Extends the base single-WHY-sentence comment rule (`code-style-agent.md`'s Line-Level Review
Checklist, enforced by `review-cosmetic-pr.md` as a blocking Confirmed Issue). This rule applies
repo-wide — to every file type the diff can touch (`.ts`, `.gitlab-ci.yml`, `.env.example`,
`scripts/**`, any config/YAML file), not only application TypeScript source — with no carve-out
for CI/config/env-template files: a comment is only ever acceptable inside a helper/keeper/utils
class (`api/utils/**`, `api/system_core/helpers/**` and each module's equivalent
`helpers/`/`client/` folder), capped at 1-2 lines, stating a WHY that isn't obvious from the code
itself — never a WHAT-restatement. Everywhere else in the repository — `.gitlab-ci.yml`,
`.env.example`, `scripts/**`, and any other non-designated location — no comment is acceptable at
any length; the fix for a violation there is to delete the comment entirely (moving any genuinely
useful rationale into README/doc prose instead), not to shrink it. A comment anywhere inside a
`*.spec.ts` file is never acceptable either, regardless of length or content: a test's `test.step`
narration and its `TC-<number>: <behavior>` name already carry that role.

## Module boundary

Business/domain logic (payload shaping, retry policy, DB cleanup rules) lives in `api/utils/` and
per-module `helpers/`/`client/` folders — `*.spec.ts` files should read as a sequence of
`client.method(...)` + `expect(...)` calls plus `test.step` narration, not raw HTTP or SQL. When a
spec needs a raw DB query for verification (common in this codebase — see
`docs/frame-specs/architecture.md`'s "Direct database verification"), keep the query itself inline
in the spec (that's the established pattern) but route any *reusable* DB operation (cleanup, schema
polling) through `api/utils/helpers/db-helper.ts`.
