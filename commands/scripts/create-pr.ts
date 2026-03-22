/**
 * Create Pull Request – used by session-end, phase-end, feature-end, and runnable as CLI.
 * Uses `gh pr create` with --body-file (no shell string concatenation) for reliable multiline bodies.
 * CLI: npx tsx .cursor/commands/scripts/create-pr.ts "Title" "Body" [--draft]
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { getCurrentBranch, gitPush } from '../git/shared/git-manager';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
} as const;

function log(message: string, color: keyof typeof colors = 'reset'): void {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

export interface CreatePullRequestResult {
  success: boolean;
  url?: string;
  branch?: string;
  error?: string;
  [key: string]: unknown;
}

/** When set to 1/true/yes, harness tiers skip calling createPullRequest (CI / no-gh environments). */
export function shouldSkipHarnessPrCreate(): boolean {
  const v = process.env.HARNESS_SKIP_PR?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function runGh(args: string[]): { ok: boolean; stdout: string; stderr: string; status: number | null } {
  const r = spawnSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  const stdout = typeof r.stdout === 'string' ? r.stdout.trim() : '';
  const stderr = typeof r.stderr === 'string' ? r.stderr.trim() : '';
  return {
    ok: r.status === 0,
    stdout,
    stderr,
    status: r.status === null ? null : r.status,
  };
}

function ghCliAvailable(): boolean {
  const r = runGh(['--version']);
  return r.ok;
}

function getDefaultBranchNameSync(): string {
  const r = runGh(['repo', 'view', '--json', 'defaultBranchRef', '-q', '.defaultBranchRef.name']);
  if (r.ok && r.stdout) return r.stdout;
  return 'main';
}

function getCompareUrlForBranch(headBranch: string): string {
  const base = getDefaultBranchNameSync();
  const r = runGh(['repo', 'view', '--json', 'url', '-q', '.url']);
  const origin = r.ok && r.stdout ? r.stdout.replace(/\/$/, '') : 'https://github.com/WillWhittakerDHP/DHP_Differential_Scheduler';
  return `${origin}/compare/${base}...${headBranch}`;
}

/**
 * Check if GitHub CLI is available and authenticated (non-interactive).
 */
export function checkGitHubCLI(): boolean {
  const r = runGh(['auth', 'status']);
  return r.ok;
}

/**
 * Create a pull request using GitHub CLI.
 */
export async function createPullRequest(
  title: string,
  body = '',
  draft = false
): Promise<CreatePullRequestResult> {
  try {
    if (shouldSkipHarnessPrCreate()) {
      log('HARNESS_SKIP_PR is set — skipping PR creation.', 'yellow');
      return { success: false, error: 'HARNESS_SKIP_PR' };
    }

    if (!ghCliAvailable()) {
      const message = 'GitHub CLI (gh) not found on PATH. Install: https://cli.github.com/';
      log(`\n❌ ${message}`, 'red');
      return { success: false, error: message };
    }

    const currentBranch = (await getCurrentBranch()).trim();

    if (currentBranch === 'main' || currentBranch === 'master') {
      log('⚠️  Cannot create PR from main/master branch', 'yellow');
      return { success: false, error: 'On main branch' };
    }

    log(`\n🔄 Pushing branch: ${currentBranch}...`, 'blue');

    try {
      const pushResult = await gitPush();
      if (!pushResult.success) {
        log('   (Branch already pushed or push failed — gh may still open PR if commits exist on remote)', 'yellow');
      }
    } catch {
      log('   (Push threw — continuing to gh pr create)', 'yellow');
    }

    log('\n📝 Creating pull request...', 'blue');

    const bodyFile = join(tmpdir(), `harness-pr-body-${randomBytes(8).toString('hex')}.md`);
    const bodyText = body.trim() === '' ? '_Pull request opened by workflow harness._' : body;
    writeFileSync(bodyFile, bodyText, 'utf8');

    try {
      const args = ['pr', 'create', '--title', title, '--body-file', bodyFile];
      if (draft) {
        args.push('--draft');
      }
      const assigneeEnv = process.env.HARNESS_PR_ASSIGNEE?.trim();
      if (assigneeEnv && assigneeEnv !== '0' && assigneeEnv.toLowerCase() !== 'false') {
        const assignee = assigneeEnv === '1' || assigneeEnv.toLowerCase() === 'me' ? '@me' : assigneeEnv;
        args.push('--assignee', assignee);
      }

      const ghResult = runGh(args);
      if (!ghResult.ok) {
        const detail = ghResult.stderr || ghResult.stdout || `exit ${ghResult.status}`;
        log(`\n❌ gh pr create failed: ${detail}`, 'red');
        const compareUrl = getCompareUrlForBranch(currentBranch);
        log(`\n⚠️  Open or update PR manually: ${compareUrl}`, 'yellow');
        return { success: false, error: detail, branch: currentBranch };
      }

      const prUrl = ghResult.stdout;
      log(`\n✅ Pull request created successfully!`, 'green');
      log(`🔗 ${prUrl}`, 'blue');

      return { success: true, url: prUrl, branch: currentBranch };
    } finally {
      try {
        unlinkSync(bodyFile);
      } catch {
        /* non-fatal */
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`\n❌ Failed to create pull request: ${message}`, 'red');
    const fallbackBranch = (await getCurrentBranch()).trim();
    const compareUrl = getCompareUrlForBranch(fallbackBranch);
    log(`\n⚠️  Create PR manually: ${compareUrl}`, 'yellow');
    return { success: false, error: message };
  }
}

// CLI when run directly (e.g. npx tsx this-file.ts)
const isMainModule =
  typeof process.argv[1] === 'string' &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    log('Usage: npx tsx create-pr.ts <title> [body] [--draft]', 'yellow');
    log('Example: npx tsx create-pr.ts "Session 4.1: Admin Panel" "Implemented main structure"', 'yellow');
    log('Optional: HARNESS_PR_ASSIGNEE=me to assign yourself; HARNESS_SKIP_PR=1 to no-op.', 'yellow');
    process.exit(1);
  }
  const title = args[0];
  const body = args[1] ?? '';
  const draft = args.includes('--draft');
  if (!checkGitHubCLI()) {
    log('❌ GitHub CLI not authenticated. Run: gh auth login', 'red');
    process.exit(1);
  }
  createPullRequest(title, body, draft).then((result) => {
    process.exit(result.success ? 0 : 1);
  });
}
