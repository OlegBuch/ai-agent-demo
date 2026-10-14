# Build, Run, and Local Setup

## Prerequisites

- Node.js (version matching the CI image's toolchain; no `engines` field pinned locally — see
  `docs/frame-specs/tech-stack.md`).
- Network/hosts access to the target CBS environment (`qa.proj.local` or `stg.proj.local`),
  its Keycloak instance, and — for anything beyond the placeholder health-check — a reachable
  Postgres instance and credentials (`docs/frame-specs/infrastructure.md`).

## First-time setup

```bash
cp .env.example .env      # fill in KEYCLOAK_USERNAME/PASSWORD, DB_*, etc. — see .env.example
npm install
npx playwright install --with-deps chromium
```

## Running tests

```bash
# By Playwright project
npm run test:api           # all API-tests
npm run test:ui             # all UI-Chromium
npm run test:full           # both

# By tag, API — smoke/regression are split by CBS milestone (m1/m2/m3, see testing-standards.md)
npm run test:api:smoke-m1
npm run test:api:regression-m1
npm run test:api:smoke-m2
npm run test:api:regression-m2
npm run test:api:smoke-m3
npm run test:api:regression-m3
npm run test:api:e2e
npm run test:api:integration
npm run test:api:health-check

# By tag, UI (same m1/m2/m3 split)
npm run test:ui:smoke-m1
npm run test:ui:regression-m1
npm run test:ui:smoke-m2
npm run test:ui:regression-m2
npm run test:ui:smoke-m3
npm run test:ui:regression-m3
npm run test:ui:health-check

# Single spec, with the Playwright debugger
npx playwright test api/system_core/tests/table-registry-smoke.spec.ts --debug
```

Two interactive pickers build (and copy to clipboard) one of the commands above instead of typing
it by hand — neither executes anything itself, both end by asking where to run it (local, Azure
bankstg, Azure bankuat, or Azure two.bankuat via `run-on-vm.sh`, with an optional `--detach`).
`two.bankuat` (added 2026-09-21) is a second CBS stack on the same UAT infrastructure as bankuat —
its own Keycloak realm (`two`) and `proj-two` k8s namespace, but sharing bankuat's Keycloak host —
and is this suite's replacement for the old `qa` env (`.env.example`'s `qa.proj.local` target):

```bash
npm run find-test    # scripts/test-scripts/npm-scripts/find-test.ts — pick a spec file, optionally scoped to one describe/test inside it
npm run find-suite    # scripts/test-scripts/npm-scripts/find-suite.ts — pick one or more ready-made suites (smoke_m1, regression_m2, e2e, ...) by tag, no file needed
```

Run/suite/find/kill tooling (`run-on-vm.sh`, `run-suite.sh`, `ci-run-on-site.sh`, `find-test.ts`, `find-suite.ts`,
`find-shared.ts`, `show-current-runs.ts`, `delete-run-by-id.ts`) lives under `scripts/test-scripts/`
(shell scripts in `scripts/test-scripts/shell-scripts/`, npm-driven ones in `scripts/test-scripts/npm-scripts/`; moved 2026-09-28), separate from the plain maintenance scripts directly under `scripts/` (see
"Maintenance scripts" below) — the split exists purely so the execution-related files are easy to
find as a group instead of mixed flat into `scripts/`.

`find-suite.ts` mirrors the same suite names `scripts/test-scripts/shell-scripts/run-suite.sh`/`test:*` already use
(`testing-standards.md`'s "Tag taxonomy"). Note one asymmetry it has to work around: on the Azure
VM side, `run-suite.sh`'s named suites (`smoke-m1`, `smoke-m2`, `smoke-m3`, etc.) are **API-only** — there is no
dedicated named suite for a UI-tagged variant, so a UI selection rides the generic `ui` suite with
its grep overridden via `run-on-vm.sh ui -- --grep "@smoke_m2"` rather than `run-on-vm.sh smoke-m2`
(which would silently run API tests only). `find-test.ts`'s own Azure branch went through the same
`ui/` vs `api/` fix — see `parallelization-readiness.md`'s "Follow-up Fix (2026-09-21)" entry.

Notes specific to this repo's execution model (see `docs/frame-specs/architecture.md` for why):

- The **first** run in a given environment is slow — `global-setup.ts` provisions a Kubernetes
  table group and polls for its database schema (up to 300s) unless an existing `AQA_GROUP_*`/
  `QA_GROUP_*` group is found and reused (local/non-CI only).
- API-tests run with `workers: API_TESTS_PARALLEL_WORKERS` (env-driven, default 1; the
  `API-tests-singleton` project always uses 1) and a 900000ms (15 minute) timeout in
  `playwright.config.ts` — raised from an original 600000ms because table creation can now
  self-heal a dead/overloaded group by provisioning a replacement before retrying. The default of 1 is
  deliberate given the shared, stateful table-group/DB infrastructure; raising it is the owner's
  decision — see `docs/frame-specs/parallelization-readiness.md` for the full current state.
- `retries` is `2` on CI, `0` locally.

## Maintenance scripts

```bash
npm run db:cleanup       # scripts/cleanup-test-schemas.ts — same sweep as pre-test global-setup (orphans + stale test-owned table groups) on a chosen env; --env, --min-age-hours (default 1), --yes
npm run group:cleanup    # scripts/cleanup-group.ts — drops orphaned table groups from previous failed runs
npm run allure:verify-ids # scripts/verify-allure-ids.ts — fails on duplicate allureCaseId(...) case ids across specs
```

## Code quality

```bash
npm run lint          # eslint .
npm run lint:ci        # eslint . --max-warnings=0 — what CI/the pre-commit hook actually run
npm run format         # prettier --write .
npm run format:check   # prettier --check .
npm run typecheck      # tsc --noEmit
```

Husky's pre-commit hook runs `lint:ci` + `format:check` automatically — see
`docs/frame-specs/coding-standards.md` for what that implies about `'warn'`-level ESLint rules.

## Reporting

- **Playwright HTML report** (always generated): `npx playwright show-report`.
- **Allure report** (always generated): `allure-results/` → `allure-report/` via `allure-commandline`;
  in CI, results additionally upload straight to Allure TestOps — see
  `docs/frame-specs/infrastructure.md`'s "Allure reporting"/"Allure TestOps upload" sections.

## Troubleshooting

- **Commit/push blocked** → run `npm run lint:ci` and `npm run format:check` to see which failed;
  `npm run format` auto-fixes formatting, lint errors must be fixed by hand.
- **Tests hang or fail immediately in global-setup** → check `BASE_URL` reachability and Keycloak
  credentials first; `global-setup.ts` logs `[global-setup]`-prefixed diagnostics for exactly this.
- **A maintenance script fails or behaves unexpectedly** → read the actual script under `scripts/`
  first (they're plain `ts-node` files, not part of the Playwright run) rather than assuming a gap;
  flag it and ask before inventing new cleanup behavior.

**Two-leg suite runs (added 2026-09-29):** `run-suite.sh` runs `npx playwright test` twice for suites with a singleton leg (`API-tests`, then `API-tests-singleton`). It sets `CBS_SUITE_LEG=first` on the first leg and `CBS_SUITE_LEG=followup` on the second (unset for single-leg suites such as `ui`, and for plain `npx playwright test`/CI/npm scripts). `global-teardown.ts` returns immediately when `first` (resources are swept once, by the last leg); `global-setup.ts` on `followup` skips the reachability probe and the orphan/stale cleanup when the first leg's `test-results/setup.ok` sentinel exists, and still resets the per-run sentinel/flag files. Trade-off: an abort during the first leg leaves its tracked resources for the next run's teardown/cleanup (on the VM the tracking file is wiped by the next sync, so only the orphan/stale sweeps catch tables/groups).
