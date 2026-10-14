# AI Architect: framework knowledge-base restructure, context-engineering audit, closeout hook, and architecture diagrams

**Date/time:** 2026-08-18 22:23 · **Branch:** N/A (framework/meta work, no consuming-repo branch) · **Ticket(s):** None — this session is entirely AI Architect meta-layer work on `proj-ai-agentic` itself, not a CBS ticket

## Discussed

A single long session, invoked as the AI Architect persona, that moved through several
connected asks from the user, roughly in this order:

1. Reorganize `docs/questions/` (a flat `currency`/`Idempotency` dump) into a real per-module,
   per-story knowledge base, plus a separate cross-cutting `docs/common-issues/` — so a role
   doing repeat work on a module stops re-discovering the same facts/incidents.
2. A deeper ask: analyze `proj-ai-agentic` for context-engineering best practices (the user was
   seeing roles "forget" context, burn too many tokens, and lose track of hard-won detail) and
   apply them — citing Anthropic's own published guidance rather than general instinct.
3. A follow-up "is it now actually optimized / a project we can be proud of" — an explicit
   request to *verify*, not just assert, which surfaced two more real structural gaps.
4. A request specifically about `fullstack-aqa-agent`, `aqa-lead-agent`, `architect-agent` (the
   user's most-used personas): make them hold whole-module context and "predict like a
   veteran" — not just read facts.
5. A separate, sharper complaint: **every** persona still carries CBS/Bruno-specific hardcodes,
   which breaks the stated goal of personas being portable "like a person" with all
   project-specifics resolved from `docs/` — a second, broader portability sweep beyond the
   narrow Bruno-only pass from earlier in the session.
6. "Do we always actually run the docs-closeout step, or does it get forgotten?" → the user
   asked for a *technical*, not prompt-only, guarantee ("делать всё серьёзно") — this became a
   real Stop/PostToolUse hook pair.
7. "Does our role/orchestration architecture itself follow Claude's own best practices?" →
   fetched and mapped the actual architecture against Anthropic's "Building Effective Agents"
   and "How we built our multi-agent research system," which surfaced a concrete, user-confirmed
   pain point: `/team:orchestrator` is too expensive to use in practice.
8. Finally, a request for a comprehensive architecture diagram (`README_ARCHITECTURE.md`,
   Mermaid), iterated twice after the user reported diagrams were too small/cramped to read and
   then that diagram 1 had literally overlapping text.

## Implemented

**Module/cross-cutting knowledge base** (new structure, replaces `docs/questions/currency` and
`docs/questions/Idempotency`):
- `docs/module-theory/Currency Definition and Logic/INDEX.md`, `US-01.13.01/README.md`,
  `US-01.13.02/README.md` — split from the old single `docs/questions/currency/README.md`.
- `docs/module-theory/Idempotency/INDEX.md` + `US-01.12.03/` (5 files `git mv`'d from
  `docs/questions/Idempotency/`).
- `docs/common-issues/INDEX.md` + `auth-operation-required.md` (consolidated from duplicated
  content that had drifted into both `frame-specs/api-conventions.md` and
  `frame-specs/testing-standards.md`).
- Both `Currency`'s and `Idempotency`'s `INDEX.md` later got a **"Patterns & Predictive Rules"**
  section — generalized, falsifiable rules distilled from the incidents already on file (e.g.
  "identity-defining fields lock permanently once LIV," "a daemon-fed table always rejects direct
  INPUT"), not just a restatement of the incidents.
- `docs/questions/framework-updates/` was deliberately left alone (not a module, not
  cross-cutting — `proj-test-automation`'s own code-duplication audits).

**Context-engineering trim** (measured with real line counts, not vibes):
- `commands/team/base-agent.md`: 360 → 139 lines. Cut generic engineering-quality boilerplate
  already covered by the host system prompt (Security/Quality/Documentation/Architecture
  Standards, Self Review, Output Requirements); kept only what's actually framework-specific
  (Repository & Persistence Model, No-AI-Attribution, Professional Disagreement).
- `commands/team/model-routing.md`: promoted from `commands/execution/review-pr-commands/` to
  `commands/team/`, `@`-included by `base-agent.md` (so all 9 personas inherit it, not just
  `review-pr-commands`); added an explicit **Opus escalation tier** (last resort only, named
  case, never default) per the user's specific request.
- `commands/team/context-resolution.md`: rewrote the "read `docs/project-spec`/`frame-specs`"
  guidance from implicit-whole-folder to explicit just-in-time (read the folder's own
  `INDEX.md`/`README.md` first, then only the specific file needed); added a **"Task Closeout
  Protocol"** section (a named, checklist-style, mandatory-language version of the
  previously-scattered "update docs as you go" advisory prose); added a **compaction** rule for
  `module-theory`/`common-issues` so they don't become the next context-bloat problem; amended
  the module-read guidance to distinguish narrow ticket-scoped reads from deep
  architecture/lead-level reads (which should load the *whole* module folder).
- `manual-qa-agent.md`: found and removed a real 5x self-repetition (the same granularity/
  atomicity hard rules restated near-verbatim across Principles, two Checklists, and
  Anti-Patterns) — checklists now point back to the one canonical rule instead of re-explaining
  it (594 → 572 lines, but the real win was removing duplication risk, not raw line count).
- `architect-agent.md`, `aqa-lead-agent.md`, `fullstack-aqa-agent.md`: added an explicit
  Task-Closeout reinforcement right before `## Task` (highest-recency placement), plus a
  "Patterns & Predictive Rules — use it actively" instruction tailored to each role.

**Portability sweep** (two passes):
- Pass 1 (narrow): fixed hardcoded `Bruno`/`proj-bruno-api` mentions in
  `skeptic-agent.md` (×3), `code-style-agent.md`, `fullstack-aqa-agent.md`,
  `manual-qa-agent.md` — reframed as "this project's current API contract source, resolve fresh
  per `docs/frame-specs/api-conventions.md`."
- Pass 2 (broad, after the user's follow-up complaint): fixed `ai-architect-agent.md`'s own
  hardcoded `proj-test-automation`/"CBS product" mentions (ironic, since this is the
  domain-agnostic meta-role) — now says "the consuming repo" / "the product domain," generic;
  reframed `manual-qa-agent.md`'s CBS-specific example module names (`Table Registry`, `Product
  Factory`) as explicitly-labeled illustrative examples, not the format itself.
- Identified, but deliberately did **not** try to fix with prose, a deeper Tier-2 gap: the actual
  *executable* pipeline (`allure-commands/`, `aqa-automate.md`) is genuinely Allure/Playwright-
  specific, not just described that way — documented this explicitly in
  `commands/execution/INDEX.md` and wired it into `bootstrap-project.md`'s Portability Risk
  Report as its own tier, per the user's "leave as-is, but document it" decision.

**New capability**: `commands/bootstrap-project.md` — a `/bootstrap-project` utility skill that
analyzes a brand-new consuming repo and populates `docs/project-spec/`/`docs/frame-specs/` from
real evidence (never overwriting real existing content, never inventing an unsourced claim),
plus a two-tier Portability Risk Report (prompt-text hardcodes vs. executable-layer coupling).

**Real technical enforcement (not prompt-only)** — `hooks/closeout-lib.ps1` (shared helpers,
resolves the `proj-ai-agentic` tree via the same sibling-directory heuristic as `base-agent.md`),
`hooks/closeout-track.ps1` (`PostToolUse` on `Write|Edit|Bash`: increments a per-session counter
on any edit outside `proj-ai-agentic`'s own `docs/`, resets it on a `docs/` edit or an explicit
`echo proj-closeout-ack: <reason>` Bash escape hatch), `hooks/closeout-check.ps1` (`Stop`: blocks
the turn with an actionable message while the counter is non-zero). Registered in
`hooks/hooks.json` alongside the pre-existing `classify-http-readonly.ps1` (the same "prompt-only
rule already failed once" precedent). **Pipe-tested exhaustively and all scenarios passed**
(increment → block → docs-edit reset → allow; ack-command reset → allow; untouched session →
allow) — see verification transcript earlier in this session. Live-fire in the running session
did not activate (plugin hooks load at session start; this session had already loaded the old
`hooks.json`) — **not yet confirmed live**, needs a fresh session to verify.

**Architecture audit against Anthropic's own published guidance** (fetched
`anthropic.com/engineering/building-effective-agents` and `.../multi-agent-research-system`
directly): found real, precise matches (prompt chaining = the QA pipeline, voting = Orchestrator
Round 1, evaluator-optimizer = Skeptic's adversarial loop, cheap-gather/expensive-judge =
`model-routing.md`) and one concrete, user-confirmed gap — **no effort-scaling**.
`orchestrator.md` ran a fixed 4 rounds regardless of question complexity, and defaulted to all 9
participants when none were specified, making Round 2's peer-review cost `N × (N-1)` (72
reviews at N=9). Fixed: removed the all-nine default (now names 2-4 relevant participants and
why), added a "Right-sizing this tool" section stating plainly this is the expensive path,
allowed a narrowly-scoped Round 3 skip (only when Round 2 raised zero weaknesses, stated
explicitly when used). Added a decision table (single persona → `/review-board` → `/team:
orchestrator`) to `commands/team/INDEX.md` and a short cross-reference in root `README.md`.

**Self-correction found and fixed mid-session**: while auditing `plugin.json`'s
`dependencies[]` for unused entries, initially removed 6 (`proj-use-cases`, `proj-devops`,
`bluedot`, `tech-writer`, `spotless`, `notebooklm`) based on zero prose mentions in
`commands/`/`docs/`/`rules/` — then discovered, while separately updating hooks documentation,
that root `README.md`'s own `bank-proj-marketplace` catalog table lists all 6 as real,
deliberately user-invoked (`on request`) capabilities the grep-only test couldn't see. **Restored
all 6** (net diff on `plugin.json` is now zero) and corrected the Framework Health Checklist item
in `ai-architect-agent.md` itself to require checking the README catalog table, not just
`commands/`/`rules/` prose, before calling a dependency unused.

**`README_ARCHITECTURE.md`** (new file, linked from root `README.md`) — 7 Mermaid diagrams:
repository/persistence topology, an include-graph-turned-table (a many-to-many "who includes
what" relation reads better as a table than a line graph — switched after user feedback),
persona collaboration graph (grounded in each persona's actual `Collaboration` section, not
invented), the QA pipeline with its `Status: Approved` checkpoint, `/review-board` vs.
`/team:orchestrator` cost comparison (including a literal N=3→6-review fan-out diagram to make
`N×(N-1)` concrete), the MR-review lens architecture with Gather/Judge/Escalate, and the
closeout-hook state machine. Published as a Claude Artifact
(`https://claude.ai/code/artifact/baa1c079-c4e7-49f2-8248-0bd05b70aa13`), then revised twice
after user feedback: (1) text too small — added `%%{init: {'themeVariables': {'fontSize':
'22px'}}}%%` to every diagram and shortened all node/edge labels, moving explanation into prose
captions; (2) diagram 1's text literally overlapped — root cause was Mermaid subgraphs
containing exactly one child node, plus edges targeting both a subgraph's boundary and a member
node inside it in the same diagram; fixed by flattening diagram 1 to plain nodes (no subgraphs)
and removing one conflicting edge in diagram 3.

## Learned

- **Anthropic's context-engineering and multi-agent-design articles map cleanly onto this
  framework's actual shape** — prompt chaining, routing, parallelization (voting/sectioning),
  orchestrator-workers, and evaluator-optimizer all have a real, named counterpart already built
  here. This is a durable fact worth citing again in a future framework audit rather than
  re-deriving; the two source URLs are in this file's own "Discussed" trail if re-fetching is
  ever needed. *(Durable framework-design fact — belongs in `ai-architect-agent.md`'s own
  Framework Stewardship Principles as precedent, not just this log; flagged, not yet moved
  there.)*
- **Grepping `commands/`/`rules/` prose is not sufficient evidence a `plugin.json` dependency is
  unused** — several are meant for direct human invocation and only appear in root `README.md`'s
  marketplace catalog table. Already folded into `ai-architect-agent.md`'s own Framework Health
  Checklist this session (see Implemented above) — recorded here for the narrative, not as an
  outstanding doc gap.
- **Mermaid subgraphs with exactly one child node are worse than no subgraph** — they invite an
  external edge to target the subgraph boundary while a sibling edge targets the one child inside
  it, which is what actually caused the diagram 1 text-overlap bug. General rule for future
  diagrams in this repo: don't wrap a single node in a subgraph just to add a label; use the
  node's own label instead.
- **`Stop` fires after every assistant turn, not at literal session end** — a naive
  always-block-on-any-uncleared-edit design would have interrupted normal multi-turn work
  constantly. The `PostToolUse`-counter + `Stop`-check-only-when-nonzero design avoids this
  because ordinary conversational turns with no product-repo edits never trip the counter in the
  first place.
- **Plugin-provided hooks (`hooks/hooks.json` inside a plugin) load at session start, not
  on-the-fly** — editing `hooks.json` mid-session doesn't activate new entries in that same
  session; needs a restart/fresh session to confirm live. This is a real, unresolved
  verification gap, not a confirmed-working feature yet (see Open Items).

## Open Items / Follow-ups

- **Closeout hook not yet confirmed live** — pipe-tests all passed, but real in-session firing
  was never confirmed (needs a fresh Claude Code session with the updated `hooks/hooks.json`
  actually loaded). Next session should verify: make a real edit to a non-scratchpad,
  non-`proj-ai-agentic` file, then check whether the `Stop` hook actually blocks without a
  closeout.
- **Architecture-audit "self-improvement loop" and "formal evaluation" gaps named but not
  closed** — no rubric-graded evaluation harness exists for persona output quality (no held-out
  query set, no LLM-as-judge scoring), and there's no equivalent of
  `review-pr-distill-patterns.md` for auditing *persona* effectiveness over time (only for
  `frame-specs` drift from MR reviews). Flagged to the user as real, unaddressed gaps — no
  decision yet on whether/how to close them.
- **The Tier-2 portability gap (Allure/Playwright baked into the executable command layer, not
  just persona prose) is explicitly accepted as-is**, per the user's own decision — not an open
  question, just worth remembering it's a real, load-bearing constraint the next new-project
  bootstrap will hit.
- **`CLAUDE.md`'s pre-existing "Architecture Note"** (docs/rules scoped to one consuming repo,
  generalization deferred until a second one shows up) was noticed mid-session and is directly
  relevant to `bootstrap-project.md`'s design — worth a deliberate read-through before that
  command is ever actually run against a second consuming repo.
- **README_ARCHITECTURE.md should be spot-checked once more** after this session's two rounds of
  Mermaid fixes — the user had not yet confirmed the second (overlap) fix looked right at the
  time this summary was written.

## References

Artifact: `https://claude.ai/code/artifact/baa1c079-c4e7-49f2-8248-0bd05b70aa13`
(`README_ARCHITECTURE.md`). Anthropic sources fetched this session:
`https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents`,
`https://www.anthropic.com/engineering/building-effective-agents`,
`https://www.anthropic.com/engineering/multi-agent-research-system`,
`https://code.claude.com/docs/en/best-practices`. No Jira/Allure links — this session touched no
CBS ticket.
