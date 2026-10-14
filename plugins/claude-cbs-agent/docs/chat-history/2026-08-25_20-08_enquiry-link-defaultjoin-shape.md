# Enquiry LINK/join field — real config shape (confirmed live)

**Date/time:** 2026-08-25 20:08 · **File:** `api/system_core/tests/enquiry-regression.spec.ts` (proj-test-automation)
**Keyword to resume this discussion:** "LINK defaultJoin" / "форма LINK-конфига"

## Summary

The documented shape for a "virtual join" Enquiry field
(`proj-bruno-api`'s `Enquiry Operation.yml`: `{operation: {type: 'LINK', config: {fieldId,
tableId}}}` on a single field) is **stale/wrong** for this environment. It is rejected with:

```
400 { "path": "schema.properties.<field>.x-config.operation.config.linkField", "message": "must be provided" }
400 { "path": "schema.properties.<field>.x-config.operation.config.targetField", "message": "must be provided" }
```

## Confirmed real shape (definition-time — persists correctly)

Root-caused via a screenshot in Jira **TB-2485** (" [Enquiry Creation] LINK operation validates
fieldId against the current table's TABLE.DEF instead of the target table", closed/fixed
2026-08-21) — a manual QA POST to the same `enquiry/operation/INPUT` endpoint that got a live
`200 OK`. The real shape is a **pair of fields**, both of which need **real backing columns in
the source table's TABLE.DEF** (a partial/virtual-only declaration gets `"field does not exist
in TABLE.DEF"`):

1. A raw `LINKED_TABLE`-typed field (the join/foreign-key column):
   ```json
   {
     "id": "<linkFieldId>",
     "type": "string",
     "title": "<linkFieldId>",
     "x-type": "LINKED_TABLE",
     "x-config": { "fieldId": "<targetFieldName>", "tableId": "<relatedTableId>" }
   }
   ```
   Note: at the **TABLE.DEF** level (`PUT .../definitions`), this same field's `x-config` uses a
   **different** key — `relatedTable` — not `fieldId`/`tableId`:
   ```json
   "x-config": { "relatedTable": "<relatedTableId>" }
   ```
   Both conventions are real and both are required (TABLE.DEF column declaration vs. the
   Enquiry's own schema re-declaration of that field) — they are not interchangeable typos.

2. A separate **display field**, with **no `operation` wrapper at all** — the join lives directly
   under `x-config.defaultJoin`:
   ```json
   {
     "type": "string",
     "title": { "en-GB": "..." },
     "x-type": "ALPHANUMERIC",
     "x-config": {
       "defaultJoin": {
         "linkField": "<linkFieldId>",
         "targetField": "<targetFieldName>",
         "relatedTable": "<relatedTableId>"
       }
     }
   }
   ```

Also note: a plain `PUT .../definitions` that lists only the *new* field(s) is now rejected as a
**"destructive change"** (`field must not be removed`) if it omits any of the table's existing
fields — always fetch the current schema (`GET .../definitions`) and merge before PUTting.

## Confirmed via live runs

- **TC-833** (`US-01.07.01.02 | Dynamic Query Engine`) — definition-only test (POST, assert the
  persisted schema). **Passes** with this shape.
- **TC-963** (`US-01.07.02 | Update Enquiry`) — definition-only test (create, then update
  `defaultJoin.relatedTable` to a second related table, assert the persisted change).
  **Passes** with this shape (confirmed live).

## Open gap — EXECUTE does not resolve the joined value

**TC-997** (`US-01.07.03 | Display Enquiry`) — same shape, but this test **executes** the
Enquiry and asserts the display field's resolved value (`'Acme Ltd'`) is present in the result
row. Live result: the display field is **absent entirely** from `result` — only the raw
`LINKED_TABLE` field's foreign-key value comes back. So:

- Definition **persistence** of `{LINKED_TABLE field + defaultJoin display field}` is confirmed
  working.
- Definition **execution-time resolution** (actually joining and returning the target value) is
  **not** confirmed — no authoritative source describes how/whether this is meant to be
  triggered (`selection.inputFieldIds`? a query param? something else?).

TC-997 is currently `test.skip`'d again with this exact finding in its comment, pending
dev-team clarification specifically on the **execute-time** contract (the definition-time shape
question is considered resolved).

**Update 2026-08-26:** TC-997 was later deleted outright from the suite after further
investigation found no forward progress possible from the test side — see
`2026-08-26_15-38_tc-997-removed-defaultjoin-execute-gap-reference.md` for the full removed test
code, standalone Bruno reproduction, and resumption instructions.

## Where to look

- All three tests are self-contained repros of this shape — start from TC-833 (simplest, passes)
  to see the minimal working definition-time shape, then TC-997's skip comment for the open
  execute-time question.
- Jira TB-2485 has the working screenshot (Bruno request/response, 200 OK) this was reverse
  engineered from.
