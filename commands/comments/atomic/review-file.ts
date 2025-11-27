/**
 * Atomic Command: /comment-review [file]
 * Review file and suggest where comments needed
 * 
 * Tier: Cross-tier utility
 * Operates on: Code file review
 */

import { readFile } from 'fs/promises';
import { join } from 'path';

export interface CommentSuggestion {
  lineNumber: number;
  codeSnippet: string;
  suggestedType: 'LEARNING' | 'WHY' | 'COMPARISON' | 'PATTERN' | 'RESOURCE' | 'STRUCTURED' | 'REFERENCE';
  reason: string;
  reference?: string; // For REFERENCE type suggestions
}

/**
 * Review file and suggest where comments needed
 * 
 * @param filePath File path to review
 * @returns Formatted review output with suggestions
 */
export async function reviewFile(filePath: string): Promise<string> {
  const output: string[] = [];
  
  output.push(`# Comment Review: ${filePath}\n`);
  output.push('---\n\n');
  
  try {
    // Read file
    const fullPath = join(process.cwd(), filePath);
    const fileContent = await readFile(fullPath, 'utf-8');
    const lines = fileContent.split('\n');
    
    const suggestions: CommentSuggestion[] = [];
    
    // Analyze code for comment opportunities
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNumber = i + 1;
      
      // Skip empty lines and comments
      if (line.length === 0 || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
        continue;
      }
      
      // Check for patterns that might need comments
      
      // 1. Complex function definitions (decision points)
      if (line.includes('function') || line.includes('=>') || line.includes('async')) {
        // Check if next few lines have complex logic
        let hasComplexLogic = false;
        let logicLineCount = 0;
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          const nextLine = lines[j].trim();
          if (nextLine.includes('if') || nextLine.includes('for') || nextLine.includes('while') || nextLine.includes('switch')) {
            hasComplexLogic = true;
            logicLineCount++;
          }
          // Count non-empty, non-comment lines
          if (nextLine.length > 0 && !nextLine.startsWith('//') && !nextLine.startsWith('/*')) {
            logicLineCount++;
          }
        }
        
        if (hasComplexLogic && logicLineCount > 5 && !hasCommentNearby(lines, i)) {
          // Check if this pattern exists elsewhere (suggest REFERENCE if found)
          const patternMatch = findSimilarPattern(lines, i, filePath);
          if (patternMatch) {
            suggestions.push({
              lineNumber,
              codeSnippet: line.substring(0, 80),
              suggestedType: 'REFERENCE',
              reason: 'Similar pattern exists elsewhere - reference original explanation',
              reference: patternMatch
            });
          } else {
            suggestions.push({
              lineNumber,
              codeSnippet: line.substring(0, 80),
              suggestedType: 'STRUCTURED',
              reason: 'Complex function logic - explain WHAT/HOW/WHY this approach was chosen'
            });
          }
        }
      }
      
      // 2. React/Vue patterns (framework transitions)
      if (line.includes('useState') || line.includes('ref(') || line.includes('computed(') ||
          line.includes('watchEffect') || line.includes('watch(')) {
        if (!hasCommentNearby(lines, i)) {
          // Check if this pattern exists elsewhere
          const patternMatch = findSimilarPattern(lines, i, filePath);
          if (patternMatch) {
            suggestions.push({
              lineNumber,
              codeSnippet: line.substring(0, 80),
              suggestedType: 'REFERENCE',
              reason: 'Framework pattern used elsewhere - reference original explanation',
              reference: patternMatch
            });
          } else {
            suggestions.push({
              lineNumber,
              codeSnippet: line.substring(0, 80),
              suggestedType: 'STRUCTURED',
              reason: 'Framework transition pattern - explain WHAT/HOW/WHY this approach'
            });
          }
        }
      }
      
      // 3. Architectural patterns (decision points)
      if (line.includes('Context') || line.includes('Provider') || line.includes('composable') || 
          line.includes('use') && (line.includes('(') || line.includes('='))) {
        if (!hasCommentNearby(lines, i)) {
          // Check if this pattern exists elsewhere
          const patternMatch = findSimilarPattern(lines, i, filePath);
          if (patternMatch) {
            suggestions.push({
              lineNumber,
              codeSnippet: line.substring(0, 80),
              suggestedType: 'REFERENCE',
              reason: 'Architectural pattern used elsewhere - reference original explanation',
              reference: patternMatch
            });
          } else {
            suggestions.push({
              lineNumber,
              codeSnippet: line.substring(0, 80),
              suggestedType: 'STRUCTURED',
              reason: 'Architectural pattern - explain WHAT/HOW/WHY this pattern was chosen'
            });
          }
        }
      }
      
      // 4. Complex type definitions (decision points)
      if (line.includes('interface') || line.includes('type') || line.includes('extends')) {
        if (line.length > 100 && !hasCommentNearby(lines, i)) {
          suggestions.push({
            lineNumber,
            codeSnippet: line.substring(0, 80),
            suggestedType: 'STRUCTURED',
            reason: 'Complex type definition - explain WHAT/HOW/WHY this type structure'
          });
        }
      }
      
      // 5. API calls or external dependencies
      if (line.includes('fetch') || line.includes('axios') || line.includes('import') && line.includes('from')) {
        if (line.includes('http') || line.includes('api') && !hasCommentNearby(lines, i)) {
          suggestions.push({
            lineNumber,
            codeSnippet: line.substring(0, 80),
            suggestedType: 'RESOURCE',
            reason: 'External API or dependency - link to documentation or explain usage'
          });
        }
      }
    }
    
    if (suggestions.length === 0) {
      output.push('✅ **No comment suggestions**\n');
      output.push('\nThe file appears to have adequate comments or is simple enough to not need additional comments.\n');
    } else {
      output.push(`## Suggestions (${suggestions.length})\n\n`);
      
      for (const suggestion of suggestions) {
        output.push(`### Line ${suggestion.lineNumber}\n`);
        output.push(`**Type:** ${suggestion.suggestedType}\n`);
        output.push(`**Reason:** ${suggestion.reason}\n`);
        output.push(`**Code:** \`${suggestion.codeSnippet}...\`\n`);
        output.push(`\n**Suggested Command:**\n`);
        if (suggestion.suggestedType === 'STRUCTURED') {
          output.push(`\`/comment-add ${filePath} ${suggestion.lineNumber} STRUCTURED "[Title]" "[Body]" --what "[What]" --how "[How]" --why "[Why]"\`\n`);
        } else if (suggestion.suggestedType === 'REFERENCE') {
          const ref = suggestion.reference || 'file-path::functionName';
          output.push(`\`/comment-add ${filePath} ${suggestion.lineNumber} REFERENCE "[Pattern Name]" "[Note]" --reference "${ref}"\`\n`);
        } else {
          output.push(`\`/comment-add ${filePath} ${suggestion.lineNumber} ${suggestion.suggestedType} "[Title]" "[Body]"\`\n`);
        }
        output.push('\n');
      }
    }
    
    return output.join('\n');
  } catch (error) {
    output.push(`**ERROR: Failed to review file**\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    return output.join('\n');
  }
}

/**
 * Check if there's a comment nearby (within 3 lines before)
 */
function hasCommentNearby(lines: string[], index: number): boolean {
  for (let i = Math.max(0, index - 3); i < index; i++) {
    const line = lines[i].trim();
    if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*') || line.startsWith('/**')) {
      return true;
    }
  }
  return false;
}

/**
 * Find similar patterns in codebase (simplified pattern matching)
 * Returns reference string if pattern found, null otherwise
 * 
 * Note: This is a simplified implementation. A full implementation would
 * scan the codebase for similar function signatures or patterns.
 */
function findSimilarPattern(lines: string[], index: number, currentFilePath: string): string | null {
  // Extract function/pattern name from current line
  const currentLine = lines[index].trim();
  
  // Simple pattern: look for function names, composable names, etc.
  const functionMatch = currentLine.match(/(?:function|const|export\s+(?:function|const))\s+(\w+)/);
  const composableMatch = currentLine.match(/use\w+\(/);
  
  if (functionMatch) {
    const funcName = functionMatch[1];
    // Return a reference format (in real implementation, would search codebase)
    // For now, return null to indicate no match found (first occurrence)
    return null;
  }
  
  if (composableMatch) {
    // Extract composable name
    const composableName = currentLine.match(/use\w+/)?.[0];
    if (composableName) {
      // In a real implementation, would search for other uses of this composable
      // For now, return null (first occurrence)
      return null;
    }
  }
  
  return null;
}

