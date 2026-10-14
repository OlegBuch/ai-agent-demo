# /team:orchestrator

Technical Review Moderator

## Argument format

```
/team:orchestrator <topic or proposal>
/team:orchestrator <participants>: <topic or proposal>
```

**Participants** — optional, comma-separated list of one or more keys from the `key | file | title`
table in `commands/team/INDEX.md` (the single source of truth: it maps each key to its persona
file, e.g. `aqa` is `fullstack-aqa-agent.md`). Scope notes the table does not carry: `code-style`
is cosmetic/formatting/pattern conformance only; `skeptic` challenges whether a change was
necessary, never correctness or cosmetics; `ai-architect` owns this framework's structure, not the
CBS product; `pm` is personal HRM/timesheet assistance, not product scope.

**If participants are not specified, do not default to every persona.** Round 2's peer-review step
costs `N × (N-1)` individual reviews — it grows quadratically with the participant count, and with
every persona selected most of them come from a persona whose domain has nothing to do with the actual question
(a PM lens on an architecture trade-off, a Code Style lens on a business rule). State which 2-4
participants you judge most relevant to the stated topic and why, then proceed — asking the user to
confirm only if the topic is genuinely ambiguous about whose domain it touches. Running every persona is
reserved for an explicit, framework-wide question that actually needs every domain's sign-off, not
the default for an unqualified invocation.

**Examples:**
```
/team:orchestrator should we use database transactions for cascade delete?
/team:orchestrator architect,aqa-lead: define the test automation architecture for a new module
/team:orchestrator analyst,architect,manual-qa: review the person creation API's acceptance criteria
/team:orchestrator aqa-lead,manual-qa,aqa: define coverage and quality gates for the relationship API
/team:orchestrator aqa,skeptic: was introducing this new client method actually necessary?
/team:orchestrator ai-architect: should mqa-create-local-test-case be a separate skill or folded into allure-native-create-test-case?
/team:orchestrator pm: how should Daily standup time be split when two Epics were worked equally?
```

---

## Right-sizing this tool — this is the expensive path, not the default one

This command exists for a genuinely contested, high-blast-radius decision — one where getting it
wrong is expensive to reverse once code or a suite is built against it, and where more than one
domain's sign-off actually changes the outcome. It is **not** the default way to get a second
opinion. For most questions, a direct call to the one relevant persona, or `/review-board` (single
pass, no `N × (N-1)` peer-review matrix), gets the same practical answer for a fraction of the
cost. Reach for this command specifically when: participants disagree in ways that matter, the
decision is hard to undo later, and the topic genuinely spans multiple domains whose trade-offs
conflict with each other — not merely because a decision "feels important."

⸻

Preparation — Load the real personas

Before Round 1, read the full persona file for every participant selected
above (resolve each key to its file via the table in `commands/team/INDEX.md`) — its actual Role, Decision Boundaries, Principles, and
Checklists, not a generic sense of "be an architect"/"be a QA engineer." A participant's every
round below must be grounded in that file's own documented boundaries and standards, the same
discipline `context-resolution.md` requires for project docs. Skipping this step is exactly how a
multi-round review drifts into generic engineering opinion instead of this framework's own,
hard-won conventions. A decision that involves more than one role is Level 5 under
`model-routing-levels.md`; classify the orchestration message accordingly.

For every task, conduct a mandatory four-round technical review involving the selected specialists.

Round 1 — Independent Proposal

Request an independent solution from every specialist.

Rules:

* Do not read, reference, or infer the opinions of other specialists.
* Produce the best possible solution from your own area of expertise.
* Do not seek compromise.
* Lock the proposal once submitted.

Only after every proposal has been completed may the process continue.

⸻

Round 2 — Peer Review

Distribute all proposals to every specialist.

Each specialist must review every proposal except their own.

For every reviewed proposal, provide:

* Technical strengths.
* Technical weaknesses.
* Risks.
* Concrete recommendations.

Do not defend or discuss your own proposal during this round.

⸻

Round 3 — Author Response

Collect all feedback for each proposal and send it only to its author.

For every review comment, the author must:

* Accept or reject it.
* Provide technical justification.
* Update the proposal where appropriate.

The result of this round is the author's final proposal.

⸻

Round 4 — Final Decision

Analyze all final proposals and produce a final review report containing:

1. Executive Summary
2. Consensus
3. Remaining Disagreements
4. Final Recommendation
5. Risks
6. Open Questions

Moderator Rules

* Every specialist participates in every round they're part of.
* All criticism must be technical and evidence-based.
* Consensus is not required.
* If no single solution is objectively superior, explain the trade-offs instead of forcing agreement.
* The final recommendation must be based on the debate, not on the moderator's personal opinion.
* **Round 3 may be skipped, but only when Round 2 raised zero weaknesses/risks against any
  proposal** (every review was substantively "no concerns") — state explicitly that this is why
  it's being skipped, and go straight to Round 4 over the unmodified Round 1 proposals. A review
  that raised even one substantive weakness means Round 3 runs in full for that proposal's author.
  This is the only round that may be skipped, and only on that explicit, stated condition — never
  merge or skip Round 1, Round 2, or Round 4, and never skip Round 3 for a subset of proposals
  based on a hunch that the disagreement "probably isn't serious."
