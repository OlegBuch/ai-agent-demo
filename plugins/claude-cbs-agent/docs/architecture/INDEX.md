# docs/architecture/ — this plugin's own architecture decision records

Design docs and implementation plans for changes to `proj-ai-agentic`'s own tooling (this plugin's
MCP servers, hooks, enforcement mechanisms) — owned by the AI Architect role, not project-spec or
frame-specs content. Organized as one topic subfolder per initiative, each with its own `INDEX.md`
(see `docs/common-issues/INDEX.md` for the same convention). A design/plan pair that gets replaced
by a later approach is marked **Superseded** in place rather than deleted, so the history of why a
prior approach was abandoned stays available.

## Topics

- [`allure-testops-custom-migration/`](allure-testops-custom-migration/INDEX.md) — the path from
  REST-only Allure TestOps access to a self-built MCP server (4 entries, 2 superseded).
- [`model-routing-enforcement/`](model-routing-enforcement/INDEX.md) — hook-backed enforcement of
  the Gather/Judge/Escalate model-routing tiers (2 entries).
- [`bank-vendoring/`](bank-vendoring/INDEX.md) — skills and remote MCP servers vendored from
  `bank-proj-marketplace` in 2.0.0, with the upstream sync procedure and freshness rule (1 entry).
