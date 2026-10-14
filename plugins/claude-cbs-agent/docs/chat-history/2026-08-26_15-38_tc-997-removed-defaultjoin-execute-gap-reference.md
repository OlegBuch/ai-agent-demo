# TC-997 removed from enquiry-regression.spec.ts — full reference for resuming later

**Date/time:** 2026-08-26 15:38 · **Branch:** group-1/TB-3083 (proj-test-automation) · **Ticket(s):** TB-2485 (unrelated,
see Learned)

## Why this file exists

TC-997 ("Execute Enquiry — virtual join (LINK) field resolves the linked value from the related
table") was **deleted outright** from `api/system_core/tests/enquiry-regression.spec.ts` on
2026-08-26, at explicit user request, after being skipped across two sessions with no forward
progress. This file preserves everything needed to pick the investigation back up later — the full
test code, the standalone Bruno reproduction steps, and the complete review history — without
digging through chat transcripts.

## Discussed

- TC-997 tests whether an Enquiry's `/execute` response resolves a `defaultJoin`-configured display
  field's value from a related table (e.g. a `CUSTOMER_NAME` pulled in via a link field), not just
  whether the Enquiry **definition** accepts and persists that configuration.
- Two full investigation passes (this session and the prior one) confirmed the same outcome every
  time: definition-time persistence works, execute-time resolution does not. Re-verified today via
  **two independent methods** — the Playwright test itself, and a from-scratch manual Bruno request
  sequence (see below) — both hit the identical gap.
- Cross-referenced against TB-2485 (linked from the manual QA ticket) in detail this session — see
  Learned; it turned out to be about a different, unrelated bug, not the execute-time resolution gap.
- User decided today (after both confirmations) to remove the test from the suite entirely rather
  than keep carrying a permanently-skipped test, with an explicit intent to possibly return to it
  later once dev-team clarification comes in.

## The removed test code (verbatim, as it stood in the suite before deletion)

Note: the `test.skip(...)` reason string below is the second-to-last version (pre-comment-strip).
The actual final live version of that string (after this session's comment-stripping pass and after
the standalone Bruno re-confirmation) read:

> "EXECUTE still does not resolve the defaultJoin display field on this environment — result only
> carries the raw LINKED_TABLE foreign-key value. Independently re-confirmed 2026-08-26 via a
> standalone Bruno probe (raw HTTP requests, no Playwright/test-framework involvement) against a
> freshly created table/Enquiry, ruling out this framework as the cause. Needs dev-team
> clarification on the execute-time resolution contract."

The test body/logic itself was unchanged between that edit and deletion. Full code:

```typescript
test(
  'TC-997: Execute Enquiry — virtual join (LINK) field resolves the linked value from the related table (API)',
  allureCaseId(997),
  async () => {
    test.skip(
      true,
      'EXECUTE still does not resolve the defaultJoin display field on this environment ' +
        '— result only carries the raw LINKED_TABLE foreign-key value. Independently ' +
        're-confirmed 2026-08-26 via a standalone Bruno probe (raw HTTP requests, no ' +
        'Playwright/test-framework involvement) against a freshly created table/Enquiry, ' +
        'ruling out this framework as the cause. Needs dev-team clarification on the ' +
        'execute-time resolution contract.',
    );

    let relatedTableId = '';
    let fullProjectionId = '';
    const enquiryId = generateCustomId('ENQ_997');
    const recordId = generateCustomId('LINK_REC');
    const relatedRecordId = generateCustomId('RELATED_REC');
    const linkFieldId = generateDynamicField(FIELD_CONSTS.X_TYPE.LINKED_TABLE);
    const displayFieldId = generateDynamicField();

    await test.step(
      'PRECONDITION 1: A related table exists with a NAME field, and holds a record ' +
        'whose NAME is known',
      async () => {
        relatedTableId = await setupRelatedNameTable(client, globalGroupId, createdTableIds);
        await seedRelatedNameRecord(client, relatedTableId, relatedRecordId, 'Acme Ltd');
      },
    );

    await test.step(
      'PRECONDITION 2: Inject a LINKED_TABLE field and a plain display field into the ' +
        'shared source table, referencing the related table',
      async () => {
        // A PUT that only lists the new fields is rejected as a "destructive change"
        // (all previously-existing fields would appear removed) — fetch the table's
        // current schema first and PUT the merged set instead of a partial one.
        const currentDefRes = await client.getTableDefinitions(tableId, {});
        expect(
          currentDefRes.status(),
          `PRECONDITION: current table definitions should be retrievable, got ${currentDefRes.status()}: ${await currentDefRes.text().catch(() => '')}`,
        ).toBe(HTTP_STATUS.OK);
        const currentDef = (await currentDefRes.json()) as {
          schema: { properties: Record<string, unknown> };
        };

        const definitionPayload = {
          schema: {
            type: 'object',
            properties: {
              ...currentDef.schema.properties,
              [linkFieldId]: {
                id: linkFieldId,
                type: 'string',
                title: linkFieldId,
                'x-type': FIELD_CONSTS.X_TYPE.LINKED_TABLE,
                'x-config': { relatedTable: relatedTableId },
              },
              [displayFieldId]: {
                id: displayFieldId,
                type: 'string',
                title: displayFieldId,
                'x-type': FIELD_CONSTS.X_TYPE.ALPHANUMERIC,
                'x-config': {},
              },
            },
          },
        };
        const injectResponse = await client.updateTableDefinition(
          tableId,
          definitionPayload,
          {},
        );
        expect(
          injectResponse.status(),
          `PRECONDITION: field injection should succeed, but got ${injectResponse.status()}: ${await injectResponse.text().catch(() => '')}`,
        ).toBe(HTTP_STATUS.CREATED);
      },
    );

    await test.step(
      `PRECONDITION 3: An Enquiry exists (on the shared US-01.07.03 table) with ` +
        `${linkFieldId} (LINKED_TABLE) and ${displayFieldId} resolving NAME from the ` +
        'related table via x-config.defaultJoin',
      async () => {
        const defaultJoin = {
          linkField: linkFieldId,
          targetField: 'NAME',
          relatedTable: relatedTableId,
        };
        const payload: EnquiryDefinitionPayload =
          EnquiryPayload.buildEnquiryDefinitionPayload(enquiryId, {
            name: { 'en-GB': `Automated Enquiry ${enquiryId}` },
            schema: EnquiryPayload.objectSchema({
              [linkFieldId]: {
                id: linkFieldId,
                type: 'string',
                title: linkFieldId,
                'x-type': FIELD_CONSTS.X_TYPE.LINKED_TABLE,
                'x-config': { fieldId: 'NAME', tableId: relatedTableId },
              },
              [displayFieldId]: {
                type: 'string',
                title: { 'en-GB': 'Customer Name' },
                'x-type': FIELD_CONSTS.X_TYPE.ALPHANUMERIC,
                'x-config': { defaultJoin },
              },
            }),
          });

        const res = await enquiryClient.createEnquiryDefinition(tableId, payload);
        expect(
          res.status(),
          `PRECONDITION: Enquiry creation should succeed, got ${res.status()}: ${await res.text().catch(() => '')}`,
        ).toBe(HTTP_STATUS.OK);
      },
    );

    await test.step(
      `PRECONDITION 4: A record exists on the source table whose ${linkFieldId} equals ` +
        "the related table's record id, written through a dedicated INPUT-capable " +
        'Projection',
      async () => {
        fullProjectionId = `${tableId}~${enquiryId}.RECORD.INPUT`;
        const projectionPayload = {
          id: fullProjectionId,
          name: { 'en-GB': 'Full Record Input' },
          schema: {
            type: 'object' as const,
            properties: toProjectionSchemaProperties({
              ...EnquiryPayload.buildEnquirySourceTableDefinitionPayload().schema.properties,
              [linkFieldId]: {
                id: linkFieldId,
                type: 'string',
                title: linkFieldId,
                'x-type': FIELD_CONSTS.X_TYPE.LINKED_TABLE,
                'x-config': { relatedTable: relatedTableId },
              },
            }),
            required: ['CUSTOMER_ID'],
          },
          layout: { view: 'grid' },
          associations: [],
        };

        const projRes = await client.inputProjectionDefinition(tableId, projectionPayload);
        expect(
          projRes.status(),
          `PRECONDITION: Full-field Projection creation should succeed, got ${projRes.status()}: ${await projRes.text().catch(() => '')}`,
        ).toBe(HTTP_STATUS.OK);

        const inputRes = await client.inputProjectionRecord(
          fullProjectionId,
          buildRecordInputPayload(recordId, {
            CUSTOMER_ID: recordId,
            [linkFieldId]: relatedRecordId,
            VALUE_DATE: '2026-01-01',
            PRINCIPAL_AMOUNT: '1000',
            OUTSTANDING_AMOUNT: '500',
            CHARGES: [],
          }),
        );
        expect(
          inputRes.status(),
          `PRECONDITION: Record INPUT should succeed, got ${inputRes.status()}: ${await inputRes.text().catch(() => '')}`,
        ).toBe(HTTP_STATUS.OK);
      },
    );

    await test.step(
      'STEP 1: Execute the Enquiry (POST, neutral body, page=0&size=100 — sized ' +
        'generously since the table is now shared with other tests) and verify ' +
        `${displayFieldId} resolves to the related record's NAME value, found by this ` +
        "record's own id",
      async () => {
        const res = await enquiryClient.executeEnquiry(
          tableId,
          enquiryId,
          { page: 0, size: 100 },
          {},
        );
        expect(
          res.status(),
          `Expected execute to return 200, got ${res.status()}: ${await res.text().catch(() => '')}`,
        ).toBe(HTTP_STATUS.OK);

        const body = (await res.json()) as EnquiryExecuteResponse;
        const matchingRow = body.data.find((row) => row.id === recordId);
        expect(
          matchingRow,
          'The seeded record should be present in the Enquiry execute result',
        ).toBeDefined();
        expect(
          matchingRow?.result[displayFieldId],
          `${displayFieldId} should resolve to the linked related record's NAME ` +
            '(Acme Ltd) via defaultJoin, not the raw foreign-key value',
        ).toBe('Acme Ltd');
      },
    );
  },
);
```

Dependencies this test alone needed (now unused elsewhere and removed from the file's imports on
deletion): `seedRelatedNameRecord` from `../helpers/enquiry-helper`. Everything else it used
(`setupRelatedNameTable`, `generateDynamicField`, `FIELD_CONSTS`, `toProjectionSchemaProperties`,
`buildRecordInputPayload`, `EnquiryExecuteResponse`, etc.) is still imported/used by other tests in
the file (TC-833, TC-963), so no other import cleanup was needed.

## The confirmed real shape (definition-time) — for reference when rebuilding

A **pair** of fields, both needing real TABLE.DEF-backed columns, is required — this differs by key
convention between the TABLE.DEF level and the Enquiry-schema level:

1. A raw `LINKED_TABLE`-typed field:
   - At the **TABLE.DEF** level: `x-config: { relatedTable: <targetTableId> }`.
   - At the **Enquiry-schema** level (re-declared on the same field id): `x-config: { fieldId:
     <targetFieldName>, tableId: <relatedTableId> }` — different keys for the same concept.
2. A separate **display field**, with **no `operation` wrapper at all** — the join lives directly
   under `x-config.defaultJoin: { linkField: <linkFieldId>, targetField: <targetFieldName>,
   relatedTable: <relatedTableId> }`. This display field also needs a real TABLE.DEF-backed column
   (plain `ALPHANUMERIC` is fine) — a display field declared *only* in the Enquiry schema, with no
   TABLE.DEF backing, is rejected with `"field does not exist in TABLE.DEF"`.

A partial `PUT .../definitions` that only lists new fields is rejected as a "destructive change" —
always `GET` the current schema first and merge before `PUT`.

## Standalone Bruno reproduction steps (given to the user, independently re-confirmed the gap)

These use throwaway literal IDs rather than the dynamic generator, since it's a manual one-off
probe outside the test framework — this was the whole point (rule out Playwright as the cause).

**1. Create Group** (skip if you already have one)
```
POST {{table-registry-url}}/api/v1/groups
{
  "name": "MANUAL_PROBE_GROUP_997",
  "origin": "LOCAL",
  "deploymentProperties": { "replicaCount": 1, "environmentVariables": {} }
}
```

**2. Create related/target table**
```
POST {{table-registry-url}}/api/v1/tables
{
  "id": "manual_probe_related_997",
  "name": "MANUAL_PROBE_RELATED_997",
  "type": "USR",
  "group": { "id": "<id from step 1>" },
  "classification": "INT",
  "origin": "LOCAL",
  "spaces": ["LIV"]
}
```

**3. Table Definition for the related table** (PUT, wait for 201, then poll `GET .../definitions`
until the schema is non-empty)
```
PUT {{table-template-url}}/api/v1/tables/manual_probe_related_997/definitions
{
  "schema": {
    "type": "object",
    "properties": {
      "NAME": { "id": "NAME", "type": "string", "title": "NAME", "x-type": "ALPHANUMERIC", "x-config": {} }
    }
  }
}
```

**4. Projection + seed record on the related table**
```
POST {{table-template-url}}/api/v1/tables/manual_probe_related_997/definitions/projections/operation/INPUT
{
  "id": "manual_probe_related_997~RECORD.INPUT",
  "name": { "en-GB": "Record Input" },
  "schema": {
    "type": "object",
    "properties": { "NAME": { "id": "NAME", "type": "string", "title": { "en-GB": "NAME" }, "x-type": "ALPHANUMERIC", "x-config": {} } },
    "required": ["NAME"]
  },
  "layout": { "view": "grid" },
  "associations": []
}
```
```
POST {{table-template-url}}/api/v1/projections/manual_probe_related_997~RECORD.INPUT/records/operations/INPUT
{
  "recordId": "manual_probe_related_rec_997",
  "data": { "NAME": "Acme Ltd" }
}
```

**5. Create source table**
```
POST {{table-registry-url}}/api/v1/tables
{
  "id": "manual_probe_source_997",
  "name": "MANUAL_PROBE_SOURCE_997",
  "type": "USR",
  "group": { "id": "<id from step 1>" },
  "classification": "INT",
  "origin": "LOCAL",
  "spaces": ["LIV"]
}
```

**6. Table Definition for the source table — MUST include both the LINK field AND the display
field as real columns** (the first attempt only including the LINK field 400'd with `"field does
not exist in TABLE.DEF"` on the display field at Enquiry-creation time — see step 7's error below)
```
PUT {{table-template-url}}/api/v1/tables/manual_probe_source_997/definitions
{
  "schema": {
    "type": "object",
    "properties": {
      "CUSTOMER_ID": { "id": "CUSTOMER_ID", "type": "string", "title": "CUSTOMER_ID", "x-type": "ALPHANUMERIC", "x-config": { "maxLength": 64 } },
      "LINK_FIELD_997": { "id": "LINK_FIELD_997", "type": "string", "title": "LINK_FIELD_997", "x-type": "LINKED_TABLE", "x-config": { "relatedTable": "manual_probe_related_997" } },
      "DISPLAY_FIELD_997": { "id": "DISPLAY_FIELD_997", "type": "string", "title": "DISPLAY_FIELD_997", "x-type": "ALPHANUMERIC", "x-config": {} }
    }
  }
}
```

**7. Create the Enquiry Definition** — two fields: the raw LINK field (different key convention —
`fieldId`/`tableId`, not `relatedTable`) plus the display field with `defaultJoin`
```
POST {{table-template-url}}/api/v1/tables/manual_probe_source_997/definitions/enquiry/operation/INPUT
{
  "id": "manual_probe_source_997~ENQ_997",
  "name": { "en-GB": "Manual Probe Enquiry 997" },
  "schema": {
    "type": "object",
    "properties": {
      "LINK_FIELD_997": {
        "id": "LINK_FIELD_997",
        "type": "string",
        "title": "LINK_FIELD_997",
        "x-type": "LINKED_TABLE",
        "x-config": { "fieldId": "NAME", "tableId": "manual_probe_related_997" }
      },
      "DISPLAY_FIELD_997": {
        "type": "string",
        "title": { "en-GB": "Customer Name" },
        "x-type": "ALPHANUMERIC",
        "x-config": {
          "defaultJoin": { "linkField": "LINK_FIELD_997", "targetField": "NAME", "relatedTable": "manual_probe_related_997" }
        }
      }
    }
  },
  "conversions": {},
  "drilldowns": [],
  "layout": {}
}
```
Confirmed `200 OK` — definition persists both fields, `defaultJoin` unchanged, `x-sortable: true`
added by the platform.

**8. Projection + record on the source table, referencing the related record**
```
POST {{table-template-url}}/api/v1/tables/manual_probe_source_997/definitions/projections/operation/INPUT
{
  "id": "manual_probe_source_997~RECORD.INPUT",
  "name": { "en-GB": "Full Record Input" },
  "schema": {
    "type": "object",
    "properties": {
      "CUSTOMER_ID": { "id": "CUSTOMER_ID", "type": "string", "title": { "en-GB": "CUSTOMER_ID" }, "x-type": "ALPHANUMERIC", "x-config": { "maxLength": 64 } },
      "LINK_FIELD_997": { "id": "LINK_FIELD_997", "type": "string", "title": { "en-GB": "LINK_FIELD_997" }, "x-type": "LINKED_TABLE", "x-config": { "relatedTable": "manual_probe_related_997" } }
    },
    "required": ["CUSTOMER_ID"]
  },
  "layout": { "view": "grid" },
  "associations": []
}
```
```
POST {{table-template-url}}/api/v1/projections/manual_probe_source_997~RECORD.INPUT/records/operations/INPUT
{
  "recordId": "manual_probe_source_rec_997",
  "data": {
    "CUSTOMER_ID": "manual_probe_source_rec_997",
    "LINK_FIELD_997": "manual_probe_related_rec_997"
  }
}
```

**9. Execute — the actual gap**
```
POST {{table-template-url}}/api/v1/tables/manual_probe_source_997/enquiries/manual_probe_source_997~ENQ_997/execute?page=0&size=100
{}
```

**Actual result (2026-08-26, live-confirmed via raw Bruno):**
```json
{
  "data": [
    {
      "id": "manual_probe_source_rec_997",
      "space": "LIV",
      "status": "LIVE",
      "result": {
        "LINK_FIELD_997": "manual_probe_related_rec_997"
      }
    }
  ],
  "page": { "size": 100, "number": 0, "totalElements": 1, "totalPages": 1 }
}
```
`DISPLAY_FIELD_997` is absent from `result` entirely — no resolved `"Acme Ltd"` value anywhere in
the response. This is the exact same shape of failure the Playwright test hit
(`matchingRow?.result[displayFieldId]` is `undefined`).

## Learned

- **TB-2485 does not explain this gap.** Its bug report/fix is entirely about a **different**,
  definition-time-only problem: the old single-field shape
  (`x-config: { operation: { type: 'LINK', config: { fieldId, tableId } } }`) had its `fieldId`
  validated against the **current** table's TABLE.DEF instead of the **target** table's — a
  `400 "must exist in TABLE.DEF"` at Enquiry-creation time. The QA "ok" confirmation screenshot for
  TB-2485 that was shared this session was itself a **definition SEE** (`POST
  .../definitions/enquiry/operation/SEE`), not an `/execute` call — it only proves definition
  persistence, which was never in question. TB-2485 doesn't touch `/execute` at all, so it can't be
  cited as evidence either way for the actual open gap.
- **Two independent confirmations, same result:** Playwright's `executeEnquiry` call and a from-
  scratch, hand-built Bruno request sequence (no shared code, no shared table/Enquiry) both produced
  the identical failure mode — `result` carries only the raw LINK field's foreign-key value, the
  `defaultJoin` display field is absent. This rules out both "test framework artifact" and
  "freshly-created resource propagation lag" as explanations.
- No authoritative source (manual QA ticket, Jira, Confluence, dev comment) documents how
  execute-time resolution for `defaultJoin` is supposed to be triggered — whether it needs a
  `selection.inputFieldIds` entry, a query parameter, or something else entirely. This remains a
  genuinely open question for the dev/platform team, not something resolvable from the test side.

## How to resume this later

1. Check whether a Jira ticket now exists / has been answered regarding `defaultJoin` execute-time
   resolution (search for "defaultJoin" or re-check TB-2485's linked issues for anything newer).
2. If the platform contract becomes clear, re-add the test above verbatim into
   `api/system_core/tests/enquiry-regression.spec.ts` (right after TC-995, before what is now
   TC-999 — check current line numbers, the file has been reformatted/comment-stripped since), drop
   the `test.skip(...)` call, and adjust STEP 1's assertion/PRECONDITIONs if the actual resolution
   mechanism turns out to need something not shown above (e.g. an extra query param or
   `selection.inputFieldIds` entry).
3. Re-add `seedRelatedNameRecord` to the `../helpers/enquiry-helper` import list at the top of the
   file (it was removed on deletion since nothing else in this file used it).
4. Re-run the full verification pipeline (`prettier --write` → `eslint --max-warnings=0` →
   `tsc --noEmit -p .` → `playwright test --list --grep "TC-997"`) before any live run.
5. The standalone Bruno steps above can be reused as-is (or re-run first) to sanity-check whether
   platform behavior has changed before touching the test code again.

## References

- Jira **TB-2485** — "[Enquiry Creation] LINK operation validates fieldId against the current
  table's TABLE.DEF instead of the target table" (closed/fixed 2026-08-21, unrelated to this gap —
  see Learned) — https://bank-proj.atlassian.net/browse/TB-2485
- `docs/chat-history/2026-08-25_20-08_enquiry-link-defaultjoin-shape.md` — original shape discovery
- `docs/chat-history/2026-08-25_23-13_enquiry-regression-link-and-auditable-fixes.md` — prior
  session's TC-833/963/997 implementation
- `docs/chat-history/2026-08-26_13-34_tb-2437-2440-inputfieldids-pagination-fixes.md` — this
  session's earlier write-up, includes the TC-1010 infra investigation done in parallel
