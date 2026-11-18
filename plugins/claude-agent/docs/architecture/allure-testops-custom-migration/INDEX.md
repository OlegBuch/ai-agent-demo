# architecture/allure-testops-custom-migration/ — Allure TestOps MCP integration design history

- [`2026-08-14-allure-testops-mcp-migration-design.md`](2026-08-14-allure-testops-mcp-migration-design.md) —
  **Superseded 2026-09-01.** Initial design proposing migration to Allure's own built-in `/api/mcp`
  server once it became reachable on-prem. Abandoned once a self-built server proved the better
  path — kept for historical record of why, not as a current plan.
- [`2026-08-14-allure-testops-mcp-migration-plan.md`](2026-08-14-allure-testops-mcp-migration-plan.md) —
  **Superseded 2026-09-01.** Implementation plan for the built-in-MCP approach above. Do not execute.
- [`2026-09-01-allure-testops-custom-design.md`](2026-09-01-allure-testops-custom-design.md) —
  **Current, implemented.** Design for a self-built `allure-testops-custom` MCP server replacing the third-party
  `allure-testops` package, with endpoint specifications.
- [`2026-09-01-allure-testops-custom-plan.md`](2026-09-01-allure-testops-custom-plan.md) —
  **Current, executed.** Implementation plan for the design above (phased rollout).
