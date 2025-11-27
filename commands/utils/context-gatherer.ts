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

import { readProjectFile, PROJECT_ROOT } from './utils';
import { access } from 'fs/promises';
import { join } from 'path';
import { MarkdownUtils } from './markdown-utils';
import { WorkflowCommandContext } from './command-context';

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
 * - `client/src/...` (React paths)
 * - `client-vue/src/...` (Vue paths)
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
    if (path.startsWith('client/') || path.startsWith('client-vue/')) {
      paths.push(path);
    }
  }
  
  // Pattern for code block paths (lines starting with file paths)
  const codeBlockPattern = /^(\s*)(client\/|client-vue\/)[^\s]+$/gm;
  while ((match = codeBlockPattern.exec(content)) !== null) {
    paths.push(match[0].trim());
  }
  
  // Pattern for markdown links with file paths
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  while ((match = linkPattern.exec(content)) !== null) {
    const url = match[2];
    if (url.startsWith('client/') || url.startsWith('client-vue/')) {
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
  } catch {
    return false;
  }
}

/**
 * Map React path to Vue path (for vue-migration feature)
 * Example: client/src/admin/... -> client-vue/src/admin/...
 */
export function mapReactToVuePath(reactPath: string): string {
  if (reactPath.startsWith('client/src/')) {
    return reactPath.replace('client/src/', 'client-vue/src/');
  }
  if (reactPath.startsWith('client/')) {
    return reactPath.replace('client/', 'client-vue/');
  }
  return reactPath;
}

/**
 * Map Vue path to React path
 */
export function mapVueToReactPath(vuePath: string): string {
  if (vuePath.startsWith('client-vue/src/')) {
    return vuePath.replace('client-vue/src/', 'client/src/');
  }
  if (vuePath.startsWith('client-vue/')) {
    return vuePath.replace('client-vue/', 'client/');
  }
  return vuePath;
}

/**
 * Determine file type (React or Vue)
 */
export function getFileType(filePath: string): 'react' | 'vue' | 'unknown' {
  if (filePath.startsWith('client/src/') || filePath.startsWith('client/')) {
    return 'react';
  }
  if (filePath.startsWith('client-vue/src/') || filePath.startsWith('client-vue/')) {
    return 'vue';
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
  featureName: string = 'vue-migration'
): Promise<string[]> {
  try {
    const context = new WorkflowCommandContext(featureName);
    const guideContent = await context.readSessionGuide(sessionId);
    return extractFilePaths(guideContent);
  } catch {
    return [];
  }
}

/**
 * Extract file paths from phase guide
 */
export async function extractFilesFromPhaseGuide(
  phase: string,
  featureName: string = 'vue-migration'
): Promise<string[]> {
  try {
    const context = new WorkflowCommandContext(featureName);
    const guideContent = await context.readPhaseGuide(phase);
    return extractFilePaths(guideContent);
  } catch {
    return [];
  }
}

/**
 * Generate current state summary for a session
 */
export async function generateCurrentStateSummary(
  sessionId: string,
  featureName: string = 'vue-migration'
): Promise<CurrentStateSummary> {
  const filePaths = await extractFilesFromSessionGuide(sessionId, featureName);
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
  featureName: string = 'vue-migration'
): Promise<FileContext> {
  // Common patterns for component paths
  const reactPatterns = [
    `client/src/admin/components/${componentName}.tsx`,
    `client/src/admin/components/${componentName}.ts`,
    `client/src/components/${componentName}.tsx`,
    `client/src/components/${componentName}.ts`,
    `client/src/${componentName}.tsx`,
    `client/src/${componentName}.ts`,
  ];
  
  const vuePatterns = [
    `client-vue/src/components/${componentName}.vue`,
    `client-vue/src/components/${componentName}.ts`,
    `client-vue/src/${componentName}.vue`,
  ];
  
  // Try to find React component
  let reactPath: string | undefined;
  for (const pattern of reactPatterns) {
    if (await checkFileExists(pattern)) {
      reactPath = pattern;
      break;
    }
  }
  
  // Try to find Vue component
  let vuePath: string | undefined;
  for (const pattern of vuePatterns) {
    if (await checkFileExists(pattern)) {
      vuePath = pattern;
      break;
    }
  }
  
  // If React found but Vue not, map React to Vue
  if (reactPath && !vuePath) {
    vuePath = mapReactToVuePath(reactPath.replace(/\.tsx?$/, '.vue'));
  }
  
  return await gatherFileContext(reactPath, vuePath);
}

/**
 * Find related files by pattern
 */
export async function findRelatedFiles(
  pattern: string,
  baseDir: string = PROJECT_ROOT
): Promise<string[]> {
  // Simple pattern matching - can be enhanced with glob later
  const results: string[] = [];
  
  // For now, return empty array - can be enhanced with actual file system search
  // This is a placeholder for future enhancement
  return results;
}

