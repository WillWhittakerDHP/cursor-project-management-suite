#!/usr/bin/env node
/* global console, process */
/**
 * One-time migration helper: list or delete local/remote `phase-*` and `session-*` branches
 * after moving to feature-only branching.
 *
 * Usage (from repo root):
 *   node .cursor/commands/scripts/cleanup-retired-tier-branches.mjs           # dry-run (list only)
 *   node .cursor/commands/scripts/cleanup-retired-tier-branches.mjs --execute  # delete listed branches
 *
 * Requires git; remote deletes use `git push origin --delete`. Review output before --execute.
 */

import { spawnSync } from 'node:child_process';

function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  const out = typeof r.stdout === 'string' ? r.stdout.trim() : '';
  const err = typeof r.stderr === 'string' ? r.stderr.trim() : '';
  return { ok: r.status === 0, out, err, status: r.status };
}

function listLocal(prefix) {
  const r = git(['branch', '--list', `${prefix}*`]);
  if (!r.ok) return [];
  return r.out
    .split('\n')
    .map((l) => l.replace(/^\*\s*/, '').trim())
    .filter(Boolean);
}

function listRemote(prefix) {
  const r = git(['branch', '-r', '--list', `origin/${prefix}*`]);
  if (!r.ok) return [];
  const names = r.out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('origin/'))
    .map((l) => l.replace(/^origin\//, ''))
    .filter((name) => !name.includes('->'));
  return [...new Set(names)];
}

/** True when `git push origin --delete` failed only because the branch is already gone on the server. */
function remoteDeleteAlreadyAbsent(combinedErrOut) {
  const s = combinedErrOut.toLowerCase();
  return (
    s.includes('remote ref does not exist') ||
    s.includes("couldn't find remote ref") ||
    s.includes('could not find remote ref')
  );
}

const execute = process.argv.includes('--execute');

if (execute) {
  console.log('Running `git fetch origin --prune` so remote branch lists match the server…\n');
  const fr = git(['fetch', 'origin', '--prune']);
  if (!fr.ok) {
    console.warn(`Warning: fetch --prune failed (continuing anyway): ${fr.err || fr.out || fr.status}`);
  }
}

const phaseLocal = listLocal('phase-');
const sessionLocal = listLocal('session-');
const phaseRemote = listRemote('phase-');
const sessionRemote = listRemote('session-');

console.log('--- Retired tier branches (feature-only harness) ---\n');
console.log('Local phase-*:', phaseLocal.length ? phaseLocal.join(', ') : '(none)');
console.log('Local session-*:', sessionLocal.length ? sessionLocal.join(', ') : '(none)');
console.log('Remote origin phase-*:', phaseRemote.length ? phaseRemote.join(', ') : '(none)');
console.log('Remote origin session-*:', sessionRemote.length ? sessionRemote.join(', ') : '(none)');

if (!execute) {
  console.log(
    '\nDry run only. Re-run with --execute to delete these branches locally and on origin.\n' +
      'Tip: run `git fetch origin --prune` first so remote lists are not stale.'
  );
  process.exit(0);
}

let failed = false;
for (const b of [...phaseLocal, ...sessionLocal]) {
  const r = git(['branch', '-D', b]);
  console.log(r.ok ? `Deleted local ${b}` : `FAILED local delete ${b}: ${r.err || r.out}`);
  if (!r.ok) failed = true;
}
for (const b of [...new Set([...phaseRemote, ...sessionRemote])]) {
  const r = git(['push', 'origin', '--delete', b]);
  const detail = r.err || r.out || '';
  if (r.ok) {
    console.log(`Deleted remote origin/${b}`);
  } else if (remoteDeleteAlreadyAbsent(detail)) {
    console.log(`Skipped remote origin/${b} (already absent on server; pruned local tracking if any)`);
  } else {
    console.log(`FAILED remote delete ${b}: ${detail}`);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
