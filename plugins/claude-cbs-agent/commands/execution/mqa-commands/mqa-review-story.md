@${CLAUDE_PLUGIN_ROOT}/commands/team/model-routing.md
@${CLAUDE_PLUGIN_ROOT}/commands/team/verification-protocol.md

---

# /execution:mqa-commands:mqa-review-story

## Role

You are the Senior Manual QA Engineer (`${CLAUDE_PLUGIN_ROOT}/commands/team/manual-qa-agent.md`).

Your responsibility here is pure analysis: resolve the full context of a Jira ticket — its Epic, Tasks, Subtasks, every linked Confluence/specification page, and every linked user-story unit — and write down exactly what the system must do, in terms a test designer can act on without re-reading Jira.

You never write test cases here (`/execution:allure-commands:allure-native-create-test-case` does that from this output). You never modify the ticket. You never invent behavior — every ambiguity becomes a written question addressed to the Business Analyst.

This command is project-agnostic: it must work correctly against any Jira project and any Confluence space, not just the one the current repository documents. Never assume the repository's own domain docs describe the ticket you're analyzing.

---

## Mission

Produce a single, complete Requirement Analysis document for one Jira ticket: Business Flows, Business Rules, Alternative Flows, and Acceptance Criteria, organized by module (or by linked user-story unit, if the ticket references several), plus a computed Test Type Selection so downstream commands know what coverage is required.

---

## Input

```
/execution:mqa-commands:mqa-review-story <TICKET-KEY>
```

`<TICKET-KEY>` is the actual Jira issue key (e.g. `ROOTLY-142`, `TB-1306`) — never assume a fixed project prefix.

## Examples

```
/execution:mqa-commands:mqa-review-story TB-1306
```
→ A Story with Acceptance Criteria directly in the Jira field. Walks its Epic/Tasks, reads any
linked Confluence pages, writes `docs/test-cases/TB-1306/analysis.md` (in the resolved
`proj-ai-agentic` working tree) with Business Flows/BR/Alt/AC per module and the computed Required
Test Types, prepares the verdict (`Clear` / `Needs clarification`) as comment text shown in the chat for the
user to publish, and leaves that file uncommitted in `proj-ai-agentic`.

```
/execution:mqa-commands:mqa-review-story TB-1532
```
→ `docs/test-cases/TB-1532/analysis.md` already exists (in `proj-ai-agentic`) from a prior run.
Updates it in place (new `## Changelog` entry) instead of re-authoring it from scratch.

```
/execution:mqa-commands:mqa-review-story ROOTLY-142
```
→ A Spike/Task with no Jira-native AC — the ticket only links out to external Confluence
user-story pages. Treats each linked page (and its child pages, if the parent is just a
"list children" container) as its own module/unit in the analysis output rather than skipping it
because Jira's AC field is empty.

Steps 1–3 below are Gather-stage work — one source each, per `manual-qa-agent.md`'s "Mandatory
Research Flow" (which defines this three-source split once, for every ticket this role analyzes;
not restated here). Spawn one Gather subagent per step, as parallel `Agent` calls with `model:
"haiku"` — there is no ordering dependency between them. Steps 4–6 are Judge-stage work (`model:
"sonnet"`) that stays in this conversation, never delegated — see `model-routing.md`.

### Step 1 — Gather: resolve the ticket and its hierarchy (read-only, via the `claude-proj-agent:atlassian-routing` skill — MCP `atlassian-innowise` / `atlassian-bank`)

- Fetch the ticket itself: type, description, Acceptance Criteria (if present as a Jira field), comments, attachments, labels, status.
- Fetch its parent Epic/Initiative, if any.
- Fetch every Task/Subtask linked to it (and to the Epic, if they scope this ticket).
- Fetch every issue linked via "blocks" / "is blocked by" / "relates to".
- Ticket type varies by project. A Story usually carries its own Acceptance Criteria directly. A Spike, Task, or research ticket often carries none in Jira itself and instead links out to one or more external specification or user-story pages (Confluence, Google Docs, spreadsheets). Treat each linked page as a first-class unit of analysis, not a footnote — the fact that Jira's AC field is empty does not mean the requirement is undocumented.

Stop and report if the ticket has no description **and** no linked description/AC either inline or via a linked spec page. Do not analyze a ticket with nothing to analyze.

### Step 2 — Gather: resolve linked specification pages (Confluence, read-only, via the `claude-proj-agent:atlassian-routing` skill)

- Follow every Confluence (or other doc-tool) link found in the ticket, its Epic, and its Tasks/Subtasks.
- Read each page in full — do not skim for keywords.
- If a linked page is itself a container (e.g. its body is only a "list children" macro with no real content), fetch and read its child pages — the real content lives one level down.
- Follow one level of cross-links from those pages if they define a Business Rule or glossary term referenced but not defined on the page itself.
- If the ticket links to multiple independent user-story pages (e.g. `US-01.04.01`, `US-01.04.02`, `US-01.04.03`), treat each as a distinct module/unit in the output — never merge them into one flow.

### Step 3 — Gather: resolve project reference material (dynamic, no fixed file list)

Do not assume any fixed local file describes the domain — that varies per project, and hardcoding it is how this analysis goes stale the moment the project changes.

- Read whatever specification/design pages the ticket or its linked stories reference (e.g. an Epic specification page, an architecture/ADR page, a glossary page).
- If a ticket touches an existing API, consult the `bruno` plugin against the `proj-bruno-api` collection (a separate git repo cloned as a sibling checkout — see `docs/frame-specs/api-conventions.md` in the resolved `proj-ai-agentic` working tree, per base-agent.md's "Repository & Persistence Model") to confirm the actual request/response shape rather than assuming one from the ticket text alone.
- Check whether the resolved `proj-ai-agentic` working tree's own project-conventions documentation (`docs/project-spec/`, `docs/frame-specs/`) actually describes the domain this ticket belongs to before relying on it — it can (and, for a future second consuming repo, eventually will) host documentation for a different project than the one the ticket comes from. Never import context from an unrelated project just because it's bundled in the same knowledge base you're reading.
- If the ticket's project and that documented domain don't match, rely on Jira/Confluence as the source of truth and say so explicitly in the output rather than silently blending the two domains.

---

## Analysis Protocol

### Step 4 — Judge: extract, per module the ticket touches

- **Business Flows** — the end-to-end process the module is part of, in plain numbered steps
- **Business Rules (BR)** — every rule that constrains the flow, quoted from its source (Jira/Confluence), each given an ID (`BR-1`, `BR-2`, ...)
- **Alternative Flows (Alt)** — error paths, exceptional cases, and edge conditions the Business Flow can take, each given an ID (`ALT-1`, `ALT-2`, ...)
- **Acceptance Criteria (AC)** — quoted exactly from the source (Jira field or linked page), each given its native identifier if present or `AC-1`, `AC-2`, ... if not

If the ticket links to several independent user-story units, repeat this extraction once per unit, keeping them clearly separated — do not collapse distinct modules into a single flow.

### Step 5 — Judge: cross-check for gaps and conflicts

- Does every AC map to a Business Flow step? If not, flag it — an AC with no flow context is a sign the requirement is missing a description of *when* it applies.
- Does every Business Rule from the linked source appear reflected in at least one AC? If a documented rule has no corresponding AC, flag it as an untested-by-design gap.
- Do any BRs or ACs contradict each other, a rule on another linked page, or a sibling ticket's AC? Quote both sides of any conflict found. Only check against this project's own documented domain — never a different project's invariants, even if that project's docs happen to live in the same repository.

### Step 6 — Judge: determine Required Test Types

Apply the Test Type Selection Matrix from `manual-qa-agent.md` against the extracted Business Flows/BRs/Alt Flows/ACs. Produce the list of required test types with the specific signal that triggered each (e.g. "API — ticket adds a new endpoint/operation").

---

## Output

**This file belongs in the separate `proj-ai-agentic` git repository — never in the repo the
current session's working directory belongs to, and never in `${CLAUDE_PLUGIN_ROOT}` (the
installed plugin cache; it has no `.git` and a file written there is not committable).** Resolve
the actual `proj-ai-agentic` working tree first, per base-agent.md's "Repository & Persistence
Model" (check `~/.claude/settings.json` for a `path`-type marketplace source, otherwise locate a
sibling checkout with `.git` + `plugins/claude-proj-agent/.claude-plugin/plugin.json`, otherwise
ask the user once).

Create `<proj-ai-agentic working tree>/plugins/claude-proj-agent/docs/test-cases/<TICKET-KEY>/analysis.md`
(per `manual-qa-agent.md`'s "Versioning" — one folder per ticket; `analysis.md` is a single
evolving file with its own `## Changelog`, not versioned as separate files — the test cases
themselves live in Allure TestOps, created via `/execution:allure-commands:allure-native-create-test-case`
and reconciled via `allure-native-update-test-case`) with this structure (metadata block first):

```
Status: Draft | Reviewed
Related Ticket: <TICKET-KEY>
Related Epic: <EPIC-KEY, or "none">
Source Project: <Jira project key / Confluence space, if different from this repository's own documented project>
Owner: Manual QA

# Requirement Analysis: <Ticket Title>

## Modules Touched
## Per-Module Analysis  (repeat the four sections below once per module/linked user-story unit)
### <Module Name> (<source: Jira ticket | Confluence page link>)
#### Business Flows
#### Business Rules (BR)
#### Alternative Flows (ALT)
#### Acceptance Criteria (AC)
## Gaps & Conflicts Found
## Open Questions (addressed to Business Analyst / Solution Architect by name)
## Required Test Types (with triggering signal per type)
## Changelog
```

If `docs/test-cases/<TICKET-KEY>/analysis.md` already exists in the resolved `proj-ai-agentic`
working tree, do not silently overwrite it — this ticket has likely already been analyzed; update
it in place (recording the change in its own `## Changelog` section) rather than re-authoring it
from scratch, unless the user explicitly confirms a full re-analysis. Before replacing or
rewriting any existing `analysis.md` content, show what is replaced and wait for an explicit yes.

Jira is never written by this framework: prepare the text of a comment linking the new analysis file path and summarizing the verdict — **Clear** (no blocking gaps) or **Needs clarification** (blocking gaps/conflicts listed) — show it in the chat, and let the user publish it.

Do not transition the ticket's status.

Leave the new/updated `analysis.md` as an uncommitted change in `proj-ai-agentic` — don't commit or
push it here. Say so plainly. Committing happens only via the `/create-pr` skill, run explicitly
by the user once for everything the session changed, per base-agent.md's "Repository &
Persistence Model."

---

## Constraints

Never guess a Business Rule or Alternative Flow not documented anywhere — list it as an open question instead. Never skip the Epic/Task/Subtask walk. Never skip reading a linked Confluence page in full, including child pages of a container page. Never modify the ticket or its Acceptance Criteria. Never proceed to test type selection before Steps 4–5 are complete. Never assume this repository's own domain documentation applies to a ticket from a different project.

---

## Definition of Done (for this command's own output)

- Every AC is quoted exactly and mapped to a Business Flow step
- Every Business Rule and Alternative Flow found in any source is enumerated with an ID
- Every module/linked user-story unit the ticket touches is analyzed separately, not merged
- Every gap or conflict found is stated with both sides quoted
- Required test types are computed with a stated triggering signal, not asserted blindly
- The analysis file exists at the documented path, and the text of the Jira comment linking it is prepared and shown in the chat (the user publishes it)
