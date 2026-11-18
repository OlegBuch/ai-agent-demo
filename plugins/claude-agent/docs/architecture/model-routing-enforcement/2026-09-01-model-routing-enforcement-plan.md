# Mandatory Model-Routing Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 5-level, per-task-message model-routing classification (Haiku Gather / Sonnet
Judge / split, per `model-routing.md`) a hook-enforced requirement instead of prose that gets
skipped, for any session where a `claude-proj-agent` team persona is active.

**Architecture:** A new, dedicated `model-routing-*.ps1` triad (`lib`/`classify`/`track`/`check`),
parallel to the existing `closeout-*`/`delegation-*` triads, plus a new `model-routing-levels.md`
rubric file `@`-included from `model-routing.md`. `model-routing-classify.ps1`
(`UserPromptSubmit`) injects the classification requirement on every qualifying new-task message;
`model-routing-track.ps1` (`PostToolUse`/`Bash`) watches for the `proj-model-tier:` ack;
`model-routing-check.ps1` (`Stop`) blocks the turn from ending until the ack is seen.

**Tech Stack:** Windows PowerShell 5.1 (`.ps1` hook scripts, same as every existing hook in this
plugin), Claude Code plugin `hooks.json` (`UserPromptSubmit`/`PostToolUse`/`Stop` events), plain
JSON for per-session state files under `$env:TEMP`.

**Spec:** `plugins/claude-proj-agent/docs/architecture/2026-09-01-model-routing-enforcement-design.md`
— read it alongside this plan; this plan does not restate the "why," only the "how."

## Global Constraints

- New hook files live in `plugins/claude-proj-agent/hooks/`, named
  `model-routing-lib.ps1`/`model-routing-classify.ps1`/`model-routing-track.ps1`/
  `model-routing-check.ps1` — exact names, matching this plugin's `<concern>-<role>.ps1` convention.
- State directory: `$env:TEMP/proj-ai-agentic-model-routing/<session_id>.state.json` (+
  `<session_id>.log`) — a dedicated directory, never reusing `proj-ai-agentic-delegation`'s.
- Ack token is the literal substring `proj-model-tier:` in a `Bash` tool's `tool_input.command` —
  lenient/presence-only match, never a strict regex on the `level=`/`tier=` grammar (spec
  Decision D4).
- Every new hook fails open (`exit 0`, no output/no block) on a missing/unparsable payload, a
  missing `session_id`, or an unreadable state file — matching every existing hook in this repo.
- `hooks.json` changes are strictly additive: never remove or reorder the existing `PreToolUse`
  (`classify-http-readonly.ps1`), `PostToolUse` (`closeout-track.ps1`, `delegation-track.ps1`), or
  `Stop` (`closeout-check.ps1`, `delegation-check.ps1`) entries. New entries use the identical
  command wrapper style already there: `powershell -NoProfile -NonInteractive -File
  "${CLAUDE_PLUGIN_ROOT}/hooks/<script>.ps1"`.
- **No git commits during implementation.** Per `base-agent.md`'s "Repository & Persistence
  Model," every task below ends with "leave the change uncommitted and state what changed," never
  `git add`/`git commit` — commits in this repo happen only via the separate `/create-pr` skill,
  invoked explicitly by the user later. This overrides this skill's usual per-task commit step.
- PowerShell function names introduced in Task 1 (`Get-ModelRoutingState`,
  `Set-ModelRoutingState`, `Set-ModelRoutingTeamRoleActive`, `Set-ModelRoutingClassificationRequired`,
  `Clear-ModelRoutingClassification`, `Write-ModelRoutingLog`) are exact and must be reused
  verbatim by every later task that dot-sources `model-routing-lib.ps1` — do not rename.

---

### Task 1: `model-routing-lib.ps1` — shared per-session state helpers

**Files:**
- Create: `plugins/claude-proj-agent/hooks/model-routing-lib.ps1`

**Interfaces:**
- Consumes: nothing (first file in the triad).
- Produces (dot-sourced by Tasks 2–4):
  - `Get-ModelRoutingStateDir` → `[string]` path, creates the directory if missing.
  - `Get-ModelRoutingStatePath -SessionId <string>` → `[string]` path.
  - `Get-ModelRoutingState -SessionId <string>` → `PSCustomObject` with `.teamRoleActive` (bool),
    `.classificationRequired` (bool); defaults to both `$false` if no state file exists yet.
  - `Set-ModelRoutingState -SessionId <string> -State <PSCustomObject>` → writes the state
    (compact JSON) to disk.
  - `Set-ModelRoutingTeamRoleActive -SessionId <string>` → idempotently sets `teamRoleActive =
    $true` and logs the first time it happens.
  - `Set-ModelRoutingClassificationRequired -SessionId <string>` → sets `classificationRequired =
    $true`.
  - `Clear-ModelRoutingClassification -SessionId <string> -Reason <string>` → sets
    `classificationRequired = $false` and logs `Reason`.
  - `Write-ModelRoutingLog -SessionId <string> -Message <string>` → appends a timestamped line to
    `<session_id>.log`.

- [ ] **Step 1: Write the file**

```powershell
# Shared helpers for the Model-Routing Classification enforcement hooks
# (model-routing-classify.ps1, model-routing-track.ps1, model-routing-check.ps1). Not a hook
# itself - dot-sourced by all three.
#
# Why this exists: model-routing.md/model-routing-levels.md already tell every persona to
# classify each new task message's complexity (1-5) and route Gather-tier work to a fresh Haiku
# subagent. This mirrors delegation-lib.ps1's own precedent - a prompt-only instruction is
# advisory and gets skipped once a task's own context grows; this is the technical backstop, not
# a restatement of the same instruction. Kept as its own triad/state directory rather than
# folded into delegation-lib.ps1 because it answers a different question - see
# model-routing-check.ps1's header.

function Get-ModelRoutingStateDir {
    $dir = Join-Path $env:TEMP 'proj-ai-agentic-model-routing'
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    return $dir
}

function Get-ModelRoutingStatePath {
    param([string]$SessionId)
    if (-not $SessionId) { $SessionId = 'unknown-session' }
    return Join-Path (Get-ModelRoutingStateDir) "$SessionId.state.json"
}

function Get-ModelRoutingState {
    param([string]$SessionId)
    $path = Get-ModelRoutingStatePath -SessionId $SessionId
    if (-not (Test-Path $path)) { return [PSCustomObject]@{ teamRoleActive = $false; classificationRequired = $false } }
    try {
        $raw = Get-Content $path -Raw -ErrorAction Stop
        $obj = $raw | ConvertFrom-Json
        if ($null -eq $obj.teamRoleActive) { $obj | Add-Member -NotePropertyName teamRoleActive -NotePropertyValue $false -Force }
        if ($null -eq $obj.classificationRequired) { $obj | Add-Member -NotePropertyName classificationRequired -NotePropertyValue $false -Force }
        return $obj
    } catch {
        return [PSCustomObject]@{ teamRoleActive = $false; classificationRequired = $false }
    }
}

function Set-ModelRoutingState {
    param([string]$SessionId, [Parameter(Mandatory)]$State)
    $path = Get-ModelRoutingStatePath -SessionId $SessionId
    ($State | ConvertTo-Json -Compress) | Set-Content -Path $path -ErrorAction SilentlyContinue
}

function Write-ModelRoutingLog {
    param([string]$SessionId, [string]$Message)
    $logPath = Join-Path (Get-ModelRoutingStateDir) "$SessionId.log"
    Add-Content -Path $logPath -Value "$(Get-Date -Format o) $Message" -ErrorAction SilentlyContinue
}

function Set-ModelRoutingTeamRoleActive {
    param([string]$SessionId)
    $state = Get-ModelRoutingState -SessionId $SessionId
    if ($state.teamRoleActive) { return }
    $state.teamRoleActive = $true
    Set-ModelRoutingState -SessionId $SessionId -State $state
    Write-ModelRoutingLog -SessionId $SessionId -Message 'TEAM ROLE ACTIVE: /claude-proj-agent:team: seen in prompt'
}

function Set-ModelRoutingClassificationRequired {
    param([string]$SessionId)
    $state = Get-ModelRoutingState -SessionId $SessionId
    $state.classificationRequired = $true
    Set-ModelRoutingState -SessionId $SessionId -State $state
}

function Clear-ModelRoutingClassification {
    param([string]$SessionId, [string]$Reason)
    $state = Get-ModelRoutingState -SessionId $SessionId
    $state.classificationRequired = $false
    Set-ModelRoutingState -SessionId $SessionId -State $state
    if ($Reason) { Write-ModelRoutingLog -SessionId $SessionId -Message "CLEARED: $Reason" }
}
```

- [ ] **Step 2: Verify the state round-trip**

Run (PowerShell):

```powershell
$sid = 'plan-test-lib-1'
. plugins/claude-proj-agent/hooks/model-routing-lib.ps1
$s = Get-ModelRoutingState -SessionId $sid
if ($s.teamRoleActive -ne $false -or $s.classificationRequired -ne $false) { throw 'FAIL: default state wrong' }
Set-ModelRoutingTeamRoleActive -SessionId $sid
Set-ModelRoutingClassificationRequired -SessionId $sid
$s2 = Get-ModelRoutingState -SessionId $sid
if (-not $s2.teamRoleActive -or -not $s2.classificationRequired) { throw 'FAIL: set state wrong' }
Clear-ModelRoutingClassification -SessionId $sid -Reason 'test'
$s3 = Get-ModelRoutingState -SessionId $sid
if ($s3.classificationRequired -ne $false -or -not $s3.teamRoleActive) { throw 'FAIL: clear state wrong' }
Write-Host 'PASS: lib state round-trip'
Remove-Item (Join-Path (Join-Path $env:TEMP 'proj-ai-agentic-model-routing') "$sid.state.json") -ErrorAction SilentlyContinue
Remove-Item (Join-Path (Join-Path $env:TEMP 'proj-ai-agentic-model-routing') "$sid.log") -ErrorAction SilentlyContinue
```

Expected: `PASS: lib state round-trip` printed, no `FAIL` thrown.

- [ ] **Step 3: Leave uncommitted**

Do not run `git add`/`git commit` (see Global Constraints). State in your response that
`plugins/claude-proj-agent/hooks/model-routing-lib.ps1` was created and is sitting as an
uncommitted change.

---

### Task 2: `model-routing-classify.ps1` — `UserPromptSubmit` hook

**Files:**
- Create: `plugins/claude-proj-agent/hooks/model-routing-classify.ps1`

**Interfaces:**
- Consumes: `Get-ModelRoutingState`, `Set-ModelRoutingTeamRoleActive`,
  `Set-ModelRoutingClassificationRequired` (Task 1).
- Produces: stdout reminder text (read by Claude Code as injected context, per the confirmed
  `UserPromptSubmit` contract — plain text on stdout with exit `0`); nothing later depends on this
  file's own exports (it's the pipeline's entry point, dot-sourced by nothing).

- [ ] **Step 1: Write the file**

```powershell
# UserPromptSubmit hook. Fires on every user message. Only ever injects context or stays silent -
# never blocks a prompt (blocking is model-routing-check.ps1's job, on Stop, per this repo's own
# track/check separation - see that file's header). See docs/architecture/
# 2026-09-01-model-routing-enforcement-design.md for the full design.
#
# Scope: silent no-op until a team persona has been invoked in this session at least once
# (`/claude-proj-agent:team:` seen in a prompt) - this enforcement is for the virtual team's own
# task-routing discipline, not every session this plugin happens to be enabled in.
#
# Once a team role is active, every subsequent prompt that isn't a short trivial reply
# (greeting/ack/one-word confirmation - see $trivialPattern) arms classificationRequired and
# injects the reminder below. model-routing-check.ps1 (Stop hook) blocks the turn end until
# model-routing-track.ps1 (PostToolUse/Bash) sees the proj-model-tier ack clear it.
#
# Fails open (exit 0, no output) if the payload is missing session_id/prompt.

. "$PSScriptRoot/model-routing-lib.ps1"

$payload = [Console]::In.ReadToEnd()
if (-not $payload) { exit 0 }

try { $json = $payload | ConvertFrom-Json } catch { exit 0 }

$sessionId = $json.session_id
$prompt = $json.prompt
if (-not $sessionId -or -not $prompt) { exit 0 }

if ($prompt -match [regex]::Escape('/claude-proj-agent:team:')) {
    Set-ModelRoutingTeamRoleActive -SessionId $sessionId
}

$state = Get-ModelRoutingState -SessionId $sessionId
if (-not $state.teamRoleActive) { exit 0 }

$trivialPattern = '^\s*(да|нет|ок|окей|хорошо|спасибо|привет|давай|продолжай|go\s*ahead|proceed|thanks?|thank\s*you|ok(ay)?|yes|no|hi|hello|sounds?\s*good)[.!]?\s*$'
$trimmed = $prompt.Trim()
if ($trimmed.Length -lt 40 -and $trimmed -match $trivialPattern) { exit 0 }

Set-ModelRoutingClassificationRequired -SessionId $sessionId

$reminder = @"
Model-routing classification required before proceeding (mandatory per model-routing.md /
model-routing-levels.md): classify this message's complexity as Level 1-5, then declare it with:
echo proj-model-tier: level=<1-5> tier=<inline|haiku|sonnet|split> reason=<one line>
Level 2 (routine gather) MUST go to a fresh Agent call with model:"haiku" - never run inline.
Level 4-5 (judgment/architecture/tests/cross-cutting) stays on this session's own model - no
forced delegation. See commands/team/model-routing-levels.md for the full rubric.
"@

Write-Output $reminder
exit 0
```

- [ ] **Step 2: Verify silent no-op without an active team role**

Run:

```powershell
$out = '{"session_id":"plan-test-classify-noroleyet","prompt":"please refactor everything across the repo"}' | powershell -NoProfile -NonInteractive -File plugins/claude-proj-agent/hooks/model-routing-classify.ps1
if ($out) { throw "FAIL: expected no output, got: $out" }
Write-Host 'PASS: silent without team role'
```

Expected: `PASS: silent without team role`.

- [ ] **Step 3: Verify injection once a team role is seen, on a task-shaped message**

Run:

```powershell
$sid = 'plan-test-classify-1'
$out = ('{"session_id":"' + $sid + '","prompt":"/claude-proj-agent:team:ai-architect-agent audit the docs folder for drift"}') | powershell -NoProfile -NonInteractive -File plugins/claude-proj-agent/hooks/model-routing-classify.ps1
if (($out | Out-String) -notmatch 'proj-model-tier') { throw "FAIL: expected reminder text, got: $out" }
Write-Host 'PASS: reminder injected'
```

Expected: `PASS: reminder injected`.

- [ ] **Step 4: Verify trivial replies are skipped once a team role is active**

Run (same `$sid` as Step 3, so `teamRoleActive` is already `true`):

```powershell
$out = ('{"session_id":"' + $sid + '","prompt":"спасибо"}') | powershell -NoProfile -NonInteractive -File plugins/claude-proj-agent/hooks/model-routing-classify.ps1
if ($out) { throw "FAIL: expected no output for a trivial reply, got: $out" }
Write-Host 'PASS: trivial reply skipped'
. plugins/claude-proj-agent/hooks/model-routing-lib.ps1
Remove-Item (Join-Path (Join-Path $env:TEMP 'proj-ai-agentic-model-routing') "$sid.state.json") -ErrorAction SilentlyContinue
Remove-Item (Join-Path (Join-Path $env:TEMP 'proj-ai-agentic-model-routing') "$sid.log") -ErrorAction SilentlyContinue
Remove-Item (Join-Path (Join-Path $env:TEMP 'proj-ai-agentic-model-routing') "plan-test-classify-noroleyet.state.json") -ErrorAction SilentlyContinue
```

Expected: `PASS: trivial reply skipped`.

- [ ] **Step 5: Leave uncommitted**

State in your response that `plugins/claude-proj-agent/hooks/model-routing-classify.ps1` was
created and is sitting as an uncommitted change.

---

### Task 3: `model-routing-track.ps1` — `PostToolUse` (`Bash`) hook

**Files:**
- Create: `plugins/claude-proj-agent/hooks/model-routing-track.ps1`

**Interfaces:**
- Consumes: `Clear-ModelRoutingClassification` (Task 1).
- Produces: nothing exported — this is a leaf hook whose only observable effect is the state file
  Task 4 reads.

- [ ] **Step 1: Write the file**

```powershell
# PostToolUse hook (Bash). Bookkeeping only - never blocks, never denies, exit 0 always. See
# model-routing-lib.ps1 for the state shape.
#
# Watches for the literal token `proj-model-tier:` in a Bash command - the explicit "I classified
# this message" declaration model-routing-classify.ps1 asks for. Presence of the token is enough
# to clear classificationRequired (lenient match, same tolerance as proj-delegation-ack/
# proj-closeout-ack - see model-routing-check.ps1's header for why).
#
# model-routing-check.ps1 (the Stop hook) reads classificationRequired to decide whether to block
# before the turn can end.

. "$PSScriptRoot/model-routing-lib.ps1"

$payload = [Console]::In.ReadToEnd()
if (-not $payload) { exit 0 }

try { $json = $payload | ConvertFrom-Json } catch { exit 0 }

$sessionId = $json.session_id
if (-not $sessionId) { exit 0 }

if ($json.tool_name -eq 'Bash') {
    $cmd = $json.tool_input.command
    if ($cmd -and ($cmd -match 'proj-model-tier:')) {
        Clear-ModelRoutingClassification -SessionId $sessionId -Reason "ack: $cmd"
    }
}

exit 0
```

- [ ] **Step 2: Verify the ack clears the requirement**

Run:

```powershell
$sid = 'plan-test-track-1'
. plugins/claude-proj-agent/hooks/model-routing-lib.ps1
Set-ModelRoutingTeamRoleActive -SessionId $sid
Set-ModelRoutingClassificationRequired -SessionId $sid
('{"session_id":"' + $sid + '","tool_name":"Bash","tool_input":{"command":"echo proj-model-tier: level=2 tier=haiku reason=test"}}') | powershell -NoProfile -NonInteractive -File plugins/claude-proj-agent/hooks/model-routing-track.ps1
$s = Get-ModelRoutingState -SessionId $sid
if ($s.classificationRequired) { throw 'FAIL: ack did not clear requirement' }
Write-Host 'PASS: ack clears requirement'
```

Expected: `PASS: ack clears requirement`.

- [ ] **Step 3: Verify a non-ack Bash command does not clear the requirement**

Run (same `$sid`, re-arm first):

```powershell
Set-ModelRoutingClassificationRequired -SessionId $sid
('{"session_id":"' + $sid + '","tool_name":"Bash","tool_input":{"command":"echo just a normal command"}}') | powershell -NoProfile -NonInteractive -File plugins/claude-proj-agent/hooks/model-routing-track.ps1
$s2 = Get-ModelRoutingState -SessionId $sid
if (-not $s2.classificationRequired) { throw 'FAIL: unrelated command incorrectly cleared requirement' }
Write-Host 'PASS: unrelated command left requirement armed'
Remove-Item (Join-Path (Join-Path $env:TEMP 'proj-ai-agentic-model-routing') "$sid.state.json") -ErrorAction SilentlyContinue
Remove-Item (Join-Path (Join-Path $env:TEMP 'proj-ai-agentic-model-routing') "$sid.log") -ErrorAction SilentlyContinue
```

Expected: `PASS: unrelated command left requirement armed`.

- [ ] **Step 4: Leave uncommitted**

State in your response that `plugins/claude-proj-agent/hooks/model-routing-track.ps1` was created
and is sitting as an uncommitted change.

---

### Task 4: `model-routing-check.ps1` — `Stop` hook

**Files:**
- Create: `plugins/claude-proj-agent/hooks/model-routing-check.ps1`

**Interfaces:**
- Consumes: `Get-ModelRoutingState` (Task 1).
- Produces: the JSON `decision:block` output Claude Code's `Stop` event consumes — nothing later
  in this plan depends on this file's own exports.

- [ ] **Step 1: Write the file**

```powershell
# Stop hook. Fires at the end of every assistant turn - not just at the literal end of a session -
# so this only blocks when there is real, uncleared signal to act on.
#
# Blocks (decision:block, continue:false) only when model-routing-track.ps1's
# classificationRequired flag for this session is true, i.e. a new-task prompt was seen by
# model-routing-classify.ps1 (UserPromptSubmit) while a team persona was active, and no
# `proj-model-tier:` ack has been seen since. This is the technical backstop for
# model-routing.md/model-routing-levels.md's mandatory per-message classification - see those
# files for the full rule; this script only enforces "was a classification declared," it never
# judges whether the declared level/tier was the right one (that judgment stays the model's).
#
# Kept as its own triad rather than folded into delegation-check.ps1 because it answers a
# different question: delegation-check.ps1 asks "did heavy mechanical work stay inline too long,"
# this asks "was this task message classified at all" - unconditionally, once a team role is
# active, not only when heavy work was detected.
#
# Fails open (exit 0, never blocks) if the payload is missing session_id, or the state can't be
# read - an enforcement that can't name what to fix is worse than no enforcement.

. "$PSScriptRoot/model-routing-lib.ps1"

$payload = [Console]::In.ReadToEnd()
if (-not $payload) { exit 0 }

try { $json = $payload | ConvertFrom-Json } catch { exit 0 }

$sessionId = $json.session_id
if (-not $sessionId) { exit 0 }

$state = Get-ModelRoutingState -SessionId $sessionId
if (-not $state.classificationRequired) { exit 0 }

$reason = @"
Model-routing classification not declared yet: this task message was seen while a team persona
was active, but no proj-model-tier declaration has been made since.

Per model-routing.md / model-routing-levels.md's mandatory per-message classification: before
this turn can end, run:
echo proj-model-tier: level=<1-5> tier=<inline|haiku|sonnet|split> reason=<one line>
via Bash, matching the complexity level you actually applied to this message.

State the classification explicitly in your next response either way.
"@

$output = @{
    decision   = 'block'
    reason     = $reason
    continue   = $false
    stopReason = "Model-routing classification required - no proj-model-tier declaration seen this turn. See reason for exactly what to do."
}

$output | ConvertTo-Json -Compress
exit 0
```

- [ ] **Step 2: Verify it blocks when armed**

Run:

```powershell
$sid = 'plan-test-check-1'
. plugins/claude-proj-agent/hooks/model-routing-lib.ps1
Set-ModelRoutingTeamRoleActive -SessionId $sid
Set-ModelRoutingClassificationRequired -SessionId $sid
$out = ('{"session_id":"' + $sid + '"}') | powershell -NoProfile -NonInteractive -File plugins/claude-proj-agent/hooks/model-routing-check.ps1
if (($out | Out-String) -notmatch '"decision":"block"') { throw "FAIL: expected a block decision, got: $out" }
Write-Host 'PASS: blocks when armed'
```

Expected: `PASS: blocks when armed`.

- [ ] **Step 3: Verify it stays silent once cleared**

Run (same `$sid`):

```powershell
Clear-ModelRoutingClassification -SessionId $sid -Reason 'test'
$out2 = ('{"session_id":"' + $sid + '"}') | powershell -NoProfile -NonInteractive -File plugins/claude-proj-agent/hooks/model-routing-check.ps1
if ($out2) { throw "FAIL: expected silent exit after clear, got: $out2" }
Write-Host 'PASS: silent once cleared'
Remove-Item (Join-Path (Join-Path $env:TEMP 'proj-ai-agentic-model-routing') "$sid.state.json") -ErrorAction SilentlyContinue
Remove-Item (Join-Path (Join-Path $env:TEMP 'proj-ai-agentic-model-routing') "$sid.log") -ErrorAction SilentlyContinue
```

Expected: `PASS: silent once cleared`.

- [ ] **Step 4: Leave uncommitted**

State in your response that `plugins/claude-proj-agent/hooks/model-routing-check.ps1` was created
and is sitting as an uncommitted change.

---

### Task 5: Register the new triad in `hooks/hooks.json`

**Files:**
- Modify: `plugins/claude-proj-agent/hooks/hooks.json` (currently 53 lines — full content shown
  below for both old and new, since it's short enough to reproduce whole rather than as a diff
  fragment)

**Interfaces:**
- Consumes: the four file paths from Tasks 1–4 (referenced by `${CLAUDE_PLUGIN_ROOT}` path only —
  no PowerShell function calls here).
- Produces: nothing further downstream depends on this file's own content beyond Claude Code
  itself loading it.

- [ ] **Step 1: Replace the file's full contents**

Current content (for reference — do not leave any of this out when replacing):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|PowerShell",
        "hooks": [
          {
            "type": "command",
            "command": "powershell -NoProfile -NonInteractive -File \"${CLAUDE_PLUGIN_ROOT}/hooks/classify-http-readonly.ps1\""
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit|Bash",
        "hooks": [
          {
            "type": "command",
            "command": "powershell -NoProfile -NonInteractive -File \"${CLAUDE_PLUGIN_ROOT}/hooks/closeout-track.ps1\""
          }
        ]
      },
      {
        "matcher": "Bash|Read|Grep|Agent",
        "hooks": [
          {
            "type": "command",
            "command": "powershell -NoProfile -NonInteractive -File \"${CLAUDE_PLUGIN_ROOT}/hooks/delegation-track.ps1\""
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "powershell -NoProfile -NonInteractive -File \"${CLAUDE_PLUGIN_ROOT}/hooks/closeout-check.ps1\""
          }
        ]
      },
      {
        "hooks": [
          {
            "type": "command",
            "command": "powershell -NoProfile -NonInteractive -File \"${CLAUDE_PLUGIN_ROOT}/hooks/delegation-check.ps1\""
          }
        ]
      }
    ]
  }
}
```

New content (adds a `UserPromptSubmit` array, one new `PostToolUse` matcher entry, one new `Stop`
entry — every existing entry above is preserved verbatim, in the same order):

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "powershell -NoProfile -NonInteractive -File \"${CLAUDE_PLUGIN_ROOT}/hooks/model-routing-classify.ps1\""
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash|PowerShell",
        "hooks": [
          {
            "type": "command",
            "command": "powershell -NoProfile -NonInteractive -File \"${CLAUDE_PLUGIN_ROOT}/hooks/classify-http-readonly.ps1\""
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit|Bash",
        "hooks": [
          {
            "type": "command",
            "command": "powershell -NoProfile -NonInteractive -File \"${CLAUDE_PLUGIN_ROOT}/hooks/closeout-track.ps1\""
          }
        ]
      },
      {
        "matcher": "Bash|Read|Grep|Agent",
        "hooks": [
          {
            "type": "command",
            "command": "powershell -NoProfile -NonInteractive -File \"${CLAUDE_PLUGIN_ROOT}/hooks/delegation-track.ps1\""
          }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "powershell -NoProfile -NonInteractive -File \"${CLAUDE_PLUGIN_ROOT}/hooks/model-routing-track.ps1\""
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "powershell -NoProfile -NonInteractive -File \"${CLAUDE_PLUGIN_ROOT}/hooks/closeout-check.ps1\""
          }
        ]
      },
      {
        "hooks": [
          {
            "type": "command",
            "command": "powershell -NoProfile -NonInteractive -File \"${CLAUDE_PLUGIN_ROOT}/hooks/delegation-check.ps1\""
          }
        ]
      },
      {
        "hooks": [
          {
            "type": "command",
            "command": "powershell -NoProfile -NonInteractive -File \"${CLAUDE_PLUGIN_ROOT}/hooks/model-routing-check.ps1\""
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Verify the JSON is well-formed and every new entry is present**

Run:

```powershell
$j = Get-Content plugins/claude-proj-agent/hooks/hooks.json -Raw | ConvertFrom-Json
if (-not $j.hooks.UserPromptSubmit) { throw 'FAIL: UserPromptSubmit missing' }
if (($j.hooks.PostToolUse | Where-Object { $_.matcher -eq 'Bash' -and $_.hooks[0].command -match 'model-routing-track' }).Count -ne 1) { throw 'FAIL: model-routing-track PostToolUse entry missing' }
if (($j.hooks.Stop | Where-Object { $_.hooks[0].command -match 'model-routing-check' }).Count -ne 1) { throw 'FAIL: model-routing-check Stop entry missing' }
if (($j.hooks.PostToolUse | Where-Object { $_.hooks[0].command -match 'closeout-track' }).Count -ne 1) { throw 'FAIL: closeout-track entry lost' }
if (($j.hooks.PostToolUse | Where-Object { $_.hooks[0].command -match 'delegation-track' }).Count -ne 1) { throw 'FAIL: delegation-track entry lost' }
if (($j.hooks.Stop | Where-Object { $_.hooks[0].command -match 'closeout-check' }).Count -ne 1) { throw 'FAIL: closeout-check entry lost' }
if (($j.hooks.Stop | Where-Object { $_.hooks[0].command -match 'delegation-check' }).Count -ne 1) { throw 'FAIL: delegation-check entry lost' }
Write-Host 'PASS: hooks.json valid and complete'
```

Expected: `PASS: hooks.json valid and complete`.

- [ ] **Step 3: Leave uncommitted**

State in your response that `plugins/claude-proj-agent/hooks/hooks.json` was updated (three new
entries, nothing removed) and is sitting as an uncommitted change.

---

### Task 6: `commands/team/model-routing-levels.md` — the 5-level rubric

**Files:**
- Create: `plugins/claude-proj-agent/commands/team/model-routing-levels.md`

**Interfaces:**
- Consumes: nothing (pure documentation).
- Produces: `@`-included from `model-routing.md` (Task 7); the ack `tier=` vocabulary
  (`inline|haiku|sonnet|split`) this file defines must match exactly what
  `model-routing-classify.ps1`'s reminder text (Task 2) and `model-routing-check.ps1`'s reason
  text (Task 4) already print.

- [ ] **Step 1: Write the file**

```markdown
# Model-Routing Complexity Levels (1-5)

Companion to `model-routing.md` — `@`-included from it, refining the Gather/Judge/Escalate tiers
defined there with finer-grained, per-message guidance. Read `model-routing.md` first for what
each tier (`haiku`/`sonnet`/`opus`) actually means; this file only adds the 1-5 classification a
persona declares per task message once `hooks/model-routing-classify.ps1` requires it (see that
hook and `hooks/model-routing-check.ps1` for the technical enforcement — this file is the rubric
they enforce, not the enforcement mechanism itself).

Every new-task message, while any `commands/team/*-agent.md` persona is active, must be
classified against exactly one of the five levels below and declared via:

```
echo proj-model-tier: level=<1-5> tier=<inline|haiku|sonnet|split> reason=<one line>
```

⸻

## Level 1 — Trivial (`tier: inline`)

One fact, one file, one yes/no confirmation — a single targeted lookup, not multi-file
exploration. Stays on the session's own current model. **No forced `Agent` spawn** — the fixed
cost of a fresh subagent context (no benefit from this session's already-warm prompt cache, plus
round-trip latency) outweighs the per-token saving for something this small. This is the same
carve-out `base-agent.md`'s "Delegation & Model Routing" already states: "a single targeted
lookup... is not itself a violation."

Examples: reading one named file to answer "what does X currently say," confirming one config
value, a yes/no check against a single already-open source.

⸻

## Level 2 — Routine Gather (`tier: haiku`)

Multi-file exploration, fetching, context/doc collection, "what already exists" audits — anything
spanning more than one source. **Mandatory** fresh `Agent` call with `model:"haiku"`. Never run by
the session's own reasoning inline — this is exactly `model-routing.md`'s Gather stage.

Examples: scanning `docs/frame-specs/` for every mention of a convention, collecting every file
under a folder before an audit, fetching a ticket's Jira description plus its linked Confluence
page.

⸻

## Level 3 — Mixed: Gather then Judge (`tier: split`)

The task needs both fetching material and rendering a verdict on it. Haiku Gather subagent first,
Sonnet Judge pass second — both steps required, per `model-routing.md`'s "never let the Judge
stage fetch its own context" rule. Declare `tier: split` once, covering both steps of the same
message.

Examples: "review this MR for staleness" (fetch the diff, then judge it), "check if these three
docs still agree with each other" (fetch all three, then judge consistency).

⸻

## Level 4 — Judgment (`tier: sonnet`)

Architecture/design decisions, writing or updating tests, correctness/quality analysis, doc/spec
authoring, review verdicts. Stays on the session's own current model (normally Sonnet already) —
an isolated `Agent` call with `model:"sonnet"` is fine if isolation is wanted, but never forced.

Examples: designing a new command/persona file, writing a Playwright test, resolving a
Justified/Not Justified challenge, authoring a spec.

⸻

## Level 5 — Cross-cutting / High-stakes (`tier: sonnet`, `opus` only if user-authorized)

Framework-wide restructuring, a decision spanning more than one role, any edit to a shared
convention file (`base-agent.md` itself, this file, `model-routing.md`). Mandatory Sonnet. Opus
is reached only if the user explicitly authorizes it for this specific case, right now —
`model-routing.md`'s existing Escalation tier rule, unchanged by this file: there is no autonomous
path to Opus, ever.

Examples: restructuring `commands/team/`, changing which personas exist, editing `base-agent.md`.

⸻

## Choosing between levels

When a task straddles two levels, declare the higher one — the classification exists to prevent
under-delegating expensive Sonnet reasoning to a routine gather task, not to find the cheapest
label that technically fits.
```

- [ ] **Step 2: Verify all five levels are present**

Run:

```powershell
$content = Get-Content plugins/claude-proj-agent/commands/team/model-routing-levels.md -Raw
1..5 | ForEach-Object {
    if ($content -notmatch "## Level $_ ") { throw "FAIL: Level $_ heading missing" }
}
Write-Host 'PASS: all 5 levels present'
```

Expected: `PASS: all 5 levels present`.

- [ ] **Step 3: Leave uncommitted**

State in your response that `plugins/claude-proj-agent/commands/team/model-routing-levels.md` was
created and is sitting as an uncommitted change.

---

### Task 7: Wire `model-routing-levels.md` into `model-routing.md`

**Files:**
- Modify: `plugins/claude-proj-agent/commands/team/model-routing.md:11-13` (the blank line and
  `⸻` divider immediately before `## Gather stage — \`model: "haiku"\``)

**Interfaces:**
- Consumes: `commands/team/model-routing-levels.md` (Task 6).
- Produces: nothing further downstream — this is documentation only.

- [ ] **Step 1: Insert the new section**

Find this exact text (lines 11–14 of the current file):

```
is that the model actually switches, not that a cheaper one is merely suggested in a comment.

⸻

## Gather stage — `model: "haiku"`
```

Replace it with:

```
is that the model actually switches, not that a cheaper one is merely suggested in a comment.

⸻

## Mandatory per-message classification (5 levels)

Every new-task message, while any `commands/team/*-agent.md` persona is active, must be
classified against the 5-level rubric in `model-routing-levels.md` and declared via
`echo proj-model-tier: level=<1-5> tier=<inline|haiku|sonnet|split> reason=<one line>`. This is not
advisory: `hooks/model-routing-classify.ps1` (`UserPromptSubmit`) injects the requirement on every
qualifying message, `hooks/model-routing-track.ps1` (`PostToolUse`) watches for the ack, and
`hooks/model-routing-check.ps1` (`Stop`) blocks the turn from ending until it's seen — the same
declare-and-check pattern `delegation-check.ps1`/`closeout-check.ps1` already use for their own
concerns. See `docs/architecture/2026-09-01-model-routing-enforcement-design.md` for the full
design.

@${CLAUDE_PLUGIN_ROOT}/commands/team/model-routing-levels.md

⸻

## Gather stage — `model: "haiku"`
```

- [ ] **Step 2: Verify the include line and section are present**

Run:

```powershell
$content = Get-Content plugins/claude-proj-agent/commands/team/model-routing.md -Raw
if ($content -notmatch [regex]::Escape('@${CLAUDE_PLUGIN_ROOT}/commands/team/model-routing-levels.md')) { throw 'FAIL: include line missing' }
if ($content -notmatch 'Mandatory per-message classification') { throw 'FAIL: new section heading missing' }
Write-Host 'PASS: model-routing.md wired to model-routing-levels.md'
```

Expected: `PASS: model-routing.md wired to model-routing-levels.md`.

- [ ] **Step 3: Leave uncommitted**

State in your response that `plugins/claude-proj-agent/commands/team/model-routing.md` was updated
and is sitting as an uncommitted change.

---

### Task 8: Update `commands/team/INDEX.md`

**Files:**
- Modify: `plugins/claude-proj-agent/commands/team/INDEX.md:11` (the existing `model-routing.md`
  table row)

**Interfaces:**
- Consumes: nothing beyond the existing table shape.
- Produces: nothing further downstream — documentation only.

- [ ] **Step 1: Insert a new row immediately after the `model-routing.md` row**

Find this exact line:

```
| `model-routing.md` | The Gather(Haiku)/Judge(Sonnet)/Escalate(Opus, disabled by default — user-authorized only) subagent-delegation convention, plus its Fork-vs-fresh-subagent guidance — `@`-included by `base-agent.md` itself, so every persona has it; also used directly by the `review-pr-commands` family. Read this before spawning any subagent or picking a model tier. |
```

Replace it with (the original line, unchanged, plus one new row directly below):

```
| `model-routing.md` | The Gather(Haiku)/Judge(Sonnet)/Escalate(Opus, disabled by default — user-authorized only) subagent-delegation convention, plus its Fork-vs-fresh-subagent guidance — `@`-included by `base-agent.md` itself, so every persona has it; also used directly by the `review-pr-commands` family. Read this before spawning any subagent or picking a model tier. |
| `model-routing-levels.md` | The 5-level complexity rubric (1–5) `@`-included from `model-routing.md`, refining its Gather/Judge/Escalate tiers with per-message granularity — hook-enforced via the `proj-model-tier` declaration (`hooks/model-routing-classify.ps1`/`model-routing-track.ps1`/`model-routing-check.ps1`), required while a team persona is active. |
```

- [ ] **Step 2: Verify the row was added**

Run:

```powershell
$content = Get-Content plugins/claude-proj-agent/commands/team/INDEX.md -Raw
if ($content -notmatch [regex]::Escape('`model-routing-levels.md`')) { throw 'FAIL: new row missing' }
Write-Host 'PASS: INDEX.md updated'
```

Expected: `PASS: INDEX.md updated`.

- [ ] **Step 3: Leave uncommitted**

State in your response that `plugins/claude-proj-agent/commands/team/INDEX.md` was updated and is
sitting as an uncommitted change.

---

### Task 9: Update the root `README.md` hooks description

**Files:**
- Modify: `README.md:43-47` (the `hooks/` bullet point)

**Interfaces:**
- Consumes: nothing beyond the existing bullet's shape.
- Produces: nothing further downstream — documentation only.

**Note:** while touching this bullet, also fold in `delegation-track.ps1`/`delegation-check.ps1`,
which this file's own drift check turned up as never having been added here despite already
existing on `main` — fixing it now costs nothing extra since the same bullet is being rewritten
anyway (see the design doc's discussion of this).

- [ ] **Step 1: Replace the bullet**

Find this exact text:

```
- **`hooks/`** — a `PreToolUse` hook that auto-approves read-only Bash/PowerShell commands and
  only prompts on mutating ones; a `PostToolUse`/`Stop` pair (`closeout-track.ps1`/
  `closeout-check.ps1`) that enforces `context-resolution.md`'s Task Closeout Protocol as a
  technical backstop, not just a prompt instruction — see that file's "Task Closeout Protocol"
  section for the rule and the `proj-closeout-ack` escape hatch.
```

Replace it with:

```
- **`hooks/`** — a `PreToolUse` hook that auto-approves read-only Bash/PowerShell commands and
  only prompts on mutating ones; three `PostToolUse`/`Stop` pairs that enforce prose conventions
  as technical backstops, not just prompt instructions — `closeout-track.ps1`/`closeout-check.ps1`
  for `context-resolution.md`'s Task Closeout Protocol (`proj-closeout-ack` escape hatch),
  `delegation-track.ps1`/`delegation-check.ps1` for `model-routing.md`'s Gather-stage delegation
  (`proj-delegation-ack` escape hatch), and `model-routing-track.ps1`/`model-routing-check.ps1`
  (plus a `UserPromptSubmit` hook, `model-routing-classify.ps1`) for `model-routing.md`/
  `model-routing-levels.md`'s mandatory per-message complexity classification (`proj-model-tier`
  declaration) — see each pair's own header comment for its exact rule and escape hatch.
```

- [ ] **Step 2: Verify the bullet mentions all three triads**

Run:

```powershell
$content = Get-Content README.md -Raw
foreach ($token in @('closeout-track.ps1', 'delegation-track.ps1', 'model-routing-track.ps1', 'model-routing-classify.ps1')) {
    if ($content -notmatch [regex]::Escape($token)) { throw "FAIL: $token not mentioned in README.md" }
}
Write-Host 'PASS: README.md hooks bullet complete'
```

Expected: `PASS: README.md hooks bullet complete`.

- [ ] **Step 3: Leave uncommitted**

State in your response that `README.md` was updated and is sitting as an uncommitted change.

---

### Task 10: End-to-end chained verification

**Files:**
- None created or modified — this task only runs Tasks 1–5's scripts together, as a real
  classify → track → check chain sharing one session id, since Tasks 2–4 each tested their hook
  in isolation against manually pre-seeded state.

**Interfaces:**
- Consumes: `model-routing-classify.ps1` (Task 2), `model-routing-track.ps1` (Task 3),
  `model-routing-check.ps1` (Task 4), `hooks.json` (Task 5).
- Produces: nothing — this is the plan's final verification gate.

- [ ] **Step 1: Full chain — armed, blocked, acked, cleared**

Run:

```powershell
$sid = 'plan-test-e2e-1'
$hooksDir = 'plugins/claude-proj-agent/hooks'

# 1. First message: activates the team role and, being long/task-shaped, arms classification.
$out1 = ('{"session_id":"' + $sid + '","prompt":"/claude-proj-agent:team:ai-architect-agent review the docs folder for drift"}') | powershell -NoProfile -NonInteractive -File "$hooksDir/model-routing-classify.ps1"
if (($out1 | Out-String) -notmatch 'proj-model-tier') { throw "FAIL step 1: expected reminder, got: $out1" }

# 2. Stop fires before any ack -> must block.
$out2 = ('{"session_id":"' + $sid + '"}') | powershell -NoProfile -NonInteractive -File "$hooksDir/model-routing-check.ps1"
if (($out2 | Out-String) -notmatch '"decision":"block"') { throw "FAIL step 2: expected block, got: $out2" }

# 3. Model declares the ack via Bash.
$out3 = ('{"session_id":"' + $sid + '","tool_name":"Bash","tool_input":{"command":"echo proj-model-tier: level=2 tier=haiku reason=folder audit"}}') | powershell -NoProfile -NonInteractive -File "$hooksDir/model-routing-track.ps1"

# 4. Stop fires again -> must now be silent.
$out4 = ('{"session_id":"' + $sid + '"}') | powershell -NoProfile -NonInteractive -File "$hooksDir/model-routing-check.ps1"
if ($out4) { throw "FAIL step 4: expected silence after ack, got: $out4" }

# 5. A trivial follow-up reply must not re-arm anything.
$out5 = ('{"session_id":"' + $sid + '","prompt":"спасибо"}') | powershell -NoProfile -NonInteractive -File "$hooksDir/model-routing-classify.ps1"
if ($out5) { throw "FAIL step 5: trivial reply should not re-arm, got: $out5" }
$out6 = ('{"session_id":"' + $sid + '"}') | powershell -NoProfile -NonInteractive -File "$hooksDir/model-routing-check.ps1"
if ($out6) { throw "FAIL step 6: expected silence after trivial reply, got: $out6" }

Write-Host 'PASS: full classify -> block -> ack -> clear -> trivial-reply-noop chain'

# cleanup
. "$hooksDir/model-routing-lib.ps1"
Remove-Item (Join-Path (Join-Path $env:TEMP 'proj-ai-agentic-model-routing') "$sid.state.json") -ErrorAction SilentlyContinue
Remove-Item (Join-Path (Join-Path $env:TEMP 'proj-ai-agentic-model-routing') "$sid.log") -ErrorAction SilentlyContinue
```

Expected: `PASS: full classify -> block -> ack -> clear -> trivial-reply-noop chain`, no `FAIL`
thrown at any step.

- [ ] **Step 2: Confirm no regression in the existing two triads**

Run the existing `closeout-check.ps1` and `delegation-check.ps1` against a session with no signal
armed, confirming both still fail open silently (they are untouched by this plan, but `hooks.json`
was edited, so confirm Claude Code still loads them):

```powershell
$sid = 'plan-test-regression-1'
$out1 = ('{"session_id":"' + $sid + '"}') | powershell -NoProfile -NonInteractive -File plugins/claude-proj-agent/hooks/closeout-check.ps1
if ($out1) { throw "FAIL: closeout-check.ps1 unexpectedly produced output: $out1" }
$out2 = ('{"session_id":"' + $sid + '"}') | powershell -NoProfile -NonInteractive -File plugins/claude-proj-agent/hooks/delegation-check.ps1
if ($out2) { throw "FAIL: delegation-check.ps1 unexpectedly produced output: $out2" }
Write-Host 'PASS: no regression in existing triads'
```

Expected: `PASS: no regression in existing triads`.

- [ ] **Step 3: Report final state**

Summarize in your response: which 5 files were created (`model-routing-lib.ps1`,
`model-routing-classify.ps1`, `model-routing-track.ps1`, `model-routing-check.ps1`,
`model-routing-levels.md`), which 4 files were modified (`hooks.json`, `model-routing.md`,
`commands/team/INDEX.md`, `README.md`), and that all of them remain uncommitted — ready for the
user to review and run `/create-pr` when they choose.

---

## Plan self-review notes

- **Spec coverage:** §3.1 (state shape) → Task 1. §3.2/§3.2.1/§3.2.2 (classify hook + heuristic +
  reminder text) → Task 2. §3.3 (track hook) → Task 3. §3.4 (check hook) → Task 4. §3.5
  (hooks.json) → Task 5. §4 (5-level table) → Task 6. The `model-routing.md` wiring implied by §4's
  "`@`-included from `model-routing.md`" → Task 7. Decision D2's "silent outside team-role
  sessions" and D4's "lenient ack match" are exercised directly by Task 2/Task 3's own test steps.
  §7's 5-point manual testing plan is covered by Task 10's chained run (points 1–3 and 5 of that
  list) and Task 2/Task 3's individual steps (point 4, no-team-role silence). §6 non-goals
  (Agent-`model`-param checking) intentionally has no task — confirmed as correctly out of scope.
- **Placeholder scan:** none found — every step has real, runnable code or an exact find/replace
  text block.
- **Type/name consistency:** `Get-ModelRoutingState`/`Set-ModelRoutingState`/
  `Set-ModelRoutingTeamRoleActive`/`Set-ModelRoutingClassificationRequired`/
  `Clear-ModelRoutingClassification`/`Write-ModelRoutingLog` are defined once in Task 1 and reused
  verbatim (same names, same parameters) in Tasks 2–4 and in every test step. The `tier=`
  vocabulary (`inline|haiku|sonnet|split`) is identical across Task 2's reminder text, Task 4's
  block reason, and Task 6's rubric file.
