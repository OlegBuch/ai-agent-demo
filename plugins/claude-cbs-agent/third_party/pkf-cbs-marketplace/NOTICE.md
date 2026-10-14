# Vendored content from bank-proj-marketplace

Copyright (c) 2026 Dzmitry Bahaslouski. Licensed under the MIT License, see `LICENSE` in this folder. The copyright and permission notice must stay with every copy of this content.

## Provenance

| Item | Value |
|---|---|
| Upstream repository | `bank-proj-marketplace` (private) |
| Upstream commit | `8743e5e4a1688106cc6c94dfd77ed9d95c8becb3` |
| Vendored on | 2026-10-05 |
| Refresh rule | flag when older than 60 days, procedure in `docs/architecture/bank-vendoring/bank-vendoring.md` |

| Upstream plugin | Version | Bundled as |
|---|---|---|
| atlassian | 0.1.1 | `external_skills/atlassian-routing/`, MCP servers `atlassian-innowise` and `atlassian-bank` in `.mcp.json` |
| bruno | 0.3.1 | `external_skills/bruno/`, `external_skills/bruno-validate/` |
| bluedot | 0.1.0 | `external_skills/bluedot/`, MCP server `bluedot` in `.mcp.json` |
| k8s | 0.2.0 | `external_skills/k8s-connect/`, `external_skills/k8s-read-only/` |
| proj-context | 0.9.0 | `external_skills/proj-context/` (with 10 references), `external_skills/nfr/` (with the register) |
| mermaid | n/a | MCP server `mermaid-ai` in `.mcp.json` |

## Local patches

Everything not listed here is byte-identical to upstream. Re-apply this list after every refresh.

| File | Patch |
|---|---|
| `external_skills/atlassian-routing/SKILL.md` | frontmatter `name` `routing` to `atlassian-routing`; server keys `innowise`/`bank` to `atlassian-innowise`/`atlassian-bank`; tool prefixes to `mcp__plugin_claude-proj-agent_atlassian-innowise__*` and `mcp__plugin_claude-proj-agent_atlassian-bank__*` |
| `external_skills/bruno-validate/SKILL.md` | `/bruno:bruno-validate` to `/claude-proj-agent:bruno-validate` (3 lines) |
| `external_skills/k8s-connect/SKILL.md` | `/k8s:k8s-connect` and `/k8s:k8s-read-only` to `/claude-proj-agent:...`; the `proj-devops` references replaced by "the infra team's dev-access runbook, not bundled" |
| `external_skills/k8s-read-only/SKILL.md` | `/k8s:k8s-read-only` to `/claude-proj-agent:k8s-read-only` |
| `external_skills/proj-context/SKILL.md` | `/proj-context:proj-context` to `/claude-proj-agent:proj-context`; "the `bruno` plugin" to "the bundled `bruno` skill"; `proj-devops` references and the `/plugin install` instruction replaced by "not bundled, obtain from the infra team" |
| `external_skills/proj-context/references/sms.md` | `proj-devops` plugin reference replaced by the infra team's authentication runbook |
| `external_skills/proj-context/references/product-factory-contracts.md` | "across this plugin" to "across this bundled skill" |
| `external_skills/nfr/SKILL.md` | `/proj-context:nfr` to `/claude-proj-agent:nfr`; `bank` connection to `atlassian-bank` |
| `.mcp.json` | server entries copied with upstream URLs unchanged; keys `innowise`/`bank` renamed to `atlassian-innowise`/`atlassian-bank` |

## Not vendored

`proj-devops`, `notebooklm`, `spotless`, `proj-use-cases` and `tech-writer` are not part of this plugin and are not referenced by it.
