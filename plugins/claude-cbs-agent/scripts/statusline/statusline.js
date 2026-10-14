#!/usr/bin/env node
'use strict';

// Claude Code statusLine script.
// Reads the JSON payload Claude Code sends on stdin (see
// https://code.claude.com/docs/en/statusline.md#available-data) and renders
// a single compact, color-coded status line.
//
// Fields rendered defensively (shown as N/A) when absent at runtime:
//   - context_window.used_percentage / remaining_percentage / current_usage
//     (null until the first API response of the session, and current_usage
//     resets to null right after /compact until the next response)
//   - rate_limits.five_hour / rate_limits.seven_day (only present for
//     Claude.ai subscribers, and only after the first API response)
//   - cost.total_lines_added / total_lines_removed / total_duration_ms /
//     total_api_duration_ms (present once the session has done any work)

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Statusline re-renders often, so reading the transcript to build the
// per-model breakdown is skipped past this size rather than risking a
// slow/laggy render on a very long session.
const MAX_TRANSCRIPT_BYTES = 25 * 1024 * 1024;

const RESET = '\x1b[0m';
const COLORS = {
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolve(chunks.join('')));
    // If nothing is piped in, don't hang forever.
    setTimeout(() => resolve(chunks.join('')), 500);
  });
}

function colorForUsage(pct) {
  if (typeof pct !== 'number' || Number.isNaN(pct)) return COLORS.gray;
  if (pct < 50) return COLORS.green;
  if (pct < 80) return COLORS.yellow;
  return COLORS.red;
}

function colorForRemaining(pct) {
  if (typeof pct !== 'number' || Number.isNaN(pct)) return COLORS.gray;
  if (pct < 20) return COLORS.red;
  if (pct < 50) return COLORS.yellow;
  return COLORS.green;
}

function fmtPct(pct) {
  return typeof pct === 'number' && !Number.isNaN(pct) ? `${Math.round(pct)}%` : 'N/A';
}

function fmtDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h${m}m` : `${m}m`;
}

function fmtTokens(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 'N/A';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return `${n}`;
}

function shortModelName(model) {
  if (typeof model !== 'string' || !model) return 'unknown';
  if (/haiku/i.test(model)) return 'Haiku';
  if (/opus/i.test(model)) return 'Opus';
  if (/sonnet/i.test(model)) return 'Sonnet';
  return model.replace(/^claude-/, '');
}

// Reads one transcript JSONL file's assistant turns into `byModel`, deduping by
// `message.id` (streaming re-emits the same usage across more than one log line).
function collectModelUsage(filePath, seenMessageIds, byModel) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (e) {
    return;
  }
  if (!stat.isFile() || stat.size === 0 || stat.size > MAX_TRANSCRIPT_BYTES) return;

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return;
  }

  for (const line of raw.split('\n')) {
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch (e) {
      continue;
    }
    const message = entry && entry.type === 'assistant' ? entry.message : null;
    const usage = message && message.usage;
    if (!message || !usage || !message.id) continue;
    if (seenMessageIds.has(message.id)) continue;
    seenMessageIds.add(message.id);

    const model = message.model || 'unknown';
    const totals = byModel.get(model) || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    totals.input += typeof usage.input_tokens === 'number' ? usage.input_tokens : 0;
    totals.output += typeof usage.output_tokens === 'number' ? usage.output_tokens : 0;
    totals.cacheRead += typeof usage.cache_read_input_tokens === 'number' ? usage.cache_read_input_tokens : 0;
    totals.cacheWrite += typeof usage.cache_creation_input_tokens === 'number' ? usage.cache_creation_input_tokens : 0;
    byModel.set(model, totals);
  }
}

// Per-model token usage for the current session (main thread + subagents),
// mirroring `/usage`'s "Usage by model" table. The statusline payload itself
// only carries the *current* model/turn, so this reads the session's own
// transcript (`transcript_path`) plus every subagent transcript Claude Code logs
// alongside it, at `<dir>/<session-id>/subagents/*.jsonl` — Task/Agent-tool
// subagent turns (e.g. a Haiku-tier research agent) never appear in the main
// transcript itself, only in their own sibling file there.
function readModelUsage(transcriptPath) {
  if (!transcriptPath) return null;

  const seenMessageIds = new Set();
  const byModel = new Map();
  collectModelUsage(transcriptPath, seenMessageIds, byModel);

  const subagentsDir = path.join(
    path.dirname(transcriptPath),
    path.basename(transcriptPath, '.jsonl'),
    'subagents'
  );
  let subagentFiles = [];
  try {
    subagentFiles = fs.readdirSync(subagentsDir).filter((f) => f.endsWith('.jsonl'));
  } catch (e) {
    subagentFiles = [];
  }
  for (const file of subagentFiles) {
    collectModelUsage(path.join(subagentsDir, file), seenMessageIds, byModel);
  }

  return byModel.size > 0 ? byModel : null;
}

function getGitBranch(cwd) {
  try {
    const branch = execSync('git --no-optional-locks branch --show-current', {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return branch || null;
  } catch (e) {
    return null;
  }
}

(async () => {
  let input = {};
  try {
    const raw = (await readStdin()).replace(/^﻿/, '').trim();
    input = raw ? JSON.parse(raw) : {};
  } catch (e) {
    input = {};
  }

  const sep = `${COLORS.gray} | ${RESET}`;

  // Top line: identity + rate limits — what am I running as, what are my ceilings.
  const topLine = [];

  // Model name
  const modelName = (input.model && input.model.display_name) || 'N/A';
  topLine.push(`${COLORS.cyan}${modelName}${RESET}`);

  // 5-hour rate limit (Claude.ai subscription usage; may be absent)
  const rl = input.rate_limits || {};
  if (rl.five_hour) {
    const pct = rl.five_hour.used_percentage;
    const resetsIn = typeof rl.five_hour.resets_at === 'number'
      ? rl.five_hour.resets_at - Math.floor(Date.now() / 1000)
      : null;
    topLine.push(
      `5h ${colorForUsage(pct)}${fmtPct(pct)}${RESET}${resetsIn !== null ? ` (${fmtDuration(resetsIn)})` : ''}`
    );
  } else {
    topLine.push(`5h ${COLORS.gray}N/A${RESET}`);
  }

  // 7-day rate limit (Claude.ai subscription usage; may be absent)
  if (rl.seven_day) {
    const pct = rl.seven_day.used_percentage;
    const resetsIn = typeof rl.seven_day.resets_at === 'number'
      ? rl.seven_day.resets_at - Math.floor(Date.now() / 1000)
      : null;
    topLine.push(
      `7d ${colorForUsage(pct)}${fmtPct(pct)}${RESET}${resetsIn !== null ? ` (${fmtDuration(resetsIn)})` : ''}`
    );
  } else {
    topLine.push(`7d ${COLORS.gray}N/A${RESET}`);
  }

  // Git branch (read live from the repo at the current working directory)
  const cwd = (input.workspace && input.workspace.current_dir) || input.cwd || process.cwd();
  const branch = getGitBranch(cwd);
  topLine.push(`${COLORS.magenta}${branch || 'no-git'}${RESET}`);

  // Bottom line: usage + efficiency — how much have I burned this session, and how well.
  const bottomLine = [];

  // Context window used / remaining, with absolute token counts when available
  const cw = input.context_window || {};
  const used = typeof cw.used_percentage === 'number' ? cw.used_percentage : null;
  const remaining = typeof cw.remaining_percentage === 'number' ? cw.remaining_percentage : null;
  const cwSize = typeof cw.context_window_size === 'number' ? cw.context_window_size : null;
  const curUsage = cw.current_usage || null;
  const usedTokens = curUsage
    && typeof curUsage.input_tokens === 'number'
    && typeof curUsage.cache_creation_input_tokens === 'number'
    && typeof curUsage.cache_read_input_tokens === 'number'
    ? curUsage.input_tokens + curUsage.cache_creation_input_tokens + curUsage.cache_read_input_tokens
    : null;
  const ctxDetail = usedTokens !== null && cwSize !== null ? ` (${fmtTokens(usedTokens)}/${fmtTokens(cwSize)})` : '';
  bottomLine.push(
    `Ctx ${colorForUsage(used)}${fmtPct(used)}${RESET}${ctxDetail} used/${colorForRemaining(remaining)}${fmtPct(remaining)}${RESET} left`
  );

  // Prompt cache: whether it's being used this turn, and read/write size
  if (curUsage) {
    const cacheRead = typeof curUsage.cache_read_input_tokens === 'number' ? curUsage.cache_read_input_tokens : 0;
    const cacheCreate = typeof curUsage.cache_creation_input_tokens === 'number' ? curUsage.cache_creation_input_tokens : 0;
    const cacheOn = cacheRead + cacheCreate > 0;
    bottomLine.push(
      `Cache ${cacheOn ? COLORS.green : COLORS.gray}${cacheOn ? `${fmtTokens(cacheRead)}R/${fmtTokens(cacheCreate)}W` : 'off'}${RESET}`
    );
  } else {
    bottomLine.push(`Cache ${COLORS.gray}N/A${RESET}`);
  }

  // Per-model token usage this session (main thread + subagents), like `/usage`'s
  // "Usage by model" table: which model(s) ran and how much each consumed.
  const modelUsage = readModelUsage(input.transcript_path);
  if (modelUsage) {
    const rows = [...modelUsage.entries()]
      .map(([model, u]) => {
        const total = u.input + u.output + u.cacheRead + u.cacheWrite;
        const cacheDenom = u.input + u.cacheRead + u.cacheWrite;
        const cacheHitPct = cacheDenom > 0 ? Math.round((u.cacheRead / cacheDenom) * 100) : null;
        return { model, total, cacheHitPct };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 3)
      .map((r) => `${shortModelName(r.model)} ${fmtTokens(r.total)}${r.cacheHitPct !== null ? `(${r.cacheHitPct}%)` : ''}`)
      .join(' ');
    bottomLine.push(`Models ${COLORS.yellow}${rows}${RESET}`);
  } else {
    bottomLine.push(`Models ${COLORS.gray}N/A${RESET}`);
  }

  // Lines changed this session (replaces the old $ cost readout)
  const cost = input.cost || {};
  const linesAdded = typeof cost.total_lines_added === 'number' ? cost.total_lines_added : 0;
  const linesRemoved = typeof cost.total_lines_removed === 'number' ? cost.total_lines_removed : 0;
  bottomLine.push(`${COLORS.green}+${linesAdded}${RESET}/${COLORS.red}-${linesRemoved}${RESET}`);

  // Session duration, with the share of it actually spent waiting on the API
  const durationMs = typeof cost.total_duration_ms === 'number' ? cost.total_duration_ms : null;
  const apiDurationMs = typeof cost.total_api_duration_ms === 'number' ? cost.total_api_duration_ms : null;
  if (durationMs !== null) {
    const apiPct = apiDurationMs !== null && durationMs > 0 ? Math.round((apiDurationMs / durationMs) * 100) : null;
    bottomLine.push(`${COLORS.blue}${fmtDuration(durationMs / 1000)}${RESET}${apiPct !== null ? ` (API ${apiPct}%)` : ''}`);
  } else {
    bottomLine.push(`${COLORS.gray}N/A${RESET}`);
  }

  process.stdout.write(`${topLine.join(sep)}\n${bottomLine.join(sep)}`);
})();
