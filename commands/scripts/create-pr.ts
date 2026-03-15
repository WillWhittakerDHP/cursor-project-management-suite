/**
 * Create Pull Request – used by session-end and runnable as CLI.
 * CLI: npx ts-node --esm .cursor/commands/scripts/create-pr.ts "Title" "Body" [--draft]
 */

import { execSync } from 'node:child_process';
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

/**
 * Create a pull request using GitHub CLI.
 */
export async function createPullRequest(
  title: string,
  body = '',
  draft = false
): Promise<CreatePullRequestResult> {
  try {
    const currentBranch = (await getCurrentBranch()).trim();

    if (currentBranch === 'main' || currentBranch === 'master') {
      log('⚠️  Cannot create PR from main/master branch', 'yellow');
      return { success: false, error: 'On main branch' };
    }

    log(`\n🔄 Pushing branch: ${currentBranch}...`, 'blue');

    try {
      const pushResult = await gitPush();
      if (!pushResult.success) {
        log('   (Branch already pushed or push failed)', 'yellow');
      }
    } catch {
      log('   (Branch already pushed or push failed)', 'yellow');
    }

    log('\n📝 Creating pull request...', 'blue');

    const draftFlag = draft ? '--draft' : '';
    const bodyFlag = body ? `--body "${body.replace(/"/g, '\\"')}"` : '--fill';
    const command = `gh pr create --title "${title.replace(/"/g, '\\"')}" ${bodyFlag} ${draftFlag} --assignee @me`;
    const prUrl = execSync(command, { encoding: 'utf8' }).trim();

    log(`\n✅ Pull request created successfully!`, 'green');
    log(`🔗 ${prUrl}`, 'blue');

    return { success: true, url: prUrl, branch: currentBranch };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`\n❌ Failed to create pull request: ${message}`, 'red');
    const repoUrl = 'https://github.com/WillWhittakerDHP/DHP_Differential_Scheduler';
    log(`\n⚠️  Create PR manually:`, 'yellow');
    const fallbackBranch = (await getCurrentBranch()).trim();
    log(`   ${repoUrl}/compare/main...${fallbackBranch}`, 'yellow');
    return { success: false, error: message };
  }
}

/**
 * Check if GitHub CLI is available and authenticated.
 */
export function checkGitHubCLI(): boolean {
  try {
    execSync('gh auth status', { encoding: 'utf8', stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// CLI when run directly (e.g. npx ts-node --esm this-file.ts)
const isMainModule =
  typeof process.argv[1] === 'string' &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    log('Usage: npx ts-node --esm create-pr.ts <title> [body] [--draft]', 'yellow');
    log('Example: npx ts-node --esm create-pr.ts "Session 4.1: Admin Panel" "Implemented main structure"', 'yellow');
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
