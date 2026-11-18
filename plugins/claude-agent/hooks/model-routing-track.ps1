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

$payload = Read-HookPayload
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
