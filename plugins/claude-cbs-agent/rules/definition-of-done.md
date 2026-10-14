# Definition of Done (DoD)
## Criteria for a Story to be Marked Done

The checklist below is structural; every item that references a project-specific convention
(build command, coverage tool, layering rule) points at `docs/frame-specs/` or
`docs/project-spec/` instead of hardcoding one — resolve those before applying this checklist.

---

A Story is **Done** when all of the following criteria are met.
No Story moves to Done unless every applicable item is checked.

---

## Checklist

### Implementation
- [ ] All Acceptance Criteria from the Story are implemented and verified
- [ ] No known bugs introduced by this Story
- [ ] No hardcoded values — constants used where applicable
- [ ] No commented-out code left behind

### Code Quality
- [ ] Code follows the conventions in `docs/frame-specs/coding-standards.md`
- [ ] Methods/functions and classes/modules stay within whatever size limits
  `docs/frame-specs/coding-standards.md` sets, if any
- [ ] No business logic in the boundary (API/UI) layer, per
  `docs/frame-specs/architecture.md`
- [ ] No framework/HTTP-specific types leak into the business/domain layer
- [ ] No datastore-specific types leak outside the persistence layer

### Testing
- [ ] Tests written per `docs/frame-specs/testing-standards.md` for business logic
- [ ] Permission/role enforcement is covered by tests
- [ ] Persistence-layer tests run against a real or realistic instance of the actual
      datastore, not mocks
- [ ] Boundary-layer tests cover request parsing/validation/response mapping
- [ ] Static checks (tsc/eslint/prettier on the touched files) are green; the test was run on the environment the owner named, or the run is UNVERIFIED with the command (`docs/frame-specs/build-and-run.md`; see `commands/team/verification-protocol.md`)
- [ ] No arbitrary sleeps/waits in tests

### Security
- [ ] All operations require authentication, per this project's actual auth mechanism
- [ ] All operations enforce the RBAC model documented in
      `docs/project-spec/access-control.md`
- [ ] No sensitive data in logs
- [ ] Input is validated at the boundary layer

### API
- [ ] API response matches the contract defined in `docs/frame-specs/api-conventions.md`
      (or the project's API spec)
- [ ] Error responses use this project's own standard error format
- [ ] Correct status codes returned, per `docs/frame-specs/api-conventions.md`

### Documentation
- [ ] If a new endpoint/operation is added — the project's API spec is updated
- [ ] If a new domain rule is introduced — `docs/project-spec/` is updated
- [ ] If an architectural decision was made — a decision doc is created, per whatever
      convention this project uses
- [ ] If a Confluence page exists for this feature — the report lists which pages the owner
      should update

### Review
- [ ] Pull Request is opened and peer-reviewed
- [ ] All PR comments are resolved
- [ ] Branch is merged to the main branch
- [ ] No commit, comment, or PR title/description contains any AI/Claude/Anthropic
      self-attribution (see `commands/team/base-agent.md`'s "Commit, Comment & Attribution
      Hygiene") — the `PreToolUse` hook hard-denies only a `git commit` carrying such a line;
      comments and PR text are checked by the role; check the actual merged history, not just
      the last commit

---

## What the Role Checks Before Reporting a Story as Done

1. All items above are checked.
2. Run the static checks (tsc/eslint/prettier on the touched files) and paste the output. Run the test only after asking the owner which environment to use; without that answer the test criterion is `UNVERIFIED` and the report names the exact command to run (`commands/team/verification-protocol.md`).
3. Verify the PR is merged.
4. State in the report which Confluence pages the owner should update, if any.
5. If a new architectural decision was made during implementation, create a decision doc.
