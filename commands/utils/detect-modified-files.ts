/**
 * Utility: Detect Modified Files for Phase/Session
 * 
 * LEARNING: Extract modified files from session logs and git history
 * WHY: Audit commands need file lists but they're not always provided
 * PATTERN: Fallback chain: session logs → git history → empty array
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { WorkflowCommandContext } from './command-context';
import { WorkflowId } from './id-utils';

const PROJECT_ROOT = process.cwd();
const FRONTEND_ROOT = 'client';
const FRONTEND_PREFIX = `${FRONTEND_ROOT}/`;

/**
 * Extract files from session log markdown
 * Parses "Files Modified:" sections from session log files
 */
async function extractFilesFromSessionLog(sessionLogPath: string): Promise<string[]> {
  try {
    if (!existsSync(sessionLogPath)) {
      return [];
    }

    const content = await readFile(sessionLogPath, 'utf-8');
    const files: string[] = [];

    // Match "Files Modified:" sections
    // Pattern: **Files Modified:** followed by list items starting with `- `
    const filesModifiedRegex = /\*\*Files Modified:\*\*\s*\n((?:- `[^`]+`\s*(?:- \[Description\])?\n?)+)/g;
    const matches = content.matchAll(filesModifiedRegex);

    for (const match of matches) {
      const fileList = match[1];
      // Extract file paths from markdown list items: `- `path``
      const filePathRegex = /- `([^`]+)`/g;
      const fileMatches = fileList.matchAll(filePathRegex);
      
      for (const fileMatch of fileMatches) {
        const filePath = fileMatch[1].trim();
        // Skip placeholder descriptions
        if (filePath && !filePath.includes('[Description]')) {
          files.push(filePath);
        }
      }
    }

    return files;
  } catch (err) {
    console.warn('Detect modified files: read failed', err);
    return [];
  }
}

/**
 * Detect files from git history for a phase
 * Uses git log to find files changed between phase start and end
 */
function detectFilesFromGitHistory(phase: string, _featureName: string): string[] {
  try {
    // Try to find phase start commit (look for phase start messages)
    // This is a heuristic - we look for commits mentioning the phase
    const phaseStartPattern = `phase.*${phase}|Phase ${phase}`;
    
    // Get all commits mentioning this phase
    const gitLogCommand = `git log --all --oneline --grep="${phaseStartPattern}" --grep="Phase ${phase}" -i --format="%H" | head -1`;
    
    let startCommit: string | null = null;
    try {
      const startCommitOutput = execSync(gitLogCommand, {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
      if (startCommitOutput) {
        startCommit = startCommitOutput.split('\n')[0];
      }
    } catch (err) {
      console.warn('Detect modified files: could not find phase start commit, using HEAD~30', err);
      startCommit = 'HEAD~30';
    }

    // Get files changed since start commit
    const gitDiffCommand = startCommit
      ? `git diff --name-only ${startCommit}..HEAD`
      : `git diff --name-only HEAD~30..HEAD`;

    const output = execSync(gitDiffCommand, {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });

    const files = output
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      // Filter to relevant paths (frontend, server, or .cursor commands)
      .filter(file => 
        file.startsWith(FRONTEND_PREFIX) ||
        file.startsWith('server/') ||
        file.startsWith('.cursor/commands/')
      );

    return files;
  } catch (err) {
    console.warn('Detect modified files: git command failed (phase history)', err);
    return [];
  }
}

/**
 * Handle file renames and deletions
 * Maps old file names to new ones if they were renamed
 */
function handleFileRenames(files: string[]): string[] {
  const renamedFiles: string[] = [];
  const fileRenameMap: Record<string, string> = {
    // Phase 3 specific: properties.ts was renamed to primitives.ts
    [`${FRONTEND_ROOT}/src/constants/properties.ts`]: `${FRONTEND_ROOT}/src/constants/primitives.ts`,
  };

  for (const file of files) {
    // Check if file was renamed
    if (fileRenameMap[file]) {
      const newFile = fileRenameMap[file];
      // Only add if new file exists
      if (existsSync(join(PROJECT_ROOT, newFile))) {
        renamedFiles.push(newFile);
      }
    } else {
      // Check if file still exists
      if (existsSync(join(PROJECT_ROOT, file))) {
        renamedFiles.push(file);
      }
      // If file doesn't exist, we still include it (might be deleted, but audit should know)
    }
  }

  return renamedFiles;
}

/**
 * Detect modified files for a phase
 * 
 * @param phase Phase identifier (e.g., "3")
 * @param completedSessions Array of completed session IDs (e.g., ["3.1"])
 * @param context Workflow command context
 * @returns Array of relative file paths
 */
export async function detectPhaseModifiedFiles(
  phase: string,
  completedSessions: string[],
  context: WorkflowCommandContext
): Promise<string[]> {
  const files: Set<string> = new Set();

  // Method 1: Extract from session logs
  for (const sessionId of completedSessions) {
    if (!WorkflowId.isValidSessionId(sessionId)) {
      continue;
    }

    try {
      const sessionLogPath = join(PROJECT_ROOT, context.paths.getSessionLogPath(sessionId));
      const sessionFiles = await extractFilesFromSessionLog(sessionLogPath);
      
      for (const file of sessionFiles) {
        files.add(file);
      }
    } catch (err) {
      console.warn('Detect modified files: extractFilesFromSessionLog failed for session', sessionId, err);
      continue;
    }
  }

  // Method 2: Fallback to git history if no files found
  if (files.size === 0) {
    const gitFiles = detectFilesFromGitHistory(phase, context.feature.name);
    for (const file of gitFiles) {
      files.add(file);
    }
  }

  // Handle file renames and filter to existing files
  const fileArray = Array.from(files);
  const processedFiles = handleFileRenames(fileArray);

  return processedFiles;
}

/**
 * Detect modified files for a session
 * 
 * @param sessionId Session ID (e.g., "3.1")
 * @param context Workflow command context
 * @returns Array of relative file paths
 */
export async function detectSessionModifiedFiles(
  sessionId: string,
  context: WorkflowCommandContext
): Promise<string[]> {
  if (!WorkflowId.isValidSessionId(sessionId)) {
    return [];
  }

  const sessionLogPath = join(PROJECT_ROOT, context.paths.getSessionLogPath(sessionId));
  const files = await extractFilesFromSessionLog(sessionLogPath);

  // Handle file renames
  return handleFileRenames(files);
}

/**
 * Detect modified files for a feature
 * Uses git history to find all files changed in feature branch
 * 
 * @param featureName Feature name (e.g. from .current-feature or git branch)
 * @param context Workflow command context
 * @returns Array of relative file paths
 */
export async function detectFeatureModifiedFiles(
  _featureName: string,
  _context: WorkflowCommandContext
): Promise<string[]> {
  try {
    // Get current branch name
    const branchOutput = execSync('git branch --show-current', {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    // Try to find base branch (usually 'develop' or 'main')
    const baseBranches = ['develop', 'main', 'master'];
    let baseBranch = 'develop';

    for (const branch of baseBranches) {
      try {
        execSync(`git rev-parse --verify ${branch}`, {
          cwd: PROJECT_ROOT,
          stdio: ['ignore', 'ignore', 'ignore'],
        });
        baseBranch = branch;
        break;
      } catch (_err) {
        continue;
      }
    }

    // Get files changed in feature branch compared to base
    const gitDiffCommand = `git diff --name-only ${baseBranch}..${branchOutput}`;
    const output = execSync(gitDiffCommand, {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });

    const files = output
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .filter(file => 
        file.startsWith(FRONTEND_PREFIX) ||
        file.startsWith('server/') ||
        file.startsWith('.cursor/commands/')
      );

    return handleFileRenames(files);
  } catch (err) {
    console.warn('Detect modified files: git command failed (feature)', err);
    return [];
  }
}

