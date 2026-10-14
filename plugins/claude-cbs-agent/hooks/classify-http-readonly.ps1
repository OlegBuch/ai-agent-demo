# PreToolUse hook (Bash|PowerShell). Default-allow model: every Bash/PowerShell command is
# auto-approved UNLESS it matches a known mutating/side-effecting signal below, in which case
# this hook stays silent and the command falls through to the normal permission flow (ask).
#
# This deliberately fails OPEN (unrecognized commands are auto-allowed) per explicit user
# instruction: only Update/Put/Delete-shaped actions - against the local filesystem/git, or
# against any external system (HTTP APIs, k8s, docker, package managers, DBs) - should prompt.
# Residual risk: a mutating command shape not yet covered below will slip through unflagged;
# extend $mutatingPatterns as new cases are found.
#
# One exception to the default-allow/fall-through-to-ask model: a `git commit` whose message
# carries an AI/Claude/Anthropic self-attribution line is hard DENIED below, not just left to
# fall through to a permission prompt - see base-agent.md's "Commit, Comment & Attribution
# Hygiene." A prompt-only instruction already failed to prevent this once (a commit with a
# "Co-Authored-By: Claude" trailer forced an MR to be closed and reopened in proj-test-automation),
# so this is a technical backstop, not a restatement of the same instruction.

. "$PSScriptRoot/hook-common.ps1"

$payload = Read-HookPayload
if (-not $payload) { exit 0 }

try { $json = $payload | ConvertFrom-Json } catch { exit 0 }
$cmd = $json.tool_input.command
if (-not $cmd) { exit 0 }

$attributionVerb = '\bgit\s+(-C\s+\S+\s+|-c\s+\S+\s+|--no-pager\s+)*(commit|tag)\b|\bgh\s+(pr|issue)\s+(create|edit|comment|review|merge)\b|\bglab\s+(mr|issue)\s+(create|update|note|merge)\b'
if ($cmd -match $attributionVerb) {
    $scanText = $cmd
    foreach ($fileMatch in [regex]::Matches($cmd, '(?:^|\s)(?:-F|--file|--body-file|-b)\s+["'']?([^\s"'']+)')) {
        $textFile = $fileMatch.Groups[1].Value
        if ($textFile -and (Test-Path -LiteralPath $textFile -PathType Leaf -ErrorAction SilentlyContinue)) {
            try { $scanText += "`n" + [System.IO.File]::ReadAllText($textFile) } catch { }
        }
    }
    $scanText = $scanText -replace 'claude-proj-agent|CLAUDE\.md|\.claude-plugin|\.claude[/\\]|CLAUDE_PLUGIN_ROOT', ''
    $scanText = $scanText -replace '\S*[\\/]\S*', ' '
    $aiAttributionPatterns = @(
        'Co-Authored-By:\s*.*(Claude|Anthropic|\bAI\b|Copilot|ChatGPT|\bGPT)'
        'noreply@anthropic\.com'
        'Generated\s+(with|by)\s+(Claude|AI\b|ChatGPT|Copilot|an\s+AI)'
        '(written|generated|authored|created|reviewed|assisted)\s+(by|with)\s+(an?\s+)?(AI|LLM|ChatGPT|Copilot|GPT|Claude|a\s+language\s+model)'
        '\bAI[- ](generated|assisted|authored|written)\b'
        '🤖'
        'claude\.ai/code'
        '\bClaude\b'
        '\bAnthropic\b'
        '\bChatGPT\b'
        '\bCopilot\b'
    )
    foreach ($p in $aiAttributionPatterns) {
        if ($scanText -match $p) {
            Write-Output '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Commit or PR text must not mention AI authorship (owner rule). Rewrite it without any AI, Claude or Anthropic mention and retry - see base-agent.md, Commit, Comment & Attribution Hygiene."}}'
            exit 0
        }
    }
}

$mutatingPatterns = @(
    # --- local filesystem mutation ---
    '(^|[;&|(])\s*(rm|rmdir|del|mv|touch|mkdir|chmod|chown|icacls|attrib|takeown|cp|copy|xcopy|robocopy|tee|dd|ln)\b'
    '\bsed\s+(-[a-zA-Z]*i\b|--in-place)'
    '\bxargs\b[^|;&]*\b(rm|mv|cp)\b'
    '\bfind\b[^|;&]*(-exec\s+(rm|mv|cp)\b|-delete\b)'
    '\b(Remove-Item|Move-Item|Copy-Item|New-Item|Set-Content|Add-Content|Out-File|Rename-Item|Clear-Content)\b'
    # redirection into a real file (allow stderr merges: 2>&1, 2>$null, 2>/dev/null)
    '(?<![12])>(?!&[12])(?!\s*\$null)(?!\s*/dev/null)'

    # --- git mutation (read: status/diff/log/show/branch/remote/blame are NOT listed here) ---
    '\bgit\s+(-C\s+\S+\s+|-c\s+\S+\s+|--no-pager\s+)*(add|commit|push|reset|checkout|merge|rebase|cherry-pick|clean|stash|restore|revert|apply|am|pull|clone|worktree|submodule|gc|prune|update-ref|symbolic-ref|filter-branch|init|rm|mv|tag\s+(-[asfdDm]\b|[^\s-])|branch\s+(-[dDmMcCu]\b|--(delete|move|copy|set-upstream-to|unset-upstream)\b|[^\s-])|remote\s+(add|remove|rename|set-url)|config\s+(--(global|local|system)\s+)?(--(unset|add|replace-all|edit)\b|[^\s-]\S*\s+[^\s-]))'
    '\b(npx|Invoke-Expression|iex)\b'
    '\bnode\s+-[ep]\b'

    # --- package managers / installers ---
    '\b(npm|yarn|pnpm)\s+(install|i|add|remove|uninstall|publish|update|upgrade)\b'
    '\bpip3?\s+(install|uninstall)\b'
    '\b(choco|winget|apt|apt-get|brew)\s+(install|uninstall|remove|upgrade)\b'

    # --- process / system / privilege escalation ---
    '\b(sudo|runas|shutdown|Restart-Computer|taskkill|Stop-Process|Stop-Service|Restart-Service|kill)\b'

    # --- mutating HTTP calls (curl / Invoke-WebRequest / Invoke-RestMethod / axios / requests / fetch) ---
    '(-X\s*(POST|PUT|PATCH|DELETE))|(--request\s*(POST|PUT|PATCH|DELETE))|(-Method\s+(Post|Put|Patch|Delete))|(--data(-raw|-binary|-urlencode|-ascii)?(?![A-Za-z-]))|(\bcurl\b[^|;&]*\s-d\s)|(-Body)'
    '\bcurl\b[^|;&]*\s(-o|-O|-T|--output|--upload-file|--remote-name)\b'
    '\bwget\b'
    '\b(Invoke-WebRequest|iwr|Invoke-RestMethod|irm)\b[^|;&]*-OutFile'
    '\.(post|put|patch|delete)\s*\('
    "method\s*[:=]\s*[`"'](POST|PUT|PATCH|DELETE)"

    # --- kubectl mutation ---
    '\bkubectl\s+(apply|delete|patch|edit|scale|create|replace|drain|cordon|taint|exec|cp|rollout\s+restart)\b'

    # --- docker / containers ---
    '\bdocker\s+(run|rm|rmi|stop|kill|build|push|pull|compose\s+(up|down))\b'

    # --- infra-as-code ---
    '\b(terraform|pulumi)\s+(apply|destroy)\b'
    '\bansible-playbook\b'

    # --- archive extraction (writes files to disk) ---
    '\btar\s+-x|unzip\b|Expand-Archive'

    # --- Windows registry / execution policy ---
    '\breg\s+(add|delete)\b|Set-ItemProperty|New-ItemProperty|Remove-ItemProperty|Set-ExecutionPolicy'

    # --- embedded scripting destructive calls (best-effort: python/node one-liners) ---
    'os\.(remove|unlink|rmdir)|shutil\.rmtree|open\([^)]*[''"](w|a|wb|ab)[''"]'
    'fs\.(unlink|rm|rmSync|writeFile|writeFileSync|appendFile)'

    # --- raw SQL mutation via a DB CLI ---
    '\b(psql|mysql|sqlcmd|mongo|redis-cli)\b.*\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b'
)

foreach ($p in $mutatingPatterns) {
    if ($cmd -match $p) { exit 0 }
}

Write-Output '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"No mutating signal detected - auto-allowed as read-only/analysis"}}'
exit 0
