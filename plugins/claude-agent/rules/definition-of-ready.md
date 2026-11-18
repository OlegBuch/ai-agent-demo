# Definition of Ready (DoR)
## Criteria for a Story to Enter a Sprint

The example below uses a generic domain; this project's actual entities/roles are in
`docs/project-spec/`.

---

A Story is **Ready** when a developer can pick it up and start immediately without needing to ask clarifying questions.

---

## Checklist

### Clarity
- [ ] The Story is written in user story format: *As a [role], I want to [action] so that [benefit]*
- [ ] The business value is clearly stated
- [ ] The scope is unambiguous — it is clear what is included and what is not

### Acceptance Criteria
- [ ] At least 3 Acceptance Criteria are defined
- [ ] Each criterion is verifiable and testable
- [ ] It is clear how to test each criterion

### Technical Readiness
- [ ] All dependencies on other Stories are identified and linked with "is blocked by"
- [ ] The relevant API endpoints are defined (or a reference to the API Design doc exists)
- [ ] The data model impact is understood
- [ ] No open architectural questions block implementation

### Scope
- [ ] The Story is small enough to complete in one sprint (≤ 8 Story Points)
- [ ] Stories estimated at 13 SP must be split before entering the sprint

### Links
- [ ] The Story is linked to an Epic
- [ ] If a related Confluence page exists, it is linked in the description
- [ ] If an ADR is relevant, it is linked

### Estimation
- [ ] The Story is estimated in Story Points using Fibonacci scale (1, 2, 3, 5, 8; 13 exists on the scale but is split first, see `jira.md` §4)
- [ ] Priority is set

---

## Examples

### ❌ Not Ready

**Summary:** Implement record update

**Description:** Users should be able to update record data.

*Missing: role context, acceptance criteria, concurrency behavior, API endpoint reference, epic link.*

---

### ✅ Ready

**Summary:** As an Editor, I want to update a record's canonical data so that it stays accurate

**Description:**
Editors and Owners can update canonical fields of a Record entity.
The update must use whatever concurrency-control mechanism `docs/project-spec/` or
`docs/frame-specs/` documents for this project — the client submits the current concurrency
token with the request.

Related: the relevant decision doc, requirement doc, and API spec entry for this operation.

**Acceptance Criteria:**
```
- Successful update applies the change and records history if this project tracks it
- Submitting a stale concurrency token returns a conflict response, record unchanged
- Unauthenticated request returns 401
- A role without permission attempting an update returns 403
```

**Epic:** Record Management
**Story Points:** 5
**Priority:** High
**Labels:** api
