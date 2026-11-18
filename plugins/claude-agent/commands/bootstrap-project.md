@${CLAUDE_PLUGIN_ROOT}/commands/team/verification-protocol.md

# /bootstrap-project

## Role

Utility skill, not a persona — reusable across any consuming repo this framework is ever pointed
at, the same way `session-summary.md`/`create-pr.md` carry no fixed stack/domain assumption. Owned
conceptually by the AI Architect (it operates on this plugin's own knowledge base, not on a single
ticket), but its output is what the seven product-facing roles then read from.

## Mission

Make this plugin's own "project-agnostic, resolved fresh every engagement" promise
(`context-resolution.md`'s opening line) something that actually happens on day one of a new
engagement, not just an aspiration. `docs/project-spec/README.md` and `docs/frame-specs/README.md`
both currently admit they were populated by **one manual analysis pass** — there has never been a
repeatable way to point this framework at a brand-new consuming repo and get a working
`docs/project-spec/`/`docs/frame-specs/` without a human doing that analysis by hand first. This
command is that repeatable path: it analyzes the actual target repo and populates both folders
using the exact file set and section shape already established here — never a new format invented
per project — so the nine personas can start working immediately, with the domain/stack knowledge
living in `docs/` where `context-resolution.md` already says it belongs, not baked into a persona's
own prompt.

## When to run this

- First time this plugin is pointed at a new consuming repo, and `docs/project-spec/`/
  `docs/frame-specs/` still read as the generic template (name no real repo, describe no real code).
- On request, to refresh a project's `docs/frame-specs/` after a stack change large enough that the
  normal "update it in the same task" discipline (`context-resolution.md`) evidently missed it.

This command does **not** run automatically at the start of every session — only when explicitly
invoked, since it does a full-repo analysis pass that `context-resolution.md`'s own just-in-time
guidance says to keep out of routine, per-ticket context.

## Input

```
/bootstrap-project
/bootstrap-project <path to the consuming repo, if not the current working directory>
```

## Preconditions

- The `proj-ai-agentic` working tree is resolved (per `base-agent.md`'s "Repository & Persistence
  Model") — this command writes only there, never into the consuming repo.
- The target consuming repo is on disk and readable.
- **Read before you write.** For every file in the fixed lists below, read its current content
  first. A file that already says something specific to a real project (names real modules, real
  entities, real conventions) is not "empty" just because it's short — never overwrite it without
  explicit confirmation from the user. This command may freely populate a file that still reads as
  the generic template describing no real project.

## Protocol

1. **State which two repos are in play**: the `proj-ai-agentic` tree (writes go here) and the target
   consuming repo (read-only, always — never write here, per Repository & Persistence Model).
2. **Classify current state** of every file in the fixed `docs/project-spec/`/`docs/frame-specs/`
   lists (see their own `README.md`s for the current canonical list) as: *real project-specific
   content already* / *generic placeholder* / *missing*. Report this before changing anything, and
   confirm with the user before touching any file in the first category — show what would be
   replaced and wait for an explicit yes (`verification-protocol.md`).
3. **Gather stage — parallel Haiku subagents** (`model-routing.md`), one per discovery axis below.
   Each returns a compact, citation-only bundle (repo path, config key, doc excerpt) — never a
   prose conclusion, never a guess. Independent axes run in parallel:
   - **Stack** — package manifest(s), lockfile, test runner config, lint/format config → feeds
     `tech-stack.md`.
   - **Layout & architecture** — top-level folder structure, where clients/fixtures/page-objects/
     services live, how a request flows from spec to assertion → feeds `architecture.md`.
   - **API contract source** — is there a Bruno/Postman/OpenAPI/GraphQL-schema/other contract
     checked in, or referenced as a sibling checkout (README, `.env.example`)? **Never assume the
     current project's tool (Bruno) — detect whatever this repo actually uses**, or report that none
     is discoverable → feeds `api-conventions.md`.
   - **Coding standards** — eslint/prettier/checkstyle/ruff/equivalent config, `CONTRIBUTING.md` →
     feeds `coding-standards.md`.
   - **Testing conventions** — tag taxonomy, fixture patterns, per-module maturity (grep for
     skip/todo/stub/pending markers) → feeds `testing-standards.md`.
   - **Infrastructure & build** — CI config, container/orchestration manifests, README's environment
     and setup sections → feeds `infrastructure.md` and `build-and-run.md`.
   - **Domain** — README/CONTRIBUTING's own description of what the product does, entity names
     recurring across the codebase, any docs/wiki already checked into the repo → feeds
     `project-scope.md`, `domain-model.md`, `glossary.md`.
   - **Business rules & access control** — auth/permission middleware, role/permission constants,
     validation logic with named rules in comments or tests → feeds `business-rules.md`,
     `access-control.md`, `non-functional.md`.
4. **Judge stage — Sonnet**, one pass per target file, given the relevant bundle(s) plus that exact
   file's **current shape in this repo** (its headings, its "What does NOT belong here" discipline)
   as the template to follow — write the new project's version in the same shape, never a new
   format invented for this project.
5. **Flag, never fabricate, what code analysis can't resolve** — business intent behind a rule, a
   real non-functional SLA, an actual stakeholder/actor name. Write these as explicit open questions
   inside the relevant file (or a dedicated "Open Questions" section), the same discipline
   `manual-qa-agent.md` applies to an ambiguous requirement — never a plausible-sounding invention.
6. **Portability Risk Report** — two distinct tiers, never conflated:
   - **Tier 1 — prompt-text hardcode.** Grep `commands/team/*.md` for a hardcoded tool/technology
     name used as an assumed fact in a persona's own reasoning (not a breadth-of-capability example
     — see `context-resolution.md`'s distinction) that doesn't match what was just discovered (e.g.
     a persona that names "Bruno" specifically when this project's real API contract source is an
     OpenAPI spec). This tier is a wording fix — report every hit with file:line.
   - **Tier 2 — executable-layer coupling.** Some `commands/execution/<domain>-commands/` families
     don't just *describe* a tool, they call it directly (e.g. `allure-commands/` talks to the real
     Allure TestOps API; `aqa-commands/aqa-automate.md` generates actual Playwright code). If the
     discovered project's test-management system or automation framework doesn't match what a
     `<domain>-commands/` family assumes, that family (and the personas that invoke it, e.g.
     `manual-qa-agent.md`'s "Output Format", `fullstack-aqa-agent.md`'s automation sections) needs
     **new commands written for the actual stack**, not a wording tweak — report this as its own
     flagged item, distinct from Tier 1, naming exactly which command family and persona
     section is affected. `mqa-create-local-test-case.md` already exists as the documented
     Allure-free fallback for test-case authoring specifically because this gap is expected, not a
     defect — no equivalent fallback currently exists for the automation-framework side
     (`aqa-automate.md` assumes Playwright unconditionally).

   **Do not edit persona/command files or write new `<domain>-commands/` as part of this
   command** — both tiers are a separate, explicitly-approved pass a human decides on, per
   `ai-architect-agent.md`'s Decision Boundaries. This command's job is to name the gap precisely,
   not to close it.
7. **Create knowledge-base skeletons** — `docs/module-theory/INDEX.md` and
   `docs/common-issues/INDEX.md` if they don't exist yet, each just explaining its own convention
   (no speculative module folders, no invented issues).
8. **Report and stop** — a summary of which files were created, which were updated, which were
   left untouched (already real content), the full Portability Risk Report, and the full Open
   Questions list. Leave every change as uncommitted in `proj-ai-agentic`; committing happens only
   via `/create-pr`, run explicitly by the user, per `base-agent.md`.

## Output

- Populated/updated `docs/project-spec/*.md`, `docs/frame-specs/*.md` — the exact existing file
  set, no new files invented.
- `docs/module-theory/INDEX.md`, `docs/common-issues/INDEX.md` skeletons, if they didn't exist.
- A **Portability Risk Report**: every persona/command file whose hardcoded assumption doesn't
  match the discovered project.
- An **Open Questions** list for anything code analysis genuinely couldn't determine.

## Constraints

- Never write to the consuming repo — read-only there, always.
- Never overwrite a `docs/project-spec/`/`docs/frame-specs/` file that already has real
  project-specific content without the user's explicit confirmation first.
- Never invent a business rule, NFR target, or actor/role name without a concrete citation
  (repo path, config value, doc excerpt) — an unsourced claim becomes an open question instead.
- Never silently adapt a persona/command file's hardcoded tool assumption as a side effect of this
  command — report the mismatch in the Portability Risk Report and stop there.
- Follow `model-routing.md`'s Gather(Haiku)/Judge(Sonnet) split for the discovery work — a full-repo
  analysis like this is exactly the "genuinely needs the full breadth of a folder" exception
  `context-resolution.md` names as belonging in a subagent, not read inline by the invoking session.

## Definition of Done

- Every file in the fixed `docs/project-spec/`/`docs/frame-specs/` lists is in one of three
  reported states: freshly populated, updated in place, or explicitly left alone because it already
  had real content.
- Every claim in a newly written file cites where it came from — no unsourced assertion.
- Everything code analysis couldn't resolve is listed as an open question, not guessed.
- The Portability Risk Report names every persona/command file whose hardcoded tool assumption
  doesn't match the new project, or states explicitly that none were found.
