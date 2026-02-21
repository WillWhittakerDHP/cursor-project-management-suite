/**
 * Context Gatherer Utility
 * 
 * Automatically gathers codebase context for start/change commands.
 * Provides file discovery, implementation status checking, and current state summaries.
 * 
 * LEARNING: Automatic context gathering reduces agent "hunting" time
 * WHY: Agents need to understand current state; manual searching is inefficient
 * PATTERN: Utility functions that parse guides and check file existence
 */

import { PROJECT_ROOT } from './utils';
import { access } from 'fs/promises';
import { join } from 'path';
import { WorkflowCommandContext } from './command-context';
import { resolveFeatureName } from './feature-context';

const FRONTEND_ROOT = 'client';
const FRONTEND_PREFIX = `${FRONTEND_ROOT}/`;
const FRONTEND_SRC_PREFIX = `${FRONTEND_ROOT}/src/`;

/**
 * File status information
 */
export interface FileStatus {
  path: string;
  exists: boolean;
  isReact?: boolean;
  isVue?: boolean;
  description?: string;
}

/**
 * File context information
 */
export interface FileContext {
  reactPath?: string;
  vuePath?: string;
  reactExists: boolean;
  vueExists: boolean;
  description?: string;
}

/**
 * Implementation status summary
 */
export interface ImplementationStatus {
  done: string[];
  missing: string[];
}

/**
 * Current state summary
 */
export interface CurrentStateSummary {
  filesStatus: FileStatus[];
  implementationStatus: ImplementationStatus;
  reactFiles: FileStatus[];
  vueFiles: FileStatus[];
}

/**
 * Extract file paths from markdown content
 * Looks for patterns like:
 * - `<frontend-root>/src/...` (Vue paths)
 * - Backtick-wrapped paths
 * - Code block paths
 */
export function extractFilePaths(content: string): string[] {
  const paths: string[] = [];
  
  // Pattern for backtick-wrapped paths
  const backtickPattern = /`([^`]+)`/g;
  let match;
  while ((match = backtickPattern.exec(content)) !== null) {
    const path = match[1].trim();
    if (path.startsWith(FRONTEND_PREFIX)) {
      paths.push(path);
    }
  }
  
  // Pattern for code block paths (lines starting with file paths)
  const codeBlockPattern = /^(\s*)([A-Za-z0-9._-]+\/)[^\s]+$/gm;
  while ((match = codeBlockPattern.exec(content)) !== null) {
    const potentialPath = match[0].trim();
    if (potentialPath.startsWith(FRONTEND_PREFIX)) {
      paths.push(potentialPath);
    }
  }
  
  // Pattern for markdown links with file paths
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  while ((match = linkPattern.exec(content)) !== null) {
    const url = match[2];
    if (url.startsWith(FRONTEND_PREFIX)) {
      paths.push(url);
    }
  }
  
  // Remove duplicates and normalize
  return [...new Set(paths)].map(p => p.trim()).filter(p => p.length > 0);
}

/**
 * Check if a file exists
 */
export async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    const fullPath = join(PROJECT_ROOT, filePath);
    await access(fullPath);
    return true;
  } catch (err) {
    console.warn('Context gatherer: file not found', filePath, err);
    return false;
  }
}

/**
 * Map React path to Vue path (OBSOLETE - migration complete)
 * Migration is complete: frontend root is the Vue app
 * Kept for backward compatibility but returns path as-is
 */
export function mapReactToVuePath(reactPath: string): string {
  // Migration complete - frontend root is Vue, so return as-is
  return reactPath;
}

/**
 * Map Vue path to React path (OBSOLETE - migration complete)
 * Migration is complete: frontend root is the Vue app
 * Kept for backward compatibility but returns path as-is
 */
export function mapVueToReactPath(vuePath: string): string {
  // Migration complete - frontend root is Vue, so return as-is
  return vuePath;
}

/**
 * Determine file type (Vue - migration complete)
 * Migration is complete: frontend root is the Vue app
 */
export function getFileType(filePath: string): 'react' | 'vue' | 'unknown' {
  if (filePath.startsWith(FRONTEND_SRC_PREFIX) || filePath.startsWith(FRONTEND_PREFIX)) {
    return 'vue'; // Migration complete - frontend root is Vue
  }
  return 'unknown';
}

/**
 * Gather file context for a React/Vue file pair
 */
export async function gatherFileContext(
  reactPath?: string,
  vuePath?: string
): Promise<FileContext> {
  let finalReactPath = reactPath;
  let finalVuePath = vuePath;
  
  // If only React path provided, map to Vue
  if (reactPath && !vuePath) {
    finalVuePath = mapReactToVuePath(reactPath);
  }
  
  // If only Vue path provided, map to React
  if (vuePath && !reactPath) {
    finalReactPath = mapVueToReactPath(vuePath);
  }
  
  const reactExists = finalReactPath ? await checkFileExists(finalReactPath) : false;
  const vueExists = finalVuePath ? await checkFileExists(finalVuePath) : false;
  
  return {
    reactPath: finalReactPath,
    vuePath: finalVuePath,
    reactExists,
    vueExists,
  };
}

/**
 * Gather file status for a list of file paths
 */
export async function gatherFileStatuses(filePaths: string[]): Promise<FileStatus[]> {
  const statuses: FileStatus[] = [];
  
  for (const path of filePaths) {
    const exists = await checkFileExists(path);
    const fileType = getFileType(path);
    
    statuses.push({
      path,
      exists,
      isReact: fileType === 'react',
      isVue: fileType === 'vue',
    });
  }
  
  return statuses;
}

/**
 * Extract file paths from session guide
 */
export async function extractFilesFromSessionGuide(
  sessionId: string,
  featureName?: string
): Promise<string[]> {
  try {
    const resolved = await resolveFeatureName(featureName);
    const context = new WorkflowCommandContext(resolved);
    const guideContent = await context.readSessionGuide(sessionId);
    return extractFilePaths(guideContent);
  } catch (err) {
    console.warn('Context gatherer: extractFilesFromSessionGuide failed', sessionId, err);
    return [];
  }
}

/**
 * Extract file paths from phase guide
 */
export async function extractFilesFromPhaseGuide(
  phase: string,
  featureName?: string
): Promise<string[]> {
  try {
    const resolved = await resolveFeatureName(featureName);
    const context = new WorkflowCommandContext(resolved);
    const guideContent = await context.readPhaseGuide(phase);
    return extractFilePaths(guideContent);
  } catch (err) {
    console.warn('Context gatherer: extractFilesFromPhaseGuide failed', phase, err);
    return [];
  }
}

/**
 * Generate current state summary for a session
 */
export async function generateCurrentStateSummary(
  sessionId: string,
  featureName?: string
): Promise<CurrentStateSummary> {
  const resolved = await resolveFeatureName(featureName);
  const filePaths = await extractFilesFromSessionGuide(sessionId, resolved);
  const fileStatuses = await gatherFileStatuses(filePaths);
  
  // Separate React and Vue files
  const reactFiles = fileStatuses.filter(f => f.isReact);
  const vueFiles = fileStatuses.filter(f => f.isVue);
  
  // Generate implementation status
  const done: string[] = [];
  const missing: string[] = [];
  
  // For each React file, check if Vue equivalent exists
  for (const reactFile of reactFiles) {
    if (reactFile.exists) {
      const vuePath = mapReactToVuePath(reactFile.path);
      const vueExists = await checkFileExists(vuePath);
      
      if (vueExists) {
        done.push(`✅ ${reactFile.path} → ${vuePath}`);
      } else {
        missing.push(`❌ ${reactFile.path} → ${vuePath} (missing)`);
      }
    }
  }
  
  // Check standalone Vue files
  for (const vueFile of vueFiles) {
    if (vueFile.exists) {
      done.push(`✅ ${vueFile.path}`);
    } else {
      missing.push(`❌ ${vueFile.path} (missing)`);
    }
  }
  
  return {
    filesStatus: fileStatuses,
    implementationStatus: { done, missing },
    reactFiles,
    vueFiles,
  };
}

/**
 * Gather component context (find React component and Vue equivalent)
 */
export async function gatherComponentContext(
  componentName: string,
  featureName?: string
): Promise<FileContext> {
  await resolveFeatureName(featureName);
  // Common patterns for Vue component paths
  const vuePatterns = [
    `${FRONTEND_ROOT}/src/components/${componentName}.vue`,
    `${FRONTEND_ROOT}/src/components/${componentName}.ts`,
    `${FRONTEND_ROOT}/src/${componentName}.vue`,
  ];
  
  // Try to find Vue component
  let vuePath: string | undefined;
  for (const pattern of vuePatterns) {
    if (await checkFileExists(pattern)) {
      vuePath = pattern;
      break;
    }
  }
  
  return await gatherFileContext(undefined, vuePath);
}

/**
 * Find related files by pattern
 */
export async function findRelatedFiles(
  pattern: string,
  _baseDir: string = PROJECT_ROOT
): Promise<string[]> {
  // Simple pattern matching - can be enhanced with glob later
  const results: string[] = [];
  
  // For now, return empty array - can be enhanced with actual file system search
  // This is a placeholder for future enhancement
  return results;
}

