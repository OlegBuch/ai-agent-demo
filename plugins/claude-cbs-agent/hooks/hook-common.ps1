# Shared helpers dot-sourced by every hook script (directly or through its *-lib.ps1). Not a hook.
# Windows PowerShell 5.1 only.

function Read-HookPayload {
    try {
        $stream = [Console]::OpenStandardInput()
        $buffer = New-Object System.IO.MemoryStream
        $stream.CopyTo($buffer)
        $text = [System.Text.Encoding]::UTF8.GetString($buffer.ToArray())
        if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) { $text = $text.Substring(1) }
        return $text
    } catch {
        return $null
    }
}

function Find-CbsAiAgenticRoot {
    $marker = 'plugins/claude-proj-agent/.claude-plugin/plugin.json'

    $settingsPath = Join-Path $HOME '.claude/settings.json'
    if (Test-Path $settingsPath) {
        try {
            $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json
            foreach ($entry in $settings.extraKnownMarketplaces.PSObject.Properties) {
                $candidate = $entry.Value.source.path
                if ($candidate -and (Test-Path (Join-Path $candidate $marker))) { return (Resolve-Path $candidate).Path }
            }
        } catch { }
    }

    $searchRoots = @()
    if ($PWD) { $searchRoots += (Split-Path -Parent $PWD.Path) }
    $searchRoots += $HOME

    foreach ($root in ($searchRoots | Select-Object -Unique)) {
        if (-not $root -or -not (Test-Path $root)) { continue }
        try {
            $dirs = Get-ChildItem -Path $root -Directory -ErrorAction SilentlyContinue
        } catch { continue }
        foreach ($dir in $dirs) {
            if (Test-Path (Join-Path $dir.FullName $marker)) { return $dir.FullName }
        }
    }

    return $null
}

function Resolve-CbsAiAgenticRoot {
    $marker = 'plugins/claude-proj-agent/.claude-plugin/plugin.json'
    $cacheDir = Join-Path $env:TEMP 'proj-ai-agentic-common'
    $cacheFile = Join-Path $cacheDir 'root.txt'

    if (Test-Path $cacheFile) {
        $age = (Get-Date) - (Get-Item $cacheFile).LastWriteTime
        if ($age.TotalMinutes -lt 10) {
            $cached = Get-Content $cacheFile -Raw -ErrorAction SilentlyContinue
            if ($cached) {
                $cached = $cached.Trim()
                if (Test-Path (Join-Path $cached $marker)) { return $cached }
            }
        }
    }

    $found = Find-CbsAiAgenticRoot
    if ($found) {
        if (-not (Test-Path $cacheDir)) { New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null }
        Set-Content -Path $cacheFile -Value $found -ErrorAction SilentlyContinue
    }
    return $found
}

function Test-UnderPath {
    param([string]$Path, [string]$Base)
    if (-not $Path -or -not $Base) { return $false }
    try {
        $fullPath = [System.IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
        $fullBase = [System.IO.Path]::GetFullPath($Base).TrimEnd('\', '/')
    } catch { return $false }
    if ($fullPath.Equals($fullBase, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
    return $fullPath.StartsWith($fullBase + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
}

function Remove-StaleHookState {
    try {
        $commonDir = Join-Path $env:TEMP 'proj-ai-agentic-common'
        $stamp = Join-Path $commonDir 'cleanup.stamp'
        if (Test-Path $stamp) {
            if (((Get-Date) - (Get-Item $stamp).LastWriteTime).TotalMinutes -lt 60) { return }
        }
        if (-not (Test-Path $commonDir)) { New-Item -ItemType Directory -Path $commonDir -Force | Out-Null }
        Set-Content -Path $stamp -Value (Get-Date -Format o) -ErrorAction SilentlyContinue

        $cutoff = (Get-Date).AddDays(-14)
        $dirs = Get-ChildItem -Path $env:TEMP -Directory -Filter 'proj-ai-agentic-*' -ErrorAction SilentlyContinue
        foreach ($dir in $dirs) {
            if ($dir.Name -eq 'proj-ai-agentic-common') { continue }
            Get-ChildItem -Path $dir.FullName -File -ErrorAction SilentlyContinue |
                Where-Object { $_.LastWriteTime -lt $cutoff -and $_.Extension -in '.count', '.json', '.log' } |
                Remove-Item -Force -ErrorAction SilentlyContinue
        }
    } catch { }
}
