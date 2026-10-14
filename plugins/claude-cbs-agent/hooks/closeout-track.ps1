# PostToolUse hook (Write|Edit|Bash). Bookkeeping only - never blocks, never denies, exit 0 always.
#
# Tracks, per session, whether "real work" (an edit outside this plugin's own docs/) has happened
# since the last Task Closeout. A closeout is either:
#   (a) an Edit/Write to a file under proj-ai-agentic's own docs/ (a real update), or
#   (b) a Bash command containing the literal token `proj-closeout-ack` (the explicit "I checked,
#       nothing applies" escape hatch - see context-resolution.md's Task Closeout Protocol; this
#       exists so the enforcement never forces a busywork docs edit when the protocol's own
#       documented answer is "nothing to close out this task").
# closeout-check.ps1 (the Stop hook) reads the resulting counter to decide whether to require a
# closeout before the turn can end.
#
# Deliberately fails open: if the proj-ai-agentic tree can't be resolved, or the session id is
# missing, this hook does nothing rather than guess - per base-agent.md, "never guess."

. "$PSScriptRoot/closeout-lib.ps1"

$payload = Read-HookPayload
if (-not $payload) { exit 0 }

try { $json = $payload | ConvertFrom-Json } catch { exit 0 }

$sessionId = $json.session_id
if (-not $sessionId) { exit 0 }

if ($json.tool_name -eq 'Bash') {
    $cmd = $json.tool_input.command
    if ($cmd -and ($cmd -match 'proj-closeout-ack')) {
        Reset-CloseoutCounter -SessionId $sessionId -Reason "explicit ack: $cmd"
    }
    exit 0
}

$filePath = $json.tool_input.file_path
if (-not $filePath) { $filePath = $json.tool_response.filePath }
if (-not $filePath) { exit 0 }

$projAiAgenticRoot = Resolve-CbsAiAgenticRoot
if (-not $projAiAgenticRoot) { exit 0 }  # can't resolve the tree -> nothing to enforce, stay silent

$docsRoot = Join-Path $projAiAgenticRoot 'plugins/claude-proj-agent/docs'

if (Test-UnderPath -Path $filePath -Base $docsRoot) {
    Reset-CloseoutCounter -SessionId $sessionId -Reason "docs edit: $filePath"
    exit 0
}

# A file inside the proj-ai-agentic tree but outside docs/ (a persona/command/rule edit) isn't
# "product work" needing a closeout either - only product-repo work is what the protocol is for.
if (Test-UnderPath -Path $filePath -Base $projAiAgenticRoot) { exit 0 }

# Scratchpad/temp writes are explicitly not deliverables - don't count them.
if ($env:TEMP -and (Test-UnderPath -Path $filePath -Base $env:TEMP)) { exit 0 }

Add-CloseoutSignal -SessionId $sessionId -FilePath $filePath
exit 0
