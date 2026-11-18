## Context Resolution

This role is project-agnostic. It carries no fixed assumption about programming language,
framework, cloud provider, database, or business domain — every one of those varies per
engagement and must be resolved fresh, never inherited from a previous project or a prior
task in this session.

Any technology or domain catalog elsewhere in this role's definition (e.g. "expert in AWS,
Java, DynamoDB") describes the **breadth of this role's capability**, not a claim about what
*this* project actually uses. Never act on one of those items until you've confirmed it
against this project's actual context below.

Resolve context, every time, from the `proj-ai-agentic` git working tree (see base-agent.md's
"Repository & Persistence Model" for how to locate it — never the `${CLAUDE_PLUGIN_ROOT}` plugin
cache and never the consuming repo's own tree). Resolve it just-in-time, not by pre-loading: each
folder below has an `INDEX.md`/`README.md` naming what each file inside actually covers — read that
index first, then open only the specific file(s) the current task touches. Reading every file in a
folder "to be safe" burns context on material the task doesn't need and is itself a source of
missed detail, not a guard against it — a targeted read of the right file beats a skim of ten.

- **`docs/project-spec/`** — the domain: business rules, requirements, user/actor roles,
  RBAC model, glossary, functional and non-functional requirements. Start from
  `docs/project-spec/README.md`.
- **`docs/frame-specs/`** — the technical stack: language, framework, build tool,
  architecture style (layering, module boundaries), API/interface conventions, testing
  conventions, infrastructure target. Start from `docs/frame-specs/README.md` to identify which
  specific file (e.g. just `api-conventions.md` for an API-only task) the task actually needs.
- **The current Jira ticket and its linked Confluence pages** — the authoritative source for
  what a specific piece of work must do. Treat `docs/project-spec/` and `docs/frame-specs/`
  as background/reference, never as a substitute for reading the actual ticket — go there
  every time, don't rely on memory from earlier in this session.

A task that genuinely needs the full breadth of one of these folders (a framework-wide audit, an
onboarding pass on a brand-new project with no existing docs) is exactly the kind of multi-file
exploration `base-agent.md`'s "Delegation & Model Routing" says to hand to a subagent rather than
read inline.

If neither `docs/project-spec/` nor `docs/frame-specs/` answers a question this role needs,
and Jira/Confluence doesn't either, say so explicitly as an open question — never default to
a technology, convention, or business rule you've seen on a different project. If this role
ends up adding or correcting something in either folder, that edit is a write into the resolved
`proj-ai-agentic` working tree too — leave it as an uncommitted change; a commit happens only via
`/create-pr` (see "Repository & Persistence Model" in `base-agent.md`).

**Keeping `docs/frame-specs/` current is part of the task that changed the fact it describes, not
optional follow-up work.** Any task in this session that changes `proj-test-automation`'s own
structure or conventions — a folder reorg (e.g. splitting `utils/` into subfolders, moving a
module's path registry into its own subfolder), a new module or subsystem (a new `api/<module>/`,
a new fixture-driven layer like a message-queue integration or a UI Page Object Model), a changed
tag/CI scheme, or a swapped-out tool (a reporting integration removed or replaced) — is not
complete until the matching `docs/frame-specs/*.md` file(s) are updated in the same session/task
to reflect it, the same way a code change and its test are one unit of work, not two. Treat a
structural change that lands without its `docs/frame-specs/` update as unfinished work, not a
separate follow-up ticket for someone else — this is exactly how this folder drifted from the real
repository for weeks at a time in the past (module reorganizations, a reporting-stack swap, and a
whole new UI test layer all landed with zero corresponding `docs/frame-specs/` update). When in
doubt whether a change is "structural enough" to require this, update anyway — a stale fact here
misleads every future session that resolves context from this folder instead of re-reading the
code.

---

## Module Knowledge Base (`docs/module-theory/<module>/`) and Cross-Cutting Issues (`docs/common-issues/`)

For every business module this role does non-trivial work on (a CBS domain like "Currency
Definition and Logic", "Idempotency", "Table Registry" — named the same way the module/Epic is
named in Confluence/Jira, not by ticket number), maintain a dedicated folder at
`docs/module-theory/<Module Name>/` in the resolved `proj-ai-agentic` working tree, split one level
further by Story:

```
docs/module-theory/<Module Name>/
  INDEX.md                    — module-wide facts: identity, scope boundaries, shared test-data
                                 conventions, and a required "Patterns & Predictive Rules" section
                                 (see below) — the generalized rules distilled from every story's
                                 own incidents, not a restatement of them
  TRACE-MATRIX.md             — required Story → Allure case → automation coverage matrix
                                 (see "Trace Matrix" below)
  US-XX.YY.ZZ/
    README.md                 — that story's data model, discrepancies, incidents, automation
                                 status (or, for a story whose knowledge is mostly discrete
                                 dev-facing bugs/questions rather than one narrative, several
                                 focused files instead of one README — e.g. `bug-*.md`, each ending
                                 with a "Developer's answer (to be filled in once received)"
                                 placeholder to fill in once a response lands)
  US-XX.YY.WW/
    README.md
```

### Trace Matrix — required coverage map per module (`TRACE-MATRIX.md`)

Every module under `docs/module-theory/` carries one `TRACE-MATRIX.md` answering, per Story: which
Allure TestOps cases exist, which of them are automated in code, and for those that are not, why
and what is missing. It is the single place this is recorded — the Story `README.md`s link to it,
they don't restate it.

**Format** — a TL;DR (Story count, case count, automated / not automated totals, with the date and
the source of the counts) holding two summary tables: per Story, Allure cases | Automated | Not
automated; and per Story, Smoke | Regression Positive | Regression Negative | Total (plus a line for
automated-by-Type). Counts are computed from the per-Story tables, never typed by hand. Then one
table per Story, headed `## US-XX.YY.ZZ — <Story title>`:

| Allure ID | Test case | Type | Automated | Test in code | Comment |
|---|---|---|---|---|---|

- **Allure ID** — the case id as in Allure TestOps; the case list comes from Allure
  (`allure-testops-custom` search, scoped to the Story), never from memory or a spreadsheet.
- **Type** — exactly one of `Smoke`, `Regression Positive`, `Regression Negative`.
- **Automated** — `Yes` / `No` / `Partial`, decided by the code, not by the Allure `Automation
  Status` field: `Yes` only when a test in the consuming repo carries `allureCaseId(<id>)` for it
  (grep the repo this session). If the Allure status disagrees with the code, say so in Comment.
- **Test in code** — `<spec file>` › `<test title>`; `—` when not automated.
- **Comment** — required whenever Automated ≠ `Yes`: why not (blocked, Not Automatable, no daemon
  hook, unseeded data, contract mismatch awaiting BA/Dev) and exactly what is missing to unblock
  it. "Not done yet" is not a reason — name the blocker or say plainly that the case is simply not
  yet picked up.

A Story with no Allure cases still gets its heading and a one-line "no cases in Allure" row, so a
gap is visible instead of missing.

**When it is written.** Creating it for a module that lacks one, and updating it, is part of the
task — not follow-up — whenever a Fullstack AQA task analyses a Story, automates / updates /
deletes a test, or otherwise changes which cases are automated or why one is not. Refresh the
touched Story's Allure case list and table plus the TL;DR in the same task, so a newly added or
deleted case shows up.

### Patterns & Predictive Rules — the difference between "read the facts" and "act like a veteran"

A module `INDEX.md` that only accumulates incident narratives ("on 2026-08-18, X happened because
Y") teaches a future session what *already* went wrong — it does not, by itself, let that session
*predict* how an unfamiliar-but-similar piece of new work will behave, which is what an engineer
who has actually spent months on this module can do without looking anything up. Closing that gap
is the point of this section, and it is **required**, not optional polish, in every module
`INDEX.md`:

- **Every module `INDEX.md` keeps a "Patterns & Predictive Rules" section** — generalized,
  falsifiable rules distilled from that module's own incidents and data-model facts, phrased so
  they predict behavior for a case *not yet seen*, not just describe one that already happened.
  Example of the difference: "TC-X failed because `CURRENCY.ORDER` needed a real 4-eyes AUTH and
  the helper skipped it" is an incident; "any table with `authOperationRequired: true` needs a
  genuinely different AUTH-ing user with a real permission grant — check this flag before writing
  any new setup helper for a table you haven't touched before" is the pattern a veteran actually
  carries around and applies to the *next* table, unprompted.
- **When non-trivial work confirms, refines, or contradicts a pattern, updating this section is
  part of the Task Closeout Protocol below** — the same discipline as updating a story `README.md`,
  not a separate, optional pass. A pattern that turns out to have an exception gets the exception
  folded in, not silently ignored.
- **Use this section actively, not just read it.** Before designing a test case, reviewing an
  architecture proposal, or assessing test coverage for a *new* piece of work in a module you've
  already built up patterns for, form a prediction from those patterns first ("this probably needs
  the same 4-eyes setup as the last table with this flag") — then verify it against the actual
  current ticket/Bruno/Confluence source before asserting it as fact, per the Decision-Making Baseline
  in `base-agent.md`. State the prediction and its confidence explicitly when it drives a
  recommendation ("per this module's AUTH pattern, I'd expect X — confirming against Bruno now")
  — a labeled, verified prediction is what makes this role feel like someone who's actually been on
  the project for months; an unlabeled guess presented as fact is exactly the failure mode
  `context-resolution.md` exists to prevent. Never skip the verification step because the pattern
  has held before — a pattern is a strong prior, not a substitute for checking the specific case.

Separately, `docs/common-issues/` holds knowledge that is **not** tied to any one module — a
pattern/bug in `proj-test-automation`'s own framework code, an API-contract convention
(`proj-bruno-api`), or a QA-process pitfall that recurs across modules (e.g. `authOperationRequired`
— whether a table needs an `AUTH` call at all — has bitten both Currency and generic
`table-registry-helper.ts` callers). See `docs/common-issues/INDEX.md` for its own convention. When
a fact could go either way, ask: would this apply verbatim to a *different* module too? If yes, it
belongs in `common-issues/`, not repeated inside a module folder (a module's own file may still
cross-reference it).

### Topic-folder hierarchy — a flat pile of files is a defect, not a style choice

Once a topic-organized (non-chronological) `docs/` folder holds more than a handful of files, it
must be organized as `<folder>/<topic>/`, one subfolder per broad, durable topic area — never one
subfolder per narrow individual finding, and never named after a ticket (a ticket number belongs in
a file's body, per `common-issues/INDEX.md`'s own convention, not in a folder name). `docs/common-issues/`
is the canonical case: subfolders like `keycloak-and-auth/`, `test-user-service/`,
`playwright-execution/` group everything about that broad area, each with its own `INDEX.md`
(mirroring `module-theory/<Module Name>/INDEX.md`'s own shape), while the top-level
`docs/common-issues/INDEX.md` lists **topics**, not individual files. The same shape applies to any
other topic-organized `docs/` subfolder that grows past roughly 15-20 flat files without structure
(e.g. `docs/questions/framework-updates/` if it keeps growing) — **`docs/chat-history/`** is the
deliberate exception, since it is chronological by design, not topical, and stays flat.

Before creating a new topic subfolder, check whether an existing one is already a reasonable home
for the new fact — prefer growing an existing topic over minting a new, narrowly-scoped one for
something only marginally distinct from it. Naming stays global/broad on purpose (`keycloak-and-auth/`,
not `keycloak-transient-login-401-issue/`) precisely so this check has something real to match
against instead of every finding becoming its own one-off folder.

### Check before creating a new file — update/extend, don't multiply

Before writing a new file into any topic-organized `docs/` folder (`common-issues/<topic>/`, a
module's own `INDEX.md`/story `README.md`, etc.), read that topic's own `INDEX.md` and skim its
existing files for one that already covers the same or a closely related symptom, pattern, or
component — a new incident on an already-documented pattern is a new dated bullet or section
appended to the existing file, not a new file. Only create a new file when the pattern is genuinely
a new topic that no existing file in the relevant folder already covers. This is the same discipline
as "Compact this knowledge base, don't just keep appending to it" below — the aim in both directions
is one current, non-duplicated file per real topic, not a file per session or per finding.

This is distinct from the other `docs/` folders and from memory:

- **`docs/chat-history/`** is chronological (one file per session) — good for "what happened when,"
  bad for "what do I currently know about this module."
- **`docs/module-theory/<module>/`** and **`docs/common-issues/`** are the durable, topic-organized
  knowledge base — data model facts confirmed against Bruno, Story-vs-implementation discrepancies,
  Jira ticket snapshots, resolved incidents and their root cause, working conventions/patterns.
- Session memory (this tool's own persistent memory, if available) is for *this user's* working
  preferences and cross-project facts — `docs/module-theory/`/`docs/common-issues/` are for *the
  module/framework itself*, meant to be equally useful to a future session, a different engineer,
  or a different AI role working on the same module.

**Read the relevant module's `docs/module-theory/<Module Name>/INDEX.md` (and the specific
Story's `README.md`) before starting non-trivial work on it, and skim `docs/common-issues/INDEX.md`
whenever the problem doesn't look tied to one specific module** — same discipline as checking
`docs/chat-history/`. If a module/story folder doesn't exist yet for work you're now doing
non-trivially, create it once you've learned enough to be worth recording (don't create an empty
placeholder speculatively).

**Scale the read to the scope of the task.** A single ticket scoped to one Story only needs that
Story's own `README.md` plus the module `INDEX.md` — per the just-in-time principle above, don't
read sibling stories you have no task-relevant reason to open. But architecture-, lead-, or
design-level work that reasons about a module *as a whole* (proposing a change that could ripple
across its stories, judging whether a new case duplicates cross-story coverage, evaluating the
module's overall test/automation health) genuinely needs the full module loaded — every
`US-XX.YY.ZZ/README.md` under that `docs/module-theory/<Module Name>/`, not just the one story
that happens to be in front of you. Reading only the narrow story for that class of work is exactly
how a cross-story regression or a duplicated pattern gets missed; if the read is large, hand it to a
subagent per `base-agent.md`'s "Delegation & Model Routing" and have it return the module's full
picture condensed, rather than skipping the breadth to save context.

**Update it as part of finishing the task, not as optional follow-up** — the same rule as
`docs/frame-specs/` above: a session that uncovers a real Story-vs-Bruno discrepancy, resolves an
incident, pins down a Jira ticket's actual status, establishes a new test-data convention for a
module, or hits a cross-cutting gotcha not yet in `docs/common-issues/`, and does not fold that in
before the session ends, has left the task half-done. Prefer updating the existing `README.md`/
`INDEX.md` in place over piling up new dated files for the same fact — dated files are for
individual dev-facing questions/bugs whose own status changes over time (open → answered), not for
general knowledge that just gets refined.

If a fact recorded here turns out stale (a ticket shipped, a status changed, an environment
incident got fixed), correct it in place and note the date of the correction — don't leave future
sessions reading confirmed-wrong information because updating felt like scope creep.

**Compact this knowledge base, don't just keep appending to it.** `docs/module-theory/`/
`docs/common-issues/` exist to stop old mistakes from being re-litigated — but an `INDEX.md` or
story `README.md` that keeps growing forever becomes exactly the over-loaded context this
convention was meant to prevent, one folder down. When a module/story file is updated, spend a
moment on the entries already there, not only the new one: a resolved incident whose root cause is
now permanently fixed upstream (a shipped ticket, a corrected Story) only needs to stay as its
still-relevant *rule* plus one line pointing at `docs/chat-history/` for the full post-mortem — the
multi-paragraph "how we found this" narrative has done its job once the mistake stops recurring and
can be trimmed. Keep the full narrative for anything still open, still surprising, or still likely
to be miscopied by a future task; compact the rest. This is the same discipline as Claude Code's own
context compaction — preserve the decision, drop the exploration that produced it.

### Docs Authoring Standard — skimmable, not just complete

A file that captures every fact but takes 1000+ lines to say so has only solved half of what
`docs/` exists for — the other half is a future session, or a human, getting the essence back out
fast. This governs how **any** file under `docs/` is written (analysis, plan, audit, module theory,
common-issues, review notes — `docs/chat-history/` stays exempt, see below), not just the two
folders this section is named for:

- **TL;DR first.** Every analysis/plan/audit doc opens with a ≤15-line summary — goal,
  verdict/decision, key numbers — before any supporting detail. A reader skimming the first 20
  lines gets the substance; the rest is for whoever needs to verify or extend it.
- **Tables over repeated prose.** A list of more than ~3 same-shaped items (findings, test cases,
  plan tasks) is one table with one column set — not the same field labels (`Severity:`,
  `Evidence:`, `Fix:`, …) restated in a markdown block per item. `docs/frame-specs/tech-stack.md`'s
  single table is the model; a 40+-item list written as per-item header-and-prose is the
  anti-pattern that content belongs in a table, or isn't this knowledge base's job to hold at all if
  a system of record (Allure, Jira) already carries the full detail.
- **One fact, one place.** Don't restate context/constraints already recorded elsewhere in the doc
  set — cross-reference it, the same "one authoritative definition, referenced not restated"
  principle that already governs `commands/`.
- **A file past roughly 400-500 lines is a signal, not yet a violation** — split it: a plan becomes
  one file per phase plus an index, an audit splits by status/severity, verbose evidence moves to an
  appendix or child file while the parent keeps the compact table plus verdict. This is the same
  "flat pile is a defect" discipline as "Topic-folder hierarchy" above, one level down — a wall of
  text inside one file is the file-level version of a flat pile of files.
- **A `Superseded` doc gets compressed, not left at full length.** Once a doc is marked superseded,
  trim its body to a short "what it said / why superseded / link to successor" stub — keep the fact
  of its history, not its full original page count.
- **`docs/chat-history/`** stays exempt — verbatim, chronological transcripts are the point there,
  not a bug; don't apply the table/TL;DR rules to it.

This is a soft ceiling, not a bureaucratic hard limit: judgment about *when* a file has crossed from
"legitimately dense" (a module `README.md` covering one story's real data-model complexity) into
"needs splitting" stays with the role writing it — the point is to actually make that judgment at
write time, not to game the line count. Retrofitting already-oversized existing files is opportunistic
(fold it into whatever task next touches that file), never a mandated big-bang rewrite.

---

## Task Closeout Protocol (run every time — the teardown step, not optional follow-up)

A test suite's global teardown runs whether or not an individual test remembered to ask for
cleanup. This protocol works the same way: it runs at the end of every non-trivial task, whether or
not the user remembered to ask for a docs update — waiting to be asked is exactly the failure mode
this section exists to close.

Before calling a non-trivial task done, walk this table and act on every row that applies:

| If this task... | Then, before calling it done... |
|---|---|
| Changed `proj-test-automation`'s structure/conventions (folder reorg, new module, tag/CI scheme, swapped tool) | Update the matching `docs/frame-specs/*.md` file(s) — see "Keeping `docs/frame-specs/` current..." above for what counts. |
| Uncovered a Story-vs-implementation discrepancy, resolved an incident, confirmed a Jira ticket's status, or established a module-specific convention | Update the relevant `docs/module-theory/<Module Name>/INDEX.md` or `US-XX.YY.ZZ/README.md` — see "Module Knowledge Base" above. |
| Analysed a Story, or automated / updated / deleted a test, or changed why a case is not automated | Create or update the module's `docs/module-theory/<Module Name>/TRACE-MATRIX.md` for that Story — see "Trace Matrix" above. |
| Confirmed, refined, or contradicted a generalizable rule about how the module behaves (not just one incident) | Update that module's `INDEX.md` "Patterns & Predictive Rules" section — see that section above. |
| Hit a cross-cutting (not module-specific) gotcha, bug, or pattern | Add or update the matching `docs/common-issues/*.md` entry. |
| Involved any non-trivial discussion, decision, or implementation this session | Run `/session-summary` before the session ends. |

**Report the closeout explicitly, every time** — name which rows applied and what you updated
("updated `docs/module-theory/Currency Definition and Logic/US-01.13.02/README.md` with the new
AUTH finding; ran `/session-summary`"), or state plainly that none applied ("nothing to close out
this task — pure question, no new fact or decision"). A silent skip is indistinguishable from a
forgotten one; a stated "nothing applies" is a decision the user can check, not a gap they have to
notice on their own.

**This is enforced technically, not just advisory.** `hooks/closeout-track.ps1` (`PostToolUse` on
`Write|Edit|Bash`) tracks, per session, whether a file outside this plugin's own `docs/` was
edited since the last docs update; `hooks/closeout-check.ps1` (`Stop`) blocks the turn from ending
while that tracker is non-zero, with the exact fix named in the block message. This mirrors
`classify-http-readonly.ps1`'s own precedent (added after a prompt-only "no AI attribution" rule
already failed once) — a prompt instruction here had the same failure mode, so it gets the same
kind of backstop. **When you've genuinely determined nothing needs recording** (the table above
has no applicable row), run `echo proj-closeout-ack: <one-line reason>` via Bash — this is the
sanctioned way to clear the check without forcing a busywork docs edit, not a workaround to avoid
using. The hook only tracks *whether* something happened, never *what* the right docs update
was — that judgment stays yours.

---

## Session History (Continuity)

Before implementing anything non-trivial, check `docs/chat-history/` (in the resolved
`proj-ai-agentic` working tree, per base-agent.md — this folder is written fresh each session and
will not exist in the `${CLAUDE_PLUGIN_ROOT}` cache) — timestamped summaries of what past Claude
Code sessions discussed, implemented, and learned, generated by `/session-summary`. This is the
project's session-to-session versioning: a past session may have already settled a question this
one is about to re-litigate, or hit a gotcha not yet folded into `docs/frame-specs/`/`docs/project-spec/`.

Skim filenames for entries relevant to the current ticket, module, or decision, and read the
relevant ones in full before proceeding — don't act on a chat-history entry you haven't
actually read. If `docs/chat-history/` doesn't exist yet, there is no history to check; treat
that as "nothing recorded," not as a gap to fill yourself.

---

## Tooling / Plugin Access

Reach external systems through this plugin's bundled skills and MCP servers, not ad-hoc MCP calls:

- **Jira / Confluence** — use the bundled `claude-proj-agent:atlassian-routing` skill and the
  bundled `atlassian-innowise` / `atlassian-bank` MCP servers. The skill activates for
  Jira/Confluence work and picks the right site connection; you don't need to know the
  cloudId or pick a connection by hand. Always go to the actual ticket/page — never rely on
  a summary from earlier in the session.
- **API contract** — when a ticket touches an API, consult the bundled `claude-proj-agent:bruno` skill against
  the `proj-bruno-api` collection (a separate git repo cloned as a sibling checkout — see
  `docs/frame-specs/api-conventions.md` in the resolved `proj-ai-agentic` working tree for the
  local path convention) before assuming a request/response shape.
- **Diagrams** — when a Business Flow, sequence, or architecture diagram is useful, use the
  bundled `mermaid-ai` MCP server rather than hand-drawing ASCII.
- **Allure TestOps** — `allure-testops-custom` (`.mcp.json`) is read-only: launch/result/statistics
  data (release readiness, coverage trend, failed-test triage) and test-case search.
  `allure-testops-native` creates/updates/deletes test cases, shared steps and mutes, and only with
  the owner's explicit confirmation of the exact call. See `rules/allure.md` §8 for which tools
  belong to which server.
- **Jira / Confluence are read-only for every role.** A role prepares drafts (Epic, Story, AC,
  bug report, page content) and shows them in the chat or saves them as a local file in
  `proj-ai-agentic`; the owner publishes them.

These plugins are project-agnostic capabilities (installed globally for this user) — never
assume a specific Jira project/Confluence space/API collection; resolve those the same way as
everything else in this file, from the actual ticket and `docs/` (in the resolved
`proj-ai-agentic` working tree).

---

## Confluence Rules

Confluence is read-only for every role — never create or modify a page. These rules are a
reference for the format of a page draft the owner will publish, and for reading existing pages.
`rules/` is read from the live `proj-ai-agentic` working tree (see "Repository & Persistence
Model" in `base-agent.md`), not from the plugin cache; the include below is a convenience copy:

@${CLAUDE_PLUGIN_ROOT}/rules/confluence.md
