# CLAUDE.md

## What This Repository Is

`proj-ai-agentic` is a Claude Code **plugin marketplace**. It hosts one plugin,
`claude-proj-agent` — a virtual QA/BA/Architecture team (personas, slash commands, skills, hooks, and bundled MCP server config) — plus the full domain/stack/process knowledge
base that team reads as context. Both live together here so that the repo this team works on can
stay entirely free of Claude/AI-agent tooling traces.

## Primary Consumer: `proj-test-automation`

`proj-test-automation` is a Playwright + TypeScript test-automation framework covering API
(primary) and UI (nascent) test suites for **PKF-CBS**, a Core Banking System platform.

Its client does not want any Claude- or AI-agent-related files or mentions inside that repo's
**shared git history**. As a direct consequence:

- `proj-test-automation` carries **zero committed** Claude-specific content — its tracked working
  tree is purely the test codebase (`api/`, `ui/`, `playwright.config.ts`, `.gitlab-ci.yml`, its
  own `README.md`, etc.). In practice, each engineer's local clone does have a project-scoped
  `.claude/settings.json` (permissions, `enabledPlugins`, `extraKnownMarketplaces`) — it just
  stays out of git via that engineer's own personal `.git/info/exclude`, never the shared,
  committed `.gitignore` (see this repo's `README.md`, "Keeping `proj-test-automation`'s git
  history clean"). That file is per-clone only and never pushed, so the client-facing
  requirement — nothing Claude-related in shared history — still holds exactly.
- Everything `claude-proj-agent` needs to know about that framework — business rules, RBAC,
  domain glossary (`plugins/claude-proj-agent/docs/project-spec/`), tech stack/conventions
  (`plugins/claude-proj-agent/docs/frame-specs/`), QA deliverables
  (`plugins/claude-proj-agent/docs/test-cases/`), session-to-session continuity
  (`plugins/claude-proj-agent/docs/chat-history/`), and Jira/Confluence/Allure process rules
  (`plugins/claude-proj-agent/rules/`; the framework reads Jira/Confluence only, never writes) — lives **here** instead, bundled inside the plugin.
- The connection between the two repos is wired up **per-machine**, via each engineer's own
  `.claude/settings.json` — global (`~/.claude/settings.json`) or the git-excluded project-local
  one described above (see this repo's `README.md`) — never inside `proj-test-automation`'s own
  git history.

## Architecture Note — an accepted trade-off, not an oversight

The persona/skill layer (`plugins/claude-proj-agent/commands/team/context-resolution.md`) was
originally designed to resolve domain/stack facts fresh from whichever repo it's installed in,
so the same skeleton could stay portable across future projects with zero project-specific
content baked in. That design is **intentionally superseded for now**: the `docs/` and `rules/`
trees under `plugins/claude-proj-agent/` are specific to `proj-test-automation`/PKF-CBS, not
generic, because the client requirement above forced the domain knowledge to move somewhere, and
this is currently the only consumer. If a second consuming repo shows up later, that's when to
decide how to generalize (e.g. namespacing by consumer) — not something to solve preemptively.

## Structure

```
.claude-plugin/marketplace.json      # marketplace manifest
plugins/claude-proj-agent/
  .claude-plugin/plugin.json         # plugin manifest — no external plugin dependencies (2.0.0+)
  commands/team/                     # 9 personas (*-agent.md except base-agent.md; 7 product-facing, incl. the
                                      # Code Style Reviewer + Change Justification Reviewer
                                      # (Skeptic) review-focused pair) + AI Architect meta
                                      # role + PM personal-tracking role +
                                      # orchestrator/review-board
  commands/execution/                # Manual QA -> Allure TestOps -> AQA automation pipeline
  docs/                              # proj-test-automation's domain + stack + QA docs (see above):
                                      # project-spec/, frame-specs/, module-theory/, common-issues/,
                                      # test-cases/, review-mr/, chat-history/, questions/,
                                      # architecture/, ai-usage/, metrics/, ci-cd-secrets.md; hrm-logs/ is
                                      # created on the first run of create-hrm-template
  rules/                             # Jira/Confluence/Allure process rules (Jira/Confluence read-only
                                      # for the framework), DoR/DoD
  hooks/                             # PreToolUse read-only-command auto-approval + commit-attribution
                                      # deny; four PostToolUse/Stop pairs (closeout, delegation,
                                      # model-routing, version-bump) + UserPromptSubmit classifier
  scripts/                           # validate-framework.js, statusline/, metrics/
  external_skills/                   # bundled skills, invoked as claude-proj-agent:<name>
                                      # (atlassian-routing, bruno, bruno-validate, bluedot,
                                      # k8s-connect, k8s-read-only, proj-context, nfr)
  third_party/                       # licence + NOTICE (pinned upstream SHA, patch list) for the
                                      # content vendored from bank-proj-marketplace into external_skills/
  .mcp.json                          # bundled MCP servers (github, gitlab, filesystem,
                                      # allure-testops-native, allure-testops-custom, playwright,
                                      # atlassian-innowise, atlassian-bank, mermaid-ai, bluedot) —
                                      # session-wide once the plugin is enabled, regardless of cwd
```

## Documentation Reference

| Topic | File |
|---|---|
| Domain / business rules / CBS module map | `plugins/claude-proj-agent/docs/project-spec/` |
| Tech stack / architecture / per-module automation maturity | `plugins/claude-proj-agent/docs/frame-specs/` |
| QA analysis and test case documents | `plugins/claude-proj-agent/docs/test-cases/` |
| Per-merge-request review findings (`review-cosmetic-pr`/`review-logical-pr`/`review-pr-orchestrator`/`review-pr-recheck`), plus cross-MR pattern proposals (`review-pr-distill-patterns`) | `plugins/claude-proj-agent/docs/review-mr/` (committed, not `.gitignore`d) |
| Session-to-session continuity log | `plugins/claude-proj-agent/docs/chat-history/` |
| Personal HRM/timesheet logworks draft (folder created on the first `create-hrm-template` run) | `plugins/claude-proj-agent/docs/hrm-logs/` |
| Jira / Confluence / Allure process rules, DoR/DoD | `plugins/claude-proj-agent/rules/` |
| `proj-test-automation`'s own CI/CD secrets reference | `plugins/claude-proj-agent/docs/ci-cd-secrets.md` |
| Vendored bank skills: what, from which upstream SHA, sync procedure | `plugins/claude-proj-agent/docs/architecture/bank-vendoring/bank-vendoring.md` |
| Framework design records (model-routing enforcement, Allure custom MCP migration) | `plugins/claude-proj-agent/docs/architecture/INDEX.md` |
| Per-module durable knowledge / cross-module recurring problems | `plugins/claude-proj-agent/docs/module-theory/`, `plugins/claude-proj-agent/docs/common-issues/` |
| Command/persona catalog | `README.md` (this repo's root) and each folder's `INDEX.md` under `plugins/claude-proj-agent/commands/` |

Within skill/command markdown bodies, these are referenced as
`${CLAUDE_PLUGIN_ROOT}/docs/...`/`${CLAUDE_PLUGIN_ROOT}/rules/...` so they resolve correctly from
the plugin's installed cache regardless of which repo's session invoked them.
