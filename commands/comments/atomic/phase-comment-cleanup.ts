/**
 * Atomic Command: /phase-comment-cleanup [--dry-run] [--compress]
 * Remove session notes from code comments while preserving WHY and PATTERN comments
 * Optionally compress verbose comment clusters to concise, context-friendly versions
 * 
 * Tier: Cross-tier utility
 * Operates on: Code file comments
 */

import { readFile, writeFile, readdir } from 'fs/promises';
import { join, extname, relative } from 'path';
import { existsSync } from 'fs';
import { applyCompression, isCommentValuable, isRegularCommentValuable, detectCommentType } from '../utils/comment-compression';

export interface CommentCleanupParams {
  dryRun?: boolean; // If true, preview changes without modifying files
  paths?: string[]; // Optional: specific file paths to clean (if provided, only these files; otherwise scans client/ and server/)
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
 * Remove session notes and optionally compress verbose comment clusters
 * 
 * @param params Cleanup parameters
 * @returns Cleanup result with summary
 */
export async function phaseCommentCleanup(
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

  // File extensions to process
  const extensions = ['.ts', '.tsx', '.vue', '.js', '.jsx', '.md'];
  
  // Patterns to exclude
  const excludePatterns = ['node_modules', 'dist', '.git', '.cursor'];
  
  // If specific paths provided, use them directly (they're already file paths)
  // Otherwise, scan entire directories
  const filesToProcess: string[] = [];
  
  if (paths && paths.length > 0) {
    // Use provided file paths directly (from detectPhaseModifiedFiles)
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
    // Default: scan entire directories
    const scanPaths = ['client', 'server'];
    for (const scanPath of scanPaths) {
      const fullPath = join(process.cwd(), scanPath);
      if (existsSync(fullPath)) {
        const files = await collectFiles(fullPath, extensions, excludePatterns);
        filesToProcess.push(...files);
      }
    }
  }
  
  // Session note patterns
  const sessionNotePatterns = {
    // Single-line: // Session X.Y.Z: ...
    singleLine: /\/\/\s*Session\s+\d+\.\d+\.\d+[:\s].*/g,
    // Multi-line: /* Session X.Y.Z: ... */
    multiLine: /\/\*\s*Session\s+\d+\.\d+\.\d+[:\s][\s\S]*?\*\//g,
    // JSDoc: * Session X.Y.Z: ... (within /** */ blocks)
    jsdoc: /\*\s*Session\s+\d+\.\d+\.\d+[:\s].*/g,
    // HTML/Vue: <!-- Session X.Y.Z: ... -->
    html: /<!--\s*Session\s+\d+\.\d+\.\d+[:\s][\s\S]*?-->/g,
  };

  try {
    result.filesProcessed = filesToProcess;
    const summaryLines: string[] = [];
    summaryLines.push(`# Phase Comment Cleanup\n`);
    summaryLines.push(`**Mode:** ${dryRun ? 'DRY RUN (no files modified)' : 'LIVE (files will be modified)'}\n`);
    summaryLines.push(`**Files to process:** ${filesToProcess.length}\n`);
    summaryLines.push('---\n\n');

    // Process each file
    for (const filePath of filesToProcess) {
      try {
        const fileResult = await processFile(filePath, sessionNotePatterns, dryRun, compress);
        
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
  } catch {} {
    // Skip directories we can't read
    return files;
  }
}

interface SessionNotePatterns {
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
 * Process a single file to remove session notes and optionally compress comment clusters
 */
async function processFile(
  filePath: string,
  patterns: SessionNotePatterns,
  dryRun: boolean,
  compress: boolean
): Promise<{ modified: boolean; commentsRemoved: number; commentsCompressed: number; linesRemoved: number[] }> {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  
  let modified = false;
  let commentsRemoved = 0;
  const linesRemoved: number[] = [];
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
      continue; // Don't add this line yet
    }
    
    // If we're in a multi-line comment, accumulate content
    if (inMultiLineComment) {
      multiLineContent += '\n' + line;
      
      // Check for multi-line comment end
      if (line.includes('*/')) {
        inMultiLineComment = false;
        // Check if this block contains a session note
        patterns.multiLine.lastIndex = 0;
        if (patterns.multiLine.test(multiLineContent)) {
          // Check if comment should be protected (contains TODO, Feature references, etc.)
          if (shouldProtectComment(multiLineContent)) {
            // Protected comment - keep it even though it has session note
            newLines.push(...multiLineContent.split('\n'));
          } else {
            // Not protected - remove the entire block
            modified = true;
            commentsRemoved++;
            // Track all lines in this block
            const blockLines = multiLineContent.split('\n').length;
            for (let j = 0; j < blockLines; j++) {
              linesRemoved.push(multiLineStart + j);
            }
          }
          multiLineStart = -1;
          multiLineContent = '';
          continue;
        }
        // Block doesn't contain session note
        // Check if it contains typed comments that should be evaluated
        const hasTypedComment = /(WHY|PATTERN|LEARNING|RESOURCE|COMPARISON):/i.test(multiLineContent);
        if (hasTypedComment) {
          // Evaluate each typed comment in the block
          const blockLines = multiLineContent.split('\n');
          const filteredLines: string[] = [];
          for (const blockLine of blockLines) {
            const type = detectCommentType(blockLine);
            if (type && !isCommentValuable(blockLine, type)) {
              // Skip non-valuable typed comment line
              modified = true;
              commentsRemoved++;
            } else {
              filteredLines.push(blockLine);
            }
          }
          // Only keep the block if it has remaining content
          if (filteredLines.length > 0) {
            newLines.push(...filteredLines);
          } else {
            // Entire block was removed
            const blockLineCount = blockLines.length;
            for (let j = 0; j < blockLineCount; j++) {
              linesRemoved.push(multiLineStart + j);
            }
          }
        } else {
          // No typed comments, keep as-is
          newLines.push(...multiLineContent.split('\n'));
        }
        multiLineStart = -1;
        multiLineContent = '';
        continue;
      }
      continue; // Still in multi-line comment
    }
    
    // Check for single-line session notes (reset regex first)
    patterns.singleLine.lastIndex = 0;
    if (patterns.singleLine.test(line)) {
      // Check if comment should be protected
      if (shouldProtectComment(line)) {
        // Protected comment - keep it even though it has session note
        newLines.push(line);
      } else {
        // Not protected - remove it
        modified = true;
        commentsRemoved++;
        linesRemoved.push(lineNum);
      }
      continue;
    }
    
    // Check for JSDoc session notes (within /** */ blocks)
    // Only check lines that are part of JSDoc comments (start with * or /**)
    if (line.trim().startsWith('*') || line.trim().startsWith('/**')) {
      patterns.jsdoc.lastIndex = 0;
      if (patterns.jsdoc.test(line)) {
        // Check if comment should be protected
        if (shouldProtectComment(line)) {
          // Protected comment - keep it even though it has session note
          newLines.push(line);
        } else {
          // Not protected - remove it
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
      // Check if comment should be protected
      if (shouldProtectComment(line)) {
        // Protected comment - keep it even though it has session note
        newLines.push(line);
      } else {
        // Not protected - remove it
        modified = true;
        commentsRemoved++;
        linesRemoved.push(lineNum);
      }
      continue;
    }
    
    // Keep the line
    newLines.push(line);
  }
  
  // Step 2: Evaluate and remove non-valuable individual typed comments
  const typedCommentPatterns = [
    /\/\/\s*(WHY|PATTERN|LEARNING|RESOURCE|COMPARISON):\s*.+/gi,
    /\*\s*(WHY|PATTERN|LEARNING|RESOURCE|COMPARISON):\s*.+/gi,
  ];
  
  for (let i = 0; i < newLines.length; i++) {
    const line = newLines[i];
    
    for (const pattern of typedCommentPatterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(line);
      if (match) {
        const type = detectCommentType(line);
        if (type && !isCommentValuable(line, type)) {
          // Remove non-valuable typed comment
          newLines.splice(i, 1);
          modified = true;
          commentsRemoved++;
          linesRemoved.push(i + 1);
          i--; // Adjust index after removal
          break;
        }
      }
    }
  }
  
  // Step 2.5: Evaluate and remove non-valuable regular comments (non-typed)
  // Only evaluate standalone regular comments, not those in clusters (clusters handled by compression)
  const regularCommentPatterns = [
    /^\s*\/\/[^/*]/, // Single-line regular comment (not // or /*)
    /^\s*\/\*[^*]/, // Multi-line comment start (not /**)
    /^\s*\*[^*/]/, // JSDoc line (not */ or /**)
  ];
  
  // Track if we're in a multi-line comment to avoid evaluating individual lines
  let _inMultiLineComment = false;
  for (let i = 0; i < newLines.length; i++) {
    const line = newLines[i];
    const trimmed = line.trim();
    
    // Track multi-line comment state
    if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
      _inMultiLineComment = true;
      continue;
    }
    if (_inMultiLineComment && trimmed.includes('*/')) {
      _inMultiLineComment = false;
      continue;
    }
    if (_inMultiLineComment) {
      continue; // Skip lines inside multi-line comments (handled by compression)
    }
    
    // Check if this is a standalone regular comment
    const isRegularComment = regularCommentPatterns.some(pattern => pattern.test(line));
    const hasTypedComment = detectCommentType(line) !== null;
    
    if (isRegularComment && !hasTypedComment) {
      // Check if it's part of a cluster (next or previous line is also a comment)
      const prevLine = i > 0 ? newLines[i - 1].trim() : '';
      const nextLine = i < newLines.length - 1 ? newLines[i + 1].trim() : '';
      const prevIsComment = prevLine.startsWith('//') || prevLine.startsWith('/*') || prevLine.startsWith('*');
      const nextIsComment = nextLine.startsWith('//') || nextLine.startsWith('/*') || nextLine.startsWith('*');
      
      // Only evaluate standalone comments (not part of clusters - clusters handled by compression)
      if (!prevIsComment && !nextIsComment) {
        if (!isRegularCommentValuable(line)) {
          // Remove non-valuable standalone regular comment
          newLines.splice(i, 1);
          modified = true;
          commentsRemoved++;
          linesRemoved.push(i + 1);
          i--; // Adjust index after removal
        }
      }
    }
  }
  
  // Step 3: Compress comment clusters if enabled
  let commentsCompressed = 0;
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

