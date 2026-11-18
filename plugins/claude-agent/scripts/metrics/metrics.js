#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { execFileSync } = require('child_process');

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const STATE_FILE = path.join(os.homedir(), '.claude', 'proj-metrics', 'state.json');
const IDLE_GAP_MS = 10 * 60 * 1000;
const GIT_REFRESH_MS = 30 * 60 * 1000;
const SUBSTANTIAL_TURNS = 5;
const TICKET_RE = /\b([A-Z]{2,6}-\d{2,5})\b/;
const VENDOR_RE = /claude|anthropic|opus|sonnet|haiku|fable|gpt|openai|gemini/i;
const SELF_PLUGIN_DIR = path.resolve(__dirname, '..', '..');

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (name) => argv.includes(name);
const opt = (name, def = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const optAll = (name) => argv.flatMap((a, i) => (a === name && argv[i + 1] ? [argv[i + 1]] : []));

const inc = (obj, key, n = 1) => {
  obj[key] = (obj[key] || 0) + n;
};
const lineCount = (s) => (typeof s === 'string' && s.length ? s.replace(/\n$/, '').split('\n').length : 0);
const exists = (p) => fs.existsSync(p);
const fileKind = (p) => {
  if (/\.spec\.ts$/.test(p || '')) return 'spec';
  if (/\.(md|csv)$/.test(p || '')) return 'doc';
  if (/\.(ts|js|json|ps1|py|sh|yml|yaml)$/.test(p || '')) return 'code';
  return 'other';
};
const tierOf = (model) => {
  const s = String(model || '');
  if (/haiku/i.test(s)) return 'light';
  if (/sonnet/i.test(s)) return 'standard';
  if (/opus|fable/i.test(s)) return 'heavy';
  return 'other';
};
const declaredTier = (t) => {
  const mapped = tierOf(t);
  if (mapped !== 'other') return mapped;
  return t === 'inline' || t === 'split' ? t : 'other';
};
const neutral = (name) => {
  const n = String(name || '')
    .replace(/^claude-proj-agent:/, '')
    .replace(/^plugin_(?:claude-proj-agent_)?/, '');
  return VENDOR_RE.test(n) ? 'external' : n;
};
const slug = (s) => String(s || 'unknown').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 20000, stdio: ['ignore', 'pipe', 'ignore'] });
}

const isPluginRepo = (p) => !!p && exists(path.join(p, '.git')) && exists(path.join(p, 'plugins', 'claude-proj-agent', '.claude-plugin', 'plugin.json'));

function resolvePluginRepo() {
  const candidates = [];
  if (process.env.CBS_AI_AGENTIC_ROOT) candidates.push(process.env.CBS_AI_AGENTIC_ROOT);
  candidates.push(path.resolve(SELF_PLUGIN_DIR, '..', '..'));
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', 'settings.json'), 'utf8'));
    for (const m of Object.values(settings.extraKnownMarketplaces || {})) {
      if (m && m.source && m.source.path) candidates.push(m.source.path);
    }
  } catch (err) {
    candidates.push(path.join(os.homedir(), 'proj-ai-agentic'));
  }
  candidates.push(path.join(os.homedir(), 'proj-ai-agentic'), path.resolve(process.cwd(), '..', 'proj-ai-agentic'));
  return candidates.find(isPluginRepo) || null;
}

function metricsRoot(repo) {
  if (process.env.CBS_METRICS_DIR) return process.env.CBS_METRICS_DIR;
  return repo ? path.join(repo, 'plugins', 'claude-proj-agent', 'docs', 'metrics') : null;
}

function currentUser(repo) {
  for (const key of ['user.email', 'user.name']) {
    try {
      const v = git(repo || process.cwd(), ['config', key]).trim();
      const s = slug(key === 'user.email' ? v.split('@')[0] : v);
      if (s !== 'unknown') return s;
    } catch (err) {
      continue;
    }
  }
  return slug(os.userInfo().username);
}

function authorOf(repo) {
  for (const key of ['user.email', 'user.name']) {
    try {
      const v = git(repo, ['config', key]).trim();
      if (v) return v;
    } catch (err) {
      continue;
    }
  }
  return null;
}

function readState() {
  try {
    const st = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    st.sessions = st.sessions || {};
    st.tips = st.tips || {};
    return st;
  } catch (err) {
    return { sessions: {}, tips: {} };
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function atomicWrite(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, body, 'utf8');
  for (let i = 0; i < 6; i += 1) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (err) {
      if (i === 5) {
        try {
          fs.unlinkSync(tmp);
        } catch (e) {
          console.error(`could not remove ${tmp}: ${e.message}`);
        }
        throw err;
      }
      sleep(150);
    }
  }
}

function withLock(root, fn) {
  fs.mkdirSync(root, { recursive: true });
  const lock = path.join(root, '.lock');
  let got = false;
  for (let i = 0; i < 60 && !got; i += 1) {
    try {
      fs.mkdirSync(lock);
      got = true;
    } catch (err) {
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > 30000) fs.rmdirSync(lock);
      } catch (e) {
        continue;
      }
      sleep(100);
    }
  }
  if (!got) throw new Error('metrics lock busy');
  try {
    return fn();
  } finally {
    try {
      fs.rmdirSync(lock);
    } catch (err) {
      console.error(`could not release lock: ${err.message}`);
    }
  }
}

const stamp = (r) => String(r.end || r.date || '');
const prefer = (current, incoming) => {
  if (!current) return incoming;
  if (incoming.kind !== 'session') return incoming;
  if (stamp(incoming) !== stamp(current)) return stamp(incoming) > stamp(current) ? incoming : current;
  return JSON.stringify(incoming).length >= JSON.stringify(current).length ? incoming : current;
};

const monthOf = (r) => {
  const d = r.kind === 'session' ? r.start : r.date;
  return d ? String(d).slice(0, 7) : 'unknown';
};

function loadUserRows(root, user) {
  const rows = new Map();
  const dir = path.join(root, 'data', user);
  if (!exists(dir)) return rows;
  for (const n of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
    for (const line of fs.readFileSync(path.join(dir, n), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        const key = `${r.kind}:${r.id}`;
        rows.set(key, prefer(rows.get(key), r));
      } catch (err) {
        console.error(`skipping malformed line in ${n}: ${err.message}`);
      }
    }
  }
  return rows;
}

function loadAllRows(root) {
  const out = [];
  const dataDir = path.join(root, 'data');
  if (!exists(dataDir)) return out;
  for (const user of fs.readdirSync(dataDir)) {
    for (const r of loadUserRows(root, user).values()) out.push({ ...r, user });
  }
  return out;
}

function saveUserRows(root, user, rows) {
  const byMonth = new Map();
  for (const r of rows.values()) {
    const m = monthOf(r);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(r);
  }
  const dir = path.join(root, 'data', user);
  for (const [m, list] of byMonth) {
    list.sort((a, b) => byText(a.kind + a.id, b.kind + b.id));
    const body = list.map((r) => JSON.stringify(r)).join('\n') + '\n';
    const file = path.join(dir, `${m}.jsonl`);
    if (!exists(file) || fs.readFileSync(file, 'utf8') !== body) atomicWrite(file, body);
  }
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((b) => (b && b.type === 'text' ? b.text || '' : '')).join('\n');
}

function addUsage(bucket, model, u) {
  if (!u || /synthetic/i.test(String(model))) return;
  const t = tierOf(model);
  if (t === 'other') return;
  const a = bucket[t] || (bucket[t] = { in: 0, out: 0, cache_read: 0, messages: 0 });
  a.in += u.input_tokens || 0;
  a.out += u.output_tokens || 0;
  a.cache_read += u.cache_read_input_tokens || 0;
  a.messages += 1;
}

async function forEachLine(file, fn) {
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch (err) {
      continue;
    }
    fn(e);
  }
}

function sourceSignature(file) {
  const st = fs.statSync(file);
  let size = st.size;
  let mtime = st.mtimeMs;
  const subDir = file.replace(/\.jsonl$/, '') + path.sep + 'subagents';
  if (exists(subDir)) {
    for (const n of fs.readdirSync(subDir)) {
      const s = fs.statSync(path.join(subDir, n));
      size += s.size;
      mtime = Math.max(mtime, s.mtimeMs);
    }
  }
  return { size, mtime: Math.round(mtime) };
}

async function parseSession(file) {
  const s = {
    id: path.basename(file, '.jsonl'),
    first: null,
    last: null,
    prev: null,
    activeGap: 0,
    activeTurn: 0,
    humanPrompts: 0,
    pluginTurns: 0,
    cwd: null,
    branches: {},
    msgs: new Map(),
    roles: {},
    commands: {},
    tools: {},
    mcp: {},
    agents: {},
    lines: {},
    hookBlocks: {},
    hookSummaries: 0,
    acks: {},
    tiers: {},
  };

  await forEachLine(file, (e) => {
    if (e.timestamp) {
      const t = Date.parse(e.timestamp);
      if (!Number.isNaN(t)) {
        if (s.first === null || t < s.first) s.first = t;
        if (s.last === null || t > s.last) s.last = t;
        if (s.prev !== null && t - s.prev > 0 && t - s.prev <= IDLE_GAP_MS) s.activeGap += t - s.prev;
        s.prev = t;
      }
    }
    if (e.cwd && !s.cwd) s.cwd = String(e.cwd);
    if (e.gitBranch) inc(s.branches, e.gitBranch);

    if (e.type === 'system') {
      if (e.subtype === 'turn_duration' && typeof e.durationMs === 'number') s.activeTurn += e.durationMs;
      if (e.subtype === 'stop_hook_summary') {
        s.hookSummaries += 1;
        if (e.preventedContinuation) {
          const reason = String(e.stopReason || '');
          const kind = /closeout/i.test(reason)
            ? 'closeout'
            : /delegation/i.test(reason)
              ? 'delegation'
              : /model-routing|classification/i.test(reason)
                ? 'model_routing'
                : /version bump/i.test(reason)
                  ? 'version_bump'
                  : 'other';
          inc(s.hookBlocks, kind);
        }
      }
    }

    if (e.type === 'user') {
      if (e.turnOrigin === 'human' || e.promptSource === 'typed') s.humanPrompts += 1;
      const m = textOf(e.message && e.message.content).match(/<command-name>\/?([^<\s]+)<\/command-name>/);
      if (m) inc(s.commands, neutral(m[1]));
    }

    if (e.type === 'assistant' && e.message) {
      if (e.attributionPlugin === 'claude-proj-agent') s.pluginTurns += 1;
      if (e.attributionSkill) inc(s.roles, neutral(e.attributionSkill));
      if (e.message.id && e.message.usage) s.msgs.set(e.message.id, { model: e.message.model, usage: e.message.usage });
      for (const b of Array.isArray(e.message.content) ? e.message.content : []) {
        if (!b || b.type !== 'tool_use') continue;
        const name = b.name || 'unknown';
        const input = b.input || {};
        if (name.startsWith('mcp__')) inc(s.mcp, neutral(name.split('__')[1] || 'mcp').replace(/_/g, '-'));
        else inc(s.tools, name);
        if (name === 'Agent') inc(s.agents, tierOf(input.model) === 'other' ? 'unspecified' : tierOf(input.model));
        if (name === 'Write') {
          const k = (s.lines[fileKind(input.file_path)] ||= { add: 0, rm: 0 });
          k.add += lineCount(input.content);
        }
        if (name === 'Edit') {
          const k = (s.lines[fileKind(input.file_path)] ||= { add: 0, rm: 0 });
          k.add += lineCount(input.new_string);
          k.rm += lineCount(input.old_string);
        }
        if (name === 'Bash' || name === 'PowerShell') {
          const c = String(input.command || '').trim();
          const tier = c.match(/^echo\s+["']?proj-model-tier:\s*level=(\d)\s+tier=(\w+)/);
          if (tier) inc(s.tiers, `L${tier[1]}/${declaredTier(tier[2])}`);
          if (/^echo\s+["']?proj-closeout-ack/.test(c)) inc(s.acks, 'closeout');
          if (/^echo\s+["']?proj-delegation-ack/.test(c)) inc(s.acks, 'delegation');
          if (/^echo\s+["']?proj-version-bump-ack/.test(c)) inc(s.acks, 'version_bump');
        }
      }
    }
  });
  return s;
}

async function parseSubagents(file) {
  const dir = file.replace(/\.jsonl$/, '') + path.sep + 'subagents';
  const msgs = new Map();
  let files = 0;
  if (!exists(dir)) return { msgs, files };
  for (const n of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
    files += 1;
    await forEachLine(path.join(dir, n), (e) => {
      if (e.type === 'assistant' && e.message && e.message.id && e.message.usage) {
        msgs.set(e.message.id, { model: e.message.model, usage: e.message.usage });
      }
    });
  }
  return { msgs, files };
}

function topTicket(branches) {
  const byTicket = {};
  for (const [b, n] of Object.entries(branches)) {
    const m = b.match(TICKET_RE);
    if (m) inc(byTicket, m[1], n);
  }
  const best = Object.entries(byTicket).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

function sessionRow(s, sub) {
  const tokens = { main: {}, sub: {} };
  for (const { model, usage } of s.msgs.values()) addUsage(tokens.main, model, usage);
  for (const { model, usage } of sub.msgs.values()) addUsage(tokens.sub, model, usage);
  return {
    kind: 'session',
    id: s.id,
    repo: s.cwd ? path.basename(s.cwd.replace(/[\\/]+$/, '')) : null,
    ticket: topTicket(s.branches),
    start: s.first === null ? null : new Date(s.first).toISOString(),
    end: s.last === null ? null : new Date(s.last).toISOString(),
    wall_ms: s.first === null ? 0 : s.last - s.first,
    active_gap_ms: s.activeGap,
    active_turn_ms: s.activeTurn,
    human_prompts: s.humanPrompts,
    plugin_turns: s.pluginTurns,
    roles: s.roles,
    commands: s.commands,
    tools: s.tools,
    mcp: s.mcp,
    agents: s.agents,
    subagent_files: sub.files,
    tokens,
    lines: s.lines,
    hooks: { summaries: s.hookSummaries, blocks: s.hookBlocks, acks: s.acks },
    tiers: s.tiers,
  };
}

function listTranscripts() {
  const out = [];
  if (!exists(PROJECTS_DIR)) return out;
  for (const proj of fs.readdirSync(PROJECTS_DIR)) {
    const dir = path.join(PROJECTS_DIR, proj);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const n of fs.readdirSync(dir)) if (n.endsWith('.jsonl')) out.push(path.join(dir, n));
  }
  return out;
}

async function ingestTranscripts(rows, files, includeAll, seenCwds, state, dirty) {
  const stats = { parsed: 0, unchanged: 0, unrelated: 0 };
  for (const file of files) {
    const id = path.basename(file, '.jsonl');
    const key = `session:${id}`;
    const sig = sourceSignature(file);
    const known = state.sessions[id];
    if (known && known.size === sig.size && known.mtime === sig.mtime && (!known.related || rows.has(key))) {
      stats.unchanged += 1;
      continue;
    }
    const s = await parseSession(file);
    if (s.cwd) seenCwds.add(s.cwd);
    const related = includeAll || s.pluginTurns > 0;
    state.sessions[id] = { ...sig, related };
    if (!related) {
      stats.unrelated += 1;
      continue;
    }
    rows.set(key, prefer(rows.get(key), sessionRow(s, await parseSubagents(file))));
    dirty.add(key);
    stats.parsed += 1;
  }
  return stats;
}

function classifyPath(p) {
  let m = p.match(/docs\/test-cases\/([A-Z]+-\d+)\//);
  if (m) return { type: /analysis\.md$/.test(p) ? 'analysis' : /test-cases/i.test(p) ? 'test_cases' : 'test_case_doc', ticket: m[1] };
  m = p.match(/docs\/review-mr\/([^/]+)\//);
  if (m) {
    const t = m[1].match(/([a-z]{2,6}-\d{2,5})/i);
    return { type: 'review', ticket: t ? t[1].toUpperCase() : null };
  }
  if (/docs\/chat-history\//.test(p)) return { type: 'chat_history', ticket: null };
  if (/docs\/common-issues\//.test(p)) return { type: 'knowledge', ticket: null };
  if (/docs\/module-theory\//.test(p)) return { type: 'module_theory', ticket: null };
  if (/docs\/(frame-specs|project-spec)\//.test(p)) return { type: 'specs', ticket: null };
  if (/claude-proj-agent\/commands\//.test(p)) return { type: 'plugin_commands', ticket: null };
  return null;
}

function refExists(repo, ref) {
  try {
    git(repo, ['rev-parse', '--verify', '--quiet', ref]);
    return true;
  } catch (err) {
    return false;
  }
}

function parseLog(repo, ref, author, since) {
  const args = ['log', ref, '--no-merges', '--numstat', '--date=iso-strict', '--pretty=format:@@%H%x09%aI%x09%s', '--fixed-strings', '--regexp-ignore-case', `--author=${author}`];
  if (since) args.push(`--since=${since}`);
  const commits = [];
  let cur = null;
  for (const line of git(repo, args).split('\n')) {
    if (line.startsWith('@@')) {
      const [sha, date, ...rest] = line.slice(2).split('\t');
      cur = { sha, date, subject: rest.join('\t'), files: [] };
      commits.push(cur);
    } else if (cur && line.trim()) {
      const [a, r, p] = line.split('\t');
      cur.files.push({ add: Number(a) || 0, rm: Number(r) || 0, path: p || '' });
    }
  }
  return commits;
}

function gitCommitRows(repo, ref, author, since) {
  const repoName = path.basename(path.resolve(repo));
  return parseLog(repo, ref, author, since).map((c) => {
    const t = c.subject.match(TICKET_RE);
    const spec = c.files.filter((f) => /\.spec\.ts$/.test(f.path));
    return {
      kind: 'commit',
      id: `${repoName}:${c.sha}`,
      repo: repoName,
      date: c.date,
      ticket: t ? t[1] : null,
      files: c.files.length,
      add: c.files.reduce((n, f) => n + f.add, 0),
      rm: c.files.reduce((n, f) => n + f.rm, 0),
      spec_files: spec.length,
      spec_add: spec.reduce((n, f) => n + f.add, 0),
    };
  });
}

function gitArtifactRows(repo, ref, author, since) {
  const rows = [];
  for (const c of parseLog(repo, ref, author, since)) {
    const groups = new Map();
    for (const f of c.files) {
      const k = classifyPath(f.path);
      if (!k) continue;
      const key = `${k.type}:${k.ticket || '-'}`;
      const g = groups.get(key) || { ...k, files: 0, add: 0, rm: 0 };
      g.files += 1;
      g.add += f.add;
      g.rm += f.rm;
      groups.set(key, g);
    }
    for (const [key, g] of groups) {
      rows.push({ kind: 'artifact', id: `${c.sha}:${key}`, date: c.date, type: g.type, ticket: g.ticket, files: g.files, add: g.add, rm: g.rm });
    }
  }
  return rows;
}

function ingestGit(rows, pluginRepo, consumerRepos, since, state, dirty) {
  const out = { commits: 0, artifacts: 0, notes: [] };
  const ref = opt('--ref', 'origin/main');
  const authorOverride = opt('--author', null);
  const repos = [pluginRepo, ...consumerRepos].filter(Boolean);
  if (flag('--fetch')) {
    for (const r of repos) {
      try {
        git(r, ['fetch', 'origin', ref.replace(/^origin\//, '')]);
      } catch (err) {
        out.notes.push(`fetch failed for ${path.basename(r)}`);
      }
    }
  }
  for (const repo of repos) {
    const name = path.basename(path.resolve(repo));
    if (!refExists(repo, ref)) {
      out.notes.push(`${name} has no ${ref}, skipped`);
      continue;
    }
    const who = authorOverride || authorOf(repo);
    if (!who) {
      out.notes.push(`${name} has no git user configured, skipped`);
      continue;
    }
    try {
      state.tips[name] = git(repo, ['log', '-1', '--format=%cI', ref]).trim();
    } catch (err) {
      out.notes.push(`${name}: could not read the tip of ${ref}`);
    }
    const isPlugin = repo === pluginRepo;
    const found = isPlugin ? gitArtifactRows(repo, ref, who, since) : gitCommitRows(repo, ref, who, since);
    for (const r of found) {
      const key = `${r.kind}:${r.id}`;
      rows.set(key, r);
      dirty.add(key);
      if (isPlugin) out.artifacts += 1;
      else out.commits += 1;
    }
  }
  return out;
}

function consumerRepoList(state, seenCwds, pluginRepo) {
  const set = new Set([...(state.repos || []), ...optAll('--repo')]);
  for (const cwd of seenCwds) {
    try {
      const top = git(cwd, ['rev-parse', '--show-toplevel']).trim();
      if (top && path.resolve(top) !== path.resolve(pluginRepo || '')) set.add(path.resolve(top));
    } catch (err) {
      continue;
    }
  }
  return [...set].filter((p) => exists(path.join(p, '.git')));
}

const hours = (ms) => (ms / 3600000).toFixed(1);
const pad2 = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const monthKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

function table(headers, data) {
  const lines = [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`];
  for (const r of data) lines.push(`| ${r.join(' | ')} |`);
  return lines.join('\n');
}

const linesOf = (s, kind) => (s.lines && s.lines[kind] ? s.lines[kind] : { add: 0, rm: 0 });
const sum = (items, fn) => items.reduce((n, x) => n + fn(x), 0);
const totalVolume = (s) => sum([s.tokens.main, s.tokens.sub], (b) => sum(Object.values(b), (m) => m.in + m.out));
const delegations = (s) => sum(Object.values(s.agents || {}), (n) => n);

function sumMaps(items, pick) {
  const o = {};
  for (const it of items) for (const [k, v] of Object.entries(pick(it) || {})) inc(o, k, v);
  return o;
}

function topTable(title, map, limit, head) {
  const data = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, limit);
  return `### ${title}\n\n${data.length ? table([head, 'Count'], data) : '_no data_'}`;
}

function groupSessions(sessions, keyFn) {
  const g = new Map();
  for (const s of sessions) {
    if (!s.start) continue;
    const k = keyFn(new Date(s.start));
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(s);
  }
  return [...g.entries()].sort((a, b) => byText(a[0], b[0]));
}

function periodTable(title, groups) {
  const data = groups.map(([k, ss]) => [
    k,
    ss.length,
    hours(sum(ss, (s) => s.active_gap_ms)),
    sum(ss, (s) => s.human_prompts),
    sum(ss, delegations),
    sum(ss, (s) => linesOf(s, 'spec').add),
    sum(ss, (s) => linesOf(s, 'doc').add),
    sum(ss, (s) => linesOf(s, 'code').add),
    Math.round(sum(ss, totalVolume) / 1000),
  ]);
  return `### ${title}\n\n${table(['Period', 'Sessions', 'Active h', 'Requests', 'Delegations', 'Spec lines +', 'Doc lines +', 'Code lines +', 'Context volume k'], data)}`;
}

function buildTasks(sessions, commits, artifacts, history) {
  const map = new Map();
  const slot = (t) => {
    if (!map.has(t)) map.set(t, { sessions: [], commits: [], artifacts: [] });
    return map.get(t);
  };
  for (const s of sessions.filter((x) => x.ticket)) slot(s.ticket).sessions.push(s);
  for (const c of commits.filter((x) => x.ticket)) slot(c.ticket).commits.push(c);
  for (const a of artifacts.filter((x) => x.ticket)) slot(a.ticket).artifacts.push(a);
  return [...map.entries()]
    .map(([ticket, v]) => {
      const starts = [...v.sessions.map((s) => Date.parse(s.start)), ...history.filter((h) => h.ticket === ticket).map((h) => Date.parse(h.date))].filter(Boolean);
      const ends = v.sessions.map((s) => Date.parse(s.end)).filter(Boolean);
      const merged = v.commits.map((c) => Date.parse(c.date)).filter(Boolean);
      const start = starts.length ? Math.min(...starts) : null;
      const mainEnd = merged.length ? Math.max(...merged) : null;
      const finish = mainEnd || (ends.length ? Math.max(...ends) : null);
      return {
        ticket,
        start,
        finish,
        wallDays: start && finish && finish >= start ? (finish - start) / 86400000 : null,
        activeMs: sum(v.sessions, (s) => s.active_gap_ms),
        turnMs: sum(v.sessions, (s) => s.active_turn_ms),
        sessions: v.sessions.length,
        specWritten: sum(v.sessions, (s) => linesOf(s, 'spec').add),
        commits: v.commits.length,
        mainAdd: sum(v.commits, (c) => c.add),
        mainRm: sum(v.commits, (c) => c.rm),
        mainSpec: sum(v.commits, (c) => c.spec_add),
        docLines: sum(v.artifacts, (a) => a.add),
        onMain: mainEnd !== null,
      };
    })
    .sort((a, b) => (b.start || b.finish || 0) - (a.start || a.finish || 0));
}

function buildReport(rows, title, options) {
  const sessions = rows.filter((r) => r.kind === 'session');
  const from = options.allTime ? null : sessions.map((s) => s.start).filter(Boolean).sort()[0] || null;
  const inPeriod = (r) => !from || String(r.date) >= from;
  const commits = rows.filter((r) => r.kind === 'commit' && inPeriod(r));
  const artifacts = rows.filter((r) => r.kind === 'artifact' && inPeriod(r));
  const out = [];
  const lastS = sessions.map((s) => s.end).filter(Boolean).sort().slice(-1)[0];
  const lastGit = [...commits, ...artifacts].map((r) => r.date).filter(Boolean).sort().slice(-1)[0];
  const tips = Object.entries(options.tips || {}).map(([n, d]) => `${n} ${String(d).slice(0, 10)}`).join(', ');
  out.push(`# ${title}\n\n**TL;DR:** measured usage of the plugin from ${from ? from.slice(0, 10) : 'n/a'} to ${lastS ? lastS.slice(0, 10) : 'n/a'}. Git figures cover the same period and come from main (last own commit or document ${lastGit ? lastGit.slice(0, 10) : 'n/a'}${tips ? `; main tip as last fetched: ${tips}` : ''}). Generated by \`scripts/metrics/metrics.js\`, never edit by hand. Time saved is not measured, only estimated on request. Read the notes at the end before quoting numbers.`);

  const blocks = sumMaps(sessions, (s) => s.hooks && s.hooks.blocks);
  const acks = sumMaps(sessions, (s) => s.hooks && s.hooks.acks);
  const substantial = sessions.filter((s) => s.plugin_turns >= SUBSTANTIAL_TURNS);
  out.push(`## Totals\n\n${table(['Metric', 'Value', 'Kind'], [
    ['Work sessions with the plugin', sessions.length, 'measured'],
    [`Substantial sessions (at least ${SUBSTANTIAL_TURNS} plugin turns)`, substantial.length, 'measured'],
    ['Active time, h (gaps up to 10 min between events)', hours(sum(sessions, (s) => s.active_gap_ms)), 'measured, upper estimate of time at the computer'],
    ['Active time by turn duration, h', hours(sum(sessions, (s) => s.active_turn_ms)), 'measured, machine turns only'],
    ['Requests typed', sum(sessions, (s) => s.human_prompts), 'measured'],
    ['Lines written into spec files (Write+Edit)', sum(sessions, (s) => linesOf(s, 'spec').add), 'measured throughput, not final size'],
    ['Lines written into docs (Write+Edit)', sum(sessions, (s) => linesOf(s, 'doc').add), 'measured throughput, not final size'],
    ['Backstop hook blocks', sum(Object.values(blocks), (n) => n), 'measured, not equal to prevented errors'],
    ['Backstop acknowledgements', sum(Object.values(acks), (n) => n), 'measured'],
    ['Own commits on main in the period', commits.length, 'measured'],
    ['Lines added / removed in those commits', `${sum(commits, (c) => c.add)} / ${sum(commits, (c) => c.rm)}`, 'measured'],
    ['Spec lines added in those commits', sum(commits, (c) => c.spec_add), 'measured'],
    ['Knowledge-base commits on main in the period', new Set(artifacts.map((a) => a.id.split(':')[0])).size, 'measured'],
  ])}`);

  if (options.team) {
    const users = [...new Set(rows.map((r) => r.user))].sort();
    out.push(`## By person\n\n${table(['Person', 'Sessions', 'Active h', 'Requests', 'Spec lines written', 'Commits on main', 'Knowledge-base commits'],
      users.map((u) => {
        const ss = sessions.filter((s) => s.user === u);
        return [
          u,
          ss.length,
          hours(sum(ss, (s) => s.active_gap_ms)),
          sum(ss, (s) => s.human_prompts),
          sum(ss, (s) => linesOf(s, 'spec').add),
          commits.filter((c) => c.user === u).length,
          new Set(artifacts.filter((a) => a.user === u).map((a) => a.id.split(':')[0])).size,
        ];
      }))}`);
  }

  out.push(periodTable('By month', groupSessions(sessions, monthKey)));
  const days = groupSessions(sessions, dayKey);
  out.push(periodTable(`By day (last ${Math.min(days.length, 45)})`, days.slice(-45)));
  out.push(periodTable('By hour of day (local time of the machine that generated this)', groupSessions(sessions, (d) => pad2(d.getHours()) + ':00')));

  const tasks = buildTasks(sessions, commits, artifacts, rows.filter((r) => r.kind !== 'session'));
  out.push(`## Tasks (grouped by ticket key)\n\nStart is the earliest of the first plugin session and the first own commit or knowledge-base commit on main for the ticket. Finish is the last own commit on main when one exists, otherwise the last session event. Wall days are calendar days. Active time sums the ticket's sessions, each session counted fully for its dominant ticket. Doc lines are knowledge-base lines the ticket added on main.\n\n${table(
    ['Ticket', 'Start', 'Finish', 'Wall days', 'Active h', 'Machine-turn h', 'Sessions', 'Spec lines written', 'Commits on main', 'Lines +/- on main', 'Spec lines + on main', 'Doc lines + on main', 'Has commit on main'],
    tasks.map((t) => [
      t.ticket,
      t.start ? dayKey(new Date(t.start)) : '-',
      t.finish ? dayKey(new Date(t.finish)) : '-',
      t.wallDays === null ? '-' : t.wallDays.toFixed(1),
      hours(t.activeMs),
      hours(t.turnMs),
      t.sessions,
      t.specWritten,
      t.commits,
      `${t.mainAdd}/${t.mainRm}`,
      t.mainSpec,
      t.docLines,
      t.onMain ? 'yes' : 'no',
    ])
  )}`);

  const artByType = {};
  for (const a of artifacts) {
    const g = (artByType[a.type] ||= { commits: new Set(), files: 0, add: 0 });
    g.commits.add(a.id.split(':')[0]);
    g.files += a.files;
    g.add += a.add;
  }
  out.push(`## Knowledge base output on main (own commits)\n\n${table(['Artifact type', 'Commits', 'Files touched', 'Lines +'],
    Object.entries(artByType).sort((a, b) => b[1].add - a[1].add).map(([t, g]) => [t, g.commits.size, g.files, g.add]))}`);

  out.push(topTable('Slash commands', sumMaps(sessions, (s) => s.commands), 15, 'Command'));
  out.push(topTable('Roles and commands by turns', sumMaps(sessions, (s) => s.roles), 15, 'Role'));
  out.push(topTable('Delegations by requested tier', sumMaps(sessions, (s) => s.agents), 8, 'Tier'));
  out.push(topTable('Integration calls by server', sumMaps(sessions, (s) => s.mcp), 12, 'Server'));
  out.push(topTable('Tool calls', sumMaps(sessions, (s) => s.tools), 12, 'Tool'));
  out.push(topTable('Backstop hook blocks by type', blocks, 8, 'Hook'));
  out.push(topTable('Complexity declarations (level/tier)', sumMaps(sessions, (s) => s.tiers), 12, 'Level/tier'));

  const volumeRows = [];
  for (const where of ['main', 'sub']) {
    const agg = {};
    for (const s of sessions) {
      for (const [m, t] of Object.entries(s.tokens[where])) {
        const a = (agg[m] ||= { in: 0, out: 0, cache_read: 0, messages: 0 });
        a.in += t.in;
        a.out += t.out;
        a.cache_read += t.cache_read;
        a.messages += t.messages;
      }
    }
    for (const [m, a] of Object.entries(agg)) volumeRows.push([where === 'main' ? 'main thread' : 'delegated', m, a.messages, a.in, a.out, a.cache_read]);
  }
  out.push(`## Context volume by tier\n\n${table(['Where', 'Tier', 'Messages', 'Input', 'Output', 'Cache read'], volumeRows)}`);

  out.push(`## Reading notes\n\n${table(['Number', 'How to read it'], [
    ['Active h', 'Upper estimate of time at the computer: reading and thinking pauses up to 10 minutes are counted. About 1.5 times the machine-turn time'],
    ['Wall time', 'Not reported as a total on purpose: resumed sessions include nights and weekends'],
    ['Spec / doc lines written', 'Gross lines of write and edit calls, including rewrites. A throughput measure, not the size of the result'],
    ['Tasks', 'Start comes from the first session or the first own commit on main, whichever is earlier, so older tasks have a start but no active time. The ticket of a session is the dominant branch ticket, so mixed sessions are attributed to one ticket'],
    ['Commits on main', 'Own commits in the period, with or without the plugin. They show the output of the whole workflow, not only of the plugin'],
    ['Hook blocks', 'A block is a safeguard firing. It may be a false alarm, so it is shown next to acknowledgements'],
    ['Main tip', 'Git figures are only as fresh as the last fetch of main on the machine that generated this file'],
  ])}`);

  const normMin = Number(options.manualMinutesPerSpecLine || 0);
  if (normMin > 0) {
    const written = sum(sessions, (s) => linesOf(s, 'spec').add);
    out.push(`## Estimate (assumption, not a measurement)\n\nAssumed ${normMin} manual minutes per spec line written. Estimated manual effort ${hours(written * normMin * 60000)} h versus ${hours(sum(sessions, (s) => s.active_gap_ms))} h active time.`);
  } else {
    out.push('## Estimate\n\nTime saved is not measured. Run `report --manual-minutes-per-spec-line <n>` for a clearly labelled estimate.');
  }
  return out.join('\n\n') + '\n';
}

function writeIfChanged(file, text) {
  if (exists(file) && fs.readFileSync(file, 'utf8') === text) return false;
  atomicWrite(file, text);
  return true;
}

function refreshReports(root, user, state) {
  const own = [...loadUserRows(root, user).values()].map((r) => ({ ...r, user }));
  writeIfChanged(path.join(root, 'reports', `${user}.md`), buildReport(own, `Plugin usage metrics: ${user}`, { team: false, tips: state.tips }));
}

function readStdin(ms) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve({});
      return;
    }
    let buf = '';
    const done = () => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(buf || '{}'));
      } catch (err) {
        resolve({});
      }
    };
    const timer = setTimeout(done, ms);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => {
      buf += c;
    });
    process.stdin.on('end', done);
    process.stdin.on('error', done);
  });
}

async function run(mode) {
  const pluginRepo = resolvePluginRepo();
  const root = metricsRoot(pluginRepo);
  if (!root) throw new Error('proj-ai-agentic working tree not found, set CBS_AI_AGENTIC_ROOT');
  const user = currentUser(pluginRepo);
  const state = readState();
  const seenCwds = new Set();
  const dirty = new Set();
  let files = listTranscripts();
  if (mode === 'auto') {
    const payload = await readStdin(3000);
    files = payload.transcript_path && exists(payload.transcript_path) ? [payload.transcript_path] : [];
  }

  const rows = loadUserRows(root, user);
  const ingest = await ingestTranscripts(rows, files, flag('--all'), seenCwds, state, dirty);
  const consumers = consumerRepoList(state, seenCwds, pluginRepo);
  const due = mode !== 'auto' || flag('--force') || Date.now() - (state.gitAt || 0) > GIT_REFRESH_MS;
  let gitResult = null;
  if (due) {
    gitResult = ingestGit(rows, pluginRepo, consumers, opt('--since', null), state, dirty);
    state.gitAt = Date.now();
    state.repos = consumers;
  }
  withLock(root, () => {
    const latest = loadUserRows(root, user);
    for (const key of dirty) latest.set(key, prefer(latest.get(key), rows.get(key)));
    saveUserRows(root, user, latest);
    refreshReports(root, user, state);
  });
  writeState(state);
  return { root, user, ingest, git: gitResult };
}

function team() {
  const root = metricsRoot(resolvePluginRepo());
  if (!root) throw new Error('proj-ai-agentic working tree not found, set CBS_AI_AGENTIC_ROOT');
  const text = buildReport(loadAllRows(root), 'Plugin usage metrics: team', {
    team: true,
    allTime: flag('--all-time'),
    tips: readState().tips,
    manualMinutesPerSpecLine: opt('--manual-minutes-per-spec-line', 0),
  });
  writeIfChanged(path.join(root, 'TEAM.md'), text);
  console.log(`team report: ${path.join(root, 'TEAM.md')}`);
}

function report() {
  const pluginRepo = resolvePluginRepo();
  const root = metricsRoot(pluginRepo);
  if (!root) throw new Error('proj-ai-agentic working tree not found, set CBS_AI_AGENTIC_ROOT');
  const user = currentUser(pluginRepo);
  const since = opt('--since', null);
  const sinceMs = since ? Date.parse(since) : null;
  if (since && Number.isNaN(sinceMs)) throw new Error(`invalid --since value: ${since}`);
  const rows = [...loadUserRows(root, user).values()]
    .map((r) => ({ ...r, user }))
    .filter((r) => !sinceMs || Date.parse(r.kind === 'session' ? r.start : r.date) >= sinceMs);
  if (!rows.length) {
    console.log('No metrics yet. Run: node scripts/metrics/metrics.js collect');
    return;
  }
  const text = buildReport(rows, `Plugin usage metrics: ${user}`, {
    team: false,
    allTime: flag('--all-time'),
    tips: readState().tips,
    manualMinutesPerSpecLine: opt('--manual-minutes-per-spec-line', 0),
  });
  const dest = opt('--out', null);
  if (dest) {
    writeIfChanged(path.resolve(dest), text);
    console.log(`report written: ${path.resolve(dest)}`);
  } else {
    process.stdout.write(text);
  }
}

(async () => {
  if (cmd === 'auto') {
    setTimeout(() => process.exit(0), 25000).unref();
    try {
      await run('auto');
    } catch (err) {
      console.error(`metrics auto skipped: ${err.message}`);
    }
    process.exit(0);
  } else if (cmd === 'collect') {
    const r = await run('collect');
    const g = r.git || { commits: 0, artifacts: 0, notes: [] };
    console.log(`metrics root: ${r.root}\nuser: ${r.user}`);
    console.log(`sessions parsed ${r.ingest.parsed}, unchanged ${r.ingest.unchanged}, unrelated ${r.ingest.unrelated}; commits ${g.commits}, doc artifacts ${g.artifacts}`);
    for (const n of g.notes) console.log(`note: ${n}`);
  } else if (cmd === 'report') report();
  else if (cmd === 'team') team();
  else {
    console.log('usage: metrics.js collect [--repo <path>]... [--ref origin/main] [--author <email>] [--since <date>] [--fetch] [--all]');
    console.log('       metrics.js report [--since <date>] [--all-time] [--out <file>] [--manual-minutes-per-spec-line <n>]');
    console.log('       metrics.js team [--all-time] [--manual-minutes-per-spec-line <n>]');
    console.log('       metrics.js auto            (hook mode: reads the hook payload on stdin, never fails)');
    process.exit(cmd ? 1 : 0);
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
