# Stop hook. Fires at the end of every assistant turn (Claude Code's "Stop" event) - not just at
# the literal end of a session - so this only blocks when there is real, uncleared signal to act
# on; everything else must fail open, or every ordinary reply would get force-extended.
#
# Blocks (decision:block, continue:false) only when closeout-track.ps1's counter for this session
# is > 0, i.e. a file outside proj-ai-agentic's docs/ was edited since the last docs update or
# explicit `proj-closeout-ack` command. This is the technical backstop for
# context-resolution.md's "Task Closeout Protocol" - see that file for the full rule; this script
# only enforces "did SOMETHING happen," it never judges WHICH docs/ file was the right one to
# touch (that judgment stays the model's).
#
# Fails open (exit 0, never blocks) if the proj-ai-agentic tree can't be resolved, or the payload
# is missing session_id - an enforcement that can't name what to fix is worse than no enforcement.

. "$PSScriptRoot/closeout-lib.ps1"

$payload = Read-HookPayload
if (-not $payload) { exit 0 }

try { $json = $payload | ConvertFrom-Json } catch { exit 0 }

$sessionId = $json.session_id
if (-not $sessionId) { exit 0 }

$count = Get-CloseoutCount -SessionId $sessionId
if ($count -le 0) { exit 0 }

$projAiAgenticRoot = Resolve-CbsAiAgenticRoot
if (-not $projAiAgenticRoot) { exit 0 }

$reason = @"
Task Closeout Protocol not run yet: $count file(s) outside proj-ai-agentic's own docs/ were edited this turn/session with no docs update or explicit ack since.

Before this turn can end, do ONE of:
1. Update the relevant docs/module-theory/<Module>/, docs/common-issues/, or docs/frame-specs/ file in the proj-ai-agentic working tree at $projAiAgenticRoot (see context-resolution.md's "Task Closeout Protocol" for which file matches what you did), then state explicitly what you updated.
2. If you already judged nothing applies (pure question, no new fact or decision), run: echo proj-closeout-ack: <one-line reason> via Bash - this is the documented escape hatch, not a workaround.

State the closeout explicitly in your next response either way.
"@

$output = @{
    decision   = 'block'
    reason     = $reason
    continue   = $false
    stopReason = "Task Closeout Protocol required - $count uncleared edit(s). See reason for exactly what to do."
}

$output | ConvertTo-Json -Compress
exit 0
