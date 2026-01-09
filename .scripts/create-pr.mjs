#!/usr/bin/env node

/**
 * Create Pull Request Script
 * 
 * Automates PR creation using GitHub CLI.
 * Called by workflow commands at session-end.
 */

import { execSync } from 'node:child_process';
import process from 'node:process';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Create a pull request using GitHub CLI
 * 
 * @param {string} title - PR title
 * @param {string} body - PR body/description
 * @param {boolean} draft - Whether to create as draft PR
 * @returns {Object} - PR information
 */
function createPullRequest(title, body = '', draft = false) {
  try {
    // Get current branch
    const currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    
    if (currentBranch === 'main' || currentBranch === 'master') {
      log('⚠️  Cannot create PR from main/master branch', 'yellow');
      return { success: false, error: 'On main branch' };
    }
    
    log(`\n🔄 Pushing branch: ${currentBranch}...`, 'blue');
    
    // Push current branch
    try {
      execSync(`git push -u origin ${currentBranch}`, { encoding: 'utf8', stdio: 'inherit' });
    } catch (pushError) {
      // Branch might already be pushed
      log('   (Branch already pushed or push failed)', 'yellow');
    }
    
    log('\n📝 Creating pull request...', 'blue');
    
    // Build gh pr create command
    const draftFlag = draft ? '--draft' : '';
    const bodyFlag = body ? `--body "${body.replace(/"/g, '\\"')}"` : '--fill';
    
    const command = `gh pr create --title "${title.replace(/"/g, '\\"')}" ${bodyFlag} ${draftFlag} --assignee @me`;
    
    const prUrl = execSync(command, { encoding: 'utf8' }).trim();
    
    log(`\n✅ Pull request created successfully!`, 'green');
    log(`🔗 ${prUrl}`, 'blue');
    
    return {
      success: true,
      url: prUrl,
      branch: currentBranch,
    };
    
  } catch (error) {
    log(`\n❌ Failed to create pull request: ${error.message}`, 'red');
    
    // Provide manual instructions
    const repoUrl = 'https://github.com/WillWhittakerDHP/DHP_Differential_Scheduler';
    log(`\n⚠️  Create PR manually:`, 'yellow');
    log(`   ${repoUrl}/compare/main...${execSync('git branch --show-current', { encoding: 'utf8' }).trim()}`, 'yellow');
    
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Check if GitHub CLI is available and authenticated
 */
function checkGitHubCLI() {
  try {
    execSync('gh auth status', { encoding: 'utf8', stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Export for use in other scripts
export { createPullRequest, checkGitHubCLI };

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    log('Usage: node create-pr.mjs <title> [body] [--draft]', 'yellow');
    log('Example: node create-pr.mjs "Session 4.1: Admin Panel" "Implemented main structure"', 'yellow');
    process.exit(1);
  }
  
  const title = args[0];
  const body = args[1] || '';
  const draft = args.includes('--draft');
  
  if (!checkGitHubCLI()) {
    log('❌ GitHub CLI not authenticated. Run: gh auth login', 'red');
    process.exit(1);
  }
  
  const result = createPullRequest(title, body, draft);
  process.exit(result.success ? 0 : 1);
}
