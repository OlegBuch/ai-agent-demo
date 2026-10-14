# Mandatory model-routing classification — design

- **Status:** Implemented (hooks/model-routing-*.ps1 and commands/team/model-routing-levels.md exist)
- **Date:** 2026-09-01
- **Owner:** AI Architect (framework meta-role)
- **Scope:** `proj-ai-agentic` only — new `hooks/model-routing-*.ps1` triad, `hooks/hooks.json`,
  new `commands/team/model-routing-levels.md`, edits to `commands/team/model-routing.md`,
  `docs/INDEX.md`/`README.md` sync. No change to `proj-test-automation` (the consuming repo) — this
  is tooling/process only, though the hook itself fires in any session where this plugin is
  enabled, regardless of the session's own `cwd`, same as every other hook in this plugin.
- **Related, explicitly out of scope for this spec:** the `allure-testops-custom` MCP rebuild and
  the agent/skill transparency-logging request raised in the same conversation are each their own
  follow-up spec — not addressed here.

## 1. Problem

`model-routing.md` already defines the Gather (Haiku) / Judge (Sonnet) / Escalate (Opus,
user-authorized only) convention, `@`-included by `base-agent.md` so every persona inherits it.
In practice it is pure prose: nothing enforces it, and per the user's own account, personas
(`fullstack-aqa-agent.md` and others) do not route trivial/routine work to Haiku unless
explicitly told to per-message. The existing `delegation-track.ps1`/`delegation-check.ps1`/
`delegation-lib.ps1` triad is a partial, adjacent backstop — it only detects "heavy mechanical
work happened inline with no `Agent` delegation at all" (a raw `curl`, or 6+ consecutive
Read/Grep calls). It does not require a complexity classification on every task message, and it
does not check *which* model tier an `Agent` call actually used.

The user wants a stronger, unconditional guarantee: every new-task message, while a team persona
is active, must be classified against a 5-level complexity scale, and that classification must be
visible/checkable, not just advisory.

## 2. Verified facts

- **`UserPromptSubmit` hook contract** (confirmed against the official Claude Code docs,
  `https://code.claude.com/docs/en/hooks.md`, via a `claude-code-guide` subagent lookup on
  2026-09-01 — re-verify if this doc is >1 sprint old and the schema below stops matching):
  - stdin JSON carries `session_id`, `prompt_id`, `transcript_path`, `cwd`, `permission_mode`,
    `hook_event_name`, and — the field this design actually reads — **`prompt`** (raw user input
    text).
  - Context injection: exit `0` and print either plain text to stdout, or JSON with a top-level
    `additionalContext` (and/or `systemMessage`) field — either is read as context added to what
    Claude sees for that turn.
  - Blocking a prompt outright is a *different* mechanism (exit `2`, or JSON
    `hookSpecificOutput.permissionDecision: "deny"`) — **not used by this design**. This hook only
    ever injects, never denies; matches this repo's existing separation of concerns where a
    `PostToolUse` hook only tracks and a `Stop` hook is the only place that blocks
    (`closeout-track.ps1`/`closeout-check.ps1`, `delegation-track.ps1`/`delegation-check.ps1`).
- `hooks.json` currently has no `UserPromptSubmit` entry at all — this is a new event key, not an
  extension of an existing one.
- `docs/architecture/` is the established location for this class of document, already used for
  exactly one prior case (`2026-08-14-allure-testops-mcp-migration-design.md` +
  `...-plan.md`) — this spec follows that file's section shape (Status/Date/Owner/Scope header,
  numbered sections, lettered Decisions) rather than the generic
  `docs/superpowers/specs/` path a from-scratch brainstorming run would otherwise default to.
- Team personas are invoked as `/claude-proj-agent:team:<role>-agent` (confirmed from this very
  session's own invocation, `/claude-proj-agent:team:ai-architect-agent`) — this literal substring
  is what marks a session as having a team role active. There is no corresponding "role
  deactivated" event in this framework; once invoked, a persona's instructions stay in context for
  the rest of the session by construction (no explicit unload mechanism exists), so "sticky true
  for the session" is not an approximation, it is the actual lifecycle.

## 3. Architecture

A new, dedicated triad, parallel to (not merged into) the existing `delegation-*`/`closeout-*`
triads — kept separate because it answers a different question ("was this task message
classified and routed correctly") than delegation-check answers ("did heavy mechanical work stay
inline too long"). Mirrors this repo's own established one-concern-per-triad convention.

```
hooks/model-routing-lib.ps1       — shared per-session state helpers (mirrors delegation-lib.ps1)
hooks/model-routing-classify.ps1  — UserPromptSubmit: classify + inject the mandatory reminder
hooks/model-routing-track.ps1     — PostToolUse (Bash): watch for the proj-model-tier ack
hooks/model-routing-check.ps1     — Stop: block the turn if classification was required and never acked
commands/team/model-routing-levels.md — the 5-level rubric itself, @-included from model-routing.md
```

### 3.1 State shape (`model-routing-lib.ps1`)

Per-session JSON file, same directory pattern as `delegation-lib.ps1`
(`$env:TEMP/proj-ai-agentic-model-routing/<session_id>.state.json`):

```json
{ "teamRoleActive": false, "classificationRequired": false }
```

- `teamRoleActive` — set `true` the first time `model-routing-classify.ps1` sees
  `/claude-proj-agent:team:` in a prompt; never reset for the life of the session (see §2's
  lifecycle note).
- `classificationRequired` — set `true` by `model-routing-classify.ps1` when it decides the
  current prompt is a new task (not a trivial reply) while `teamRoleActive` is true; cleared by
  `model-routing-track.ps1` on sighting the ack; read (never written) by
  `model-routing-check.ps1`.

### 3.2 `model-routing-classify.ps1` (new `UserPromptSubmit` hook)

1. Read stdin, extract `session_id`, `prompt`. Fail open (exit 0, no output) on missing either.
2. If `prompt` contains `/claude-proj-agent:team:`, set `teamRoleActive = true`.
3. If `teamRoleActive` is still false, exit 0 silently — no persona active, nothing to enforce.
4. Classify `prompt` against a trivial-reply pattern list (short length **and** matches a
   greeting/ack/single-word-confirmation regex, RU+EN — see §3.2.1). Match → exit 0 silently, do
   not arm anything. No match (i.e., this looks like an actual task/question) → set
   `classificationRequired = true` and print the reminder text (§3.2.2) to stdout, exit 0.

#### 3.2.1 Trivial-reply heuristic

Fail toward "treat as a task" (a false negative here just costs one harmless extra ack line; a
false positive silently skips enforcement on a real task, which is the failure mode that
actually matters):

```
^\s*(да|нет|ок|окей|хорошо|спасибо|привет|давай|продолжай|go\s*ahead|proceed|thanks?|thank\s*you|ok(ay)?|yes|no|hi|hello|sounds?\s*good)\.?!?\s*$
```
matched case-insensitively **and** trimmed prompt length under ~40 characters. Anything longer,
or not matching this list, is treated as a task message.

#### 3.2.2 Injected reminder text

States: classify this message's complexity against `model-routing-levels.md` (Level 1–5) before
proceeding; declare it via a Bash call this turn:
`echo proj-model-tier: level=<1-5> tier=<inline|haiku|sonnet|split> reason=<one line>`; Level 2
work must go to a fresh `Agent` call with `model:"haiku"`, never run inline; Level 4–5 stays on
the current session's own model, no forced delegation.

### 3.3 `model-routing-track.ps1` (new `PostToolUse` hook, matcher `Bash`)

Bookkeeping only, never blocks, exit 0 always — mirrors `delegation-track.ps1`'s own header
comment convention. On a `Bash` tool call, if `tool_input.command` matches the literal token
`proj-model-tier:` (lenient match, same tolerance as `proj-delegation-ack`/`proj-closeout-ack` —
presence of the token is enough, no strict grammar enforcement on the `level=`/`tier=` shape),
clear `classificationRequired` to `false` for that session and log the raw declaration line to
this triad's own session log file (mirrors `Write-DelegationLog`).

### 3.4 `model-routing-check.ps1` (new `Stop` hook)

Read `session_id`, get state. If `classificationRequired` is false (either never armed, or
cleared by an ack), exit 0. If true, block (`decision: "block"`, `continue: false`) with a reason
explaining the requirement and the exact ack command to run — same reason-block shape as
`delegation-check.ps1`/`closeout-check.ps1`. Fails open (exit 0) on missing `session_id` or an
unreadable state file.

### 3.5 `hooks.json` changes

- New top-level `"UserPromptSubmit"` array: one entry running `model-routing-classify.ps1`.
- `"PostToolUse"` gains a new matcher entry (`"Bash"`) running `model-routing-track.ps1` —
  additive, does not touch the existing `Write|Edit|Bash` (closeout) or `Bash|Read|Grep|Agent`
  (delegation) entries.
- `"Stop"` gains a third hook entry running `model-routing-check.ps1` — additive, alongside the
  existing `closeout-check.ps1`/`delegation-check.ps1` entries.

## 4. The 5-level scale (`commands/team/model-routing-levels.md`)

Refines `model-routing.md`'s existing Gather/Judge/Escalate tiers with finer granularity; does
not contradict or restate them — this file is `@`-included from `model-routing.md`, which keeps
being the one authoritative definition of the tier semantics themselves.

| Level | Shape of the work | Tier | Delegation rule |
|---|---|---|---|
| 1 — Trivial | One fact/file/confirmation; a single targeted lookup | `inline` | Stays on the session's current model. **No forced `Agent` spawn** — see Decision D1. |
| 2 — Routine gather | Multi-file exploration, fetching, context/doc collection, "what already exists" audits | `haiku` | **Mandatory** fresh `Agent` call, `model:"haiku"`. Never run by the session's own reasoning. |
| 3 — Mixed | Needs both fetching material and rendering a verdict on it | `split` | Haiku Gather subagent first, then a Sonnet Judge pass — both steps required, per `model-routing.md`'s existing "never let Judge fetch its own context" rule. |
| 4 — Judgment | Architecture/design decisions, writing or updating tests, correctness/quality analysis, doc/spec authoring, review verdicts | `sonnet` | Stays on the session's current model (normally Sonnet); an isolated `Agent` with `model:"sonnet"` is fine but never forced. |
| 5 — Cross-cutting / high-stakes | Framework-wide restructuring, decisions spanning multiple roles, edits to shared conventions (`base-agent.md` itself) | `sonnet` | Mandatory Sonnet. Opus only if the user explicitly authorizes it for this specific case — existing Escalation-tier rule in `model-routing.md`, unchanged by this spec. |

## 5. Decisions

- **D1 — Level 1 stays inline, not forced to Haiku.** The user's literal ask was "route all
  light/routine work to Haiku," but for a genuinely atomic single-file/single-fact lookup, the
  fixed cost of spawning a fresh subagent (new context, no benefit from this session's already-warm
  prompt cache, round-trip latency) outweighs the per-token saving — confirmed against this
  framework's own existing carve-out in `base-agent.md` ("a single targeted lookup... is not
  itself a violation"). Discussed with and approved by the user in this session
  (2026-09-01). Level 2+ (anything past one atomic lookup) is where inline reasoning starts
  actually crowding the expensive Sonnet context, which is exactly where mandatory Haiku
  delegation kicks in.
- **D2 — Enforcement scoped to sessions where a team persona is active, not every session.**
  Approved by the user (2026-09-01) — this hook must stay silent in ordinary, non-persona work in
  this or any other repo the plugin happens to be enabled in.
- **D3 — New dedicated triad, not an extension of `delegation-*.ps1`.** The two triads answer
  different questions (see §3's opening paragraph) and this repo's own established convention is
  one triad per concern (`closeout-*` vs `delegation-*` are already split this way) — extending
  `delegation-track.ps1` to also parse `proj-model-tier:` would blur that boundary and risk
  regressing the existing, already-validated delegation behavior.
- **D4 — Ack detection is lenient (token presence), not a strict grammar check.** Matches
  `proj-delegation-ack`/`proj-closeout-ack`'s own precedent: a check that rejects an
  almost-but-not-quite-well-formed declaration is worse than one that accepts the token and logs
  whatever followed it, per this repo's own "an enforcement that can't name what to fix is worse
  than no enforcement" ethos already stated in `delegation-check.ps1`'s header.
- **D5 — Spec filed under `docs/architecture/`, not the generic
  `docs/superpowers/specs/` default.** This repo's own `docs/INDEX.md` already names
  `docs/architecture/` as "Architecture decision records for this plugin's own tooling... owned by
  the AI Architect role," with a live precedent (the Allure MCP migration doc) in the exact same
  Status/Date/Owner/Scope shape this document follows.

## 6. Non-goals

- Does not change which model the **main session thread itself** runs on — a hook cannot do that;
  it can only gate how `Agent` delegation is used. Level 4/5 "stays on the session's current
  model" assumes that model is already Sonnet per this framework's own default, not a `/model`
  switch this design performs.
- Does not add a check on whether an `Agent` call's `model` parameter actually matches the
  declared tier (e.g. catching "declared Level 2 but spawned with no `model` param at all"). This
  is a real, cheap follow-up (`model-routing-track.ps1` already inspects `Agent` tool calls'
  `tool_input`) but is intentionally deferred to keep this first version's blast radius to exactly
  what was asked — the mandatory per-message declaration. Flagged here so it isn't silently
  forgotten.
- Does not touch `allure-testops-custom` or agent/skill execution-transparency logging — separate
  specs.

## 7. Testing plan

Manual, since these are Claude Code hooks with no unit-test harness in this repo (same as every
other `hooks/*.ps1` file here):

1. Invoke a team persona, send a clearly task-shaped follow-up → confirm the reminder text
   appears as injected context and that ending the turn without an ack blocks with
   `model-routing-check.ps1`'s reason.
2. Send the ack (`echo proj-model-tier: level=2 tier=haiku reason=...`) → confirm the turn ends
   cleanly.
3. Send a one-word trivial reply (`ок`, `спасибо`) → confirm no reminder is injected and no block
   occurs.
4. In a session where no team persona was ever invoked → confirm the hook is fully silent
   end-to-end (no injection, no block) — regression check against ordinary work in this or any
   other repo.
5. Confirm `hooks.json`'s three new entries are additive — re-run one existing `closeout`/
   `delegation` scenario each to confirm those triads are unaffected.
