# PostToolUse hook (Bash|Read|Grep|Agent). Bookkeeping only - never blocks, never denies, exit 0
# always. See delegation-lib.ps1 for the rationale and its one known, unverified limitation
# (possible false positives from a subagent's own tool calls sharing this session_id).
#
# Tracks, per session, a "heavy mechanical call happened inline" violation count, incremented
# when:
#   - a Bash command looks like a raw network fetch (curl/wget/Invoke-WebRequest/
#     Invoke-RestMethod/iwr/irm), or
#   - a Read/Grep call is the 6th+ in a row with no intervening Agent call - per base-agent.md's
#     own "heavy multi-file exploration... is itself a smell" rule.
# An Agent tool call resets both the violation count and the consecutive Read/Grep count to 0 -
# delegation happened, whatever was pending is resolved. The literal Bash token
# `proj-delegation-ack` is the explicit "I judged this didn't need delegation" escape hatch,
# mirroring closeout-track.ps1's `proj-closeout-ack`.
#
# delegation-check.ps1 (the Stop hook) reads the resulting violations count to decide whether to
# remind before the turn can end.

. "$PSScriptRoot/delegation-lib.ps1"

$payload = Read-HookPayload
if (-not $payload) { exit 0 }

try { $json = $payload | ConvertFrom-Json } catch { exit 0 }

$sessionId = $json.session_id
if (-not $sessionId) { exit 0 }

$toolName = $json.tool_name

if ($toolName -eq 'Agent') {
    Reset-DelegationState -SessionId $sessionId -Reason 'Agent tool called - delegation happened'
    exit 0
}

if ($toolName -eq 'Bash') {
    $cmd = $json.tool_input.command
    if ($cmd -and ($cmd -match 'proj-delegation-ack')) {
        Reset-DelegationState -SessionId $sessionId -Reason "explicit ack: $cmd"
        exit 0
    }
    if ($cmd -and ($cmd -match '(?i)(^|[\s;|&])(curl|wget|Invoke-WebRequest|Invoke-RestMethod|iwr|irm)\b')) {
        $state = Get-DelegationState -SessionId $sessionId
        $state.violations += 1
        Set-DelegationState -SessionId $sessionId -State $state
        Write-DelegationLog -SessionId $sessionId -Message "VIOLATION (curl/network Bash inline): $cmd (violations=$($state.violations))"
    }
    exit 0
}

if ($toolName -eq 'Read' -or $toolName -eq 'Grep') {
    $state = Get-DelegationState -SessionId $sessionId
    $state.consecutiveReadGrep += 1
    if ($state.consecutiveReadGrep -gt 5) {
        $state.violations += 1
        Write-DelegationLog -SessionId $sessionId -Message "VIOLATION (Read/Grep #$($state.consecutiveReadGrep) with no Agent call in between) (violations=$($state.violations))"
    }
    Set-DelegationState -SessionId $sessionId -State $state
    exit 0
}

exit 0
