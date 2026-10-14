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

$payload = Read-HookPayload
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
