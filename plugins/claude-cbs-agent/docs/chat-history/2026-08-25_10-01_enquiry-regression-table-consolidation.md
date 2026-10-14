# Enquiry Regression — Related-Table Consolidation (open decision)

**Date/time:** 2026-08-25 10:01 · **File:** `api/system_core/tests/enquiry-regression.spec.ts` (proj-test-automation)
**Keyword to resume this discussion:** "консолидация таблиц"

## Context

While adding the 7-ticket US-01.07.03 batch (TC-995, TC-996 [duplicate, not implemented],
TC-997, TC-999, TC-1144, TC-1145, TC-1146), the user asked (discussion only, no code changed)
whether the new tests could reuse shared resources/tables instead of each provisioning its own.

## Findings

- **TC-995, TC-1144, TC-1145, TC-1146** already reuse the shared `US-01.07.03` table (`tableId`
  from the describe-level `beforeAll`) — Camp A, no new table created.
- **TC-999** deliberately provisions its own private table (Camp B) and must keep doing so: it
  asserts on the full, unfiltered/unsorted result set's row order, so any other test's records
  landing in a shared table would break the "insertion order == everything returned" assumption.
- **TC-997** provisions its own fresh "related name" table (via `setupRelatedNameTable`, for its
  LINK-target) — and this is not the first such case. `setupRelatedNameTable` is currently called
  4 times across the file, each creating an independent table:
  - TC-833 (`US-01.07.01.02 | Dynamic Query Engine`)
  - TC-963 — twice (`relatedTableIdA`, `relatedTableIdB`, for its before/after LINK-target switch)
  - TC-997 (`US-01.07.03 | Display Enquiry`, this batch)

## Open decision

All four related-table tests only ever read back their own seeded record by its own id (never an
aggregate/table-wide assertion) — the same Camp-A reasoning already used to justify sharing the
main `US-01.07.03` table applies here. In principle these could consolidate onto one shared
related-name table.

Blocker: TC-833 lives in a different `test.describe` block (`US-01.07.01.02`) than
TC-963/TC-997 (`US-01.07.03`). A real consolidation means hoisting the related-table setup to a
scope visible across blocks (e.g. an outer-level `beforeAll`), not just within one describe —
structurally similar to the earlier Camp A consolidations (Task #17/#18 in this project's task
history: US-01.07.03 and US-01.07.04 each got their own shared table+enquiry).

Trade-off noted to the user: fewer `createTableAndWait` calls → fewer K8s table-registry groups
created → less exposure to the infra flakiness that recurred repeatedly this session (group
healing cascades, Postgres schema-poll timeouts, `reconciler_is_down` circuit breaker). Cost:
cross-describe-block shared state, which needs careful scoping.

## Status

Not started. No code changed. User will resume this specific decision later using the keyword
**"консолидация таблиц"** — when that comes up, re-read this file for the four candidate
call sites (TC-833, TC-963 ×2, TC-997) and the scoping blocker above before proposing an
implementation.
