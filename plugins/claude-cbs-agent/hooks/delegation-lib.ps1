# Shared helpers for the Delegation-Compliance enforcement hooks (delegation-track.ps1,
# delegation-check.ps1). Not a hook itself - dot-sourced by both.
#
# Why this exists: base-agent.md's "Delegation & Model Routing" / model-routing.md already tell
# every persona to push mechanical Gather-stage work (REST/curl fetches, reading more than a
# handful of files) into a fresh Haiku subagent rather than doing it inline. This mirrors
# closeout-track.ps1/closeout-check.ps1's own precedent - a prompt-only instruction is advisory
# and gets skipped once a task's own context grows; this is the technical backstop, not a
# restatement of the same instruction.
#
# Known limitation (unverified, 2026-08-26): if a subagent spawned via the Agent tool reports its
# own tool calls through this same hook pipeline under the SAME session_id as the parent
# conversation (the hook payload schema has no documented field distinguishing a subagent's own
# tool call from the main thread's), this hook cannot tell "the main thread is doing mechanical
# work inline" apart from "a Haiku Gather subagent is doing exactly the delegated work it was
# spawned for" - the latter would wrongly increment the counter. This has not been observed or
# confirmed either way; if violations fire suspiciously often right after a legitimate Agent
# delegation, this is the first thing to check.

. "$PSScriptRoot/hook-common.ps1"

function Get-DelegationStateDir {
    $dir = Join-Path $env:TEMP 'proj-ai-agentic-delegation'
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    return $dir
}

function Get-DelegationStatePath {
    param([string]$SessionId)
    if (-not $SessionId) { $SessionId = 'unknown-session' }
    return Join-Path (Get-DelegationStateDir) "$SessionId.state.json"
}

function Get-DelegationState {
    param([string]$SessionId)
    $path = Get-DelegationStatePath -SessionId $SessionId
    if (-not (Test-Path $path)) { return [PSCustomObject]@{ consecutiveReadGrep = 0; violations = 0 } }
    try {
        $raw = Get-Content $path -Raw -ErrorAction Stop
        $obj = $raw | ConvertFrom-Json
        if ($null -eq $obj.consecutiveReadGrep) { $obj | Add-Member -NotePropertyName consecutiveReadGrep -NotePropertyValue 0 -Force }
        if ($null -eq $obj.violations) { $obj | Add-Member -NotePropertyName violations -NotePropertyValue 0 -Force }
        return $obj
    } catch {
        return [PSCustomObject]@{ consecutiveReadGrep = 0; violations = 0 }
    }
}

function Set-DelegationState {
    param([string]$SessionId, [Parameter(Mandatory)]$State)
    $path = Get-DelegationStatePath -SessionId $SessionId
    ($State | ConvertTo-Json -Compress) | Set-Content -Path $path -ErrorAction SilentlyContinue
}

function Reset-DelegationState {
    param([string]$SessionId, [string]$Reason)
    $path = Get-DelegationStatePath -SessionId $SessionId
    if (Test-Path $path) { Remove-Item $path -Force -ErrorAction SilentlyContinue }
    if ($Reason) {
        $logPath = Join-Path (Get-DelegationStateDir) "$SessionId.log"
        Add-Content -Path $logPath -Value "$(Get-Date -Format o) RESET: $Reason" -ErrorAction SilentlyContinue
    }
}

function Write-DelegationLog {
    param([string]$SessionId, [string]$Message)
    $logPath = Join-Path (Get-DelegationStateDir) "$SessionId.log"
    Add-Content -Path $logPath -Value "$(Get-Date -Format o) $Message" -ErrorAction SilentlyContinue
}
