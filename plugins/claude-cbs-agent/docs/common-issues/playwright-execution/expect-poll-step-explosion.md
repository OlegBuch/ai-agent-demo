# expect.poll() explodes a single wait into 100+ Allure steps

## The pattern/symptom

Playwright's native `expect.poll(callback, options).toBe(...)` automatically wraps *every single
polling attempt* in its own Allure sub-step. For a passive wait with a long timeout (event
propagation, Kafka consumer catch-up, a multi-minute settle window), this can produce 100-220
near-identical sub-steps under one `STEP`/`PRECONDITION` — a reviewer has to scroll through all of
them to find the one attempt that actually mattered (the last one, right before success or
timeout). This is a volume/noise problem, distinct from
[`unwrapped-requests-outside-test-step.md`](unwrapped-requests-outside-test-step.md)'s "unlabeled"
problem — these steps *are* labeled, there are just far too many of them.

Confirmed sources of this pattern in this codebase (searched via `grep -rn "expect\s*\.\s*poll("`
across all of `api/`):
- `waitForRecordEvents` (`api/account/helpers/account-contract-setup-helper.ts`) — waited on a
  Kafka `RECORD_UPDATED/AUTH` event; a 90s timeout with the topic never emitting produced **220
  sub-steps** in one observed report (`consolidation_engine`'s TC-61/62/63).
- `waitForRecordValue` and its callers `waitForMandateStatus`/`waitForInstructionStatus`/
  `waitForExecutionReference` (`api/transfer/helpers/ddi-helper.ts`).

Not every `expect.poll()` is this pattern — one remains, deliberately, in
`consolidation-engine-smoke.spec.ts` retrying a real `POST` (each attempt has genuine side effects,
a short 10s timeout caps it to a handful of attempts, and per-attempt visibility is actually useful
for a mutating retry) — see "When not to convert" below.

## The rule

The project's own `pollUntilReady` helper (`api/utils/helpers/test-polling-helper.ts`) does **not**
create a step per iteration — it's a plain `while` loop. Prefer it over `expect.poll()` for any
**passive, read-only** wait (polling a record/event/query to reach some state), and keep only the
last couple of diagnostic snapshots for the eventual timeout error message:

```typescript
const recentAttempts: string[] = [];

await pollUntilReady(
  async () => {
    const value = /* ...check... */;
    const ready = /* ... */;
    recentAttempts.push(`saw "${value}"`);
    if (recentAttempts.length > 2) recentAttempts.shift();
    return { ready };
  },
  timeoutMs,
  () => new Error(`${message}. Last ${recentAttempts.length} attempt(s): ${recentAttempts.join(' | ')}`),
  intervalMs,
);
```

When migrating a caller that passed an `intervals: number[]` array (Playwright's poll-backoff
schedule) to `pollUntilReady`'s single fixed `intervalMs`, use the array's *last* value (its steady-
state interval) rather than the first — preserves the eventual polling cadence without hammering
early.

### When not to convert

A `expect.poll()` retrying a **mutating** call (a `POST` that creates a real record, where a retry
is a materially new attempt with real side effects, not just re-reading the same state) is a
different situation — per-attempt visibility can be genuinely useful there, and the short timeouts
such retries typically use (single-digit seconds) don't produce runaway step counts. Judge by
timeout length and whether the polled callback mutates state, not by "does it use `expect.poll()`."

## The incident

**2026-09-18, framework-wide report-architecture sweep (prompted by a `/execution:allure-commands:
allure-review-report` visual review of a `vm-results-smoke-m2` run flagging a 220-sub-step
`consolidation_engine` test as unreadable).** Converted `waitForRecordEvents` and `waitForRecordValue`
(plus its three callers, unchanged at their call sites) from `expect.poll()` to `pollUntilReady`,
keeping only the last 2 attempts' diagnostics in the eventual timeout error. Left the one
mutating-`POST` retry in `consolidation-engine-smoke.spec.ts` (`TC-30`'s `postDimensionEntry`)
unconverted — see "When not to convert" above. No assertions or business logic changed; verified via
`tsc --noEmit` and `eslint .` only (repo-wide, both clean), consistent with this topic's existing
verification convention. Same sweep also fixed the [bare-hooks and shared-helper causes](unwrapped-requests-outside-test-step.md#the-ruleitem-5-6)
across 45 spec files and 2 pervasively-used services (`auth-service.ts`, `test-user-service.ts`) —
see that file's own incident log for the full list.
