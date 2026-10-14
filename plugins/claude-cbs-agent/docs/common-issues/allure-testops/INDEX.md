# common-issues/allure-testops/ — Allure TestOps REST/MCP quirks and case-field conventions

Part of `docs/common-issues/` — see the parent `docs/common-issues/INDEX.md` for the overall
cross-cutting-knowledge convention (when something belongs here vs. in a module folder, how to
add/update an entry, when to create a new file vs. extend an existing one).

## Entries

- [`allure-story-field-no-id-prefix.md`](allure-story-field-no-id-prefix.md) — Allure TestOps' `Story` custom field holds the bare title only (e.g. `"Asynchronous Rate Order Staging..."`), never the `US-XX.YY.ZZ | <title>` form this repo's own docs/folders use; filtering by the prefixed form silently returns zero matches even when cases exist.
- [`allure-rest-scenario-endpoint-can-return-empty.md`](allure-rest-scenario-endpoint-can-return-empty.md) — raw REST `GET /testcase/{id}/scenario` can return `{"steps":[]}` even when a case has real Steps/ER, silently misleading automation into working from title/precondition alone; use `allure-testops-native`'s `testops_find_testcases(expand:["scenario"])` (or the `/testcase/{id}/step` fallback if that MCP is unreachable) instead of trusting an empty `/scenario` response.
- [`allure-noop-runtime-warning-outside-test-context.md`](allure-noop-runtime-warning-outside-test-context.md) — a `BaseApiClient`-derived client call (e.g. `KeycloakAdminApiClient`) made from `global-setup`/`global-teardown` or any script outside an active `test()` prints a benign `"no test runtime is found"` warning (Allure's `NoopTestRuntime` fallback) and then succeeds normally — not a real error, don't chase it as a regression.
