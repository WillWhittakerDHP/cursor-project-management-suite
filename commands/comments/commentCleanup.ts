/**
 * Single comment cleanup implementation. Callers pass a config (or preset); no wrappers.
 * Used by feature-end (FEATURE_CLEANUP_CONFIG), phase-end (PHASE_CLEANUP_CONFIG), and npm run comments:cleanup.
 */

import { readFile, writeFile, readdir } from 'fs/promises';
import { join, extname, relative } from 'path';
import { existsSync } from 'fs';
import {
  applyCompression,
  isCommentValuable,
  isRegularCommentValuable,
  detectCommentType,
  stripTrailingComment,
  lineContainsCode,
  validateFileIntegrity,
  detectVueSfcSections,
} from './utils/comment-compression';
import { FRONTEND_ROOT } from '../utils/utils';

export interface CleanupConfig {
  notePatterns: {
    singleLine: RegExp;
    multiLine: RegExp;
    jsdoc: RegExp;
    html: RegExp;
  };
  evaluateTypedComments: boolean;
  evaluateRegularComments: boolean;
  compress: boolean;
  dryRun: boolean;
  paths?: string[];
}

export interface CommentCleanupResult {
  success: boolean;
  filesModified: number;
  commentsRemoved: number;
  commentsCompressed: number;
  filesProcessed: string[];
  summary: string;
  errors?: string[];
  /** Number of files skipped due to validation (review recommended). */
  filesSkipped?: number;
  /** Path and reason for each skipped file. */
  skippedDetails?: { path: string; reason: string }[];
}

/** Phase notes (Phase X.Y or X.Y.Z). Used by feature-end. */
export const FEATURE_CLEANUP_CONFIG: Omit<CleanupConfig, 'dryRun' | 'paths'> = {
  notePatterns: {
    singleLine: /\/\/\s*Phase\s+\d+\.\d+(?:\.\d+)?[:\s].*/g,
    multiLine: /\/\*\s*Phase\s+\d+\.\d+(?:\.\d+)?[:\s][\s\S]*?\*\//g,
    jsdoc: /\*\s*Phase\s+\d+\.\d+(?:\.\d+)?[:\s].*/g,
    html: /<!--\s*Phase\s+\d+\.\d+(?:\.\d+)?[:\s][\s\S]*?-->/g,
  },
  evaluateTypedComments: false,
  evaluateRegularComments: false,
  compress: false,
};

/** Session notes (Session X.Y.Z) and typed/regular comment evaluation. Used by phase-end and npm run comments:cleanup. */
export const PHASE_CLEANUP_CONFIG: Omit<CleanupConfig, 'dryRun' | 'paths'> = {
  notePatterns: {
    singleLine: /\/\/\s*Session\s+\d+\.\d+\.\d+[:\s].*/g,
    multiLine: /\/\*\s*Session\s+\d+\.\d+\.\d+[:\s][\s\S]*?\*\//g,
    jsdoc: /\*\s*Session\s+\d+\.\d+\.\d+[:\s].*/g,
    html: /<!--\s*Session\s+\d+\.\d+\.\d+[:\s][\s\S]*?-->/g,
  },
  evaluateTypedComments: true,
  evaluateRegularComments: true,
  compress: false,
};

/**
 * Run comment cleanup with the given config. Single entry point; no wrappers.
 */
export async function commentCleanup(config: CleanupConfig): Promise<CommentCleanupResult> {
  const result: CommentCleanupResult = {
    success: true,
    filesModified: 0,
    commentsRemoved: 0,
    commentsCompressed: 0,
    filesProcessed: [],
    summary: '',
    errors: [],
    filesSkipped: 0,
    skippedDetails: [],
  };

  try {
  const { dryRun, paths, compress, notePatterns, evaluateTypedComments, evaluateRegularComments } = config;
  const extensions = ['.ts', '.tsx', '.vue', '.js', '.jsx', '.md'];
  const excludePatterns = ['node_modules', 'dist', '.git', '.cursor'];
  const filesToProcess: string[] = [];

  if (paths && paths.length > 0) {
    for (const filePath of paths) {
      const fullPath = join(process.cwd(), filePath);
      if (existsSync(fullPath)) {
        const ext = extname(filePath);
        if (extensions.includes(ext)) {
          filesToProcess.push(fullPath);
        }
      }
    }
  } else {
    const scanPaths = [FRONTEND_ROOT, 'server'];
    for (const scanPath of scanPaths) {
      const fullPath = join(process.cwd(), scanPath);
      if (existsSync(fullPath)) {
        const files = await collectFiles(fullPath, extensions, excludePatterns);
        filesToProcess.push(...files);
      }
    }
  }

  result.filesProcessed = filesToProcess;
  const summaryLines: string[] = [];
  const skippedFiles: { path: string; reason: string }[] = [];
  summaryLines.push(`# Comment Cleanup\n`);
  summaryLines.push(`**Mode:** ${dryRun ? 'DRY RUN (no files modified)' : 'LIVE (files will be modified)'}\n`);
  summaryLines.push(`**Files to process:** ${filesToProcess.length}\n`);
  summaryLines.push('---\n\n');

  for (const filePath of filesToProcess) {
    try {
      const fileResult = await processFile(filePath, {
        notePatterns,
        evaluateTypedComments,
        evaluateRegularComments,
        compress,
        dryRun,
      });
      if (fileResult.skipped && fileResult.skipReason) {
        skippedFiles.push({ path: filePath, reason: fileResult.skipReason });
      }
      if (fileResult.modified) {
        result.filesModified++;
        result.commentsRemoved += fileResult.commentsRemoved;
        result.commentsCompressed += fileResult.commentsCompressed;
        summaryLines.push(`**${relative(process.cwd(), filePath)}**`);
        summaryLines.push(`- Comments removed: ${fileResult.commentsRemoved}`);
        if (compress && fileResult.commentsCompressed > 0) {
          summaryLines.push(`- Comments compressed: ${fileResult.commentsCompressed}`);
        }
        if (fileResult.linesRemoved.length > 0) {
          summaryLines.push(`- Lines removed: ${fileResult.linesRemoved.join(', ')}`);
        }
        summaryLines.push('');
      }
    } catch (_error) {
      const errorMsg = `Error processing ${filePath}: ${_error instanceof Error ? _error.message : String(_error)}`;
      result.errors?.push(errorMsg);
      summaryLines.push(`❌ ${errorMsg}\n`);
    }
  }

  result.filesSkipped = skippedFiles.length;
  result.skippedDetails = skippedFiles;
  if (skippedFiles.length > 0) {
    result.success = false;
  }

  result.summary = summaryLines.join('\n');
  if (dryRun) {
    result.summary += '\n\n⚠️ **DRY RUN MODE** - No files were modified. Run without dryRun to apply changes.';
  } else {
    result.summary += `\n\n✅ **Cleanup complete**\n`;
    result.summary += `- Files modified: ${result.filesModified}\n`;
    result.summary += `- Comments removed: ${result.commentsRemoved}\n`;
    if (compress) {
      result.summary += `- Comments compressed: ${result.commentsCompressed}`;
    }
    if (skippedFiles.length > 0) {
      result.summary += `\n\n⚠️ **Skipped (review recommended)**\n`;
      result.summary += `- Files skipped: ${skippedFiles.length}\n\n`;
      for (const { path: p, reason } of skippedFiles) {
        result.summary += `- **${relative(process.cwd(), p)}**\n  ${reason}\n\n`;
      }
    }
  }

  return result;
  } catch (_error) {
    result.success = false;
    result.errors?.push(_error instanceof Error ? _error.message : String(_error));
    result.summary = `❌ **Error:** ${_error instanceof Error ? _error.message : String(_error)}`;
    return result;
  }
}

/** Params for cleanup (dryRun, paths, optional compress). Used by feature-end and phase-end. */
export interface CommentCleanupParams {
  dryRun?: boolean;
  paths?: string[];
  compress?: boolean;
}

/** Backward-compat: feature-end calls this; delegates to commentCleanup(FEATURE_CLEANUP_CONFIG). */
export async function featureCommentCleanup(params: CommentCleanupParams = {}): Promise<CommentCleanupResult> {
  return commentCleanup({ ...FEATURE_CLEANUP_CONFIG, dryRun: params.dryRun ?? false, paths: params.paths, compress: params.compress ?? false });
}

/** Backward-compat: phase-end calls this; delegates to commentCleanup(PHASE_CLEANUP_CONFIG). */
export async function phaseCommentCleanup(params: CommentCleanupParams = {}): Promise<CommentCleanupResult> {
  return commentCleanup({ ...PHASE_CLEANUP_CONFIG, dryRun: params.dryRun ?? false, paths: params.paths, compress: params.compress ?? false });
}

async function collectFiles(
  dir: string,
  extensions: string[],
  excludePatterns: string[],
  files: string[] = []
): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = relative(process.cwd(), fullPath);
      if (excludePatterns.some(pattern => relativePath.includes(pattern))) continue;
      if (entry.isDirectory()) {
        await collectFiles(fullPath, extensions, excludePatterns, files);
      } else if (entry.isFile()) {
        const ext = extname(entry.name);
        if (extensions.includes(ext)) files.push(fullPath);
      }
    }
    return files;
  } catch (err) {
    console.warn('Comment cleanup: directory not readable', dir, err);
    return files;
  }
}

function shouldProtectComment(content: string): boolean {
  const protectionPatterns = [
    /\bTODO\b/i,
    /\bFIXME\b/i,
    /\bNOTE:\s/i,
    /Feature\s+\d+/i,
    /\bfuture\s+work\b/i,
    /\bfuture\s+use\b/i,
    /\bfuture\s+feature\b/i,
    /\bplugin\b/i,
    /\bplug-in\b/i,
    /\bextension\s+point\b/i,
  ];
  return protectionPatterns.some(pattern => pattern.test(content));
}

function safeRemoveLine(line: string): string | null {
  if (lineContainsCode(line)) {
    return stripTrailingComment(line) ?? line;
  }
  return null;
}

interface ProcessFileConfig {
  notePatterns: CleanupConfig['notePatterns'];
  evaluateTypedComments: boolean;
  evaluateRegularComments: boolean;
  compress: boolean;
  dryRun: boolean;
}

async function processFile(
  filePath: string,
  cfg: ProcessFileConfig
): Promise<{
  modified: boolean;
  commentsRemoved: number;
  commentsCompressed: number;
  linesRemoved: number[];
  skipped?: boolean;
  skipReason?: string;
}> {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const isVue = filePath.endsWith('.vue');
  const patterns = cfg.notePatterns;

  let modified = false;
  let commentsRemoved = 0;
  let commentsCompressed = 0;
  const linesRemoved: number[] = [];
  const newLines: string[] = [];
  let inMultiLineComment = false;
  let multiLineStart = -1;
  let multiLineContent = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (!inMultiLineComment && trimmed.startsWith('/*') && !trimmed.includes('*/')) {
      inMultiLineComment = true;
      multiLineStart = lineNum;
      multiLineContent = line;
      continue;
    }

    if (inMultiLineComment) {
      multiLineContent += '\n' + line;
      if (line.includes('*/')) {
        inMultiLineComment = false;
        patterns.multiLine.lastIndex = 0;
        if (patterns.multiLine.test(multiLineContent)) {
          if (shouldProtectComment(multiLineContent)) {
            newLines.push(...multiLineContent.split('\n'));
          } else {
            modified = true;
            commentsRemoved++;
            const blockLines = multiLineContent.split('\n').length;
            for (let j = 0; j < blockLines; j++) linesRemoved.push(multiLineStart + j);
          }
        } else {
          if (cfg.evaluateTypedComments && /(WHY|PATTERN|LEARNING|RESOURCE|COMPARISON):/i.test(multiLineContent)) {
            const blockLines = multiLineContent.split('\n');
            const filteredLines: string[] = [];
            for (const blockLine of blockLines) {
              const type = detectCommentType(blockLine);
              if (type && !isCommentValuable(blockLine, type)) {
                modified = true;
                commentsRemoved++;
              } else {
                filteredLines.push(blockLine);
              }
            }
            if (filteredLines.length > 0) {
              newLines.push(...filteredLines);
            } else {
              for (let j = 0; j < blockLines.length; j++) linesRemoved.push(multiLineStart + j);
            }
          } else {
            newLines.push(...multiLineContent.split('\n'));
          }
        }
        multiLineStart = -1;
        multiLineContent = '';
        continue;
      }
      continue;
    }

    patterns.singleLine.lastIndex = 0;
    if (patterns.singleLine.test(line)) {
      if (shouldProtectComment(line)) {
        newLines.push(line);
      } else {
        const kept = safeRemoveLine(line);
        if (kept !== null) newLines.push(kept);
        modified = true;
        commentsRemoved++;
        linesRemoved.push(lineNum);
      }
      continue;
    }

    if (trimmed.startsWith('*') || trimmed.startsWith('/**')) {
      patterns.jsdoc.lastIndex = 0;
      if (patterns.jsdoc.test(line)) {
        if (shouldProtectComment(line)) {
          newLines.push(line);
        } else {
          modified = true;
          commentsRemoved++;
          linesRemoved.push(lineNum);
        }
        continue;
      }
    }

    patterns.html.lastIndex = 0;
    if (patterns.html.test(line)) {
      if (shouldProtectComment(line)) {
        newLines.push(line);
      } else {
        modified = true;
        commentsRemoved++;
        linesRemoved.push(lineNum);
      }
      continue;
    }

    newLines.push(line);
  }

  const workingLines = newLines;

  if (cfg.evaluateTypedComments) {
    const typedCommentPatterns = [
      /\/\/\s*(WHY|PATTERN|LEARNING|RESOURCE|COMPARISON):\s*.+/gi,
      /\*\s*(WHY|PATTERN|LEARNING|RESOURCE|COMPARISON):\s*.+/gi,
    ];
    for (let i = 0; i < workingLines.length; i++) {
      const line = workingLines[i];
      for (const pattern of typedCommentPatterns) {
        pattern.lastIndex = 0;
        if (pattern.exec(line)) {
          const type = detectCommentType(line);
          if (type && !isCommentValuable(line, type)) {
            const kept = safeRemoveLine(line);
            if (kept !== null) {
              workingLines[i] = kept;
            } else {
              workingLines.splice(i, 1);
              i--;
            }
            modified = true;
            commentsRemoved++;
            linesRemoved.push(i + 1);
            break;
          }
        }
      }
    }
  }

  if (cfg.evaluateRegularComments) {
    const regularCommentPatterns = [/^\s*\/\/[^/*]/, /^\s*\/\*[^*]/, /^\s*\*[^*/]/];
    let trackMultiLine = false;
    for (let i = 0; i < workingLines.length; i++) {
      const line = workingLines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
        trackMultiLine = true;
        continue;
      }
      if (trackMultiLine && trimmed.includes('*/')) {
        trackMultiLine = false;
        continue;
      }
      if (trackMultiLine) continue;
      const isRegularComment = regularCommentPatterns.some(p => p.test(line));
      const hasTypedComment = detectCommentType(line) !== null;
      if (isRegularComment && !hasTypedComment) {
        const prevLine = i > 0 ? workingLines[i - 1].trim() : '';
        const nextLine = i < workingLines.length - 1 ? workingLines[i + 1].trim() : '';
        const prevIsComment = prevLine.startsWith('//') || prevLine.startsWith('/*') || prevLine.startsWith('*');
        const nextIsComment = nextLine.startsWith('//') || nextLine.startsWith('/*') || nextLine.startsWith('*');
        if (!prevIsComment && !nextIsComment && !isRegularCommentValuable(line)) {
          const kept = safeRemoveLine(line);
          if (kept !== null) {
            workingLines[i] = kept;
          } else {
            workingLines.splice(i, 1);
            i--;
          }
          modified = true;
          commentsRemoved++;
          linesRemoved.push(i + 1);
        }
      }
    }
  }

  let finalLines = workingLines;
  if (cfg.compress) {
    const sfcSections = isVue ? detectVueSfcSections(workingLines) : undefined;
    const compressionResult = applyCompression(workingLines, sfcSections);
    finalLines = compressionResult.lines;
    commentsCompressed = compressionResult.compressionCount;
    if (commentsCompressed > 0) modified = true;
  }

  if (modified && !cfg.dryRun) {
    const validation = validateFileIntegrity(finalLines, filePath);
    if (!validation.valid) {
      const reason = validation.errors.join('; ');
      console.warn(`[comment-cleanup] Skipping ${filePath} — validation failed: ${reason}`);
      return { modified: false, commentsRemoved: 0, commentsCompressed: 0, linesRemoved: [], skipped: true, skipReason: reason };
    }
    await writeFile(filePath, finalLines.join('\n'), 'utf-8');
  }

  return { modified, commentsRemoved, commentsCompressed, linesRemoved };
}
