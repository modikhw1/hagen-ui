#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const canonicalMigrationsDir = path.join(repoRoot, 'supabase', 'migrations');
const legacyMigrationsDir = path.join(repoRoot, 'app', 'supabase', 'migrations');

function log(message) {
  console.log(message);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(canonicalMigrationsDir)) {
  fail(`Missing canonical migrations directory: ${canonicalMigrationsDir}`);
}

const extraArgs = process.argv.slice(2);
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = ['supabase', 'db', 'push', ...extraArgs];

log(`Using canonical migrations: ${canonicalMigrationsDir}`);

if (fs.existsSync(legacyMigrationsDir)) {
  log(`Ignoring legacy migrations: ${legacyMigrationsDir}`);
}

log(`Running from repo root: ${repoRoot}`);
log(`Command: ${command} ${args.join(' ')}`);

const result = spawnSync(command, args, {
  cwd: repoRoot,
  stdio: 'inherit',
});

if (result.error) {
  fail(`Could not start Supabase CLI: ${result.error.message}`);
}

process.exit(result.status ?? 1);
