# Post-Liquibase pod restart: table-registry readiness ≠ downstream pipeline warm (REFUTED — see below)

**2026-09-11, later same day — this hypothesis is REFUTED.** Timeout was widened `15000 → 45000`
+ `intervals: [5000]` per the theory below; a live re-run still failed identically at the full 45s
(`Received: 0`), on the same first-call case. A genuine pod-warmup lag would have been absorbed by
3x the original timeout — it wasn't, so this was the wrong root cause. **Reverted to `timeout:
15000` (original value)**, since the longer timeout bought nothing and only slows the suite down.
The real mechanism (a `DELETE` record-operation on a four-eyes NAU draft not transitioning the
record's status or moving it into DEL, confirmed via the actual response body) is now tracked as an open dev question for Customization US-01.04.01 (no `docs/module-theory/Customization/` folder exists) — a dev question is pending, not an infra
timing issue. Keeping this file (compressed) as a record of a plausible-but-wrong hypothesis and
why it was ruled out, per this repo's "preserve the decision, drop the exploration" convention.

## Original hypothesis (ruled out)

`table-registry-helper.ts`'s `createTablesAndWait` forces a pod restart (`Bumping AQA_RESTART_EPOCH
... to trigger pod redeploy for Liquibase migrations`) whenever a freshly-registered table needs
its schema migration applied, then polls until the pod "recognizes" all tables (`Get Table
Definition` succeeds) before returning control to the test. That readiness check is metadata-level
only — it does not guarantee that other, async, downstream processing paths tied to the same
freshly-restarted pod (e.g. whatever moves a deleted NAU draft into the DEL segment) are equally
warmed up yet.

**Symptom (regression-m2, 2026-09-11):** two Customization tests
(`customization-regression.spec.ts`, `US-01.04.01 | Delete Local Table` → `Safe Deletion Policy —
DEL segment purge blocking`, cases 646/652) failed on the very first
`stageAndPurgeDraftIntoDel(...)` call in their precondition — `expect.poll` for a DEL-segment DB row
timed out at 15s (`Received: 0`). Both failures immediately followed this same
`AQA_RESTART_EPOCH`/Liquibase pod-restart sequence for their own freshly-provisioned FIN
(`setupFinTableWithFourEyesDynamic`) table — the only 2 places in an 884-test run where this
correlation appeared. Not dev-confirmed (unlike a genuine backend contract change) — a strong,
log-correlated hypothesis, not a certainty.

**Pattern to predict from:** any test whose precondition polls for a side effect of a write
(DB row appearing, async projection updating, etc.) against a table that was *just* freshly
created/migrated in the same test's own `beforeAll` is at higher risk of the first such poll timing
out, purely because the pod is newly restarted — even though the table-registry itself already
reports it "ready". This is not specific to Customization/DEL — any module provisioning a
fresh FIN/four-eyes/newly-migrated table right before a tight-timeout poll could hit the same
thing.

**Fix applied here:** not a hardcoded sleep (anti-pattern) — the existing `expect.poll(...)` already
polls correctly, it just needed a longer ceiling. Bumped `timeout: 15000 → 45000` and added
`intervals: [5000]` (retry every 5s instead of the default backoff) in
`stageAndPurgeDraftIntoDel` (`customization-regression.spec.ts`). If a similar tight-timeout poll
elsewhere shows the same first-call-after-fresh-table-restart flakiness, prefer widening that poll's
own `timeout`/`intervals` over adding a separate wait — the poll's condition is already the correct
mechanism, it only needed more headroom.
