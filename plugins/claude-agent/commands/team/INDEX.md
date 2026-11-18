# commands/team/ Index

Persona files (`*-agent.md`) are **not** separately invocable slash commands — each is the "Role"
an `execution:` command assumes, or a persona `/team:orchestrator`/`/review-board` draws on. Every
persona file `@`-includes `base-agent.md` first (shared principles/standards) and, where noted,
`context-resolution.md` near the end (session-history/continuity lookup) before its own `## Task`.

| File | Read this when you need... |
|---|---|
| `base-agent.md` | The framework-specific principles (delegation/model-routing, Repository & Persistence Model, no-AI-attribution) every persona inherits — included first by every `*-agent.md` file. Deliberately lean: generic engineering-quality guidance already covered by the host system prompt lives there, not here. Changing this file changes every role at once (see `ai-architect-agent.md`'s Decision Boundaries). |
| `model-routing.md` | The Gather(Haiku)/Judge(Sonnet)/Escalate(Opus, disabled by default — user-authorized only) subagent-delegation convention, plus its Fork-vs-fresh-subagent guidance — `@`-included by `base-agent.md` itself, so every persona has it; also used directly by the `review-pr-commands` family. Read this before spawning any subagent or picking a model tier. |
| `model-routing-levels.md` | The 5-level complexity rubric (1–5) `@`-included from `model-routing.md`, refining its Gather/Judge/Escalate tiers with per-message granularity — hook-enforced via the `proj-model-tier` declaration (`hooks/model-routing-classify.ps1`/`model-routing-track.ps1`/`model-routing-check.ps1`), required while the session was started by a `team:`/`execution:` command. |
| `context-resolution.md` | Just-in-time context resolution (`docs/project-spec/`/`docs/frame-specs/`, resolved per-file not per-folder), the `docs/module-theory/`/`docs/common-issues/` knowledge base convention, and the session-history/continuity lookup — included by most persona files near their own `## Task`. |
| `verification-protocol.md` | What "done" may be claimed on (evidence; UNVERIFIED for anything needing a test run — a test is run only after the owner names the environment) and which actions stop for the owner first (commit/push, Allure writes, file overwrite; Jira/Confluence are never written). `@`-included by `execution:` commands that edit code, write to Allure, delete files, or hand text to a human; persona files link to it, `base-agent.md` does not include it. |
| `analyst-agent.md` | Senior Business Analyst — requirements/acceptance-criteria/domain-rule authority for the CBS product. |
| `architect-agent.md` | Senior Solution Architect — system boundaries, coupling, scalability, failure-mode authority. |
| `manual-qa-agent.md` | Senior Manual QA Engineer — test case design, `mqa-review-story`/`mqa-create-local-test-case`'s persona. |
| `fullstack-aqa-agent.md` | Senior Full Stack AQA Engineer — automation correctness/layering; the AQA lens in `review-logical-pr` and `review-pr-recheck`'s fresh sweep. |
| `aqa-lead-agent.md` | Senior QA Test Automation Lead Engineer — suite-level fit/coverage/CI gates; the AQA Lead lens in `review-logical-pr` and `review-pr-recheck`'s fresh sweep. |
| `code-style-agent.md` | Senior Code Style & Conventions Reviewer — mechanical/cosmetic-only lens; owns `review-cosmetic-pr`, also drawn on by `review-pr-recheck`'s fresh sweep. |
| `skeptic-agent.md` | Senior Change Justification Reviewer — adversarial necessity lens; owns `review-pr-orchestrator`'s debate stage. |
| `ai-architect-agent.md` | AI Architect — this framework's own meta-layer (structure/roles/skills), never the CBS product. |
| `pm-agent.md` | Project Manager — personal HRM/timesheet logging assistance (`/create-hrm-template`), not product scope. |
| `orchestrator.md` | `/team:orchestrator` — full 4-round structured technical review across requested personas. Expensive (`N × (N-1)` peer reviews in Round 2) — reserve for a genuinely contested, hard-to-reverse decision spanning conflicting domains, not the default second opinion. |
| `review-board.md` | `/review-board` — lighter single-pass design review, one response per requested persona plus a `[VERDICT]`. |

**Participant keys** — the single source of truth for `orchestrator.md`/`review-board.md`. A key is not always the persona file's name (`aqa` is `fullstack-aqa-agent.md`); resolve the file from this table, never by `<key>-agent.md`.

| key | file | title |
|---|---|---|
| `architect` | `architect-agent.md` | Senior Solution Architect |
| `analyst` | `analyst-agent.md` | Senior Business Analyst |
| `aqa-lead` | `aqa-lead-agent.md` | Senior QA Test Automation Lead Engineer |
| `manual-qa` | `manual-qa-agent.md` | Senior Manual QA Engineer |
| `aqa` | `fullstack-aqa-agent.md` | Senior Full Stack AQA Engineer |
| `code-style` | `code-style-agent.md` | Senior Code Style & Conventions Reviewer |
| `skeptic` | `skeptic-agent.md` | Senior Change Justification Reviewer |
| `ai-architect` | `ai-architect-agent.md` | AI Architect |
| `pm` | `pm-agent.md` | Project Manager |

**Invocation names.** Commands are invoked as `/claude-proj-agent:team:<name>` and `/claude-proj-agent:execution:<package>:<command>` — the form `hooks/model-routing-classify.ps1` matches. Shorthand such as `/team:orchestrator` or `/execution:allure-commands:...` in these files means the same command without the plugin prefix.

**Choosing between a direct persona call, `/review-board`, and `/team:orchestrator`** — scale the
tool to the decision, not the other way around:

| Situation | Use |
|---|---|
| One clear domain, routine question | Call that persona directly (or the matching `execution:` command) |
| Need 2+ perspectives, moderate stakes, want it cheap | `/review-board <2-4 relevant participants>: ...` |
| Genuinely contested, hard-to-reverse decision where domains actively conflict | `/team:orchestrator <2-4 relevant participants>: ...` — never every persona by default, see `orchestrator.md`'s own "Right-sizing this tool" |

If `/team:orchestrator` feels too expensive to reach for even when the decision seems to warrant
it, that's a signal to narrow the participant list, not to skip structured review altogether —
see `orchestrator.md`'s own guidance on participant count and its one allowed round-skip.

For the full narrative (why the Code Style / Skeptic split exists, how the roles divide the
product vs. framework vs. personal-tracking scope), see the root `README.md`'s "Team / persona
commands" section.
