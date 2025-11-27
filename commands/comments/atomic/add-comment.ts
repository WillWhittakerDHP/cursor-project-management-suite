/**
 * Atomic Command: /comment-add [file] [line] [type] [content]
 * Add comment to file at specific line
 * 
 * Tier: Cross-tier utility
 * Operates on: Code file comments
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { formatComment, CommentType, CommentContent } from './format-comment';

export interface AddCommentParams {
  filePath: string;
  lineNumber: number;
  commentType: CommentType;
  title: string;
  body: string;
  resourceUrl?: string;
  language?: string;
  // STRUCTURED type fields
  what?: string;
  how?: string;
  why?: string;
  see?: string;
  // REFERENCE type field
  reference?: string;
}

/**
 * Add comment to file at specific line
 * 
 * @param params Add comment parameters
 * @returns Formatted output
 */
export async function addComment(params: AddCommentParams): Promise<string> {
  const output: string[] = [];
  
  output.push(`# Add Comment: ${params.commentType}\n`);
  output.push(`**File:** ${params.filePath}\n`);
  output.push(`**Line:** ${params.lineNumber}\n`);
  output.push('---\n\n');
  
  try {
    // Read file
    const fullPath = join(process.cwd(), params.filePath);
    const fileContent = await readFile(fullPath, 'utf-8');
    const lines = fileContent.split('\n');
    
    // Validate line number
    if (params.lineNumber < 1 || params.lineNumber > lines.length) {
      return `Error: Line number ${params.lineNumber} is out of range (file has ${lines.length} lines)`;
    }
    
    // Detect language from file extension
    const language = params.language || detectLanguage(params.filePath);
    
    // Validate required fields based on comment type
    if (params.commentType === 'STRUCTURED') {
      if (!params.what || !params.how || !params.why) {
        return `Error: STRUCTURED comment type requires what, how, and why fields`;
      }
    }
    
    if (params.commentType === 'REFERENCE') {
      if (!params.reference) {
        return `Error: REFERENCE comment type requires reference field`;
      }
    }
    
    // Format comment
    const commentContent: CommentContent = {
      type: params.commentType,
      title: params.title,
      body: params.body,
      resourceUrl: params.resourceUrl,
      what: params.what,
      how: params.how,
      why: params.why,
      see: params.see,
      reference: params.reference
    };
    
    const formattedComment = formatComment(commentContent, language);
    const commentLines = formattedComment.split('\n');
    
    // Insert comment before the specified line (0-indexed)
    const insertIndex = params.lineNumber - 1;
    const newLines = [
      ...lines.slice(0, insertIndex),
      ...commentLines,
      '', // Empty line after comment
      ...lines.slice(insertIndex)
    ];
    
    // Write file
    await writeFile(fullPath, newLines.join('\n'), 'utf-8');
    
    output.push('✅ **Comment added successfully**\n');
    output.push(`\n**Comment Preview:**\n`);
    output.push('```\n');
    output.push(formattedComment);
    output.push('\n```\n');
    
    return output.join('\n');
  } catch (error) {
    output.push(`**ERROR: Failed to add comment**\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    return output.join('\n');
  }
}

/**
 * Detect programming language from file path
 */
function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'py':
      return 'python';
    case 'java':
      return 'java';
    case 'c':
      return 'c';
    case 'cpp':
    case 'cc':
    case 'cxx':
      return 'cpp';
    case 'cs':
      return 'csharp';
    default:
      return 'typescript'; // Default to TypeScript
  }
}

