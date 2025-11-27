/**
 * Natural Language Parser - Shared Utilities
 * 
 * Shared parsing utilities used by both planning and todo parsers.
 * Extracted to eliminate duplication and ensure consistent parsing behavior.
 * 
 * These utilities handle common patterns:
 * - Tokenization
 * - Priority extraction
 * - Tag extraction
 * - Dependency extraction
 * - Explicit field extraction
 */

// ===================================================================
// TOKENIZATION
// ===================================================================

/**
 * Tokenize input text into array of tokens
 * 
 * Converts text to lowercase and splits by whitespace, filtering empty tokens.
 * This ensures consistent tokenization across both planning and todo parsers.
 * 
 * @param text Input text to tokenize
 * @returns Array of lowercase tokens
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(token => token.length > 0);
}

// ===================================================================
// PRIORITY EXTRACTION
// ===================================================================

/**
 * Extract priority from tokens
 * 
 * Looks for priority keywords in the tokenized text and returns
 * the matching priority level. Merges patterns from both planning
 * and todo parsers for comprehensive detection.
 * 
 * @param tokens Tokenized text
 * @returns Priority level or undefined if not found
 */
export function extractPriority(tokens: string[]): 'low' | 'medium' | 'high' | 'critical' | undefined {
  const text = tokens.join(' ');
  
  // Critical priority keywords
  if (/\b(critical|urgent|asap|immediate)\b/.test(text)) {
    return 'critical';
  }
  
  // High priority keywords
  if (/\b(high|important|priority)\b/.test(text)) {
    return 'high';
  }
  
  // Low priority keywords
  if (/\b(low|minor|nice to have)\b/.test(text)) {
    return 'low';
  }
  
  // Medium priority keywords
  if (/\b(medium|moderate|normal)\b/.test(text)) {
    return 'medium';
  }
  
  return undefined;
}

// ===================================================================
// TAG EXTRACTION
// ===================================================================

/**
 * Extract tags from tokens
 * 
 * Supports multiple tag formats:
 * - Hashtags: #tag
 * - Explicit tags: tags: tag1, tag2 or categories: tag1, tag2
 * 
 * Merges patterns from both planning and todo parsers.
 * 
 * @param tokens Tokenized text
 * @returns Array of extracted tags
 */
export function extractTags(tokens: string[]): string[] {
  const tags: string[] = [];
  const text = tokens.join(' ');
  
  // Extract hashtags (#tag)
  const hashtagPattern = /#(\w+)/g;
  const hashtagMatches = text.matchAll(hashtagPattern);
  for (const match of hashtagMatches) {
    if (match[1]) {
      tags.push(match[1].trim());
    }
  }
  
  // Extract explicit tags (tags: ... or categories: ...)
  const explicitTagPatterns = [
    /(?:tags?|categories?):\s*([^\n]+)/gi,
  ];
  
  for (const pattern of explicitTagPatterns) {
    const match = text.match(pattern);
    if (match) {
      // Split comma-separated tags
      const tagList = match[1]?.split(',').map(t => t.trim()).filter(t => t.length > 0) || [];
      tags.push(...tagList);
    }
  }
  
  // Remove duplicates
  return [...new Set(tags)];
}

// ===================================================================
// DEPENDENCY EXTRACTION
// ===================================================================

/**
 * Extract dependencies from tokens
 * 
 * Looks for dependency markers in the text:
 * - depends on, requires, needs, relies on
 * - after, following, once
 * 
 * Uses comprehensive patterns from planning parser.
 * 
 * @param tokens Tokenized text
 * @returns Array of extracted dependencies
 */
export function extractDependencies(tokens: string[]): string[] {
  const dependencies: string[] = [];
  const text = tokens.join(' ');
  
  // Look for dependency markers
  const dependencyPatterns = [
    /(?:depends?\s+on|requires?|needs?|relies?\s+on)[:\s]+(.+?)(?:\.|$)/gi,
    /(?:after|following|once)[:\s]+(.+?)(?:\.|$)/gi,
  ];
  
  for (const pattern of dependencyPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        const dep = match[1].trim();
        // Handle comma-separated dependencies
        if (dep.includes(',')) {
          dependencies.push(...dep.split(',').map(d => d.trim()).filter(d => d.length > 0));
        } else {
          dependencies.push(dep);
        }
      }
    }
  }
  
  // Remove duplicates
  return [...new Set(dependencies)];
}

// ===================================================================
// EXPLICIT FIELD EXTRACTION
// ===================================================================

/**
 * Check if text contains explicit field marker
 * 
 * Looks for patterns like "field:" or "field ="
 * 
 * @param tokens Tokenized text
 * @param field Field name to check for
 * @returns True if explicit field marker found
 */
export function hasExplicitField(tokens: string[], field: string): boolean {
  const text = tokens.join(' ').toLowerCase();
  return text.includes(`${field}:`) || text.includes(`${field} =`);
}

/**
 * Extract explicit field value
 * 
 * Extracts value from patterns like "field: value" or "field = value"
 * 
 * @param tokens Tokenized text
 * @param field Field name to extract
 * @returns Extracted field value or empty string
 */
export function extractExplicitField(tokens: string[], field: string): string {
  const text = tokens.join(' ');
  const regex = new RegExp(`${field}[:=]\\s*([^\\n]+)`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

