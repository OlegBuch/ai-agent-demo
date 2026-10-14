# Cleanup/setup helper's own failure signal discarded by its caller — false "success" logs

## The pattern/symptom

A helper function returns a `boolean` (or throws only in some paths) to signal whether it actually
succeeded, but the caller `await`s it without checking the result and then unconditionally logs
success — or a helper's docstring promises it "aborts early if persistently unavailable" but no
code path actually throws, so the caller always proceeds regardless of what was probed. Either way,
the log/behavior a future reader trusts ("Successfully cleaned up group", "Service reachable") does
not reflect what actually happened, and a genuinely dead environment produces a wall of misleading
`[FAIL] ... 403` immediately followed by `Successfully cleaned up ...` for every single item, which
reads as a flaky/racy script instead of what it is: two unrelated discarded-signal bugs.

## The rule

When a helper's return type or docstring promises a success/failure signal, the caller must act on
it before logging or proceeding — never assume "didn't throw" means "succeeded" for a function whose
own contract is a `boolean` or partial-result object. Symmetrically, when a docstring says a function
"aborts"/"fails fast" on a condition, grep that function's own body for an actual `throw` on that
condition before trusting the docstring — a function that only `console.warn`s and returns normally
does not abort, no matter what its comment claims.

## The incident (2026-09-07, `proj-test-automation`, TB-3587 branch)

`api/utils/helpers/group-cleanup-helper.ts`: `cleanupGroupById` called
`deleteGroupViaApiWithRetry(...)` (which returns `boolean`) without capturing the result, so a `403`
on the actual group-delete call never surfaced — `cleanupStaleGroups`'s `try/catch` never threw,
and every stale group got logged `Successfully cleaned up group` right after its own `[FAIL] ...
403` line. Fixed by threading the real success/failure through `cleanupGroupById` (now returns
`Promise<boolean>`, `false` if registry-metadata delete, schema drop, or the API delete failed) and
having `cleanupStaleGroups` log accordingly.

Separately, `api/utils/fixtures/global-setup.ts`'s `assertServiceReachable` docstring says it
"aborts early if it is persistently unavailable," but on exhausting all 3 probe attempts (network
errors or repeated 5xx) it only `console.warn`'d "proceeding anyway" and returned normally — no
`throw` existed anywhere in the function. On a dead QA environment this let `globalSetup` grind
through the full stale-group sweep (123 groups, each a doomed authenticated call) and further setup
steps before failing somewhere downstream, instead of failing fast with one clear message. Fixed by
throwing after the final attempt, which propagates through `globalSetup`'s existing top-level
`catch` (already logs `[global-setup] Fatal error during setup: ...` and rethrows).

Both fixes are scoped to matching the function's own already-stated contract — no new behavior
invented, no scope creep into deciding *when* 403 vs 5xx should be treated as "environment dead"
(the probe's `status < 500` = "reachable" heuristic was left untouched; only the "never actually
aborts" gap was closed).

## Follow-up: consecutive-failure circuit breaker (2026-09-07, same session)

Even with the log now honest, `cleanupStaleGroups` still ground through all 123 stale groups one by
one against a dead environment — each one a wasted authenticated round-trip. Added a circuit
breaker: `CLEANUP_CONSECUTIVE_FAILURE_THRESHOLD` (`constants-waiter.ts`, set to `3`) counts
consecutive per-group cleanup failures **across different groups** (not retries within one group —
those are already exhausted by `CLEANUP_RETRY_ATTEMPTS` before `cleanupGroupById` returns/throws).
On reaching the threshold, `cleanupStaleGroups` throws `"Aborting: N consecutive stale-group
cleanup failures ... The environment is likely temporarily unavailable."`, which propagates through
`cleanupOrphanedSchemas`/`cleanupStaleGroups`'s caller (`globalSetup`'s top-level `catch`) exactly
like the `assertServiceReachable` fix above — same propagation path, same rationale: stop burning
through a doomed sweep and fail fast with a clear cause instead of a wall of per-group `[FAIL]`
lines. If this proves too aggressive for a real mixed-failure sweep (e.g. 2 genuinely-broken groups
interleaved with healthy ones tripping it by coincidence), consider whether the threshold should
reset per distinct *error class* rather than any failure — no evidence of that yet, revisit if seen.

## Follow-up: destructive schema drop missing the ownership guard (2026-09-15, `api/` architecture audit — fixed same day)

A separate, more serious gap in the same file, found by a full-repo architecture audit (not a live
incident): `cleanupGroupById` dropped every schema returned by `DB_QUERIES.SCHEMA.MATCHING_BASE_NAME()`
— a **regex prefix match** — filtered only by `isProtectedSystemName(schema)`. It never called
`isTestOwnedName`. This was the one destructive-op path in `api/utils/` that did not honor the
repo's stated invariant ("every destructive DB operation must be guarded by test-ownership"; see
`db-helper.ts#isTestOwnedSchema`'s own doc in `docs/frame-specs/architecture.md`). A non-test
`groupId` passed to this exported function would have fanned out to every schema sharing its prefix
and `DROP ... CASCADE`'d them. Independently confirmed real by an adversarial review that traced
`MATCHING_BASE_NAME`'s input back to `TABLE_IDS_BY_GROUP_ID` (`SELECT id FROM tables WHERE
group_id = $1`, no ownership filter of its own) before the fix was accepted.

A second, lower-risk instance in the same file: `cleanupOrphanedSchemas` also called
`DB_QUERIES.SCHEMA.DROP(schema)` directly, safe only because its caller pre-filtered with
`isTestOwnedName && !isProtectedSystemName` earlier in the function — the safety depended on that
filter never being edited out, not on the drop site itself.

**Fixed**: added the missing `isTestOwnedName(schema)` early-continue guard at both drop sites in
`group-cleanup-helper.ts`, matching the existing `isProtectedSystemName` guard's style (two
sequential specific-reason checks, not one collapsed condition — an earlier draft of the second
guard collapsed both checks into one generic log message and lost which reason actually fired;
corrected before landing). Deliberately did **not** route through `db-helper.ts`'s
`dropSchemaIfTestOwned` — that would have silently dropped the per-drop success/failure logging and
retry-count tracking this function already does, for no safety benefit (the two-line inline guard
closes the same gap with less blast radius on a Tier-0 safety fix).

**Evaluated and declined**: whether `cleanupGroupById`'s registry-metadata deletion step (which
runs on every `tableId` in the group, with no per-table ownership check of its own) is "the same
vulnerability class, one layer up." It is not — `TABLE_IDS_BY_GROUP_ID` is an exact `group_id` join
with no regex/prefix expansion, so it only ever touches tables that genuinely belong to the
caller-supplied `groupId`. Every call site (`table-registry-helper.ts`, `test-user-service.ts`, 4
spec files) passes a `groupId` it created itself; there is no path by which an unrelated group's
tables reach this step. Adding a redundant per-table `isTestOwnedName` check here would risk
skipping legitimate metadata deletion for a test-created table whose ID doesn't happen to match the
naming heuristic. Revisit only if a future caller ever passes a `groupId` it did not create itself.

**Rule (generalizes past this file):** grep for every call site of `DB_QUERIES.SCHEMA.DROP(` /
`DROP SCHEMA` before trusting that a module's destructive DB path is guarded — a correct guard
existing *somewhere* in the helper does not mean every drop call in that file goes through it. But
also don't reflexively add the same guard to every step that merely sits near a destructive one —
check whether that step's own input is actually unbounded (a regex/prefix match) or already exactly
scoped (a direct-key join) before deciding a guard is missing there too.
