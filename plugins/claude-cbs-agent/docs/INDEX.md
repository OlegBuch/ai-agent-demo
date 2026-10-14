# docs/ Index

The `${CLAUDE_PLUGIN_ROOT}/commands/` roles read domain and stack facts from this tree; the
`docs/` and `rules/` trees are specific to `proj-test-automation` (a Playwright + TypeScript suite
testing the PKF-CBS core banking platform) — the earlier project-agnostic principle was
deliberately dropped (see `proj-ai-agentic`'s `CLAUDE.md`, "Architecture Note"). Everything
project-specific lives here:

| Folder | Read this when you need... |
|---|---|
| `project-spec/` | The domain: this suite's CBS module/entity map, business rules (record lifecycle, four-eyes, multi-company isolation, origin governance), RBAC model, glossary. See `project-spec/README.md`. Generic CBS platform terminology is the `proj-context` plugin's job, not this folder's. |
| `frame-specs/` | The tech stack: Playwright/TypeScript, the client/fixture/global-setup architecture, API conventions, coding/testing standards (including per-module automation maturity), infrastructure, build-and-run. See `frame-specs/README.md`. |
| `module-theory/` | Durable, topic-organized knowledge base per CBS business module (e.g. "Currency Definition and Logic", "Idempotency") — data model facts confirmed against Bruno, Story-vs-implementation discrepancies, resolved incidents, module-specific test-data conventions. One folder per module, split into one subfolder per Story, plus a module-level `INDEX.md`. See below and `commands/team/context-resolution.md`'s "Module Knowledge Base" section. |
| `common-issues/` | Cross-module recurring problems and fixes — a framework/API-contract/QA-process pitfall that isn't tied to one business module (e.g. `authOperationRequired`). See `common-issues/INDEX.md`. |
| `test-cases/` | Per-ticket QA analysis and test case documents — see below. |
| `review-mr/` | Per-merge-request review findings from the `review-pr-commands` family (cosmetic/logical/orchestrator/recheck), committed here instead of posted to GitLab, plus a cross-MR `_pattern-log.md` distilled from all of them — see below. |
| `chat-history/` | Session-to-session continuity log — dated summaries of what past Claude Code sessions discussed, implemented, and learned. See below. |
| `hrm-logs/` | Personal running draft of this engineer's HRM/timesheet logworks, one file per month. Created on first run of `/create-hrm-template` (`commands/create-hrm-template.md`, PM persona) — the folder does not exist until then. Not the HRM system itself — a working draft the user pastes from. See below. |
| `architecture/` | Architecture decision records for this plugin's own tooling (framework-level design docs: `allure-testops-custom-migration/`, `model-routing-enforcement/`, and `bank-vendoring/` — the skills/MCP servers vendored from `bank-proj-marketplace` and their sync procedure) — owned by the AI Architect role. Not project-spec/frame-specs content. See `architecture/INDEX.md`. |
| `ci-cd-secrets.md` | The env vars / tokens the MCP servers and `proj-test-automation`'s CI need (names only, never values), where each is set, and the local prerequisites (`uv`, Node). Read before wiring `.mcp.json` or CI variables. |
| `metrics/` | Measured plugin usage written automatically each turn: per-person data files (committed), local reports and `TEAM.md` rebuilt from them. Start at `metrics/INDEX.md`. |
| `ai-usage/` | `AI-Playbook-Claude-Code-QA.pptx` — the team's presentation on using Claude Code for QA. A binary deck, not read by roles. |
| `allure-test-case-design-standard.md` | The content bar for a well-formed Allure TestOps test case — what Tags/Title/Description/Steps/Comments/Custom Fields should actually contain, with real examples and the recurring mistakes Manual QA/AQA hit. Complements `rules/allure.md`, which covers the MCP mechanics only. Read before creating, updating, or reviewing any Allure case. |
| `questions/framework-updates/` | `proj-test-automation` framework-code duplication/organization audits (e.g. TB-2799, TB-2807) — about this repo's own code structure, not a CBS business module or a cross-module pattern, so it stays out of `module-theory/`/`common-issues/`. |

Both `project-spec/` and `frame-specs/` have been populated by direct analysis of the current
codebase (as of 2026-07-07) — keep them in sync as the code evolves rather than treating them as
frozen. Every role must still read from these folders (and from the current Jira ticket /
Confluence pages) instead of assuming prior-project or prior-session context.

**Note:** `docs/api-bruno-spec/` does not exist in this repo. The real API contract is the `proj-bruno-api` Bruno workspace — a **separate git
repository** cloned as a sibling checkout, not a folder in this repo — see
`frame-specs/api-conventions.md` for the remote URL and what it covers.

## module-theory/ and common-issues/ — durable module/cross-cutting knowledge

The full convention (folder shape, when to create a module/story folder vs. a `common-issues/`
entry, update discipline) is defined once in `commands/team/context-resolution.md`'s "Module
Knowledge Base" section — read it there rather than here, this row exists only so the folder isn't
orphaned from this index. In short: `module-theory/<Module Name>/INDEX.md` holds module-wide facts,
`module-theory/<Module Name>/TRACE-MATRIX.md` is the required per-Story Allure-case → automation coverage table (Allure ID, case, Type, Automated, test in code, comment),
`module-theory/<Module Name>/US-XX.YY.ZZ/` holds one Story's data model/discrepancies/incidents,
and `common-issues/<pattern>.md` holds a problem that recurs across modules.

## test-cases/ — per-ticket QA analysis and test case documents

`analysis.md` is populated by `${CLAUDE_PLUGIN_ROOT}/commands/execution/mqa-commands/mqa-review-story.md`
(Senior Manual QA Engineer persona, `${CLAUDE_PLUGIN_ROOT}/commands/team/manual-qa-agent.md`) for every
ticket, regardless of which test-case path is used next. From there, the suite itself takes
**one** of two mutually exclusive paths per ticket (never both for the same ticket — see
`rules/allure.md`'s note on this):

- **Allure TestOps (default)** — `${CLAUDE_PLUGIN_ROOT}/commands/execution/allure-commands/allure-native-create-test-case.md`
  creates the suite directly in Allure; nothing local is written for the cases themselves (only
  `analysis.md` lives here). Updated via `allure-native-update-test-case.md`; automation status tracked
  via `aqa-automate.md`.
- **Local-only (explicit opt-in)** — `${CLAUDE_PLUGIN_ROOT}/commands/execution/mqa-commands/mqa-create-local-test-case.md`
  creates the suite as local `.xlsx` **and** `.csv` files instead, for a ticket that intentionally
  skips Allure (offline review, client handoff, no Allure project configured for this engagement).
  One folder per ticket, named by the actual Jira issue key, per that command's own Output section:

```
test-cases/<TICKET-KEY>/
  analysis.md                          — single evolving file, own internal Changelog
  <TICKET-KEY>-test-cases-v1.xlsx      — first version (multi-sheet: Info + one sheet per module)
  <TICKET-KEY>-test-cases-v1.csv       — same revision's data, one flat table
  <TICKET-KEY>-test-cases-v2.xlsx      — next revision (never overwrites v1)
  <TICKET-KEY>-test-cases-v2.csv
  ...
```

| File pattern | Read this when you need... |
|---|---|
| `test-cases/<TICKET-KEY>/analysis.md` | Requirement analysis for one ticket: Business Flows, Business Rules (BR), Alternative Flows (Alt), Acceptance Criteria (AC) per module, gaps/conflicts found, Required Test Types, and — once a local suite exists — its appended Coverage Matrix |
| `test-cases/<TICKET-KEY>/<TICKET-KEY>-test-cases-v<N>.xlsx` | Local-only path's test case suite, one immutable file per revision (`v1`, `v2`, ...), in the format defined once in `manual-qa-agent.md` ("Required Test Case Table Format", 12 columns) plus the local-only `Automation Status` column (see `mqa-create-local-test-case.md`), `Status` (Draft/Approved) on its `Info` sheet. Always read the highest `N` present unless you specifically need history. |
| `test-cases/<TICKET-KEY>/<TICKET-KEY>-test-cases-v<N>.csv` | Same revision, same columns, as one flat comma-separated table (all modules concatenated, disambiguated by the `Story` column) — for diffing or importing into non-Excel tooling. `Status` lives only on the `.xlsx`'s `Info` sheet, not duplicated here. |

Test cases are not stored in Confluence (see `rules/confluence.md`) regardless of which path is
used. QA pipeline order: `mqa-review-story` → (`allure-native-create-test-case` **or**
`mqa-create-local-test-case`, never both for the same ticket) → `aqa-automate`.

## review-mr/ — per-merge-request review findings

Populated by five commands under `${CLAUDE_PLUGIN_ROOT}/commands/execution/review-pr-commands/`
(see that folder's own `INDEX.md` for the full rationale) — four produce one per-MR folder's
worth of findings (splitting a single joint 4-lens review into narrower, lower-context passes —
see `commands/team/model-routing.md` for the Gather/Judge/Escalate model pattern they share), and a fifth mines
the accumulated result of all of them:

- `review-cosmetic-pr.md` — Senior Code Style & Conventions Reviewer only, mechanical/
  cosmetic, every changed line.
- `review-logical-pr.md` — Senior Full Stack AQA Engineer + Senior QA Test Automation Lead
  Engineer, joint: correctness and suite-level fit.
- `review-pr-orchestrator.md` — the entry point: ensures the two files above exist (running
  whichever is missing), then has the Senior Change Justification Reviewer adversarially
  challenge their necessity conclusions before producing the final report.
- `review-pr-recheck.md` — run after `final_analysis.md`'s Ready-to-paste comment was posted and
  the author pushed fixes: verifies every raised item was actually fixed and sweeps the current
  diff for anything new, without re-deriving or rewriting the first three files.
- `review-pr-distill-patterns.md` — touches no GitLab MR; reads every past `final_analysis.md`/
  `re-review-analysis.md` folder below, and for a finding that recurs across several distinct MRs
  and isn't already covered by `frame-specs/`, drafts (never applies) the standards-doc addition
  that would catch it automatically going forward. Run periodically/on request, not per-MR.

```
review-mr/<mr-iid>-<slug-of-ticket-key-or-mr-title>/
  cosmetic_analysis.md    — Code Style lens findings
  logical_analysis.md     — AQA + AQA Lead lens findings, plus first-pass necessity citations
  final_analysis.md       — merged findings, the Change Justification Debate log, and the
                             ready-to-paste GitLab comment — this is the file the user actually
                             copies from, first round
  re-review-analysis.md   — fix-verification results plus any new findings from a later push,
                             and its own ready-to-paste follow-up comment
review-mr/_pattern-log.md — cross-MR distillation runs (created by the first run of
                             `review-pr-distill-patterns`); not a per-MR folder (leading underscore
                             keeps it sorted apart from the `<mr-iid>-<slug>` folders above)
```

Each per-MR file is a single evolving document with its own internal `## Changelog` on re-review
(same convention as `test-cases/<TICKET-KEY>/analysis.md`); `_pattern-log.md` similarly appends a
dated section per distillation run rather than being overwritten. None of these five commands ever
posts to GitLab itself — the user copies `final_analysis.md`'s (or `re-review-analysis.md`'s)
ready-to-paste section into the real MR by hand, and reviews `_pattern-log.md`'s proposals by hand
before applying any of them to `frame-specs/`.

This folder is committed to `proj-ai-agentic`'s own history (not `.gitignore`d) specifically so
`review-pr-distill-patterns.md` has something to mine — a review's findings outlive the session
that produced them.

## chat-history/ — session-to-session continuity log

Populated by `/session-summary` (`${CLAUDE_PLUGIN_ROOT}/commands/session-summary.md`), a global utility
skill callable from any role. One file per session, never overwritten:

```
chat-history/<yyyy-MM-dd_HH-mm>_<short-slug>.md
```

Every persona checks this folder for entries relevant to the current work before implementing
(see `${CLAUDE_PLUGIN_ROOT}/commands/team/context-resolution.md`'s "Session History (Continuity)"). This is a
chat-level log, not a substitute for `project-spec/`/`frame-specs/` — a durable project fact
surfaced in a chat-history entry still belongs in those docs, not only here.

## hrm-logs/ — personal HRM/timesheet logworks draft

Populated by `/create-hrm-template` (`${CLAUDE_PLUGIN_ROOT}/commands/create-hrm-template.md`, PM
persona at `${CLAUDE_PLUGIN_ROOT}/commands/team/pm-agent.md`); the folder is created on its first
run. One file per month:

```
hrm-logs/<yyyy-MM>.md
```

Each file accumulates one `## Day <D> (<DD.MM.YYYY>)` section per day logged that month, grouped
by resolved Jira Parent/Epic per the org's own template (see `create-hrm-template.md` for the
canonical shape and its rules — not restated here). Re-running the command for an already-logged
day replaces that day's section in place rather than duplicating it. This is a personal working
draft only — the source of truth for actual hours is whatever the user pastes into HRM itself.

---

For coding conventions see `frame-specs/`. For Jira/Confluence process rules see
`rules/INDEX.md`. For the overall operating model see `proj-ai-agentic`'s root `CLAUDE.md`.
