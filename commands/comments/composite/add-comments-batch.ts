/**
 * Composite Command: /comment-batch [files] [type]
 * Add comments to multiple files
 * 
 * Tier: Cross-tier utility
 * Operates on: Batch comment operations
 */

import { addComment, AddCommentParams } from '../atomic/add-comment';

export interface BatchCommentParams {
  files: Array<{
    filePath: string;
    lineNumber: number;
    title: string;
    body: string;
    resourceUrl?: string;
    // STRUCTURED type fields
    what?: string;
    how?: string;
    why?: string;
    see?: string;
    // REFERENCE type field
    reference?: string;
  }>;
  commentType: 'LEARNING' | 'WHY' | 'COMPARISON' | 'PATTERN' | 'RESOURCE' | 'STRUCTURED' | 'REFERENCE';
  language?: string;
}

/**
 * Add comments to multiple files
 * 
 * @param params Batch comment parameters
 * @returns Formatted batch output
 */
export async function addCommentsBatch(params: BatchCommentParams): Promise<string> {
  const output: string[] = [];
  
  output.push(`# Batch Add Comments: ${params.commentType}\n`);
  output.push(`**Files:** ${params.files.length}\n`);
  output.push('---\n\n');
  
  const results: Array<{ filePath: string; success: boolean; error?: string }> = [];
  
  for (const file of params.files) {
    const addParams: AddCommentParams = {
      filePath: file.filePath,
      lineNumber: file.lineNumber,
      commentType: params.commentType,
      title: file.title,
      body: file.body,
      resourceUrl: file.resourceUrl,
      language: params.language,
      what: file.what,
      how: file.how,
      why: file.why,
      see: file.see,
      reference: file.reference
    };
    
    try {
      await addComment(addParams);
      results.push({ filePath: file.filePath, success: true });
    } catch (error) {
      results.push({
        filePath: file.filePath,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  // Summary
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  output.push('## Results\n\n');
  output.push(`**Successful:** ${successful}\n`);
  output.push(`**Failed:** ${failed}\n`);
  output.push('\n---\n\n');
  
  if (successful > 0) {
    output.push('### Successful\n\n');
    for (const result of results.filter(r => r.success)) {
      output.push(`- ✅ ${result.filePath}\n`);
    }
    output.push('\n');
  }
  
  if (failed > 0) {
    output.push('### Failed\n\n');
    for (const result of results.filter(r => !r.success)) {
      output.push(`- ❌ ${result.filePath}: ${result.error}\n`);
    }
  }
  
  return output.join('\n');
}

