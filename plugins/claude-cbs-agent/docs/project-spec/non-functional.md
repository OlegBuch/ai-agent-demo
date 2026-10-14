# Non-Functional Requirements

No dedicated NFR document for CBS exists in this repo, and none was surfaced in the
Jira/Confluence context available while writing this file. Everything below is **inferred from
the test framework's own observed behavior** (timeouts, retries, provisioning waits) — not a
committed SLA/SLO. Confirm real performance, availability, security, and compliance requirements
from Jira/Confluence or the CBS architecture team before treating any of this as a target to test
against; treat it as operational context for why the test suite is shaped the way it is.

## Timeouts observed in the test framework (not CBS SLOs)

- Default Playwright test timeout: 30000ms (30s) — `playwright.config.ts`.
- `API-tests` and `API-tests-singleton` project timeout: 900000ms (15 min) per test — deliberately generous because
  real infrastructure provisioning (see below) can be slow, not because CBS operations themselves
  are expected to take that long.
- Global setup polls for Kubernetes/Postgres schema provisioning for up to 300s (5 min) before
  failing — implies real Table Group provisioning (a K8s `table-template` deployment) can
  legitimately take several minutes end-to-end, especially on a cold start.
- Stale Table Group TTL: 12 hours (`cleanupStaleGroups` in `api/utils/helpers/group-cleanup-helper.ts`) —
  an operational housekeeping window for this test framework, not a CBS data-retention rule.
- User-Group/permission propagation: tests insert an explicit ~5s wait after granting/updating
  group membership before asserting on its effect (see `access-control.md`) — implies some
  eventual-consistency window in the real platform for permission changes, though the exact
  mechanism (cache TTL, async projection rebuild, etc.) is not documented anywhere this repo's
  roles can read.

## Reliability patterns observed in the test framework (not CBS itself)

- `BaseApiClient` retries on 5xx responses and on specific "transient" 400-class bodies (`Unknown
  projectionId`, `Unknown tableId`, `does not have access to table`) — these exist because
  table/projection provisioning is asynchronous, so a request immediately after `createTable` can
  race a not-yet-reconciled backend. This is a workaround for eventual consistency in CBS's own
  provisioning pipeline, not a general CBS reliability guarantee.
- Report Portal integration was removed from this repo; reporting is Playwright HTML + Allure only (see `docs/frame-specs/infrastructure.md`).
- Global teardown's destructive cleanup only runs on CI; local runs skip it to keep repeated local
  iteration fast — a deliberate trade-off between run speed and full resource hygiene, not a claim
  about CBS's own idempotency guarantees.

## Open questions (flag, don't guess)

- No documented performance/load targets for any CBS endpoint (no load-testing tooling exists in
  this repo either — see `docs/project-spec/project-scope.md`'s "Out of scope").
- No documented availability/DR requirements for `qa`/`stage`/production CBS environments.
- No documented data-retention or audit-log-retention requirement beyond the NAU/LIV/HIS/HIS-history
  mechanism itself (see `business-rules.md`).
- No documented security/compliance certification requirements (e.g. PCI-DSS scope) surfaced to
  this repo's roles yet — if a ticket requires asserting one, get it from Jira/Confluence, not from
  assumption.
