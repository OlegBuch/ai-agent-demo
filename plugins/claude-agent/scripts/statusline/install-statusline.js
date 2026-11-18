#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const dryRun = args.has('--dry-run');

const claudeDir = path.join(os.homedir(), '.claude');
const sourceScript = path.join(__dirname, 'statusline.js');
const targetScript = path.join(claudeDir, 'statusline.js');
const settingsPath = path.join(claudeDir, 'settings.json');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

function toForwardSlashes(p) {
  return p.replace(/\\/g, '/');
}

function buildCommand() {
  return `node "${toForwardSlashes(targetScript)}"`;
}

function isOurCommand(command) {
  return typeof command === 'string' && toForwardSlashes(command).includes(toForwardSlashes(targetScript));
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function readSettings() {
  if (!fs.existsSync(settingsPath)) return {};
  const raw = fs.readFileSync(settingsPath, 'utf8').replace(/^﻿/, '').trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      fail(`${settingsPath} is not a JSON object; nothing was changed.`);
    }
    return parsed;
  } catch (e) {
    fail(`${settingsPath} is not valid JSON (${e.message}); nothing was changed.`);
  }
}

function backup(filePath) {
  const backupPath = `${filePath}.bak-${stamp}`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

if (!fs.existsSync(sourceScript)) {
  fail(`statusline.js not found next to the installer (${sourceScript}).`);
}

const settings = readSettings();
const current = settings.statusLine;
const desired = { type: 'command', command: buildCommand() };

if (current && !isOurCommand(current.command) && !force) {
  console.log('A different statusLine is already configured:');
  console.log(JSON.stringify(current, null, 2));
  console.log('Nothing was changed. Re-run with --force to replace it (a backup of settings.json is kept).');
  process.exit(2);
}

const scriptChanged = !fs.existsSync(targetScript)
  || fs.readFileSync(targetScript, 'utf8') !== fs.readFileSync(sourceScript, 'utf8');
const settingsChanged = !current || current.type !== desired.type || current.command !== desired.command;

console.log(`Target script : ${targetScript} (${scriptChanged ? 'will be written' : 'already up to date'})`);
console.log(`Settings file : ${settingsPath} (${settingsChanged ? 'statusLine will be set' : 'statusLine already set'})`);

if (dryRun) {
  console.log('Dry run: no files were modified.');
  process.exit(0);
}

fs.mkdirSync(claudeDir, { recursive: true });

if (scriptChanged) {
  if (fs.existsSync(targetScript)) {
    console.log(`Backed up existing script to ${backup(targetScript)}`);
  }
  fs.copyFileSync(sourceScript, targetScript);
  console.log(`Wrote ${targetScript}`);
}

if (settingsChanged) {
  if (fs.existsSync(settingsPath)) {
    console.log(`Backed up settings to ${backup(settingsPath)}`);
  }
  settings.statusLine = desired;
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  console.log(`Updated ${settingsPath}`);
}

console.log('Done. Restart Claude Code (or start a new session) to see the status line.');
