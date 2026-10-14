# Leftover records from past runs are old enough to collide with business duplicate-checks in a brand-new run

## The pattern/symptom

A `vm-results-smoke-m2-20260918-143907` run (3 `API-tests` workers) failed 5 distinct
`TF.FUNDS.TRANSFER` tests with `422 DUPLICATE_FOUND` from the real `funds-transfer-duplicate-check`
business rule — each clashing against a `sourceRefs` id from a run **hours to days older** than the
current one (e.g. today's `AQA_AQA.FT_1789733286313_92f` clashed with `AQA_AQA.FT_1789583129244_79e`
— a ~150000-second, i.e. ~42-hour-older, id). Same session, a separate balance test
(`Waiting for ACCOUNT.ENTRY to reflect both events (-160)`) timed out expecting `-160` but observed
`-9920` — a multiple of `-160` consistent with the same shared/reused account having accumulated
that delta across roughly 62 prior runs, never reset.

This is distinct from every other cleanup gotcha already in this folder: those are about a *single
run's own* resources leaking or racing. This is about resources from **previous, already-finished
runs** still being live long enough for a *new* run's business logic (a duplicate-detection rule, an
aggregate balance) to see and react to them.

## The rule

Any test that relies on a uniqueness/duplicate-check business rule (`funds-transfer-duplicate-check`
and anything shaped like it) or that asserts an exact aggregate value on a **shared or long-lived**
account/record is implicitly assuming its own test data is the *only* data the backend will ever
compare against. That assumption breaks the moment cleanup isn't 100% reliable across every prior
run — which, per this folder's own `db-helper-reconnect-race-hangs-client.md`,
`cleanup-failure-swallowed-by-caller.md`, and the parallelization-readiness audit, it already isn't
guaranteed to be. A single missed teardown call today is invisible; the same record is still there
weeks later, silently waiting to collide with an unrelated future test.

**Predict**: any *new* test asserting exact-match uniqueness or an exact aggregate total is at risk
of this exact failure mode on bankstg specifically (a long-lived, never-wiped shared environment,
unlike a disposable ephemeral env) — prefer asserting a *relative* change (delta before/after) over
an absolute total when the underlying record isn't provably fresh-per-run, and prefer generating
uniqueness-sensitive identifiers with enough entropy that an accidental match against 2+-day-old
data is the actual anomaly being tested, not incidental collateral from an unrelated test.

## Separately observed in the same run: cleanup double-delete noise

Not yet confirmed as a distinct root cause (needs its own investigation), but worth tracking
alongside the finding above since it's the same "resource lifecycle isn't as clean as assumed"
theme: the same run logged ~16 "delete table group" `404`s (already-deleted) and 4+ Kafka
`UnknownTopicOrPartitionException` "topic already gone" warnings during cleanup. None of these
failed a test (cleanup errors are swallowed, per `cleanup-failure-swallowed-by-caller.md`'s pattern),
but a double-delete this frequent suggests either two workers racing to clean up a
group/topic-id derived from a shared/reused seed, or a retry path re-attempting a delete that
already succeeded. Flagged here for whoever picks this up next — not yet root-caused.

## Incident

2026-09-18, `group-3/TB-3922`, `vm-results-smoke-m2-20260918-143907` (3 `API-tests` workers,
smoke-m2). 25 total failures; this pattern accounts for at least 6 of them (5 `TF.FUNDS.TRANSFER`
duplicate clashes + the `-9920` balance drift) — the largest single failure category in that run
after the already-tracked Keycloak login race (see
[`keycloak-shared-credential-lockout-and-ci-log-masking.md`](../keycloak-and-auth/keycloak-shared-credential-lockout-and-ci-log-masking.md)'s
Fix 8). Not yet fixed — needs a decision on whether affected tests should switch to delta-based
assertions, or whether bankstg needs a periodic stale-data sweep, before further action.
