# PostToolUse hook (Write|Edit|Bash). Bookkeeping only - never blocks, never denies, exit 0 always.
#
# Tracks, per session, whether a file that Claude Code's installed **plugin cache** actually serves
# (anything under plugins/claude-proj-agent/ except docs/ and rules/, which are always read live
# from the git working tree - see base-agent.md's "Repository & Persistence Model") was edited
# since the last time plugin.json's own `version` field was bumped. version-bump-check.ps1 (the
# Stop hook) reads the resulting counter to decide whether to require a bump before the turn can
# end.
#
# A version bump is detected by comparing the working-tree plugin.json's `version` against the
# last-committed (HEAD) one - so a bump made and committed earlier in the same session correctly
# clears the counter for edits made after it, without needing a separate "session baseline" file.
# The escape hatch mirrors closeout-track.ps1's: a Bash command containing the literal token
# `proj-version-bump-ack` clears the counter (for the rare edit that genuinely doesn't need one -
# e.g. touching only a comment, or a hook script that isn't plugin-cache-served).
#
# Deliberately fails open: if the proj-ai-agentic tree can't be resolved, or the session id is
# missing, this hook does nothing rather than guess - per base-agent.md, "never guess."

. "$PSScriptRoot/version-bump-lib.ps1"

$payload = Read-HookPayload
if (-not $payload) { exit 0 }

try { $json = $payload | ConvertFrom-Json } catch { exit 0 }

$sessionId = $json.session_id
if (-not $sessionId) { exit 0 }

$projAiAgenticRoot = Resolve-CbsAiAgenticRoot
if (-not $projAiAgenticRoot) { exit 0 }  # can't resolve the tree -> nothing to enforce, stay silent

if ($json.tool_name -eq 'Bash') {
    $cmd = $json.tool_input.command
    if ($cmd -and ($cmd -match 'proj-version-bump-ack')) {
        Reset-VersionBumpCounter -SessionId $sessionId -Reason "explicit ack: $cmd"
    }
    exit 0
}

$filePath = $json.tool_input.file_path
if (-not $filePath) { $filePath = $json.tool_response.filePath }
if (-not $filePath) { exit 0 }

$pluginRoot = Join-Path $projAiAgenticRoot 'plugins/claude-proj-agent'
if (-not (Test-UnderPath -Path $filePath -Base $pluginRoot)) { exit 0 }  # not this plugin's own tree

$pluginJsonPath = Join-Path $pluginRoot '.claude-plugin/plugin.json'

if (Test-UnderPath -Path $filePath -Base $pluginJsonPath) {
    # plugin.json itself was edited - only a version-field change counts as the bump.
    $workingVersion = Get-PluginJsonVersion -Path $pluginJsonPath
    $headVersion = Get-PluginJsonVersion -CbsAiAgenticRoot $projAiAgenticRoot
    if ($workingVersion -and $headVersion -and ($workingVersion -ne $headVersion)) {
        Reset-VersionBumpCounter -SessionId $sessionId -Reason "version bumped: $headVersion -> $workingVersion"
    }
    exit 0
}

$docsRoot = Join-Path $pluginRoot 'docs'
$rulesRoot = Join-Path $pluginRoot 'rules'
if ((Test-UnderPath -Path $filePath -Base $docsRoot) -or (Test-UnderPath -Path $filePath -Base $rulesRoot)) {
    exit 0  # read live from the working tree, never cached - no bump needed
}

Add-VersionBumpSignal -SessionId $sessionId -FilePath $filePath
exit 0
