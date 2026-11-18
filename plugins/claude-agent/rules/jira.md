# Jira Rules
## Project Management Guidelines

> The framework works with Jira/Confluence **read-only**; these rules describe the format of the text that a role prepares and a human publishes.

Reference for what a correct Epic/Story/AC looks like, used when reading and analysing issues
and when preparing a draft that a human publishes. Examples below use generic placeholders;
the real domain terms are in `docs/project-spec/`.

---

## 1. Issue Hierarchy

```
Epic
└── Story
    └── Task (optional subtask)
```

- **Epic** — a large functional area. One Epic per domain area.
- **Story** — a user-facing capability deliverable in one sprint. Always linked to an Epic.
- **Task** — a technical sub-step inside a Story (e.g., "Create table X", "Write unit
  tests"). Optional.
- **Bug** — defect found after a Story is marked Done.

A correct Story always has an Epic. A correct Bug links to the affected Story or Epic.

---

## 2. Issue Naming

### Epics
Format: `[Domain]: [Short description]`

Example: `Authentication: User Registration & Login`

### Stories
Format: `As a [role], I want to [action] so that [benefit]`

Example: `As an Owner, I want to create a new record so that I can start working with it`

### Tasks
Format: `[Verb] [object]`

Example: `Implement validation in RecordService`

---

## 3. Required Fields per Issue Type

### Epic
| Field | Required | Notes |
|---|---|---|
| Summary | ✓ | Domain-prefixed name |
| Description | ✓ | What this Epic covers |
| Priority | ✓ | |

### Story
| Field | Required | Notes |
|---|---|---|
| Summary | ✓ | User Story format |
| Description | ✓ | Business context |
| Acceptance Criteria | ✓ | Verifiable checklist |
| Epic Link | ✓ | Must be linked |
| Story Points | ✓ | Fibonacci 1, 2, 3, 5, 8; 13 = split before sprint |
| Priority | ✓ | |

### Task
| Field | Required | Notes |
|---|---|---|
| Summary | ✓ | Verb-first |
| Parent Story | ✓ | Must be linked |
| Story Points | ✗ | Optional |

---

## 4. Story Points Scale

Use Fibonacci: 1, 2, 3, 5, 8, 13 (a Story entering a sprint is ≤ 8; see `definition-of-ready.md`)

| Points | Meaning |
|---|---|
| 1 | Trivial change, no unknowns |
| 2 | Small, clear scope |
| 3 | Standard story, well understood |
| 5 | Moderate complexity or some uncertainty |
| 8 | Complex, multiple components affected |
| 13 | Very complex — consider splitting |

If a Story is estimated at 13, it must be split before sprint planning.

---

## 5. Acceptance Criteria Format

Acceptance Criteria are written as a checklist of verifiable conditions. Each item must be
testable.

Example:
```
- Record is created successfully with the given input
- Creator is assigned the Owner role
- Unauthenticated requests return 401
- Invalid input returns 400
```

---

## 6. Priority Levels

| Priority | When to use |
|---|---|
| Highest | Blocks other work or is a critical path item |
| High | Core MVP feature |
| Medium | Important but not blocking |
| Low | Nice to have, post-MVP consideration |

---

## 7. Labels

Use labels to add cross-cutting classification — adapt to what this project actually needs;
these are illustrative, not fixed:

| Label | Meaning |
|---|---|
| `security` | Security-related change |
| `performance` | Performance-sensitive |
| `infrastructure` | Infrastructure work |
| `api` | API-layer change |
| `breaking-change` | Introduces breaking API change |
| `technical-debt` | Cleanup, refactor |

---

## 8. Linking Rules

- Every Story must link to its Epic.
- Stories that depend on another Story must use "is blocked by" link.
- Stories that have a Confluence page must include a link in the description.
- Related architectural decisions must be linked in the Story description.

---

## 9. Workflow States

```
To Do → In Progress → In Review → Done
```

- Move to **In Progress** when development starts.
- Move to **In Review** when PR is opened.
- Move to **Done** only when all Definition of Done criteria are met.

---

## 10. What the Role Checks Before Preparing an Issue Draft

1. Read `rules/definition-of-ready.md` — validate every Story draft against DoR.
2. Search (read-only) for existing Epics — the draft must not duplicate an Epic.
3. Search (read-only) for existing Stories — the draft must not duplicate a Story.
4. The Story draft names its Epic link.
5. One Epic per domain area.
6. Show the draft in the chat; the owner creates the issue in Jira.
