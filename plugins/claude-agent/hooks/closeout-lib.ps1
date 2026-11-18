# Shared helpers for the Task Closeout enforcement hooks (closeout-track.ps1, closeout-check.ps1,
# closeout-ack.ps1). Not a hook itself - dot-sourced by the three above.
#
# Why this exists: base-agent.md/context-resolution.md already told every persona to update
# docs/module-theory, docs/common-issues, docs/frame-specs, and run /session-summary before
# finishing non-trivial work. The user reported this was reliably being skipped in practice - a
# prompt-only instruction is advisory and gets lost once a task's own context grows. This mirrors
# classify-http-readonly.ps1's own precedent (added after a prompt-only "no AI attribution" rule
# already failed once) - a technical backstop, not a restatement of the same instruction.

. "$PSScriptRoot/hook-common.ps1"

function Get-CloseoutStateDir {
    $dir = Join-Path $env:TEMP 'proj-ai-agentic-closeout'
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    return $dir
}

function Get-CloseoutCounterPath {
    param([string]$SessionId)
    if (-not $SessionId) { $SessionId = 'unknown-session' }
    return Join-Path (Get-CloseoutStateDir) "$SessionId.count"
}

function Reset-CloseoutCounter {
    param([string]$SessionId, [string]$Reason)
    $path = Get-CloseoutCounterPath -SessionId $SessionId
    if (Test-Path $path) { Remove-Item $path -Force -ErrorAction SilentlyContinue }
    if ($Reason) {
        $logPath = Join-Path (Get-CloseoutStateDir) "$SessionId.log"
        Add-Content -Path $logPath -Value "$(Get-Date -Format o) RESET: $Reason" -ErrorAction SilentlyContinue
    }
}

function Add-CloseoutSignal {
    param([string]$SessionId, [string]$FilePath)
    $path = Get-CloseoutCounterPath -SessionId $SessionId
    $current = 0
    if (Test-Path $path) {
        $raw = Get-Content $path -Raw -ErrorAction SilentlyContinue
        if ($raw -and [int]::TryParse($raw.Trim(), [ref]$current)) { } else { $current = 0 }
    }
    $current += 1
    Set-Content -Path $path -Value $current -ErrorAction SilentlyContinue
    $logPath = Join-Path (Get-CloseoutStateDir) "$SessionId.log"
    Add-Content -Path $logPath -Value "$(Get-Date -Format o) EDIT: $FilePath (count=$current)" -ErrorAction SilentlyContinue
}

function Get-CloseoutCount {
    param([string]$SessionId)
    $path = Get-CloseoutCounterPath -SessionId $SessionId
    if (-not (Test-Path $path)) { return 0 }
    $raw = Get-Content $path -Raw -ErrorAction SilentlyContinue
    $val = 0
    if ($raw -and [int]::TryParse($raw.Trim(), [ref]$val)) { return $val }
    return 0
}
