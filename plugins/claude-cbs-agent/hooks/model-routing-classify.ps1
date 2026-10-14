# UserPromptSubmit hook. Fires on every user message. Only ever injects context or stays silent -
# never blocks a prompt (blocking is model-routing-check.ps1's job, on Stop, per this repo's own
# track/check separation - see that file's header). See docs/architecture/
# 2026-09-01-model-routing-enforcement-design.md for the full design.
#
# Scope: silent no-op until a team persona has been invoked in this session at least once - a
# prompt starting with `/claude-proj-agent:team:` or `/claude-proj-agent:execution:` (the latter
# covers commands/execution/*/ commands, which each @-include a commands/team/*-agent.md persona)
# - this enforcement is for the virtual team's own task-routing discipline, not every session this
# plugin happens to be enabled in. The match is anchored to the start of the (trimmed) prompt, so a
# prompt that merely mentions one of these command strings mid-sentence does not arm it.
#
# Once a team role is active, every subsequent prompt that isn't a short trivial reply
# (greeting/ack/one-word confirmation - see $trivialPattern) arms classificationRequired and
# injects the reminder below. model-routing-check.ps1 (Stop hook) blocks the turn end until
# model-routing-track.ps1 (PostToolUse/Bash) sees the proj-model-tier ack clear it.
#
# Fails open (exit 0, no output) if the payload is missing session_id/prompt.

. "$PSScriptRoot/model-routing-lib.ps1"

$payload = Read-HookPayload
if (-not $payload) { exit 0 }

try { $json = $payload | ConvertFrom-Json } catch { exit 0 }

Remove-StaleHookState

$sessionId = $json.session_id
$prompt = $json.prompt
if (-not $sessionId -or -not $prompt) { exit 0 }

if ($prompt.TrimStart() -match '^/claude-proj-agent:(team|execution):') {
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
