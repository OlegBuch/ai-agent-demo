# PreToolUse hook (Bash|PowerShell). Fail-closed allowlist model.
#
# A command is auto-approved ONLY when every pipeline segment is a recognised read-only command from
# $readOnly below and the command contains no chaining, redirection or substitution. Everything else -
# including any command this hook does not recognise - produces no decision, so it falls through to
# Claude Code's normal permission flow (the user is asked, unless their own settings already allow it).
#
# This replaces the earlier default-allow blacklist, which auto-approved any command not matching a
# known mutating pattern and could be bypassed by an unlisted command shape. This hook never denies and
# never blocks text in commit or PR messages; attribution follows the target repository's conventions.

. "$PSScriptRoot/hook-common.ps1"

$payload = Read-HookPayload
if (-not $payload) { exit 0 }
try { $json = $payload | ConvertFrom-Json } catch { exit 0 }
$cmd = [string]$json.tool_input.command
if ([string]::IsNullOrWhiteSpace($cmd)) { exit 0 }

# Anything that chains, redirects, substitutes or spans lines goes to the normal prompt.
if ($cmd -match '[;&<>`]|\$\(|\$\{|\|\||\r|\n') { exit 0 }

$readOnly = @(
    '^git(\s+--no-pager)?\s+(status|diff|log|show|blame|shortlog|rev-parse|ls-files|ls-tree|describe|grep)\b'
    '^git(\s+--no-pager)?\s+branch(\s+(-a|-r|-v|-vv|--list|--show-current))*\s*$'
    '^git\s+remote(\s+-v)?\s*$'
    '^git\s+config\s+--get(-all)?\s+\S+\s*$'
    '^(ls|dir|pwd|cat|head|tail|wc|grep|rg|sort|uniq|cut|tr|diff|file|stat|du|which|where|basename|dirname|realpath)(\s|$)'
    '^find\s(?!.*\s-(exec|execdir|ok|delete|fprint|fls)\b)'
    '^(Get-ChildItem|gci|Get-Content|gc|Select-String|sls|Test-Path|Resolve-Path|Get-Location|Get-Item|Measure-Object|Select-Object|Where-Object|Sort-Object|Format-Table|Format-List|ConvertFrom-Json|Get-Command)(\s|$)'
    '^(node|npm|npx|python|python3|uv|java|mvn|gh|glab|kubectl|docker)\s+(--version|-v|-V|version)\s*$'
    '^gh\s+(pr|issue)\s+(view|list|diff|checks|status)\b'
    '^glab\s+(mr|issue)\s+(view|list|diff)\b'
    '^kubectl\s+(get|describe|logs|explain|api-resources|version)\b'
)

foreach ($segment in ($cmd -split '\|')) {
    $s = $segment.Trim()
    if (-not $s) { exit 0 }
    $ok = $false
    foreach ($p in $readOnly) { if ($s -match $p) { $ok = $true; break } }
    if (-not $ok) { exit 0 }   # not recognised -> normal permission prompt
}

Write-Output '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"Allowlisted read-only command"}}'
exit 0
