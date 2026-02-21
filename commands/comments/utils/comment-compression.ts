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
 * Determine if a comment contains non-obvious, valuable insights
 * Returns true if comment is worth keeping, false if it's obvious/redundant
 */
export function isCommentValuable(comment: string, type: string): boolean {
  const cleaned = extractCoreInsight(comment, type).toLowerCase();
  
  // Obvious patterns to remove (too generic or redundant with code)
  const obviousPatterns = [
    /^(gets?|fetches?|loads?|saves?|sends?|returns?|creates?|updates?|deletes?)/, // Obvious actions
    /^(ensures?|provides?|handles?|manages?)/, // Generic verbs
    /^(for|to|when|if|because|so that)/, // Generic connectors without substance
    /^(always|never|must|should)\s+(include|use|call|set)/, // Obvious requirements
    /^(this|it|the)\s+(function|method|code|value)/, // Vague references
    /^use\s+(composable|function|pattern|api)/, // Generic "use X" without why
  ];
  
  // Check if comment is too obvious
  if (obviousPatterns.some(pattern => pattern.test(cleaned))) {
    return false;
  }
  
  // Valuable patterns (non-obvious insights)
  const valuablePatterns = [
    /\b(converts?|transforms?|extracts?|parses?|validates?)\s+\w+\s+(to|from|into)/, // Specific transformations
    /\b(prevents?|avoids?|ensures?)\s+\w+\s+(bugs?|errors?|issues?|problems?)/, // Problem prevention
    /\b(because|since|due to|as)\s+\w+/, // Causal explanations
    /\b(pattern|approach|strategy|architecture)/, // Architectural concepts
    /\b(reactivity|dependency|tracking|state|lifecycle)/, // Technical concepts
    /\b(rfc3339|rfc|iso|utc|timezone|format)/, // Specific formats/standards
    /\b(composable|hook|middleware|transformer|validator)/, // Specific patterns
  ];
  
  // Must contain valuable pattern AND be substantial (>20 chars after cleaning)
  const hasValuablePattern = valuablePatterns.some(pattern => pattern.test(cleaned));
  const isSubstantial = cleaned.length > 20;
  
  return hasValuablePattern && isSubstantial;
}

/**
 * Determine if a regular (non-typed) comment contains valuable insights
 * Uses stricter criteria than typed comments since regular comments are less structured
 * Returns true if comment is worth keeping, false if it's obvious/redundant
 */
export function isRegularCommentValuable(comment: string): boolean {
  // Remove comment markers
  const cleaned = comment
    .replace(/^\/\*\*?|\*\/$/g, '') // Remove /** */ or /* */
    .replace(/^\s*\*\s?/gm, '') // Remove leading * from JSDoc lines
    .replace(/^\/\/\s*/gm, '') // Remove // from single-line comments
    .replace(/^<!--\s*|\s*-->$/g, '') // Remove HTML comment markers
    .trim()
    .toLowerCase();
  
  // Skip very short comments (likely just labels)
  if (cleaned.length < 15) {
    return false;
  }
  
  // Obvious patterns to remove (more aggressive for regular comments)
  const obviousPatterns = [
    /^(gets?|fetches?|loads?|saves?|sends?|returns?|creates?|updates?|deletes?|sets?|initializes?)/, // Obvious actions
    /^(this|it|the)\s+(function|method|code|value|variable|constant|object|array)/, // Vague references
    /^(calculates?|computes?|processes?|handles?|manages?|provides?|ensures?)/, // Generic verbs
    /^(for|to|when|if|because|so that|in order to)/, // Generic connectors without substance
    /^(always|never|must|should|will|can)\s+(be|have|do|use|call|set|get|return)/, // Obvious requirements
    /^(a|an|the)\s+(function|method|variable|constant|object|array|value)/, // Generic articles
    /^(here|this is|this code|this function|this method)/, // Redundant references
    /^(note|notice|remember|important|warning|todo|fixme)/i, // Meta-comments without substance
  ];
  
  // Check if comment is too obvious
  if (obviousPatterns.some(pattern => pattern.test(cleaned))) {
    return false;
  }
  
  // Valuable patterns (non-obvious insights) - stricter for regular comments
  const valuablePatterns = [
    /\b(workaround|hack|temporary|fix|issue|bug|edge\s+case|corner\s+case)/, // Problem-solving context
    /\b(performance|optimization|memory|speed|efficiency|slow|fast)/, // Performance considerations
    /\b(race\s+condition|concurrency|thread|async|promise|callback)/, // Concurrency concerns
    /\b(deprecated|legacy|old|backward\s+compatibility|migration)/, // Legacy/compatibility notes
    /\b(security|vulnerability|sanitize|escape|validate|authorize)/, // Security concerns
    /\b(limitation|constraint|restriction|cannot|unable|not\s+supported)/, // Limitations
    /\b(assumption|expects?|requires?|depends?\s+on|prerequisite)/, // Dependencies/assumptions
    /\b(why|reason|rationale|because|since|due\s+to|as\s+a\s+result)/, // Explanations
    /\b(algorithm|complexity|o\(n\)|o\(1\)|recursive|iterative)/, // Algorithm details
    /\b(format|encoding|encoding|charset|utf-8|base64|json|xml)/, // Format/encoding specifics
    /\b(timezone|utc|gmt|local\s+time|date|timestamp|epoch)/, // Time-related specifics
    /\b(api|endpoint|url|request|response|status\s+code|header)/, // API specifics
  ];
  
  // Must contain valuable pattern AND be substantial (>25 chars for regular comments)
  const hasValuablePattern = valuablePatterns.some(pattern => pattern.test(cleaned));
  const isSubstantial = cleaned.length > 25;
  
  // Also check if comment explains "why" or "what could go wrong" (valuable)
  const explainsWhy = /\b(why|because|since|due\s+to|reason|rationale)/.test(cleaned);
  const explainsRisk = /\b(risk|danger|warning|caution|important|critical|must|should)/.test(cleaned);
  
  return (hasValuablePattern && isSubstantial) || (explainsWhy && isSubstantial) || (explainsRisk && isSubstantial);
}

/**
 * Compress a cluster of comments to their most helpful, context-friendly form
 */
export function compressCommentCluster(cluster: CommentCluster): string[] {
  const compressed: string[] = [];
  const insights = new Map<string, string>();
  
  // Check if this is a regular comment cluster (no typed comments)
  const hasTypedComments = cluster.types.size > 0;
  
  if (hasTypedComments) {
    // Handle typed comments (WHY/PATTERN/LEARNING/etc.)
    // Filter to only valuable comments first
    const valuableComments = cluster.comments.filter(comment => {
      const type = detectCommentType(comment);
      return type ? isCommentValuable(comment, type) : false;
    });
    
    // If no valuable comments, return empty (cluster will be removed)
    if (valuableComments.length === 0) {
      return [];
    }
    
    // Extract insights by type from valuable comments only
    for (const comment of valuableComments) {
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
              // Convert to WHY format if it's valuable
              insights.set('WHY', insight);
            } else {
              insights.set(type, insight);
            }
          }
        }
      }
    }
    
    // Build compressed comment (max 2-3 lines)
    if (insights.size > 0) {
      compressed.push('/**');
      
      // WHY first (most important) - max 1 line
      if (insights.has('WHY')) {
        const whyText = insights.get('WHY')!;
        // Truncate if too long (max ~80 chars per line)
        const truncatedWhy = whyText.length > 75 ? whyText.substring(0, 72) + '...' : whyText;
        compressed.push(` * WHY: ${truncatedWhy}`);
      }
      
      // PATTERN second - max 1 line
      if (insights.has('PATTERN')) {
        const patternText = insights.get('PATTERN')!;
        const truncatedPattern = patternText.length > 75 ? patternText.substring(0, 72) + '...' : patternText;
        compressed.push(` * PATTERN: ${truncatedPattern}`);
      }
      
      // Only add SEE/REFERENCE if we have space (max 3 lines total)
      if (insights.size <= 2 && (insights.has('SEE') || insights.has('REFERENCE'))) {
        if (insights.has('SEE')) {
          compressed.push(` * SEE: ${insights.get('SEE')}`);
        } else if (insights.has('REFERENCE')) {
          compressed.push(` * SEE: ${insights.get('REFERENCE')}`);
        }
      }
      
      compressed.push(' */');
    }
  } else {
    // Handle regular comment cluster (no typed comments)
    // Filter to only valuable regular comments
    const valuableComments = cluster.comments.filter(comment => isRegularCommentValuable(comment));
    
    // If no valuable comments, return empty (cluster will be removed)
    if (valuableComments.length === 0) {
      return [];
    }
    
    // Extract core insights from valuable regular comments
    // Take the first valuable comment and compress it
    if (valuableComments.length > 0) {
      const firstValuable = valuableComments[0];
      let cleaned = firstValuable
        .replace(/^\/\*\*?|\*\/$/g, '')
        .replace(/^\s*\*\s?/gm, '')
        .replace(/^\/\/\s*/gm, '')
        .replace(/^<!--\s*|\s*-->$/g, '')
        .trim();
      
      // Truncate if too long (max ~75 chars)
      if (cleaned.length > 75) {
        cleaned = cleaned.substring(0, 72) + '...';
      }
      
      // Build compressed comment (single line for regular comments)
      compressed.push('/**');
      compressed.push(` * ${cleaned}`);
      compressed.push(' */');
    }
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
      // Save it if it has typed comments OR if it's a verbose regular comment cluster
      const hasTypedComments = currentCluster.types.size >= 1;
      const isVerboseRegularCluster = currentCluster.types.size === 0 && currentCluster.comments.length >= 3;
      
      if (hasTypedComments || isVerboseRegularCluster) {
        clusters.push(currentCluster);
      }
      currentCluster = null;
      emptyLineCount = 0;
    }
  }
  
  // Save final cluster if exists (typed comments or verbose regular clusters)
  if (currentCluster) {
    const hasTypedComments = currentCluster.types.size >= 1;
    const isVerboseRegularCluster = currentCluster.types.size === 0 && currentCluster.comments.length >= 3;
    
    if (hasTypedComments || isVerboseRegularCluster) {
      clusters.push(currentCluster);
    }
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
  const finalLines = [...lines];
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

