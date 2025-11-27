/**
 * Atomic Command: Format comment based on type
 * 
 * Tier: Cross-tier utility
 * Operates on: Code comment formatting
 */

export type CommentType = 'LEARNING' | 'WHY' | 'COMPARISON' | 'PATTERN' | 'RESOURCE' | 'STRUCTURED' | 'REFERENCE';

export interface CommentContent {
  type: CommentType;
  title: string;
  body: string;
  resourceUrl?: string; // For RESOURCE type
  what?: string;      // For STRUCTURED type
  how?: string;       // For STRUCTURED type
  why?: string;       // For STRUCTURED type
  see?: string;       // For STRUCTURED type (optional reference)
  reference?: string; // For REFERENCE type (required)
}

/**
 * Format comment based on type
 * 
 * @param content Comment content
 * @param language Programming language (for syntax)
 * @returns Formatted comment string
 */
export function formatComment(content: CommentContent, language: string = 'typescript'): string {
  const commentStart = getCommentStart(language);
  const commentLine = getCommentLine(language);
  
  const lines: string[] = [];
  
  // Handle STRUCTURED type
  if (content.type === 'STRUCTURED') {
    lines.push(`${commentStart} * STRUCTURED: ${content.title}`);
    lines.push(`${commentLine}`);
    
    if (content.what) {
      lines.push(`${commentLine} WHAT: ${content.what}`);
      lines.push(`${commentLine}`);
    }
    
    if (content.how) {
      lines.push(`${commentLine} HOW: ${content.how}`);
      lines.push(`${commentLine}`);
    }
    
    if (content.why) {
      lines.push(`${commentLine} WHY: ${content.why}`);
      if (content.see) {
        lines.push(`${commentLine}`);
      }
    }
    
    if (content.see) {
      lines.push(`${commentLine} SEE: ${content.see}`);
    }
    
    // Comment footer
    lines.push(`${commentStart}`);
    return lines.join('\n');
  }
  
  // Handle REFERENCE type
  if (content.type === 'REFERENCE') {
    lines.push(`${commentStart} * REFERENCE: ${content.title}`);
    
    if (content.reference) {
      lines.push(`${commentLine} See: ${content.reference}`);
    }
    
    if (content.body) {
      lines.push(`${commentLine}`);
      const bodyLines = content.body.split('\n');
      for (const line of bodyLines) {
        if (line.trim().length === 0) {
          lines.push(`${commentLine}`);
        } else {
          lines.push(`${commentLine} ${line}`);
        }
      }
    }
    
    // Comment footer
    lines.push(`${commentStart}`);
    return lines.join('\n');
  }
  
  // Handle other comment types (LEARNING, WHY, COMPARISON, PATTERN, RESOURCE)
  // Comment header
  lines.push(`${commentStart} * ${content.type}: ${content.title}`);
  
  // Empty line
  lines.push(`${commentLine}`);
  
  // Body lines
  const bodyLines = content.body.split('\n');
  for (const line of bodyLines) {
    if (line.trim().length === 0) {
      lines.push(`${commentLine}`);
    } else {
      lines.push(`${commentLine} ${line}`);
    }
  }
  
  // Resource URL (for RESOURCE type)
  if (content.type === 'RESOURCE' && content.resourceUrl) {
    lines.push(`${commentLine}`);
    lines.push(`${commentLine} ${content.resourceUrl}`);
  }
  
  // Comment footer
  lines.push(`${commentStart}`);
  
  return lines.join('\n');
}

/**
 * Get comment start syntax for language
 */
function getCommentStart(language: string): string {
  switch (language.toLowerCase()) {
    case 'typescript':
    case 'javascript':
    case 'ts':
    case 'js':
      return '/**';
    case 'python':
    case 'py':
      return '"""';
    case 'java':
    case 'c':
    case 'cpp':
    case 'csharp':
    case 'cs':
      return '/**';
    default:
      return '/**';
  }
}

/**
 * Get comment line syntax for language
 */
function getCommentLine(language: string): string {
  switch (language.toLowerCase()) {
    case 'typescript':
    case 'javascript':
    case 'ts':
    case 'js':
    case 'java':
    case 'c':
    case 'cpp':
    case 'csharp':
    case 'cs':
      return ' *';
    case 'python':
    case 'py':
      return '';
    default:
      return ' *';
  }
}

