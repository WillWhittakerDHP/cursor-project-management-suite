/**
 * Atomic Command: /feature-comment-cleanup [--dry-run] [--compress]
 * Remove phase notes from code comments while preserving WHY and PATTERN comments
 * Optionally compress verbose comment clusters to concise, context-friendly versions
 * 
 * Tier: Cross-tier utility
 * Operates on: Code file comments
 */

import { readFile, writeFile, readdir } from 'fs/promises';
import { join, extname, relative } from 'path';
import { existsSync } from 'fs';
import { applyCompression } from '../utils/comment-compression';

export interface CommentCleanupParams {
  dryRun?: boolean; // If true, preview changes without modifying files
  paths?: string[]; // Optional: specific paths to clean (default: client/ and server/)
  compress?: boolean; // If true, compress verbose comment clusters to concise versions (default: true)
}

export interface CommentCleanupResult {
  success: boolean;
  filesModified: number;
  commentsRemoved: number;
  commentsCompressed: number;
  filesProcessed: string[];
  summary: string;
  errors?: string[];
}

/**
 * Remove phase notes and optionally compress verbose comment clusters
 * 
 * @param params Cleanup parameters
 * @returns Cleanup result with summary
 */
export async function featureCommentCleanup(
  params: CommentCleanupParams = {}
): Promise<CommentCleanupResult> {
  const { dryRun = false, paths, compress = true } = params;
  
  const result: CommentCleanupResult = {
    success: true,
    filesModified: 0,
    commentsRemoved: 0,
    commentsCompressed: 0,
    filesProcessed: [],
    summary: '',
    errors: [],
  };

  // Default paths to scan
  const scanPaths = paths || ['client', 'server'];
  
  // File extensions to process
  const extensions = ['.ts', '.tsx', '.vue', '.js', '.jsx', '.md'];
  
  // Patterns to exclude
  const excludePatterns = ['node_modules', 'dist', '.git', '.cursor'];
  
  // Phase note patterns (supports X.Y.Z and X.Y formats)
  const phaseNotePatterns = {
    // Single-line: // Phase X.Y.Z: ... or // Phase X.Y: ...
    singleLine: /\/\/\s*Phase\s+\d+\.\d+(?:\.\d+)?[:\s].*/g,
    // Multi-line: /* Phase X.Y.Z: ... */
    multiLine: /\/\*\s*Phase\s+\d+\.\d+(?:\.\d+)?[:\s][\s\S]*?\*\//g,
    // JSDoc: * Phase X.Y.Z: ... (within /** */ blocks)
    jsdoc: /\*\s*Phase\s+\d+\.\d+(?:\.\d+)?[:\s].*/g,
    // HTML/Vue: <!-- Phase X.Y.Z: ... -->
    html: /<!--\s*Phase\s+\d+\.\d+(?:\.\d+)?[:\s][\s\S]*?-->/g,
  };

  try {
    // Collect all files to process
    const filesToProcess: string[] = [];
    
    for (const scanPath of scanPaths) {
      const fullPath = join(process.cwd(), scanPath);
      if (existsSync(fullPath)) {
        const files = await collectFiles(fullPath, extensions, excludePatterns);
        filesToProcess.push(...files);
      }
    }

    result.filesProcessed = filesToProcess;
    const summaryLines: string[] = [];
    summaryLines.push(`# Feature Comment Cleanup\n`);
    summaryLines.push(`**Mode:** ${dryRun ? 'DRY RUN (no files modified)' : 'LIVE (files will be modified)'}\n`);
    summaryLines.push(`**Files to process:** ${filesToProcess.length}\n`);
    summaryLines.push('---\n\n');

    // Process each file
    for (const filePath of filesToProcess) {
      try {
        const fileResult = await processFile(filePath, phaseNotePatterns, dryRun, compress);
        
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
      } catch (error) {
        const errorMsg = `Error processing ${filePath}: ${error instanceof Error ? error.message : String(error)}`;
        result.errors?.push(errorMsg);
        summaryLines.push(`❌ ${errorMsg}\n`);
      }
    }

    result.summary = summaryLines.join('\n');
    
    if (dryRun) {
      result.summary += '\n\n⚠️ **DRY RUN MODE** - No files were modified. Run without --dry-run to apply changes.';
    } else {
      result.summary += `\n\n✅ **Cleanup complete**\n`;
      result.summary += `- Files modified: ${result.filesModified}\n`;
      result.summary += `- Comments removed: ${result.commentsRemoved}\n`;
      if (compress) {
        result.summary += `- Comments compressed: ${result.commentsCompressed}`;
      }
    }

    return result;
  } catch (error) {
    result.success = false;
    result.errors?.push(error instanceof Error ? error.message : String(error));
    result.summary = `❌ **Error:** ${error instanceof Error ? error.message : String(error)}`;
    return result;
  }
}

/**
 * Recursively collect files matching extensions
 */
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
      
      // Skip excluded patterns
      if (excludePatterns.some(pattern => relativePath.includes(pattern))) {
        continue;
      }
      
      if (entry.isDirectory()) {
        await collectFiles(fullPath, extensions, excludePatterns, files);
      } else if (entry.isFile()) {
        const ext = extname(entry.name);
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
    
    return files;
  } catch (error) {
    // Skip directories we can't read
    return files;
  }
}

interface PhaseNotePatterns {
  singleLine: RegExp;
  multiLine: RegExp;
  jsdoc: RegExp;
  html: RegExp;
}

/**
 * Check if a comment should be protected (contains TODO, Feature references, future work, etc.)
 */
function shouldProtectComment(content: string): boolean {
  const protectionPatterns = [
    /\bTODO\b/i,
    /\bFIXME\b/i,
    /\bNOTE:\s/i, // NOTE: at start of comment
    /Feature\s+\d+/i, // Feature 4, Feature 5, etc.
    /\bfuture\s+work\b/i,
    /\bfuture\s+use\b/i,
    /\bfuture\s+feature\b/i,
    /\bplugin\b/i,
    /\bplug-in\b/i,
    /\bextension\s+point\b/i,
    /\bextension\s+point\b/i,
  ];
  
  return protectionPatterns.some(pattern => pattern.test(content));
}

/**
 * Process a single file to remove phase notes and optionally compress comment clusters
 */
async function processFile(
  filePath: string,
  patterns: PhaseNotePatterns,
  dryRun: boolean,
  compress: boolean
): Promise<{ modified: boolean; commentsRemoved: number; commentsCompressed: number; linesRemoved: number[] }> {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  
  let modified = false;
  let commentsRemoved = 0;
  let commentsCompressed = 0;
  const linesRemoved: number[] = [];
  
  // Step 1: Remove phase notes (existing logic)
  const newLines: string[] = [];
  let inMultiLineComment = false;
  let multiLineStart = -1;
  let multiLineContent = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    
    // Check for multi-line comment start
    if (line.includes('/*') && !line.includes('*/')) {
      inMultiLineComment = true;
      multiLineStart = lineNum;
      multiLineContent = line;
      continue;
    }
    
    // If we're in a multi-line comment, accumulate content
    if (inMultiLineComment) {
      multiLineContent += '\n' + line;
      
      // Check for multi-line comment end
      if (line.includes('*/')) {
        inMultiLineComment = false;
        // Check if this block contains a phase note
        patterns.multiLine.lastIndex = 0;
        if (patterns.multiLine.test(multiLineContent)) {
          if (shouldProtectComment(multiLineContent)) {
            newLines.push(...multiLineContent.split('\n'));
          } else {
            modified = true;
            commentsRemoved++;
            const blockLines = multiLineContent.split('\n').length;
            for (let j = 0; j < blockLines; j++) {
              linesRemoved.push(multiLineStart + j);
            }
          }
          multiLineStart = -1;
          multiLineContent = '';
          continue;
        }
        newLines.push(...multiLineContent.split('\n'));
        multiLineStart = -1;
        multiLineContent = '';
        continue;
      }
      continue;
    }
    
    // Check for single-line phase notes
    patterns.singleLine.lastIndex = 0;
    if (patterns.singleLine.test(line)) {
      if (shouldProtectComment(line)) {
        newLines.push(line);
      } else {
        modified = true;
        commentsRemoved++;
        linesRemoved.push(lineNum);
      }
      continue;
    }
    
    // Check for JSDoc phase notes
    if (line.trim().startsWith('*') || line.trim().startsWith('/**')) {
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
    
    // Check for HTML/Vue template comments
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
  
  // Step 2: Compress comment clusters if enabled
  let finalLines = newLines;
  if (compress) {
    const compressionResult = applyCompression(newLines);
    finalLines = compressionResult.lines;
    commentsCompressed = compressionResult.compressionCount;
    
    if (commentsCompressed > 0) {
      modified = true;
    }
  }
  
  // Write file if modified and not dry run
  if (modified && !dryRun) {
    await writeFile(filePath, finalLines.join('\n'), 'utf-8');
  }
  
  return { modified, commentsRemoved, commentsCompressed, linesRemoved };
}

