# Model-Routing Convention (Gather → Judge → Escalate)

Framework-wide convention — `@`-included by `base-agent.md` (so every persona inherits it) and by
the `review-pr-commands` family, which was this pattern's original use case. Any command or persona
that spawns subagents follows this file rather than picking a model ad hoc; this is the one place
the tiers are defined.

A command/persona that includes this file spawns subagents via the `Agent` tool, explicitly passing
`model`, regardless of what model the invoking session itself is running. The point of this pattern
is that the model actually switches, not that a cheaper one is merely suggested in a comment.

⸻

## Mandatory per-message classification (5 levels)

Every new-task message, while the session was started by a `team:`/`execution:` command (the hook arms on the `/claude-proj-agent:(team|execution):` prefix), must be
classified against the 5-level rubric in `model-routing-levels.md` and declared via
`echo proj-model-tier: level=<1-5> tier=<inline|haiku|sonnet|split> reason=<one line>`. This is not
advisory: `hooks/model-routing-classify.ps1` (`UserPromptSubmit`) injects the requirement on every
qualifying message, `hooks/model-routing-track.ps1` (`PostToolUse`) watches for the ack, and
`hooks/model-routing-check.ps1` (`Stop`) blocks the turn from ending until it's seen — the same
declare-and-check pattern `delegation-check.ps1`/`closeout-check.ps1` already use for their own
concerns. See `docs/architecture/model-routing-enforcement/2026-09-01-model-routing-enforcement-design.md` for the full
design.

@${CLAUDE_PLUGIN_ROOT}/commands/team/model-routing-levels.md

⸻

## Gather stage — `model: "haiku"`

Spawn one subagent per fetch/read task the calling command/persona's own protocol lists (an MR diff
and commit log, a ticket's goal via the `claude-proj-agent:atlassian-routing` skill (read-only), a convention/doc/reuse-surface file,
raw file/folder contents for an audit). Its prompt states exactly what to fetch and gives it the
paths/commands to do so; its only job is retrieving and condensing that material into one compact
context bundle — file/line references, the ticket's stated goal, the exact convention lines that
apply. It never renders a verdict, never applies a persona checklist, never writes a finding.

Independent gather tasks (e.g. fetching a diff vs. reading a standards file vs. resolving a ticket)
may run as parallel `Agent` calls — there is no ordering dependency between them.

## Judge stage — `model: "sonnet"` (the default for this framework's own reasoning)

Spawn once the Gather stage's bundle(s) are ready. Its prompt carries the bundle plus a pointer to
the exact persona checklist(s)/rule(s) that apply (e.g. "apply `code-style-agent.md`'s own
Line-Level Review Checklist") — never a re-paste of that checklist's bullets, so this stage's prompt
stays short even though its reasoning budget is the expensive one. This stage produces the actual
findings, recommendations, test cases, or resolutions the calling command/persona's Output section
requires. Any work this framework does that renders a judgment — a finding, a challenge, a
Justified/Not Justified resolution, a test case, an architectural recommendation — defaults to this
tier, whether run inline in the current session or delegated to a subagent.

## Escalation tier — `model: "opus"` (disabled by default — user-authorized only)

Opus is never invoked on this framework's own initiative, for any reason, no matter how ambiguous a
case looks or how many Sonnet rounds already failed to converge. There is no autonomous last-resort
path to Opus — that used to exist here and has been removed; a non-converging Sonnet pass (an
adversarial verification loop that didn't settle, two Sonnet judges reaching opposite well-argued
conclusions) is reported back to the user as an unresolved case, not escalated on the agent's own
judgment.

The only way Opus runs is the user explicitly asking for it, in that specific moment, for that
specific case — a standing preference from an earlier conversation does not carry forward, and a
persona/command file may never bake in an automatic Opus fallback. If a user request appears to
authorize Opus for a case, name that request in the subagent's prompt (and in whatever report
reaches the user) as the reason — an Opus call with no cited user request is a routing mistake to
fix, not a safe default to leave in place.

⸻

## Fork vs fresh subagent

Every `Agent` call also needs a second decision, independent of model tier: does the subagent start
fresh (no memory of this conversation) or fork (`subagent_type: "fork"`, inherits this
conversation's full context and always runs on this conversation's own model, regardless of what
`model` tier this file would otherwise route it to)?

**Gather stage — always fresh.** A Gather task is self-contained by construction: its prompt names
the exact file/URL/command to fetch and what to condense from it, per the Gather stage's own
definition above. It needs nothing this conversation already knows, so a fork would only carry
irrelevant context into what should be a cheap, isolated fetch. Spawn a fresh Haiku subagent per
source, never a fork, regardless of how long the current conversation has grown.

**Escalation tier — only relevant once the user has actually authorized it (see above); fresh by
default even then, fork only when the retry genuinely needs the failed attempt's own accumulated
context.** Since Opus never runs without an explicit, in-the-moment user request, this choice only
comes up after that authorization exists. Reaching Opus does not by itself justify a fork — default
to a fresh Opus subagent with the case restated from scratch, since a clean restatement is usually a
better input than a long, possibly circuitous conversation trail. Use a fork instead only when the
retry needs what a clean restatement would lose: the non-converging Judge pass's own reasoning
chain, the exact point where two Judge attempts diverged, or partial progress that would be
expensive to reconstruct from scratch. As with any Escalation-tier call, state in the subagent's
prompt (and in whatever report reaches the user) both the cited user request that authorized Opus at
all, and why a fork was chosen over a fresh restatement, not just why Opus was chosen over Sonnet.

⸻

## Rules

- Never let the Judge stage fetch its own context "for simplicity" — that reintroduces exactly the
  cost profile this pattern exists to avoid. If the Gather bundle turns out to be missing something
  the Judge stage needs, that is a defect in the Gather prompt to fix, not a reason to skip the
  split.
- Every step that renders a judgment stays on the Judge model defined in `model-routing-levels.md`
  (Levels 4-5) — only fetch/summarize work moves to Haiku, and
  Opus is never reached for autonomously regardless of stakes; the cost of a dropped or wrong
  finding is far higher than what running it on a cheaper model would save, but that is an argument
  for careful Sonnet work and honest reporting of unresolved cases, not for self-escalating to Opus.
- The Gather stage's bundle is working context for the Judge stage, not part of the calling
  command's own output — never write it to `docs/` in its own right.
- Heavy multi-file exploration inside *this conversation's own context* (not a subagent at all) is
  itself a smell once it grows past a handful of files — that is exactly the shape of work this
  pattern exists to move into an isolated subagent context instead, per `base-agent.md`'s
  "Delegation & Model Routing".
