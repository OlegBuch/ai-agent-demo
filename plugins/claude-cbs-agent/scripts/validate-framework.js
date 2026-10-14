#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(PLUGIN_ROOT, '..', '..');
const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const AS_JSON = args.includes('--json');
const consumerIdx = args.indexOf('--consumer');
const CONSUMER = consumerIdx >= 0 ? path.resolve(args[consumerIdx + 1] || '') : null;

const SKIP_DIRS = new Set(['node_modules', '.venv', '.git', '__pycache__', 'certs', 'mcp-servers']);
const GENERATED_DOCS = ['docs/test-cases', 'docs/chat-history', 'docs/review-mr', 'docs/module-theory', 'docs/hrm-logs'];
const SIZE_CEILING = 500;
const SNAPSHOT_MAX_AGE_DAYS = 60;

const findings = [];
const add = (level, check, file, line, msg) => findings.push({ level, check, file, line, msg });
const rel = (p) => path.relative(REPO_ROOT, p).split(path.sep).join('/');
const exists = (p) => fs.existsSync(p);
const read = (p) => fs.readFileSync(p, 'utf8').replace(/^﻿/, '');

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    console.error(`cannot read ${dir}: ${err.message}`);
    return out;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const isGenerated = (file) => {
  const r = path.relative(PLUGIN_ROOT, file).split(path.sep).join('/');
  return GENERATED_DOCS.some((g) => r === g || r.startsWith(g + '/'));
};

const allFiles = walk(PLUGIN_ROOT);
const mdFiles = allFiles.filter((f) => f.endsWith('.md') && !isGenerated(f) && !f.includes(`${path.sep}third_party${path.sep}`));
const rootDocs = ['README.md', 'CLAUDE.md'].map((f) => path.join(REPO_ROOT, f)).filter(exists);
const scanFiles = [...mdFiles, ...rootDocs];
const HISTORICAL = /[\\/]\d{4}-\d{2}-\d{2}-[^\\/]+\.md$/;
const lines = new Map(scanFiles.filter((f) => !HISTORICAL.test(f)).map((f) => [f, read(f).split(/\r?\n/)]));

const commandsDir = path.join(PLUGIN_ROOT, 'commands');
const execDir = path.join(commandsDir, 'execution');
const teamDir = path.join(commandsDir, 'team');
const listMd = (dir) => (exists(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith('.md')) : []);
const packages = exists(execDir)
  ? fs.readdirSync(execDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
  : [];
const execCommands = new Map();
for (const pkg of packages) {
  for (const n of listMd(path.join(execDir, pkg))) {
    if (n !== 'INDEX.md') execCommands.set(`${pkg}/${n.slice(0, -3)}`, path.join(execDir, pkg, n));
  }
}
const allMdBasenames = new Set(allFiles.filter((f) => f.endsWith('.md')).map((f) => path.basename(f)));

function mentions(regex, fn) {
  for (const [file, ls] of lines) {
    ls.forEach((text, i) => {
      for (const m of text.matchAll(regex)) fn(file, i + 1, m, text);
    });
  }
}

function checkDeadCommandRefs() {
  mentions(/\/(?:claude-proj-agent:)?execution:([a-z0-9-]+-commands):([a-z0-9-]+)/g, (file, line, m) => {
    if (!execCommands.has(`${m[1]}/${m[2]}`)) {
      add('FAIL', 'C1-dead-command', rel(file), line, `invocation ${m[0]} has no commands/execution/${m[1]}/${m[2]}.md`);
    }
  });
  mentions(/(?<![A-Za-z0-9-])((?:allure|aqa|mqa|review)-[a-z0-9-]+\.md)\b/g, (file, line, m) => {
    if (!allMdBasenames.has(m[1])) {
      add('FAIL', 'C1-dead-command', rel(file), line, `${m[1]} is referenced but no such file exists`);
    }
  });
}

function checkIncludes() {
  mentions(/^@(\S+)/g, (file, line, m) => {
    const target = m[1].replace('${CLAUDE_PLUGIN_ROOT}', PLUGIN_ROOT);
    if (!path.isAbsolute(target) || /^[A-Za-z]:[\\/].*\.claude[\\/]plugins[\\/]cache/.test(target)) return;
    if (!exists(target)) add('FAIL', 'C2-include', rel(file), line, `@-include target missing: ${m[1]}`);
  });
}

function indexCoverage(dir, indexFile, label, level, filter = () => true) {
  if (!exists(indexFile)) {
    add('FAIL', 'C3-index', rel(dir), 0, `${label}: INDEX.md missing`);
    return;
  }
  const idx = read(indexFile);
  for (const n of listMd(dir).filter((x) => x !== 'INDEX.md' && filter(x))) {
    if (!idx.includes(n) && !idx.includes(n.slice(0, -3))) {
      add(level, 'C3-index', rel(path.join(dir, n)), 0, `${label}: not listed in ${rel(indexFile)}`);
    }
  }
}

function checkIndexes() {
  for (const pkg of packages) {
    indexCoverage(path.join(execDir, pkg), path.join(execDir, pkg, 'INDEX.md'), `execution/${pkg}`, 'FAIL');
  }
  indexCoverage(teamDir, path.join(teamDir, 'INDEX.md'), 'team', 'FAIL');
  indexCoverage(commandsDir, path.join(commandsDir, 'INDEX.md'), 'commands', 'FAIL');
  indexCoverage(path.join(PLUGIN_ROOT, 'rules'), path.join(PLUGIN_ROOT, 'rules', 'INDEX.md'), 'rules', 'FAIL');
  indexCoverage(path.join(PLUGIN_ROOT, 'docs'), path.join(PLUGIN_ROOT, 'docs', 'INDEX.md'), 'docs', 'WARN');

  const docsIdx = path.join(PLUGIN_ROOT, 'docs', 'INDEX.md');
  if (exists(docsIdx)) {
    const idx = read(docsIdx);
    for (const e of fs.readdirSync(path.join(PLUGIN_ROOT, 'docs'), { withFileTypes: true })) {
      if (e.isDirectory() && !idx.includes(e.name + '/') && !idx.includes('`' + e.name)) {
        add('WARN', 'C3-index', `plugins/claude-proj-agent/docs/${e.name}`, 0, 'docs folder not described in docs/INDEX.md');
      }
    }
  }

  const readme = path.join(REPO_ROOT, 'README.md');
  if (exists(readme)) {
    const text = read(readme);
    for (const key of execCommands.keys()) {
      const name = key.split('/')[1];
      if (!read(execCommands.get(key)).startsWith('---')) continue;
      if (!text.includes(name)) add('WARN', 'C3-index', rel(execCommands.get(key)), 0, 'command missing from root README.md catalog');
    }
  }
}

function checkPersonas() {
  const personas = listMd(teamDir).filter((n) => n.endsWith('-agent.md')).map((n) => n.slice(0, -'-agent.md'.length));
  for (const f of ['orchestrator.md', 'review-board.md']) {
    const p = path.join(teamDir, f);
    if (!exists(p)) {
      add('FAIL', 'C4-persona', rel(p), 0, 'file missing');
      continue;
    }
    for (const [i, text] of read(p).split(/\r?\n/).entries()) {
      for (const m of text.matchAll(/commands\/team\/([a-z0-9-]+)-agent\.md/g)) {
        if (!personas.includes(m[1])) add('FAIL', 'C4-persona', rel(p), i + 1, `references persona file ${m[0]} which does not exist`);
      }
    }
  }
  for (const key of personas.filter((k) => k !== 'base')) {
    const first = read(path.join(teamDir, `${key}-agent.md`)).split(/\r?\n/).slice(0, 5).join('\n');
    if (!/base-agent\.md/.test(first)) {
      add('WARN', 'C4-persona', `commands/team/${key}-agent.md`, 1, 'does not @-include base-agent.md in its first lines');
    }
  }
}

function checkBacktickPaths() {
  const roots = ['docs/', 'rules/', 'commands/', 'hooks/', 'scripts/', 'external_skills/', 'third_party/', 'plugins/', '.claude-plugin/'];
  const exts = /\.(md|json|ps1|js|sh|yml|yaml|py)$/;
  mentions(/`([^`\s]+)`/g, (file, line, m) => {
    const tok = m[1].replace(/[),.;:]+$/, '');
    if (!roots.some((r) => tok.startsWith(r)) || !exts.test(tok)) return;
    if (/[<>*{}$|]|\.\.\./.test(tok)) return;
    if (GENERATED_DOCS.some((g) => tok.startsWith(g + '/'))) return;
    const candidates = [
      path.join(PLUGIN_ROOT, tok),
      path.join(REPO_ROOT, tok),
      path.join(path.dirname(file), tok),
    ];
    if (CONSUMER) candidates.push(path.join(CONSUMER, tok));
    if (!candidates.some(exists)) {
      const level = tok.startsWith('scripts/') ? 'WARN' : 'FAIL';
      add(level, 'C5-dead-path', rel(file), line, `path does not resolve: ${tok}`);
    }
  });
}

function checkAtlassianWrites() {
  const writeTools = /\b(addCommentToJiraIssue|createJiraIssue|editJiraIssue|transitionJiraIssue|createConfluencePage|updateConfluencePage|createConfluenceFooterComment|createConfluenceInlineComment|addWorklogToJiraIssue)\b/g;
  const negation = /\b(deny|denied|never|forbid|forbidden|must not|do not|don't|read-only|no write)\b/i;
  mentions(writeTools, (file, line, m, text) => {
    if (!negation.test(text)) add('FAIL', 'C6-atlassian-write', rel(file), line, `Atlassian write tool referenced outside a prohibition: ${m[0]}`);
  });
}

function checkTestRunRequirements() {
  const runs = /(npx playwright test|npm (?:run )?test\b|run (?:the )?(?:full |project'?s? )?(?:actual )?(?:build and )?test|all (?:new\/changed |new and changed )?tests? pass)/i;
  const negation = /\b(never|do not|don't|UNVERIFIED|user runs|the user runs|hand (?:it )?to the user|environment|asking the owner|ask the owner)\b/i;
  for (const [file, ls] of lines) {
    const r = rel(file);
    if (!/(commands\/execution\/|rules\/|commands\/team\/)/.test(r)) continue;
    ls.forEach((text, i) => {
      if (runs.test(text) && !negation.test(text)) add('WARN', 'C7-run-tests', r, i + 1, `runs tests without the environment question: ${text.trim().slice(0, 110)}`);
    });
  }
}

function checkSkills() {
  const dir = path.join(PLUGIN_ROOT, 'external_skills');
  if (!exists(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).filter((x) => x.isDirectory())) {
    const md = path.join(dir, e.name, 'SKILL.md');
    if (!exists(md)) {
      add('FAIL', 'C8-skill', `external_skills/${e.name}`, 0, 'SKILL.md missing');
      continue;
    }
    const txt = read(md);
    const fm = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) {
      add('FAIL', 'C8-skill', rel(md), 1, 'no YAML frontmatter');
      continue;
    }
    const name = (fm[1].match(/^name:\s*(.+)$/m) || [])[1];
    if (!name || name.replace(/["']/g, '').trim() !== e.name) add('FAIL', 'C8-skill', rel(md), 1, `name '${name}' != directory '${e.name}'`);
    const desc = (fm[1].match(/^description:\s*([\s\S]*?)(?=^\S+:|$(?![\r\n]))/m) || [])[1];
    if (!desc) add('FAIL', 'C8-skill', rel(md), 1, 'description missing');
    else if (desc.trim().length > 1024) add('WARN', 'C8-skill', rel(md), 1, `description ${desc.trim().length} chars > 1024 (vendored: report upstream, do not edit)`);
  }
  const notice = path.join(PLUGIN_ROOT, 'third_party', 'bank-proj-marketplace', 'NOTICE.md');
  if (exists(notice)) {
    const m = read(notice).match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (m) {
      const days = Math.floor((Date.now() - new Date(m[1]).getTime()) / 86400000);
      if (days > SNAPSHOT_MAX_AGE_DAYS) add('WARN', 'C8-skill', rel(notice), 0, `vendored snapshot dated ${m[1]} is ${days} days old (> ${SNAPSHOT_MAX_AGE_DAYS})`);
    } else {
      add('WARN', 'C8-skill', rel(notice), 0, 'no snapshot date found');
    }
  }
}

function checkPluginJson() {
  const p = path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json');
  try {
    const j = JSON.parse(read(p));
    if (!/^\d+\.\d+\.\d+$/.test(j.version || '')) add('FAIL', 'C9-plugin-json', rel(p), 0, `version '${j.version}' is not semver`);
    for (const s of j.skills || []) {
      if (!exists(path.join(PLUGIN_ROOT, s))) add('FAIL', 'C9-plugin-json', rel(p), 0, `skills path missing: ${s}`);
    }
    if (j.dependencies && j.dependencies.length) add('WARN', 'C9-plugin-json', rel(p), 0, 'dependencies[] declared; plugin is meant to be self-contained');
  } catch (err) {
    add('FAIL', 'C9-plugin-json', rel(p), 0, `unreadable: ${err.message}`);
  }
}

function checkHooks() {
  const p = path.join(PLUGIN_ROOT, 'hooks', 'hooks.json');
  if (!exists(p)) return;
  let j;
  try {
    j = JSON.parse(read(p));
  } catch (err) {
    add('FAIL', 'C10-hooks', rel(p), 0, `hooks.json unreadable: ${err.message}`);
    return;
  }
  const referenced = new Set();
  for (const groups of Object.values(j.hooks || {})) {
    for (const g of groups) {
      for (const h of g.hooks || []) {
        const m = (h.command || '').match(/hooks\/([A-Za-z0-9._-]+\.ps1)/);
        if (m) {
          referenced.add(m[1]);
          if (!exists(path.join(PLUGIN_ROOT, 'hooks', m[1]))) add('FAIL', 'C10-hooks', rel(p), 0, `registers missing script ${m[1]}`);
        }
      }
    }
  }
  const dir = path.join(PLUGIN_ROOT, 'hooks');
  const libs = new Set(fs.readdirSync(dir).filter((n) => /-(lib|common).ps1$/.test(n)));
  for (const n of fs.readdirSync(dir).filter((x) => x.endsWith('.ps1'))) {
    if (referenced.has(n) || libs.has(n)) continue;
    add('WARN', 'C10-hooks', `plugins/claude-proj-agent/hooks/${n}`, 0, 'script is not registered in hooks.json and is not a *-lib.ps1 or *-common.ps1 helper (dead code?)');
  }
}

function checkSize() {
  for (const f of mdFiles) {
    const r = path.relative(PLUGIN_ROOT, f).split(path.sep).join('/');
    if (!r.startsWith('docs/')) continue;
    const n = (lines.get(f) || read(f).split(/\r?\n/)).length;
    if (n > SIZE_CEILING) add('WARN', 'C11-size', rel(f), 0, `${n} lines > soft ceiling ${SIZE_CEILING} (Docs Authoring Standard)`);
  }
}

function checkConsumer() {
  if (!CONSUMER) return;
  const spec = path.join(PLUGIN_ROOT, 'docs', 'frame-specs', 'tech-stack.md');
  const pkg = path.join(CONSUMER, 'package.json');
  if (!exists(spec) || !exists(pkg)) {
    add('WARN', 'C12-consumer', rel(spec), 0, `cannot compare: ${!exists(spec) ? 'tech-stack.md' : pkg} missing`);
    return;
  }
  const pj = JSON.parse(read(pkg));
  const have = ((pj.devDependencies || {})['@playwright/test'] || (pj.dependencies || {})['@playwright/test'] || '').replace(/^[^\d]*/, '');
  read(spec).split(/\r?\n/).forEach((text, i) => {
    const m = text.match(/Playwright[^|]*\|[^|]*\|\s*`?\^?(\d+\.\d+)/);
    if (m && have && !have.startsWith(m[1])) add('WARN', 'C12-consumer', rel(spec), i + 1, `documents Playwright ${m[1]} but consumer package.json declares ${have}`);
  });
}

function checkRoleCounts() {
  const words = { five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  const agents = listMd(teamDir).filter((n) => n.endsWith('-agent.md')).length;
  const seen = new Map();
  mentions(/\b(five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})\s+(?:[a-z-]+\s+)?roles\b/gi, (file, line, m) => {
    const n = words[m[1].toLowerCase()] || Number(m[1]);
    if (!seen.has(n)) seen.set(n, []);
    seen.get(n).push(`${rel(file)}:${line}`);
  });
  if (seen.size > 1) {
    const detail = [...seen.entries()].map(([n, w]) => `${n} (${w.length}x, e.g. ${w[0]})`).join('; ');
    add('WARN', 'C13-role-count', 'plugins/claude-proj-agent/commands/team', 0, `role-count claims disagree: ${detail}; personas on disk: ${agents}`);
  }
}

const checks = [
  checkDeadCommandRefs, checkIncludes, checkIndexes, checkPersonas, checkBacktickPaths, checkAtlassianWrites,
  checkTestRunRequirements, checkSkills, checkPluginJson, checkHooks, checkSize, checkConsumer, checkRoleCounts,
];
for (const c of checks) {
  try {
    c();
  } catch (err) {
    add('FAIL', 'internal', c.name, 0, `check crashed: ${err.message}`);
  }
}

const seenKeys = new Set();
const unique = findings.filter((f) => {
  const k = `${f.check}|${f.file}|${f.line}|${f.msg}`;
  if (seenKeys.has(k)) return false;
  seenKeys.add(k);
  return true;
});
const fails = unique.filter((f) => f.level === 'FAIL');
const warns = unique.filter((f) => f.level === 'WARN');

if (AS_JSON) {
  console.log(JSON.stringify({ scanned: scanFiles.length, fail: fails.length, warn: warns.length, findings: unique }, null, 2));
} else {
  console.log(`validate-framework: scanned ${scanFiles.length} markdown files, ${allFiles.length} files total under ${rel(PLUGIN_ROOT)}`);
  const groups = new Map();
  for (const f of unique) {
    const k = `${f.level} ${f.check}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  for (const [k, list] of [...groups.entries()].sort()) {
    console.log(`\n== ${k} (${list.length})`);
    for (const f of list) console.log(`  ${f.file}${f.line ? ':' + f.line : ''}  ${f.msg}`);
  }
  console.log(`\n${fails.length ? 'FAIL' : 'PASS'} - ${fails.length} failure(s), ${warns.length} warning(s)`);
}
process.exit(fails.length || (STRICT && warns.length) ? 1 : 0);
