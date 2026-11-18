# Stop hook. Fires at the end of every assistant turn (Claude Code's "Stop" event) - not just at
# the literal end of a session - so this only blocks when there is real, uncleared signal to act
# on; everything else must fail open, or every ordinary reply would get force-extended.
#
# Blocks (decision:block, continue:false) only when version-bump-track.ps1's counter for this
# session is > 0, i.e. a plugin-cache-served file (commands/, hooks/, skills, .mcp.json - anything
# under plugins/claude-proj-agent/ except docs/ and rules/) was edited since the last time
# .claude-plugin/plugin.json's `version` was bumped. This is the technical backstop for keeping
# the installed plugin cache (${CLAUDE_PLUGIN_ROOT}, refreshed only on version bump - see
# base-agent.md's "Repository & Persistence Model") from silently drifting behind the marketplace
# source, the same failure mode this session hit: a renamed MCP server (allure-testops ->
# allure-testops-custom) that never took effect for the user because plugin.json's version never
# changed. This script only enforces "did SOMETHING happen," it never picks the semver bump size
# (patch/minor/major) - that judgment stays the model's (the ai-architect-agent role).
#
# Fails open (exit 0, never blocks) if the proj-ai-agentic tree can't be resolved, or the payload
# is missing session_id - an enforcement that can't name what to fix is worse than no enforcement.

. "$PSScriptRoot/version-bump-lib.ps1"

$payload = Read-HookPayload
if (-not $payload) { exit 0 }

try { $json = $payload | ConvertFrom-Json } catch { exit 0 }

$sessionId = $json.session_id
if (-not $sessionId) { exit 0 }

$count = Get-VersionBumpCount -SessionId $sessionId
if ($count -le 0) { exit 0 }

$projAiAgenticRoot = Resolve-CbsAiAgenticRoot
if (-not $projAiAgenticRoot) { exit 0 }

$pluginJsonPath = Join-Path $projAiAgenticRoot 'plugins/claude-proj-agent/.claude-plugin/plugin.json'
$currentVersion = Get-PluginJsonVersion -Path $pluginJsonPath
$headVersion = Get-PluginJsonVersion -CbsAiAgenticRoot $projAiAgenticRoot
if ($currentVersion -and $headVersion -and ($currentVersion -ne $headVersion)) {
    Reset-VersionBumpCounter -SessionId $sessionId -Reason "version already bumped: $headVersion -> $currentVersion"
    exit 0
}

$reason = @"
Plugin Version Bump not done yet: $count plugin-cache-served file(s) (commands/, hooks/, skills, .mcp.json) were edited this turn/session with no version bump since.

The installed plugin cache (the CLAUDE_PLUGIN_ROOT path) only refreshes when .claude-plugin/plugin.json's version field changes - docs/ and rules/ are read live and don't need this, everything else does. Current version on disk: $currentVersion.

Before this turn can end, do ONE of:
1. Bump plugins/claude-proj-agent/.claude-plugin/plugin.json's version (semver - patch for a fix/tweak, minor for a new role/skill/command, major for a breaking rename or removal), then state explicitly what changed and the new version.
2. If you already judged this edit doesn't need a bump (e.g. a comment-only change, or a file the cache doesn't actually serve), run: echo proj-version-bump-ack: <one-line reason> via Bash - this is the documented escape hatch, not a workaround.

State the version bump (or the ack) explicitly in your next response either way.
"@

$output = @{
    decision   = 'block'
    reason     = $reason
    continue   = $false
    stopReason = "Plugin Version Bump required - $count uncleared plugin-cache edit(s). See reason for exactly what to do."
}

$output | ConvertTo-Json -Compress
exit 0
