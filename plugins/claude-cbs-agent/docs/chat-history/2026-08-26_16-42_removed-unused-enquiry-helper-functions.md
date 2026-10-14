# Removed unused enquiry-helper.ts functions — seedRelatedNameRecord, waitForEnquirySelectionFieldReady

**Date/time:** 2026-08-26 16:42 · **Branch:** group-1/TB-3083 · **Ticket(s):** MR !152 review finding

## Why this file exists

A GitLab MR review (MR !152, TB-3083) flagged: "two new helper functions in
`enquiry-helper.ts` (`seedRelatedNameRecord`, `waitForEnquirySelectionFieldReady` + its constant,
~150 lines) are exported but never called anywhere in the repo." Verified via `grep` across the
whole `api/` tree — confirmed accurate, only `enquiry-helper.ts` itself referenced them. Both were
removed from `api/system_core/helpers/enquiry-helper.ts` on 2026-08-26; this file preserves the
full code and the reasoning so either can be restored quickly if needed later.

## Why each one went dead (not an oversight — a side effect of today's/yesterday's fixes)

- **`seedRelatedNameRecord`** — its only caller was **TC-997**
  (`api/system_core/tests/enquiry-regression.spec.ts`), which was deleted outright on 2026-08-26
  after two independent confirmations (Playwright + a standalone Bruno probe) that Enquiry
  `/execute` never resolves a `defaultJoin` display field's value. Full removed test code, the
  Bruno reproduction steps, and resumption instructions live in
  `docs/chat-history/2026-08-26_15-38_tc-997-removed-defaultjoin-execute-gap-reference.md` — that
  file's "How to resume this later" step 3 already says to re-add this helper (and its import) if
  TC-997 is ever restored.
- **`waitForEnquirySelectionFieldReady`** (+ `ENQUIRY_SELECTION_FIELD_PROPAGATION_TIMEOUT_MS`) —
  its last remaining callers (TC-1145, TC-1146) were fixed today by *removing* the call entirely:
  an experiment proved the wait wasn't a valid readiness proxy for the Enquiry `/execute` endpoint
  it was gating (it probes via `REPORT.CONTROL~BASIC`'s own, unrelated `CONDITION` array field —
  see `docs/chat-history/2026-08-26_13-34_tb-2437-2440-inputfieldids-pagination-fixes.md`,
  "Learned" section). TC-1012 (the other historical caller, from the prior session) also ended up
  not needing it — it uses a `FIELD: 'ID'` bypass instead, since `FIELD: 'ID'` is always valid in
  a `CONDITION` with no propagation dependency. So every real use case this function was written
  for turned out to have a better solution that didn't need it — it wasn't forgotten, it was
  superseded everywhere it was tried.

## Removed code (verbatim, as it stood before deletion)

```typescript
export async function seedRelatedNameRecord(
  client: TableRegistryApiClient,
  relatedTableId: string,
  recordId: string,
  name: string,
): Promise<string> {
  const projectionId = `${relatedTableId}~RECORD.INPUT`;

  const projectionPayload = {
    id: projectionId,
    name: { 'en-GB': 'Record Input' },
    schema: {
      type: 'object' as const,
      properties: toProjectionSchemaProperties({
        NAME: {
          id: 'NAME',
          type: 'string',
          title: 'NAME',
          'x-type': FIELD_CONSTS.X_TYPE.ALPHANUMERIC,
          'x-config': {},
        },
      }),
      required: ['NAME'],
    },
    layout: { view: 'grid' },
    associations: [],
  };

  const projRes = await client.inputProjectionDefinition(relatedTableId, projectionPayload);
  if (projRes.status() !== HTTP_STATUS.OK) {
    throw new Error(
      `[enquiry-helper] Record-input Projection creation for related-name table ` +
        `"${relatedTableId}" failed: ${projRes.status()} - ${await projRes.text().catch(() => '')}`,
    );
  }

  const inputRes = await client.inputProjectionRecord(
    projectionId,
    buildRecordInputPayload(recordId, { NAME: name }),
  );
  if (inputRes.status() !== HTTP_STATUS.OK) {
    throw new Error(
      `[enquiry-helper] Record INPUT "${recordId}" on "${projectionId}" failed: ` +
        `${inputRes.status()} - ${await inputRes.text().catch(() => '')}`,
    );
  }

  return projectionId;
}
```

```typescript
export const ENQUIRY_SELECTION_FIELD_PROPAGATION_TIMEOUT_MS = 60_000;

export async function waitForEnquirySelectionFieldReady(
  client: TableRegistryApiClient,
  enquiryId: string,
  fieldId: string,
  timeoutMs = ENQUIRY_SELECTION_FIELD_PROPAGATION_TIMEOUT_MS,
): Promise<void> {
  await pollUntilReady(
    async () => {
      const probeId = generateCustomId('RPT_CTRL_PROBE');
      const res = await client.performRecordOperation(
        'REPORT.CONTROL~BASIC',
        TEST_CONSTS.OPERATION.INPUT,
        buildRecordInputPayload(probeId, {
          NAME: { 'en-GB': `Automated Probe ${probeId}` },
          ENQUIRY_ID: enquiryId,
          CONDITION: [{ FIELD: fieldId, OPERAND: 'EQ', VALUE: '0' }],
          SPACES: ['LIV'],
          ACCESS_GROUPS: [],
          FORMAT: 'CSV',
          RETENTION_DAYS: 1,
          ENABLED: true,
        }),
        TEST_CONSTS.HEADERS.TARGET_COMPANY,
      );
      if (res.status() === HTTP_STATUS.OK) {
        return { ready: true };
      }
      const bodyText = await res.text().catch(() => '');
      if (
        res.status() === HTTP_STATUS.BAD_REQUEST &&
        bodyText.includes('selection.inputFieldIds')
      ) {
        return { ready: false, diagnostic: bodyText };
      }
      throw new Error(
        `[enquiry-helper] Unexpected response while probing CONDITION readiness for field ` +
          `"${fieldId}" on Enquiry "${enquiryId}": ${res.status()} - ${bodyText}`,
      );
    },
    timeoutMs,
    (diagnostic) =>
      new Error(
        `[enquiry-helper] Timeout waiting for REPORT.CONTROL~BASIC's CONDITION validation to ` +
          `recognize Enquiry "${enquiryId}"'s selection.inputFieldIds entry for "${fieldId}" ` +
          `(last error: ${diagnostic ?? 'unknown'}).`,
      ),
    3000,
  );
}
```

Note: **this second function was already known to be flaky/broken** even while it had callers —
0 successful live probes across 4+ separate runs this session and last, even after raising its
timeout from 60s to 150s as a diagnostic (see
`docs/chat-history/2026-08-25_23-13_enquiry-regression-link-and-auditable-fixes.md`, "Learned").
If it's ever needed again, that history should be re-read first — the underlying platform issue
(propagation of `selection.inputFieldIds` to `REPORT.CONTROL~BASIC`/`REPORT.SPOOL~ADHOC`'s
`CONDITION` validator) was never actually fixed, just avoided.

## Imports cleaned up alongside the removal

In `api/system_core/helpers/enquiry-helper.ts`:
- `generateCustomId` (from `../../utils/helpers/dynamic-name-generator`) — was only used inside
  `waitForEnquirySelectionFieldReady`'s `probeId` generation. `generateDynamicTable` from the same
  import line is still used elsewhere in the file and stays.
- `pollUntilReady` (from `../../utils/helpers/test-polling-helper`) — was only used inside
  `waitForEnquirySelectionFieldReady`. `delay` from the same import line is still used by
  `waitForEnquiryInRegistry` and stays.

`toProjectionSchemaProperties` and `buildRecordInputPayload` remain imported/used — both are still
needed by `seedEnquirySourceRecord`, which stays.

## How to resume either later

1. **`seedRelatedNameRecord`**: paste the code above back into `enquiry-helper.ts`, re-add it to
   the export list any caller imports from, and re-add `generateCustomId`'s sibling import if also
   restoring `waitForEnquirySelectionFieldReady`. Primarily relevant if TC-997 is restored — see
   that file's own "How to resume this later" section.
2. **`waitForEnquirySelectionFieldReady`**: before restoring, re-verify whether the underlying
   platform propagation issue has actually been fixed (the dev/platform team was never able to
   confirm this) — a fresh live probe is cheap and would settle it either way. If restoring, also
   restore the `pollUntilReady` import.
3. Re-run the verification pipeline (`prettier --write` → `eslint --max-warnings=0` →
   `tsc --noEmit -p .`) on `enquiry-helper.ts` and any file that re-imports these after restoring.

## References

- MR !152 (TB-3083) review finding — the trigger for this cleanup.
- `docs/chat-history/2026-08-26_15-38_tc-997-removed-defaultjoin-execute-gap-reference.md`
- `docs/chat-history/2026-08-26_13-34_tb-2437-2440-inputfieldids-pagination-fixes.md`
- `docs/chat-history/2026-08-25_23-13_enquiry-regression-link-and-auditable-fixes.md`
