Title: [BUG] POST /records/operations/INPUT/accept returns 500 Internal Server Error

Module: Idempotency / Functional Duplicate Detection (US-01.12.03)
Related tickets: TB-2034 (TC-03 automation), TB-1860 (TC-36 - the four-eyes/permission question is still blocked by this bug)
Severity: High - the accept-override feature does not work at all, every call to the endpoint fails
Component: Table Template (system_core) - Execute Accept Override endpoint

Context
After fixing the URL in the Bruno contract (the correct path includes the /records/ segment - see the previous TC-03 question), re-running against the correct endpoint returns 500 instead of the expected 200 (or at least a meaningful 4xx). This is an actual bug, not a behavior/permission question.

Environment
BASE_URL: QA environment (http://qa.proj.local per .env.example; confirm the actual stand URL with QA/DevOps if it differs)
X-Company-Code: MOCK
proj-user-context: mock profile from CI (MOCK_USER_CONTEXT)
Table: dynamically created, classification INT, type USR, spaces [LIV, NAU, HIS]

Endpoint
POST /api/v1/projections/{projectionId}/records/operations/INPUT/accept

Observed projectionId from the error: aqa_int_table_1786013339505_e85~FUNCDUP

Precondition - Table/Projection/Duplicate Config setup

1. POST /api/v1/tables - create a Table (classification INT, type USR, spaces [LIV, NAU, HIS]).

2. Update the Table Definition and create Projection <tableId>~FUNCDUP with schema:
   {
     "type": "object",
     "properties": {
       "ID": { "id": "ID", "type": "string", "title": "ID", "x-type": "ALPHANUMERIC", "x-config": { "maxLength": 64 } },
       "ACCOUNT_NUMBER": { "id": "ACCOUNT_NUMBER", "type": "string", "title": "Account Number", "x-type": "ALPHANUMERIC", "x-config": { "maxLength": 32 } }
     },
     "required": ["ID"]
   }

3. POST /api/v1/tables/{tableId}/duplicate-configs:
   {
     "id": "FUNCDUP_OVR_CFG_<suffix>",
     "matchFields": ["ACCOUNT_NUMBER"],
     "enforcementAction": "OVERRIDE",
     "purgeDays": 5
   }

Steps to reproduce

1. INPUT the first record (establishes the matching hash):
   POST /api/v1/projections/{projectionId}/records/operations/INPUT
   { "recordId": "FUNCDUP_TC03_A_<suffix>", "data": { "ID": "FUNCDUP_TC03_A_<suffix>", "ACCOUNT_NUMBER": "ACC_TC03_<suffix>" } }
   Result: 200, record persisted, hash registered in duplicate_registry.

2. INPUT a second record with the same ACCOUNT_NUMBER (matching hash):
   POST /api/v1/projections/{projectionId}/records/operations/INPUT
   { "recordId": "FUNCDUP_TC03_B_<suffix>", "data": { "ID": "FUNCDUP_TC03_B_<suffix>", "ACCOUNT_NUMBER": "ACC_TC03_<suffix>" } }
   Result: 422 - override info / InputSession is created correctly.

3. Accept the override:
   POST /api/v1/projections/{projectionId}/records/operations/INPUT/accept
   { "recordId": "FUNCDUP_TC03_B_<suffix>" }
   Expected: 200 (record accepted, duplicate_registry now references both records)
   Actual: 500

Actual result

500 Internal Server Error
{
  "detail": "An unexpected server error occurred",
  "instance": "/api/v1/projections/aqa_int_table_1786013339505_e85~FUNCDUP/records/operations/INPUT/accept",
  "properties": null,
  "status": 500,
  "title": "Internal Server Error",
  "type": null
}

Expected result
200 OK, the override is confirmed, the second record is persisted, and the duplicate_registry row now references both records (source_ref contains both recordIds).

Side effect in automation (context only, not part of the bug)
Our HTTP client (BaseApiClient) treats any >= 500 response as a retryable transient error and retries up to 80 times with a 3s delay between attempts (up to ~4 minutes per call before giving up) - that is why the log shows "Retrying in 3000ms... (Attempt 1/80)". We did not wait for all 80 attempts to exhaust for this reproduction - happy to re-run and attach the full log with the final attempt/timings if needed.

What we need from the developer

1. Server-side stack trace/logs for the request identified by "instance" (or by timestamp) - what exactly failed on the server side.

2. Confirmation: is this a regression from simply hitting the correct /records/ path for the first time (i.e. this code path was never actually exercised before), or a bug in the accept-override business logic regardless of the path?

3. Once fixed, this same chain needs to be re-run again: the TC-36 (TB-1860) question - four-eyes vs. permission-check - is still unanswered, because both reproduction attempts so far have hit transport-level bugs (first a wrong URL, now a 500), never the actual business-logic check.

Developer's answer
(to be filled in once received)
