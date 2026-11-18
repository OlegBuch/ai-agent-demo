# Stop hook. Fires at the end of every assistant turn - not just at the literal end of a session -
# so this only blocks when there is real, uncleared signal to act on; everything else must fail
# open, or every ordinary reply would get force-extended.
#
# Blocks (decision:block, continue:false) only when delegation-track.ps1's violations counter for
# this session is > 0, i.e. a network fetch (curl/wget/...) ran inline in Bash, or more than 5
# consecutive Read/Grep calls happened with no intervening Agent call, since the last Agent
# delegation or explicit `proj-delegation-ack`. This is the technical backstop for base-agent.md's
# "Delegation & Model Routing" / model-routing.md's Gather-stage convention - see those files for
# the full rule; this script only enforces "did mechanical work stay inline too long," it never
# judges whether THIS SPECIFIC task genuinely needed delegation (that judgment stays the model's -
# a short, one-off Read or a single non-network Bash command is not itself a violation).
#
# Fails open (exit 0, never blocks) if the payload is missing session_id, or the counter can't be
# read - an enforcement that can't name what to fix is worse than no enforcement.

. "$PSScriptRoot/delegation-lib.ps1"

$payload = Read-HookPayload
if (-not $payload) { exit 0 }

try { $json = $payload | ConvertFrom-Json } catch { exit 0 }

$sessionId = $json.session_id
if (-not $sessionId) { exit 0 }

$state = Get-DelegationState -SessionId $sessionId
if ($state.violations -le 0) { exit 0 }

$reason = @"
Delegation check: $($state.violations) heavy mechanical call(s) (a raw curl/network Bash command, or more than 5 consecutive Read/Grep calls) ran inline in the main thread this session with no Agent-tool delegation since.

Per base-agent.md's "Delegation & Model Routing" / model-routing.md's Gather stage: fetch/read/mechanical-summarize work belongs in a fresh Haiku subagent (Agent tool, model: "haiku"), not inline here - it crowds out the judgment work this context actually needs.

Before this turn can end, do ONE of:
1. If more inline mechanical work is still needed, delegate it now via the Agent tool (a fresh Haiku Gather subagent) - this clears the counter automatically.
2. If the inline work already finished and was genuinely too small/one-off to warrant delegation (a single targeted lookup, not multi-file exploration), run: echo proj-delegation-ack: <one-line reason> via Bash to clear this check explicitly.

State which of the two applies in your next response.
"@

$output = @{
    decision   = 'block'
    reason     = $reason
    continue   = $false
    stopReason = "Delegation check required - $($state.violations) uncleared inline mechanical call(s). See reason for exactly what to do."
}

$output | ConvertTo-Json -Compress
exit 0
