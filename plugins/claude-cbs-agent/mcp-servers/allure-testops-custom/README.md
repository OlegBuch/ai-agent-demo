# allure-testops-custom

Self-owned MCP server for this plugin, replacing the third-party `allure-testops`
(`mshegolev/allure-testops-mcp`). See
`../../docs/architecture/2026-09-01-allure-testops-custom-design.md` for the full design.

## Dev setup

    uv sync

## Run tests

    uv run pytest

## Run the server directly (for manual smoke testing, not how Claude Code invokes it)

    ALLURE_URL=http://allure.proj.local:8090 ALLURE_TOKEN=<token> uv run allure-testops-custom
