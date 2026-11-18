# Shared helpers for the Model-Routing Classification enforcement hooks
# (model-routing-classify.ps1, model-routing-track.ps1, model-routing-check.ps1). Not a hook
# itself - dot-sourced by all three.
#
# Why this exists: model-routing.md/model-routing-levels.md already tell every persona to
# classify each new task message's complexity (1-5) and route Gather-tier work to a fresh Haiku
# subagent. This mirrors delegation-lib.ps1's own precedent - a prompt-only instruction is
# advisory and gets skipped once a task's own context grows; this is the technical backstop, not
# a restatement of the same instruction. Kept as its own triad/state directory rather than
# folded into delegation-lib.ps1 because it answers a different question - see
# model-routing-check.ps1's header.

. "$PSScriptRoot/hook-common.ps1"

function Get-ModelRoutingStateDir {
    $dir = Join-Path $env:TEMP 'proj-ai-agentic-model-routing'
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    return $dir
}

function Get-ModelRoutingStatePath {
    param([string]$SessionId)
    if (-not $SessionId) { $SessionId = 'unknown-session' }
    return Join-Path (Get-ModelRoutingStateDir) "$SessionId.state.json"
}

function Get-ModelRoutingState {
    param([string]$SessionId)
    $path = Get-ModelRoutingStatePath -SessionId $SessionId
    if (-not (Test-Path $path)) { return [PSCustomObject]@{ teamRoleActive = $false; classificationRequired = $false } }
    try {
        $raw = Get-Content $path -Raw -ErrorAction Stop
        $obj = $raw | ConvertFrom-Json
        if ($null -eq $obj.teamRoleActive) { $obj | Add-Member -NotePropertyName teamRoleActive -NotePropertyValue $false -Force }
        if ($null -eq $obj.classificationRequired) { $obj | Add-Member -NotePropertyName classificationRequired -NotePropertyValue $false -Force }
        return $obj
    } catch {
        return [PSCustomObject]@{ teamRoleActive = $false; classificationRequired = $false }
    }
}

function Set-ModelRoutingState {
    param([string]$SessionId, [Parameter(Mandatory)]$State)
    $path = Get-ModelRoutingStatePath -SessionId $SessionId
    ($State | ConvertTo-Json -Compress) | Set-Content -Path $path -ErrorAction SilentlyContinue
}

function Write-ModelRoutingLog {
    param([string]$SessionId, [string]$Message)
    $logPath = Join-Path (Get-ModelRoutingStateDir) "$SessionId.log"
    Add-Content -Path $logPath -Value "$(Get-Date -Format o) $Message" -ErrorAction SilentlyContinue
}

function Set-ModelRoutingTeamRoleActive {
    param([string]$SessionId)
    $state = Get-ModelRoutingState -SessionId $SessionId
    if ($state.teamRoleActive) { return }
    $state.teamRoleActive = $true
    Set-ModelRoutingState -SessionId $SessionId -State $state
    Write-ModelRoutingLog -SessionId $SessionId -Message 'TEAM ROLE ACTIVE: /claude-proj-agent:team: seen in prompt'
}

function Set-ModelRoutingClassificationRequired {
    param([string]$SessionId)
    $state = Get-ModelRoutingState -SessionId $SessionId
    $state.classificationRequired = $true
    Set-ModelRoutingState -SessionId $SessionId -State $state
}

function Clear-ModelRoutingClassification {
    param([string]$SessionId, [string]$Reason)
    $state = Get-ModelRoutingState -SessionId $SessionId
    $state.classificationRequired = $false
    Set-ModelRoutingState -SessionId $SessionId -State $state
    if ($Reason) { Write-ModelRoutingLog -SessionId $SessionId -Message "CLEARED: $Reason" }
}
