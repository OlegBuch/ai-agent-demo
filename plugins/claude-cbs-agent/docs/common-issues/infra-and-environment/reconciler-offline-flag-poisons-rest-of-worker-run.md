# "Database reconciler is offline/down" is a self-poisoning circuit breaker, not N separate defects

**2026-09-17, found triaging `vm-results-smoke-m2-20260916-202906` /
`vm-results-regression-m2-20260917-004121`.** 6 Customization/Idempotency/Currency smoke failures
and 4 more in regression all threw the identical message `"Skipping table creation: Database
reconciler is offline/down."` — looked like 10 independent module bugs at first glance; it's one
mechanism.

## Mechanism

`table-registry-helper.ts`'s `createTableAndWait`/`createTablesAndWait` poll Postgres
(`pollDatabaseForTableSpaces`) for a freshly-registered table's schema/spaces after creation. If
that poll times out **and** the group-heal retry (`healGroupIfDead`) doesn't recover it, the
function writes a flag file (`flagPath`, under a temp dir) and re-throws. Every subsequent call to
either function **anywhere else in that same worker process, for the rest of the run** starts with
`if (fs.existsSync(flagPath)) throw new Error('Skipping table creation: Database reconciler is
offline/down.')` — a hard short-circuit, no retry, no distinction by module or table.

**Consequence**: one genuine DB/reconciler hiccup on ONE table, in ONE test, poisons every other
table-creating test sharing that worker for the rest of the run — regardless of which module those
other tests belong to. The smoke run's actual root incident was very likely
`basic-customization-smoke.spec.ts`'s `Timeout waiting for Postgres schemas/spaces to be created`
failure (the only smoke failure with a *different* message, in the same worker) — the other 5
"reconciler offline" failures (Customization ×2, Idempotency ×3) are downstream noise from that one
incident, not independent defects.

**Predict**: when triaging a batch of failures across modules that all cite this exact message,
don't investigate them as N separate root causes — find the one test in the same worker/run that
hit a *different*, real error first (a schema/table-space timeout, a DB connection failure), fix or
retry that, and the rest should clear on their own. Conversely, don't dismiss the *first* such
failure as "just infra flakiness" without a real look — it's the one that matters; the cascade
that follows it in the same worker is expected noise once that one is real.

**Root-caused and fixed, same day.** Full timeline of the triggering incident (`TC-01: Verify
role-based menu tree rendering for a permitted role`, `basic-customization-smoke.spec.ts`):
table created on a brand-new group `6474` → `pollDatabaseForTableSpaces` timed out at the full
`TABLE_SCHEMA_POLL_MAX_WAIT_MS` (150s) → `healGroupIfDead` provisioned a second brand-new
replacement group `6475` → the schema poll timed out again on `6475`, also at the full 150s →
flag written. Both groups involved were freshly provisioned (cold-started pods), and
`constants-waiter.ts` itself documents (`graduatedPollDelayMs`'s comment) that a pod cold-start's
"backend-confirmed floor is ~150-200s" — `TABLE_SCHEMA_POLL_MAX_WAIT_MS` sat at the exact low edge
of that floor with zero margin, so a schema poll following a cold-started group had a real chance
of exhausting its entire budget on pod startup alone, before the reconciler ever got to run the
Liquibase migration that creates the schema. Unlike `waitForTableApiReady` (which already has
explicit cold-start awareness via `isFreshGroup`/`COLD_START_WAIT_MS`/forced-reload escalation),
`pollDatabaseForTableSpaces` had no such allowance — a flat timeout regardless of whether the group
was warm or freshly healed.

**Fix**: `TABLE_SCHEMA_POLL_MAX_WAIT_MS` raised `150_000 → 210_000` in `constants-waiter.ts`,
clearing the documented 150-200s cold-start floor with real margin (also bumped
`ORPHAN_CLEANUP_GRACE_MS`'s comment, ~5.5 min → ~6.5 min worst-case, to match). Deliberately did
*not* touch `healGroupIfDead`'s unconditional "treat as dead, provision a replacement" behavior —
once the timeout itself has enough margin, that path should trigger far less often for what was
really just cold-start slowness, and changing it without more evidence would be an unjustified
second change riding on the first.

**Predict**: any poll whose condition depends on a table group's pod being fully up (schema
creation, projection registration, anything gated on the pod recognizing new metadata) needs to
budget for the same ~150-200s cold-start floor if that group could plausibly be freshly
created/healed — a flat timeout copied without that allowance is exactly how this incident
happened. Check `constants-waiter.ts` for the existing budgets before inventing a new one.

**Also improved, same day**: the flag file used to just contain the literal string `'true'` — every
downstream "skipped" error carried zero forensic value, which is exactly why this incident took a
full log/attachment archaeology pass to reconstruct. `writeReconcilerDownFlag`/
`readReconcilerDownFlagMessage` now persist and surface which table/group originally tripped it,
when, and the last poll diagnostic — every subsequent skipped-table error now names the original
trigger instead of a bare generic message.

## Follow-up, same day: threshold-to-open + half-open retry, not just a raised timeout

Raising `TABLE_SCHEMA_POLL_MAX_WAIT_MS` fixed the false-trip *frequency* but not the design flaw:
one genuine timeout still opened the breaker for the *entire rest of the run* on that worker, with
no re-check — a real (not cold-start) reconciler blip early in an hours-long run would have kept
failing every later table-creating test on that worker even after the backend recovered. Fixed:

- **Threshold to open**: `RECONCILER_CONSECUTIVE_TIMEOUT_THRESHOLD = 2` — a per-worker streak file
  (`reconciler_streak_<worker>.txt`) counts consecutive genuine (post-heal) timeouts on *different*
  tables; the breaker only opens on the 2nd, absorbing a single blip without ever tripping.
- **Half-open retry**: once open, the flag also carries `lastProbeAt`/`blockedSinceProbe`. The next
  call is let through as a real recovery attempt (not short-circuited) once
  `RECONCILER_HALF_OPEN_RETRY_MS = 30_000` has passed since the last probe, OR once
  `RECONCILER_HALF_OPEN_MAX_BLOCKED_HITS = 3` calls have been blocked since then — whichever comes
  first. A successful probe (in `createTableAndWait` or `createTablesAndWait`) fully clears the flag
  and the streak via `clearReconcilerState()`.
- Both counters are per-worker files (same `${workerIndex}` suffix as the flag itself), cleared at
  the start of every run in `global-setup.ts` alongside the flag.

**Predict — this is worker-isolated, not cluster-isolated.** The breaker's state never crosses
workers (each worker's flag/streak file is private), unlike `group-helper.ts`'s `HEAL_MAP_DIR`
(intentionally shared, no worker suffix, so one worker's confirmed-dead-group finding benefits
every worker immediately). That's correct for *unrelated* per-worker blips, but means a genuine
*systemic* slowdown (e.g. the cluster genuinely can't cold-start N pods fast enough because
`workers` is now 2-4 per TB-3874) is rediscovered independently by every worker — each pays its own
2-timeout learning cost before protecting itself, and each half-open-probes on its own 30s clock
with no cross-worker backoff. If future data shows correlated timeouts across multiple workers in
the same window (not just one worker's own streak), that's the signal this would need to become
cluster-wide shared state (mirroring `HEAL_MAP_DIR`'s pattern) rather than per-worker — not yet
justified from a single incident, but worth checking for on the next occurrence.
