# Shared helpers for the Plugin Version Bump enforcement hooks (version-bump-track.ps1,
# version-bump-check.ps1). Not a hook itself - dot-sourced by both.
#
# Why this exists: base-agent.md's "Repository & Persistence Model" already documents that
# `${CLAUDE_PLUGIN_ROOT}` (everything except docs/ and rules/, which are always read live from the
# git working tree) is the installed **plugin cache**, refreshed only when the plugin is
# (re)installed - i.e. only when `.claude-plugin/plugin.json`'s `version` field changes. A
# commands/hooks/skills/.mcp.json edit that isn't paired with a version bump silently never reaches
# any consumer until someone notices and bumps it later. This mirrors closeout-lib.ps1's own
# precedent (a prompt-only rule that was reliably being skipped) - a technical backstop, not a
# restatement of the same instruction.

. "$PSScriptRoot/hook-common.ps1"

function Get-VersionBumpStateDir {
    $dir = Join-Path $env:TEMP 'proj-ai-agentic-version-bump'
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    return $dir
}

function Get-VersionBumpCounterPath {
    param([string]$SessionId)
    if (-not $SessionId) { $SessionId = 'unknown-session' }
    return Join-Path (Get-VersionBumpStateDir) "$SessionId.count"
}

function Reset-VersionBumpCounter {
    param([string]$SessionId, [string]$Reason)
    $path = Get-VersionBumpCounterPath -SessionId $SessionId
    if (Test-Path $path) { Remove-Item $path -Force -ErrorAction SilentlyContinue }
    if ($Reason) {
        $logPath = Join-Path (Get-VersionBumpStateDir) "$SessionId.log"
        Add-Content -Path $logPath -Value "$(Get-Date -Format o) RESET: $Reason" -ErrorAction SilentlyContinue
    }
}

function Add-VersionBumpSignal {
    param([string]$SessionId, [string]$FilePath)
    $path = Get-VersionBumpCounterPath -SessionId $SessionId
    $current = 0
    if (Test-Path $path) {
        $raw = Get-Content $path -Raw -ErrorAction SilentlyContinue
        if ($raw -and [int]::TryParse($raw.Trim(), [ref]$current)) { } else { $current = 0 }
    }
    $current += 1
    Set-Content -Path $path -Value $current -ErrorAction SilentlyContinue
    $logPath = Join-Path (Get-VersionBumpStateDir) "$SessionId.log"
    Add-Content -Path $logPath -Value "$(Get-Date -Format o) EDIT: $FilePath (count=$current)" -ErrorAction SilentlyContinue
}

function Get-VersionBumpCount {
    param([string]$SessionId)
    $path = Get-VersionBumpCounterPath -SessionId $SessionId
    if (-not (Test-Path $path)) { return 0 }
    $raw = Get-Content $path -Raw -ErrorAction SilentlyContinue
    $val = 0
    if ($raw -and [int]::TryParse($raw.Trim(), [ref]$val)) { return $val }
    return 0
}

function Get-PluginJsonVersion {
    # Reads the `version` field from a plugin.json - either a working-tree path (pass -Path) or
    # the last-committed blob at HEAD (pass -CbsAiAgenticRoot, reads via `git show`). Returns
    # $null on any failure (missing file, bad JSON, no git, detached/no HEAD) - callers must treat
    # $null as "can't tell" and fail open, never as "version is empty".
    param([string]$Path, [string]$CbsAiAgenticRoot)
    try {
        if ($Path) {
            if (-not (Test-Path $Path)) { return $null }
            $raw = Get-Content $Path -Raw -ErrorAction Stop
        } elseif ($CbsAiAgenticRoot) {
            $raw = git -C $CbsAiAgenticRoot show 'HEAD:plugins/claude-proj-agent/.claude-plugin/plugin.json' 2>$null
            if ($LASTEXITCODE -ne 0 -or -not $raw) { return $null }
        } else {
            return $null
        }
        $obj = $raw | ConvertFrom-Json -ErrorAction Stop
        return $obj.version
    } catch {
        return $null
    }
}
