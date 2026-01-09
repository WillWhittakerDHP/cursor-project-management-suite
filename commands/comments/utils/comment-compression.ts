/**
 * Comment Compression Utilities
 * 
 * Shared utilities for compressing verbose comment clusters to concise, context-friendly versions
 * Used by phase-comment-cleanup and feature-comment-cleanup commands
 */

export interface CommentCluster {
  startLine: number;
  endLine: number;
  comments: string[];
  types: Set<string>; // WHY, LEARNING, PATTERN, etc.
}

/**
 * Detect comment type from content
 */
export function detectCommentType(content: string): string | null {
  const typePatterns = [
    { type: 'STRUCTURED', pattern: /(?:\/\/|\/\*\*?|\*)\s*STRUCTURED:/i },
    { type: 'REFERENCE', pattern: /(?:\/\/|\/\*\*?|\*)\s*REFERENCE:/i },
    { type: 'LEARNING', pattern: /(?:\/\/|\/\*\*?|\*)\s*LEARNING:/i },
    { type: 'WHY', pattern: /(?:\/\/|\/\*\*?|\*)\s*WHY:/i },
    { type: 'COMPARISON', pattern: /(?:\/\/|\/\*\*?|\*)\s*COMPARISON:/i },
    { type: 'PATTERN', pattern: /(?:\/\/|\/\*\*?|\*)\s*PATTERN:/i },
    { type: 'RESOURCE', pattern: /(?:\/\/|\/\*\*?|\*)\s*RESOURCE:/i },
    { type: 'WHAT', pattern: /(?:\/\/|\/\*\*?|\*)\s*WHAT:/i },
    { type: 'HOW', pattern: /(?:\/\/|\/\*\*?|\*)\s*HOW:/i },
    { type: 'SEE', pattern: /(?:\/\/|\/\*\*?|\*)\s*SEE:/i },
  ];
  
  for (const { type, pattern } of typePatterns) {
    if (pattern.test(content)) {
      return type;
    }
  }
  
  return null;
}

/**
 * Extract core insight from verbose comment
 */
export function extractCoreInsight(comment: string, type: string): string {
  // Remove comment markers and type prefix
  let cleaned = comment
    .replace(/^\/\*\*?|\*\/$/g, '') // Remove /** */ or /* */
    .replace(/^\s*\*\s?/gm, '') // Remove leading * from JSDoc lines
    .replace(/^\/\/\s*/gm, '') // Remove // from single-line comments
    .replace(/^<!--\s*|\s*-->$/g, '') // Remove HTML comment markers
    .trim();
  
  // Remove type prefix (e.g., "LEARNING:", "WHY:")
  const typePattern = new RegExp(`^${type}:\\s*`, 'i');
  cleaned = cleaned.replace(typePattern, '').trim();
  
  // Extract first meaningful sentence or clause
  const sentences = cleaned.split(/[.!?]\s+/);
  if (sentences.length > 0 && sentences[0].length > 0) {
    // Take first sentence if it's substantial
    if (sentences[0].length > 20) {
      return sentences[0].trim();
    }
    // Otherwise, take first two sentences if available
    if (sentences.length > 1) {
      return `${sentences[0].trim()}. ${sentences[1].trim()}`;
    }
    return sentences[0].trim();
  }
  
  return cleaned;
}

/**
 * Compress a cluster of comments to their most helpful, context-friendly form
 */
export function compressCommentCluster(cluster: CommentCluster): string[] {
  const compressed: string[] = [];
  const insights = new Map<string, string>();
  
  // Extract insights by type
  for (const comment of cluster.comments) {
    const type = detectCommentType(comment);
    if (type) {
      const insight = extractCoreInsight(comment, type);
      if (insight && insight.length > 10) {
        // Prioritize: WHY > PATTERN > others
        if (type === 'WHY' || type === 'PATTERN') {
          insights.set(type, insight);
        } else if (!insights.has('WHY') && !insights.has('PATTERN')) {
          // Only keep LEARNING/COMPARISON if no WHY/PATTERN exists
          if (type === 'LEARNING' || type === 'COMPARISON') {
            // Convert to WHY format
            insights.set('WHY', insight);
          } else {
            insights.set(type, insight);
          }
        }
      }
    }
  }
  
  // Build compressed comment
  if (insights.size > 0) {
    compressed.push('/**');
    
    // WHY first (most important)
    if (insights.has('WHY')) {
      compressed.push(` * WHY: ${insights.get('WHY')}`);
    }
    
    // PATTERN second
    if (insights.has('PATTERN')) {
      compressed.push(` * PATTERN: ${insights.get('PATTERN')}`);
    }
    
    // SEE/REFERENCE if exists
    if (insights.has('SEE')) {
      compressed.push(` * SEE: ${insights.get('SEE')}`);
    } else if (insights.has('REFERENCE')) {
      compressed.push(` * SEE: ${insights.get('REFERENCE')}`);
    }
    
    compressed.push(' */');
  }
  
  return compressed;
}

/**
 * Identify comment clusters in lines (groups of consecutive comments)
 */
export function identifyCommentClusters(lines: string[]): CommentCluster[] {
  const clusters: CommentCluster[] = [];
  let currentCluster: CommentCluster | null = null;
  let inMultiLineComment = false;
  let multiLineContent = '';
  let emptyLineCount = 0; // Track consecutive empty lines
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Empty line handling - allow 1 empty line between comments in a cluster
    if (trimmed === '') {
      if (currentCluster) {
        emptyLineCount++;
        if (emptyLineCount <= 1) {
          // Allow one empty line, don't break cluster yet
          currentCluster.endLine = i + 1;
          continue;
        }
      }
    } else {
      emptyLineCount = 0;
    }
    
    // Check if this is a comment line
    const isCommentLine = trimmed.startsWith('//') || 
                          trimmed.startsWith('/*') || 
                          trimmed.startsWith('*') || 
                          trimmed.startsWith('<!--') ||
                          inMultiLineComment;
    
    if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
      inMultiLineComment = true;
      multiLineContent = line;
      
      // Start new cluster if not in one
      if (!currentCluster) {
        currentCluster = {
          startLine: i + 1,
          endLine: i + 1,
          comments: [],
          types: new Set(),
        };
      } else {
        currentCluster.endLine = i + 1;
      }
      continue;
    }
    
    if (inMultiLineComment) {
      multiLineContent += '\n' + line;
      if (currentCluster) {
        currentCluster.endLine = i + 1;
      }
      
      if (trimmed.includes('*/')) {
        inMultiLineComment = false;
        if (currentCluster) {
          currentCluster.comments.push(multiLineContent);
          const type = detectCommentType(multiLineContent);
          if (type) {
            currentCluster.types.add(type);
          }
        }
        multiLineContent = '';
      }
      continue;
    }
    
    if (isCommentLine && !inMultiLineComment) {
      // Start new cluster or extend existing
      if (!currentCluster) {
        currentCluster = {
          startLine: i + 1,
          endLine: i + 1,
          comments: [line],
          types: new Set(),
        };
        const type = detectCommentType(line);
        if (type) {
          currentCluster.types.add(type);
        }
      } else {
        currentCluster.endLine = i + 1;
        currentCluster.comments.push(line);
        const type = detectCommentType(line);
        if (type) {
          currentCluster.types.add(type);
        }
      }
    } else if (currentCluster && !isCommentLine && trimmed !== '') {
      // End of cluster (non-empty, non-comment line)
      // Save it if it has multiple typed comments or is verbose
      if (currentCluster.types.size >= 2 || 
          (currentCluster.types.size >= 1 && currentCluster.comments.length >= 2)) {
        clusters.push(currentCluster);
      }
      currentCluster = null;
      emptyLineCount = 0;
    }
  }
  
  // Save final cluster if exists
  if (currentCluster && (currentCluster.types.size >= 2 || 
      (currentCluster.types.size >= 1 && currentCluster.comments.length >= 2))) {
    clusters.push(currentCluster);
  }
  
  return clusters;
}

/**
 * Apply compression to lines and return modified lines with compression count
 */
export function applyCompression(lines: string[]): { lines: string[]; compressionCount: number } {
  const clusters = identifyCommentClusters(lines);
  
  if (clusters.length === 0) {
    return { lines, compressionCount: 0 };
  }
  
  // Process clusters in reverse order to maintain line numbers
  const clustersToCompress = clusters.reverse();
  let finalLines = [...lines];
  let compressionCount = 0;
  
  for (const cluster of clustersToCompress) {
    const compressed = compressCommentCluster(cluster);
    
    // Calculate original line span
    const originalLineSpan = cluster.endLine - cluster.startLine + 1;
    
    // Only compress if we actually reduced the size (comparing line counts)
    if (compressed.length > 0 && compressed.length < originalLineSpan) {
      // Get indentation from original first line
      const originalFirstLine = lines[cluster.startLine - 1];
      const indentation = originalFirstLine.match(/^\s*/)?.[0] || '';
      
      // Apply indentation to compressed comments
      const indentedCompressed = compressed.map(line => 
        line === '/**' || line === ' */' ? `${indentation}${line}` : `${indentation}${line}`
      );
      
      // Replace cluster with compressed version
      finalLines.splice(
        cluster.startLine - 1,
        originalLineSpan,
        ...indentedCompressed
      );
      
      compressionCount++;
    }
  }
  
  return { lines: finalLines, compressionCount };
}

