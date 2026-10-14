# TB-2960: Idempotency/Customization failures root-caused to removed `auditable` field

**Date/time:** 2026-08-28 08:51 · **Branch:** group-3/TB-2960 · **Ticket(s):** TB-2960

## Discussed

User reported failing tests in `regression.html` (Customization/Idempotency) and `smoke.html`
(Idempotency/Customization) Playwright HTML reports and asked to find the cause and fix it, noting
devs had changed something. Mid-investigation the user pasted a dev Slack thread (Artur Fonichkin,
2026-07-24) confirming the backend removed the `auditable` field from
`POST {{table-registry-url}}/api/v1/tables` requests long ago, and Bruno's own collection was being
cleaned of it too — this became the confirmed root cause rather than a hypothesis.

## Implemented

- Extracted the embedded Playwright report data (base64 zip in a `<template
  id="playwrightReportBase64">` tag) from both `regression.html` and `smoke.html` to read actual
  per-test error messages, since the reports are self-contained single-line HTML files.
- Confirmed all failures in `idempotency-smoke.spec.ts`, `customization-smoke.spec.ts`,
  `idempotency-regression.spec.ts`, `customization-regression.spec.ts` shared one error: `400 —
  "unknown field 'auditable'"` thrown from `table-registry-helper.ts:379`
  (`registerTableIdempotently`), cascading into long `skipped` tails per file.
- Traced the field to `test-data/payload-builder.ts`'s `buildCreateTablePayload`, which defaulted
  `auditable: false` on every create-table payload; none of the 4 failing spec files override it.
- `test-data/payload-builder.ts` — removed the `auditable: false` default line from
  `buildCreateTablePayload`.
- First pass: relaxed `CreateTablePayload.auditable` to optional rather than removing it, to avoid
  touching call sites outside the asked-about modules. User pushed back ("зачем оставлять
  опциональным, разве не удалили полностью? проверь в Bruno").
- Fetched fresh `proj-bruno-api` `origin/main` (local `main` was stale — `ad447439`→`44d44205`,
  confirming the "always fetch origin/main" rule) and confirmed via `collections/Table
  Registry/Tables/folder.yml` (POST schema table has no `auditable` row) and a real request example
  (`Create DATES table.yml`, no `auditable` key) that the field is fully gone from the create
  contract — auditability is now derived server-side from `type` (`USR`→auditable, `SYS`→not), per
  both that doc and `collections/Table Registry/Internal/folder.yml`.
- Second pass, now with confirmed evidence: removed `auditable` from `CreateTablePayload` entirely
  (`api/types/table-registry.types.ts`), then fixed every remaining call site that still passed it
  explicitly — safe because each one's value already matched what the backend now derives from
  `type` (e.g. `auditable: true` alongside `type: 'USR'`):
  `api/security_management/tests/override-dispo-regression.spec.ts:839`,
  `api/system_core/tests/table-registry-regression.spec.ts:855`,
  `api/system_core/helpers/validation-engine-helper.ts:73`,
  `api/integration_chapter/tests/audit-fields-integration.spec.ts:112`,
  `api/system_core/tests/audit-fields-regression.spec.ts:97,138`,
  `api/system_core/tests/audit-fields-smoke.spec.ts:154`.
- Verified: `npx tsc --noEmit` clean, `npx eslint` clean across all 8 touched
  `proj-test-automation` files. Did not run the test suite (user runs tests manually).
- User then asked to double-check nothing was missed, and to hit the live server directly with
  every combination rather than trust docs alone. Re-ran an unscoped case-insensitive `grep -ri
  auditable` across the whole repo (previous searches had been glob-scoped) — confirmed only two
  legitimate remaining hits: `GroupTableConfig.auditable` in the types file and an assertion-message
  string in `audit-fields-smoke.spec.ts`.
- Wrote a throwaway diagnostic script (`_probe-auditable.ts`, run via `npx ts-node
  --transpile-only`, deleted after) that authenticates via `createAuthenticatedApiContext`, creates
  a fresh table group, and sends `POST /api/v1/tables` for all 6 combinations of `type: USR|SYS` ×
  `{omit auditable, true, false}`. Result: the field is rejected (`400 unknown field 'auditable'`)
  in all 4 cases it's present, for both types and both values — unconditional. The 2 omitted-field
  requests succeeded (`201`) for both types. Checked the create response, a public `GET
  /api/v1/tables/{id}`, and the internal `GET /table-registry-groups/{id}/tables` for the two
  created tables: `auditable` is absent from the first two, present and server-derived in the third
  (`USR` → `true`, `SYS` → `false`) — matching the Bruno docs exactly. Deleted both probe tables and
  the probe group afterward (`204` on every delete).
- `proj-ai-agentic`: wrote/updated `docs/common-issues/test-data-and-assertions/table-create-auditable-field-removed.md` and
  `docs/common-issues/INDEX.md` to reflect the full removal (not the initial optional-field
  compromise) plus the live-verification table.

## Learned

- The backend's table-registry create endpoint now rejects the `auditable` field outright (unknown
  field, not silently ignored) and it's not a "removed default" — the field is entirely gone from
  the create contract. Auditability is now a derived, read-only property (`type: USR` → auditable,
  `type: SYS` → not), confirmed both by dev chat and by `proj-bruno-api`'s own docs. Making a type
  field merely optional is the wrong level of fix when the field is actually gone from the wire
  contract — optional still permits reintroducing it; removing it entirely makes doing so a compile
  error, which is the correct guard.
- `GroupTableConfig.auditable` (the `Internal` bootstrap-config **response** type, distinct from
  `CreateTablePayload`) was deliberately left untouched — `proj-bruno-api`'s
  `Table Registry/Internal/folder.yml` confirms the backend still returns `auditable` there, just
  server-derived now rather than client-set. Response-side and request-side are separate contracts;
  don't conflate them when a dev message talks about "requests."
- Full write-up in `docs/common-issues/test-data-and-assertions/table-create-auditable-field-removed.md`.

## Open Items / Follow-ups

- Changes in both repos are uncommitted; user has not asked for `/create-pr` yet.

## References

- TB-2960 (branch `group-3/TB-2960`)
- Local report files: `regression.html`, `smoke.html` (untracked, in
  `proj-test-automation` working tree)
