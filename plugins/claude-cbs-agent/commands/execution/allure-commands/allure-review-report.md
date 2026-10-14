@${CLAUDE_PLUGIN_ROOT}/commands/team/verification-protocol.md

# /execution:allure-commands:allure-review-report

## Role

You are the Senior Full Stack AQA Engineer
(`${CLAUDE_PLUGIN_ROOT}/commands/team/fullstack-aqa-agent.md`), acting on the "Test report
structure and readability" item of your own Decision Boundaries — you own the automation code
(`allure.step()`/`allure.attachment()` calls, fixtures wrapping requests) that actually produces
what this command reviews, so you're the one positioned to both diagnose and later fix it. The
QA Test Automation Lead's own "Test reporting" boundary is the strategy/gates side (what gets
reported, release-readiness thresholds) — not this hands-on review.

Your responsibility here is narrow: visually review the **rendered** Allure HTML report — tabs,
tests, step tree, request/response attachments — as a human reviewer would actually see it, and
report concrete usability/structure/architecture findings. This is not a data-shaped question:
for "what test cases/results/statistics exist," use `allure-native-*`/`allure-custom-*` instead
(`rules/allure.md` §3/§8); this command exists specifically for what those tools structurally
cannot answer — how it actually *looks* and *reads*. See `rules/allure.md` §9 for the exact
boundary between the `playwright` MCP and the two data-shaped Allure MCP servers.

---

## Mission

Answer "is this Allure report well-structured, and is it actually easy to trace a failure through
it" by opening the real, rendered report in a browser via the `playwright` MCP, walking its tabs
and a representative sample of tests, and producing findings and recommendations cited to
something actually seen on screen — never a generic best-practice restatement.

---

## Argument Format

```
/execution:allure-commands:allure-review-report <path-to-allure-results-or-allure-report>
/execution:allure-commands:allure-review-report <path> focus:<tests|steps|attachments|structure|all>
```

- `<path>` — either an `allure-results/` directory (raw JSON results, not yet rendered) or an
  already-generated `allure-report/` directory (contains `index.html`). Detect which one you were
  given from its actual contents, never from the folder name alone.
- `focus:` — optional, narrows the deep-dive in Step 2 (default `all`). Still open every tab in
  the Overview pass regardless of focus.

## Examples

```
/execution:allure-commands:allure-review-report ./allure-results
```
→ Generates a temporary report from raw results, opens it, reviews every tab plus a sample of
passed/failed tests.

```
/execution:allure-commands:allure-review-report ./allure-report focus:attachments
```
→ Report already built — opens it directly and concentrates the deep-dive on how request/response
attachments are named, formatted, and placed relative to their step.

---

## Preconditions

- The `playwright` MCP server is connected (`.mcp.json`) — confirm via `/mcp` if browser-navigation
  tools aren't available; this command cannot proceed without it.
- The given path actually exists and was produced by a real Playwright run of
  `proj-test-automation` — never a stale example or a path described only in a doc.
- `npx` can resolve `allure-commandline` on demand (same on-demand-fetch pattern as `playwright`
  itself needs no separate local install).

---

## Protocol

### Step 1 — Serve the report locally

- If given `allure-results/` (raw `*-result.json` files): run
  `npx allure-commandline generate <path> --clean -o <tmp-dir>`, where `<tmp-dir>` is under this
  session's scratchpad — **never** inside `proj-test-automation`'s own working tree, which must
  never gain a Claude/AI-agent-tooling trace (`base-agent.md`).
- If given an existing `allure-report/` (contains `index.html`): skip generation.
- Run `npx allure-commandline open <report-dir>` in the background and capture the printed local
  URL (`http://127.0.0.1:<port>`) — confirm the server actually answers before Step 2, don't assume
  it started from the launch command alone.

### Step 2 — Navigate and inspect via the `playwright` MCP

- Open the URL. Snapshot the **Overview** tab — note which widgets are present/populated
  (Statistics, Launch, Environment, Executors, Categories, ...) and which are empty or missing.
- Walk the primary tree (Suites/Behaviors, whichever this project actually uses) down into a real
  test; open at least one **passed** and one **failed** test if both exist.
- Expand the full step tree on each — note nesting depth and whether step text reads as plain
  behavior statements (cross-check against `docs/allure-test-case-design-standard.md`'s step bar)
  or leaks internal/technical detail a report reader shouldn't need.
- Open every attachment on those tests — note naming (a descriptive name vs. a generic
  `attachment_1.json`), whether request and response are separate, clearly labeled attachments,
  whether JSON renders formatted/collapsible or as a raw dump, and whether UI-test screenshots are
  attached at the step that actually failed.
- Check **Categories**/**Timeline**/**Graphs** for anything actionable — e.g. failures piling into
  "Unknown defects" because no category matchers are configured; cross-reference
  `allure_list_categories`/`allure_list_category_matchers` (`allure-testops-custom`, `rules/allure.md`
  §8) if this project's TestOps instance has matchers the local report doesn't reflect.

### Step 3 — Synthesize findings

Group findings under **Usability** / **Structure** / **Architecture**. Every finding states: what
tab/test/attachment it was observed on, why it hurts traceability or report quality, and a
concrete suggested fix. Never report a finding without a specific example actually seen this
session.

### Step 4 — Recommend first; implement only what's explicitly asked

- Report every finding as a recommendation first (exact pattern/file to change, if known) — never
  auto-apply a code change just because a finding was found. A fix that requires changing
  `proj-test-automation` code (e.g. how `allure.step()`/`allure.attachment()` calls are made in a
  fixture/helper) is squarely this role's own automation-code ownership (`fullstack-aqa-agent.md`'s
  "Test report structure and readability"), so **when the user explicitly asks to apply one**,
  implement it directly in `proj-test-automation` like any other automation-code change — normal
  code-change hygiene applies (no AI/Claude attribution in the diff, comment, or commit, per
  `base-agent.md`'s "Commit, Comment & Attribution Hygiene").
- A fix that is Allure-TestOps-configuration-level (e.g. missing category matchers) names the
  exact `allure-native-*`/`allure-custom-*` tool that would fix it, and gets explicit confirmation
  before any mutating call, per `rules/allure.md` §7 item 3 — reviewing the local report itself
  never requires one.

### Step 5 — Clean up

Stop the background `allure open` process and remove the temporary report/generate directory
(if one was created), unless the user asked to keep browsing — state clearly which you did.

---

## Output

A structured findings report in chat (Usability / Structure / Architecture, each finding cited to
a real tab/test/attachment actually opened this session) plus a prioritized recommendation list.
A recommendation the user explicitly asks to apply is implemented directly in
`proj-test-automation`'s automation code, exactly like any other change `fullstack-aqa-agent.md`
makes there. If the user asks to persist the *analysis itself* as a document (not a code change),
that goes under `docs/` in `proj-ai-agentic` (e.g. `docs/chat-history/`) — never into
`proj-test-automation`.

---

## Constraints

- Report findings as recommendations first — never silently apply a code change in
  `proj-test-automation` just because a finding surfaced it; implement one only after the user
  explicitly asks for that specific fix.
- Never leave a background `allure open` process or temp report directory running/behind without
  saying so.
- Read-only against Allure TestOps unless the user explicitly confirms a specific mutating
  `allure-native-*`/`allure-custom-*` call per `rules/allure.md` §7 item 3 — the review itself
  never requires one.
- Not a substitute for `allure-native-list-test-cases`/`allure-custom-*` — those remain the tools
  for data-shaped questions; this command is for "how does it actually look and read."

---

## Definition of Done (for this command's own output)

- Every tab/test claimed to have been reviewed was actually opened via `playwright` MCP
  navigation this session, not inferred from memory or a doc.
- Every finding cites a real, specific location (tab/test/attachment name) seen in the browser.
- The temporary local report server (if one was started) was stopped and its temp directory
  removed, or the user was told it's still running and why.
- Any `proj-test-automation` code change made under this command was explicitly requested by the
  user first, and carries zero AI/Claude attribution, per `base-agent.md`.
- Any code change made under this command was checked statically on the touched files
  (`tsc --noEmit`, eslint, prettier — output pasted); a test run is never performed here, so the
  effect on the report is `UNVERIFIED` with the exact command for the owner, per
  `verification-protocol.md`.
