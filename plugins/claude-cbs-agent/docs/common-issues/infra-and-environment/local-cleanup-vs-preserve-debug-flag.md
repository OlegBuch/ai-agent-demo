# `LOCAL_CLEANUP` does not gate every helper's teardown — check for a per-helper `PRESERVE_LOCAL_GROUP_FOR_DEBUG` too

**Symptom:** a local/VM run's created test data (mandates, instructions, transfers, orders, etc.)
still disappears after the run even though `LOCAL_CLEANUP=false` is set — sometimes set in the
*wrong* file entirely for a VM run.

**Rule (predictive, check both of these before any "why did my data get deleted" investigation):**

1. **`LOCAL_CLEANUP`** (`api/utils/helpers/db-helper.ts`'s `isLocalCleanupEnabled()`/
   `shouldRunCleanup()`) only gates the **table_registry/schema/table-group-level** cleanup path —
   `cleanupOrphanedSchemas`/`cleanupStaleGroups` at start, and dropping the run's table group at
   teardown. It says nothing about a suite helper's own record-level tracker.
2. Several suite helpers keep their **own** SQL-level tracker + `DELETE` cleanup, entirely separate
   from `db-helper.ts`'s cleanup path, gated instead by a distinct flag,
   **`PRESERVE_LOCAL_GROUP_FOR_DEBUG=true`** (skips it; unset/`false` deletes as normal, same on CI
   and locally — this flag has no CI carve-out unlike `LOCAL_CLEANUP`). Confirmed present in:
   `api/transfer/helpers/ddi-helper.ts`, `api/transfer/helpers/payment-order-helper.ts`,
   `api/soft_accounting/helpers/soft-accounting-helper.ts`,
   `api/document_management/helpers/dm-helper.ts`,
   `api/consolidation_engine/consolidation-engine-db-helper.ts`. Before assuming a spec's created
   records survive a run, grep the spec's own helper for `PRESERVE_LOCAL_GROUP_FOR_DEBUG` — do not
   assume `LOCAL_CLEANUP` alone covers it.
3. Even with `PRESERVE_LOCAL_GROUP_FOR_DEBUG=true`, **`global-teardown.ts` still unconditionally
   deletes the run-scoped bootstrap super-admin Keycloak user** (`[global-teardown] Deleting
   run-scoped super-admin user: ...`) — this one has no preserve flag at all. Any Keycloak test user
   a spec's own helper creates via `test-user-service.ts`'s `deleteTestUser` (e.g. a `checker` or
   `no-permission` role fixture) is also deleted unconditionally in that helper's own `dispose()`,
   regardless of either flag — only skip it by not exercising that code path (e.g. the
   `US-08.04.05` DDI dispatch/callback scenarios never call `resolveCheckerClient`/
   `resolveNoPermissionClient`, so they create no throwaway Keycloak users to lose in the first
   place).
4. **For a VM run specifically (`scripts/test-scripts/shell-scripts/run-on-vm.sh`), the flag has to be set in
   `.env.<env>-local` (for example `.env.bankstg-local`), not the repo's local `.env`.** `run-on-vm.sh`'s `bootstrap_env()` composes
   the VM's `.env` **verbatim from `.env.<env>-local`** (stripping only the runner-only
   `CBS_VM_*`/`VAULT_*` keys) — it never reads or copies the repo's own `.env` at all. Setting
   `LOCAL_CLEANUP=false` (or `PRESERVE_LOCAL_GROUP_FOR_DEBUG=true`) in `.env` has zero effect on a
   VM run; it must go in `.env.<env>-local`.

**Incident (2026-09-10):** ran `ddi-smoke.spec.ts`'s `US-08.04.05 | Execution Dispatch and
Callbacks` block (5 tests) on the `bankstg` VM. The user had set `LOCAL_CLEANUP=false` in the repo's
local `.env`, expecting the run's mandates/instructions to survive — that setting was never even
read by the VM run (rule 4), and would not have prevented `ddi-helper.ts`'s own
`deleteTrackedRecords`/`cleanupDb` from deleting them anyway (rule 2). Fix applied: added
`PRESERVE_LOCAL_GROUP_FOR_DEBUG=true` and `LOCAL_CLEANUP=false` directly to `.env.bankstg-local`
before the run; confirmed in `run.log` via the `[ddi] PRESERVE_LOCAL_GROUP_FOR_DEBUG=true; keeping
test records.` line printed once per test.

**Update (2026-09-11, TB-3837 handoff):** the preserve-branch log line only said records were kept,
never *which* ones — useless for handing IDs to devs without opening a debugger. Added
`console.table(records.map(([tableId, id]) => ({ tableId, id })))` right after the existing log line
in `ddi-helper.ts`'s `deleteTrackedRecords` (same PRESERVE branch), so a run with
`PRESERVE_LOCAL_GROUP_FOR_DEBUG=true` prints a copy-pasteable `tableId | id` table per test straight
to the terminal — `MANDATE`/`INSTRUCTION`/the dispatch engine's own table (`FUNDS.TRANSFER` or
`ORDER`), per `context.tracker.track(...)` call sites at `ddi-helper.ts:356`, `:646`, `:838`. Not yet
applied to the 4 sibling helpers (`payment-order-helper.ts` etc.) — same change would apply
verbatim if a future handoff needs it there too. Re-confirmed rule 3 also holds for the specific
Allure cases 3013/3014/3024 (same `US-08.04.05` block): none of the three call
`resolveCheckerClient`/`resolveNoPermissionClient`, so no throwaway Keycloak user is at risk for
this handoff.
