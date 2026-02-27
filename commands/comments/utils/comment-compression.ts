/**
 * Comment Compression Utilities
 * 
 * Shared utilities for compressing verbose comment clusters to concise, context-friendly versions.
 * Used by phase-comment-cleanup and feature-comment-cleanup commands.
 * 
 * Safety: includes Vue SFC section detection, structural validation, and code-aware
 * line handling to prevent accidental removal of executable code.
 */

export interface CommentCluster {
  startLine: number;
  endLine: number;
  comments: string[];
  types: Set<string>;
}

/**
 * Tracks which section of a Vue SFC a given line belongs to.
 * Compression must emit correct comment syntax per section.
 */
export type VueSfcSection = 'script' | 'template' | 'style' | 'unknown';

/**
 * Determine the Vue SFC section boundaries for a .vue file.
 * Returns an array mapping each line index to its SFC section.
 */
export function detectVueSfcSections(lines: string[]): VueSfcSection[] {
  const sections: VueSfcSection[] = new Array(lines.length).fill('unknown');
  let currentSection: VueSfcSection = 'unknown';

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (/^<script[\s>]/.test(trimmed)) {
      currentSection = 'script';
    } else if (/^<template[\s>]/.test(trimmed)) {
      currentSection = 'template';
    } else if (/^<style[\s>]/.test(trimmed)) {
      currentSection = 'style';
    } else if (/^<\/script>/.test(trimmed)) {
      sections[i] = currentSection;
      currentSection = 'unknown';
      continue;
    } else if (/^<\/template>/.test(trimmed)) {
      sections[i] = currentSection;
      currentSection = 'unknown';
      continue;
    } else if (/^<\/style>/.test(trimmed)) {
      sections[i] = currentSection;
      currentSection = 'unknown';
      continue;
    }

    sections[i] = currentSection;
  }

  return sections;
}

/**
 * Strip only the trailing comment from a line that contains both code and a comment.
 * Returns null if the entire line is a pure comment (no code portion).
 */
export function stripTrailingComment(line: string): string | null {
  const trimmed = line.trim();

  if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('<!--')) {
    return null;
  }

  const stripped = line.replace(/\s*\/\/\s*(WHY|PATTERN|LEARNING|RESOURCE|COMPARISON|STRUCTURED|REFERENCE|WHAT|HOW|SEE|Session\s+\d).*$/i, '').trimEnd();

  if (stripped.trim().length === 0) {
    return null;
  }

  return stripped;
}

/**
 * Checks whether a line contains executable code (not purely a comment).
 * A line with code AND a trailing comment is considered a code line.
 */
export function lineContainsCode(line: string): boolean {
  const trimmed = line.trim();

  if (trimmed === '' || trimmed === '/**' || trimmed === '*/' || trimmed === '*/') {
    return false;
  }
  if (trimmed.startsWith('//')) return false;
  if (trimmed.startsWith('/*')) return false;
  if (trimmed.startsWith('*')) return false;
  if (trimmed.startsWith('<!--')) return false;
  if (trimmed.startsWith('-->')) return false;

  return true;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** File extensions that use JS/TS block comment syntax (bare * check applies only to these). */
const JS_COMMENT_EXTENSIONS = /\.(ts|tsx|js|jsx|vue)$/i;

/**
 * Validate structural integrity of modified file content before writing.
 * Catches orphaned comment delimiters, unbalanced blocks, Vue template issues,
 * and real corruption (non-whitespace before /**). Relaxed so valid JSDoc is not rejected.
 */
export function validateFileIntegrity(lines: string[], filePath: string): ValidationResult {
  const errors: string[] = [];
  const isVue = filePath.endsWith('.vue');
  const isJsCommentFile = JS_COMMENT_EXTENSIONS.test(filePath);

  let openMultiLine = 0;
  let inMultiLineComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!inMultiLineComment && trimmed === '*/') {
      errors.push(`Line ${i + 1}: orphaned closing comment delimiter */`);
      continue;
    }

    // Only in JS/TS: flag when there is non-whitespace before /** (e.g. "code /**"). Skip .md etc. where /** can be literal (e.g. in backticks).
    if (isJsCommentFile && !inMultiLineComment && /\S.*\/\*\*/.test(line)) {
      errors.push(`Line ${i + 1}: opening block comment appears after non-whitespace (corruption pattern)`);
    }

    // Bare * outside block: only in JS/TS/Vue; skip .md and other files where * is content (e.g. markdown lists).
    if (isJsCommentFile && !inMultiLineComment && trimmed.startsWith('*') && !trimmed.startsWith('*/') && !trimmed.startsWith('/*')) {
      errors.push(`Line ${i + 1}: bare \`*\` line outside comment block`);
    }

    if (!inMultiLineComment && (trimmed.startsWith('/*') || trimmed.startsWith('/**'))) {
      if (!trimmed.includes('*/')) {
        inMultiLineComment = true;
        openMultiLine = i + 1;
      }
    } else if (inMultiLineComment) {
      // No longer require star prefix on every line inside block; allow normal JSDoc formatting variants.
      if (trimmed.includes('*/')) {
        inMultiLineComment = false;
      }
    }
  }

  if (inMultiLineComment) {
    errors.push(`Unclosed multi-line comment starting at line ${openMultiLine}`);
  }

  if (isVue) {
    const sections = detectVueSfcSections(lines);
    for (let i = 0; i < lines.length; i++) {
      if (sections[i] === 'template') {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('/**') || (trimmed.startsWith('/*') && !trimmed.startsWith('<!--'))) {
          errors.push(`Line ${i + 1}: JSDoc/JS comment inside <template> section`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
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
 * Compress a cluster of comments to their most helpful, context-friendly form.
 * When sfcSection is 'template', emits HTML comments instead of JSDoc.
 * When sfcSection is 'style', emits CSS comments instead of JSDoc.
 */
export function compressCommentCluster(cluster: CommentCluster, sfcSection: VueSfcSection = 'script'): string[] {
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
    
    // Build compressed comment using syntax appropriate for the SFC section
    if (insights.size > 0) {
      const parts: string[] = [];
      if (insights.has('WHY')) {
        const whyText = insights.get('WHY')!;
        const truncated = whyText.length > 75 ? whyText.substring(0, 72) + '...' : whyText;
        parts.push(`WHY: ${truncated}`);
      }
      if (insights.has('PATTERN')) {
        const patternText = insights.get('PATTERN')!;
        const truncated = patternText.length > 75 ? patternText.substring(0, 72) + '...' : patternText;
        parts.push(`PATTERN: ${truncated}`);
      }
      if (insights.size <= 2 && (insights.has('SEE') || insights.has('REFERENCE'))) {
        const seeText = insights.get('SEE') || insights.get('REFERENCE')!;
        parts.push(`SEE: ${seeText}`);
      }

      compressed.push(...formatCompressedComment(parts, sfcSection));
    }
  } else {
    // Handle regular comment cluster (no typed comments)
    // Filter to only valuable regular comments
    const valuableComments = cluster.comments.filter(comment => isRegularCommentValuable(comment));
    
    // If no valuable comments, return empty (cluster will be removed)
    if (valuableComments.length === 0) {
      return [];
    }
    
    if (valuableComments.length > 0) {
      const firstValuable = valuableComments[0];
      let cleaned = firstValuable
        .replace(/^\/\*\*?|\*\/$/g, '')
        .replace(/^\s*\*\s?/gm, '')
        .replace(/^\/\/\s*/gm, '')
        .replace(/^<!--\s*|\s*-->$/g, '')
        .trim();

      if (cleaned.length > 75) {
        cleaned = cleaned.substring(0, 72) + '...';
      }

      compressed.push(...formatCompressedComment([cleaned], sfcSection));
    }
  }
  
  return compressed;
}

/**
 * Emit a compressed comment in the correct syntax for the current SFC section.
 */
function formatCompressedComment(parts: string[], section: VueSfcSection): string[] {
  if (section === 'template') {
    return parts.map(part => `<!-- ${part} -->`);
  }
  if (section === 'style') {
    return [`/* ${parts.join(' | ')} */`];
  }
  const result = ['/**'];
  for (const part of parts) {
    result.push(` * ${part}`);
  }
  result.push(' */');
  return result;
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
 * Apply compression to lines and return modified lines with compression count.
 * When sfcSections is provided (for .vue files), compression uses the correct
 * comment syntax for each section (HTML in template, CSS in style, JSDoc in script).
 */
export function applyCompression(
  lines: string[],
  sfcSections?: VueSfcSection[]
): { lines: string[]; compressionCount: number } {
  const clusters = identifyCommentClusters(lines);

  if (clusters.length === 0) {
    return { lines, compressionCount: 0 };
  }

  const clustersToCompress = clusters.reverse();
  const finalLines = [...lines];
  let compressionCount = 0;

  for (const cluster of clustersToCompress) {
    const section: VueSfcSection = sfcSections?.[cluster.startLine - 1] ?? 'script';

    // Skip compression entirely in <template> sections to avoid injecting invalid syntax
    if (section === 'template') {
      continue;
    }

    const compressed = compressCommentCluster(cluster, section);

    const originalLineSpan = cluster.endLine - cluster.startLine + 1;

    if (compressed.length > 0 && compressed.length < originalLineSpan) {
      const originalFirstLine = lines[cluster.startLine - 1];
      const indentation = originalFirstLine.match(/^\s*/)?.[0] || '';

      const indentedCompressed = compressed.map(line =>
        `${indentation}${line}`
      );

      const startIdx = cluster.startLine - 1;
      const originalSegment = finalLines.slice(startIdx, startIdx + originalLineSpan);
      finalLines.splice(startIdx, originalLineSpan, ...indentedCompressed);

      if (!spliceSanityCheck(finalLines, startIdx, indentedCompressed.length)) {
        finalLines.splice(startIdx, indentedCompressed.length, ...originalSegment);
        console.warn(`[comment-cleanup] Skipping compression at line ${cluster.startLine} — post-splice sanity check failed`);
      } else {
        compressionCount++;
      }
    }
  }

  return { lines: finalLines, compressionCount };
}

/**
 * After a splice, verify the replaced region does not introduce corruption:
 * no bare star lines outside block comments, no opening block comment after non-whitespace, no missing star prefix inside blocks.
 */
function spliceSanityCheck(lines: string[], startIdx: number, span: number): boolean {
  const slice = lines.slice(startIdx, startIdx + span);
  let inBlock = false;
  for (let i = 0; i < slice.length; i++) {
    const trimmed = slice[i].trim();
    if (/.\s*\/\*\*/.test(slice[i])) {
      return false;
    }
    if (trimmed.startsWith('/**') || (trimmed.startsWith('/*') && !trimmed.includes('*/'))) {
      inBlock = true;
    }
    if (inBlock) {
      if (!trimmed.startsWith('*') && trimmed !== '*/' && trimmed !== '' && !trimmed.startsWith('/*')) {
        return false;
      }
      if (trimmed.includes('*/')) {
        inBlock = false;
      }
    } else {
      if (trimmed.startsWith('*') && !trimmed.startsWith('*/')) {
        return false;
      }
    }
  }
  return true;
}

