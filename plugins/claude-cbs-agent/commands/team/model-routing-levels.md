# Model-Routing Complexity Levels (1-5)

Companion to `model-routing.md` — `@`-included from it, refining the Gather/Judge/Escalate tiers
defined there with finer-grained, per-message guidance. Read `model-routing.md` first for what
each tier (`haiku`/`sonnet`/`opus`) actually means; this file only adds the 1-5 classification a
persona declares per task message once `hooks/model-routing-classify.ps1` requires it (see that
hook and `hooks/model-routing-check.ps1` for the technical enforcement — this file is the rubric
they enforce, not the enforcement mechanism itself).

Every new-task message, while the session was started by a `team:`/`execution:` command (the hook arms on the `/claude-proj-agent:(team|execution):` prefix), must be
classified against exactly one of the five levels below and declared via:

```
echo proj-model-tier: level=<1-5> tier=<inline|haiku|sonnet|split> reason=<one line>
```

⸻

## Level 1 — Trivial (`tier: inline`)

One fact, one file, one yes/no confirmation — a single targeted lookup, not multi-file
exploration. Stays on the session's own current model. **No forced `Agent` spawn** — the fixed
cost of a fresh subagent context (no benefit from this session's already-warm prompt cache, plus
round-trip latency) outweighs the per-token saving for something this small. This is the same
carve-out `base-agent.md`'s "Delegation & Model Routing" already states: "a single targeted
lookup... is not itself a violation."

Examples: reading one named file to answer "what does X currently say," confirming one config
value, a yes/no check against a single already-open source.

⸻

## Level 2 — Routine Gather (`tier: haiku`)

Multi-file exploration, fetching, context/doc collection, "what already exists" audits — anything
spanning more than one source. **Mandatory** fresh `Agent` call with `model:"haiku"`. Never run by
the session's own reasoning inline — this is exactly `model-routing.md`'s Gather stage.

Examples: scanning `docs/frame-specs/` for every mention of a convention, collecting every file
under a folder before an audit, fetching a ticket's Jira description plus its linked Confluence
page.

⸻

## Level 3 — Mixed: Gather then Judge (`tier: split`)

The task needs both fetching material and rendering a verdict on it. Haiku Gather subagent first,
Sonnet Judge pass second — both steps required, per `model-routing.md`'s "never let the Judge
stage fetch its own context" rule. Declare `tier: split` once, covering both steps of the same
message.

Examples: "review this MR for staleness" (fetch the diff, then judge it), "check if these three
docs still agree with each other" (fetch all three, then judge consistency).

⸻

## Level 4 — Judgment (`tier: sonnet`)

Architecture/design decisions, writing or updating tests, correctness/quality analysis, doc/spec
authoring, review verdicts. This file is the single definition of the **Judge model**: the
session's own current model (expected to be Sonnet), never Haiku, never Opus without the owner's
explicit ask. An isolated `Agent` call with `model:"sonnet"` is fine if isolation is wanted, but never forced.

Examples: designing a new command/persona file, writing a Playwright test, resolving a
Justified/Not Justified challenge, authoring a spec.

⸻

## Level 5 — Cross-cutting / High-stakes (`tier: sonnet`, `opus` only if user-authorized)

Framework-wide restructuring, a decision spanning more than one role, any edit to a shared
convention file (`base-agent.md` itself, this file, `model-routing.md`). Judge model, as defined in Level 4. Opus
is reached only if the user explicitly authorizes it for this specific case, right now —
`model-routing.md`'s existing Escalation tier rule, unchanged by this file: there is no autonomous
path to Opus, ever. The `tier=` vocabulary has no separate `opus` value, so even user-authorized
Opus work still declares `tier=sonnet` in the ack and names the authorization itself in the
`reason=` field.

Examples: restructuring `commands/team/`, changing which personas exist, editing `base-agent.md`.

⸻

## Choosing between levels

When a task straddles two levels, declare the higher one — the classification exists to prevent
under-delegating expensive Sonnet reasoning to a routine gather task, not to find the cheapest
label that technically fits.
