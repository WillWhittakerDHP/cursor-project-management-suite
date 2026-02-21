/**
 * Shared utilities for slash commands
 * 
 * ## Deprecated Functions Removed
 * 
 * The following functions were deprecated and have been removed:
 * - `FILE_PATHS` constant - Hardcoded paths for single feature
 * - `getSessionLogPath()` - Hardcoded feature name
 * - `extractMarkdownSection()` - Basic markdown extraction
 * - `parseTaskId()` - Basic ID parsing
 * - `parseSessionId()` - Basic ID parsing
 * - Task IDs: Use WorkflowId.parseTaskId (task = tier below session).
 * 
 * ## Migration Guide
 * 
 * **Path Operations:**
 * Use `WorkflowCommandContext` from `.cursor/commands/utils/command-context`:
 * ```typescript
 * const context = new WorkflowCommandContext('feature-name');
 * const path = context.paths.getSessionLogPath(sessionId);
 * const handoffPath = context.paths.getFeatureHandoffPath();
 * ```
 * 
 * **Markdown Operations:**
 * Use `MarkdownUtils` from `.cursor/commands/utils/markdown-utils`:
 * ```typescript
 * import { MarkdownUtils } from './markdown-utils';
 * const section = MarkdownUtils.extractSection(content, 'Section Title', { includeSubsections: true });
 * ```
 * 
 * **ID Parsing:**
 * Use `WorkflowId` via `WorkflowCommandContext`:
 * ```typescript
 * const context = new WorkflowCommandContext('feature-name');
 * const parsed = context.idUtils.parseTaskId(taskId);
 * const sessionParsed = context.idUtils.parseSessionId(sessionId);
 * ```
 * 
 * See `.cursor/commands/utils/` for utility files.
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { execSync } from 'child_process';

export const PROJECT_ROOT = process.cwd();
/** Frontend app root directory (Vue). Use for path construction; avoid hardcoding the frontend path. */
export const FRONTEND_ROOT = 'client';

/**
 * Read a file from the project root
 */
export async function readProjectFile(filename: string): Promise<string> {
  const filePath = join(PROJECT_ROOT, filename);
  return await readFile(filePath, 'utf-8');
}

/**
 * Write a file to the project root
 */
export async function writeProjectFile(filename: string, content: string): Promise<void> {
  const filePath = join(PROJECT_ROOT, filename);
  await writeFile(filePath, content, 'utf-8');
}


/**
 * Get current date in YYYY-MM-DD format
 */
export function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get current git branch
 */
export async function getCurrentBranch(): Promise<string> {
  try {
    return execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
  } catch (_error) {
    console.warn(
      `WARNING: Could not get current git branch, defaulting to 'main'\n` +
      `Command: git branch --show-current\n` +
      `Error: ${_error instanceof Error ? _error.message : String(_error)}\n`
    );
    return 'main';
  }
}

/**
 * Check if a branch is based on another branch (parent branch is ancestor of child branch)
 * Uses git merge-base to find common ancestor and verify parent is ancestor of child
 */
export async function isBranchBasedOn(childBranch: string, parentBranch: string): Promise<boolean> {
  try {
    // Get merge base between the two branches
    const mergeBase = execSync(`git merge-base ${parentBranch} ${childBranch}`, {
      encoding: 'utf-8',
      cwd: PROJECT_ROOT,
      stdio: 'pipe'
    }).trim();
    
    // Get parent branch HEAD commit
    const parentHead = execSync(`git rev-parse ${parentBranch}`, {
      encoding: 'utf-8',
      cwd: PROJECT_ROOT,
      stdio: 'pipe'
    }).trim();
    
    // If merge base equals parent HEAD, then parent is ancestor of child (child is based on parent)
    return mergeBase === parentHead;
  } catch (_error) {
    // If branches don't exist or can't compare, return false
    return false;
  }
}

/**
 * Check if a branch exists
 */
export async function branchExists(branchName: string): Promise<boolean> {
  try {
    execSync(`git rev-parse --verify ${branchName}`, {
      encoding: 'utf-8',
      cwd: PROJECT_ROOT,
      stdio: 'pipe'
    });
    return true;
  } catch (_error) {
    return false;
  }
}

/**
 * Run a command and return output
 */
export async function runCommand(command: string, cwd?: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const output = execSync(command, { 
      encoding: 'utf-8',
      cwd: cwd || PROJECT_ROOT,
      stdio: 'pipe'
    });
    return { success: true, output: output.trim() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    return { 
      success: false, 
      output: error.stdout?.toString() || '', 
      error: error.stderr?.toString() || error.message 
    };
  }
}


/**
 * Change Request Types
 */
export type ChangeRequestType = 'naming' | 'refactoring' | 'architectural' | 'other';

/**
 * Change Request Interface
 */
export interface ChangeRequest {
  type: ChangeRequestType;
  description: string;
  directive: string;
  oldValue?: string; // e.g., "getChildrenOf"
  newValue?: string; // e.g., "getGlobalRelationship"
  filesAffected?: string[];
  tiersAffected: string[];
  scope: 'code-only' | 'docs-only' | 'both';
}

/**
 * Change Scope Interface
 */
export interface ChangeScope {
  filesAffected: string[];
  documentationAffected: string[];
  tiersAffected: string[];
}

/**
 * Parse conversational change request into structured format
 * @param description Conversational description (e.g., "rename getChildrenOf to getGlobalRelationship throughout client")
 * @returns Structured ChangeRequest object
 */
export function parseChangeRequest(description: string): ChangeRequest {
  const lowerDesc = description.toLowerCase();
  
  // Detect change type
  let type: ChangeRequestType = 'other';
  if (lowerDesc.includes('rename') || lowerDesc.includes('name') || lowerDesc.includes('naming')) {
    type = 'naming';
  } else if (lowerDesc.includes('refactor') || lowerDesc.includes('restructure')) {
    type = 'refactoring';
  } else if (lowerDesc.includes('architect') || lowerDesc.includes('pattern') || lowerDesc.includes('design')) {
    type = 'architectural';
  }
  
  // Extract old/new values for renaming
  let oldValue: string | undefined;
  let newValue: string | undefined;
  
  if (type === 'naming') {
    // Try to extract "X to Y" or "X → Y" patterns
    const renamePatterns = [
      /rename\s+(\w+)\s+to\s+(\w+)/i,
      /(\w+)\s+to\s+(\w+)/i,
      /(\w+)\s+→\s+(\w+)/i,
      /change\s+(\w+)\s+to\s+(\w+)/i,
    ];
    
    for (const pattern of renamePatterns) {
      const match = description.match(pattern);
      if (match) {
        oldValue = match[1];
        newValue = match[2];
        break;
      }
    }
  }
  
  // Generate concise directive
  const directive = generateDirective(description, type, oldValue, newValue);
  
  // Default scope - assume both code and docs unless specified
  const scope: 'code-only' | 'docs-only' | 'both' = 
    lowerDesc.includes('code-only') ? 'code-only' :
    lowerDesc.includes('docs-only') || lowerDesc.includes('documentation-only') ? 'docs-only' :
    'both';
  
  // Default tiers - session level for mid-session changes
  const tiersAffected = ['session'];
  
  return {
    type,
    description,
    directive,
    oldValue,
    newValue,
    tiersAffected,
    scope,
  };
}

/**
 * Generate concise directive from change request
 */
function generateDirective(description: string, type: ChangeRequestType, oldValue?: string, newValue?: string): string {
  if (type === 'naming' && oldValue && newValue) {
    return `Rename \`${oldValue}\` to \`${newValue}\` throughout the codebase for consistency and better naming clarity.`;
  }
  
  // Capitalize first letter and ensure it ends with a period
  let directive = description.trim();
  if (directive.length > 0) {
    directive = directive.charAt(0).toUpperCase() + directive.slice(1);
    if (!directive.endsWith('.') && !directive.endsWith('!') && !directive.endsWith('?')) {
      directive += '.';
    }
  }
  
  return directive;
}

/**
 * Identify scope of change impact
 * @param changeRequest Parsed change request
 * @returns ChangeScope with files, docs, and tiers affected
 */
export async function identifyChangeScope(changeRequest: ChangeRequest): Promise<ChangeScope> {
  const filesAffected: string[] = [];
  const documentationAffected: string[] = [];
  const tiersAffected = [...changeRequest.tiersAffected];
  
  // If it's a naming change, search for files containing the old value
  if (changeRequest.type === 'naming' && changeRequest.oldValue) {
    try {
      // Search for the old value in code files
      const searchResult = execSync(
        `grep -r --include="*.ts" --include="*.tsx" --include="*.vue" --include="*.js" --include="*.jsx" -l "${changeRequest.oldValue}" "${FRONTEND_ROOT}/" 2>/dev/null || true`,
        { encoding: 'utf-8', cwd: PROJECT_ROOT }
      );
      
      const files = searchResult.trim().split('\n').filter(f => f.length > 0);
      filesAffected.push(...files);
    } catch (_error) {
      // If grep fails, continue without file list
      console.warn(`Could not search for files containing ${changeRequest.oldValue}: ${_error instanceof Error ? _error.message : String(_error)}`);
    }
  }
  
  // Determine documentation affected based on tiers
  if (tiersAffected.includes('session')) {
    documentationAffected.push('Session Log');
    documentationAffected.push('Session Handoff');
  }
  if (tiersAffected.includes('phase')) {
    documentationAffected.push('Phase Guide');
    documentationAffected.push('Phase Log');
  }
  if (tiersAffected.includes('task')) {
    documentationAffected.push('Task entries in session log');
  }
  
  return {
    filesAffected,
    documentationAffected,
    tiersAffected,
  };
}



