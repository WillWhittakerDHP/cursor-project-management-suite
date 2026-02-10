/**
 * Composite Command: /comment-review-and-add [file]
 * Review file and add comments based on suggestions
 * 
 * Tier: Cross-tier utility
 * Operates on: Review and add comments workflow
 */

import { reviewFile } from '../atomic/review-file';

export interface ReviewAndAddParams {
  filePath: string;
  autoAdd?: boolean; // If true, automatically add comments for suggestions
}

/**
 * Review file and optionally add comments
 * 
 * @param params Review and add parameters
 * @returns Formatted review and add output
 */
export async function reviewAndAdd(params: ReviewAndAddParams): Promise<string> {
  const output: string[] = [];
  
  output.push(`# Review and Add Comments: ${params.filePath}\n`);
  output.push('---\n\n');
  
  // Step 1: Review file
  output.push('## Step 1: Review File\n\n');
  const reviewOutput = await reviewFile(params.filePath);
  output.push(reviewOutput);
  output.push('\n---\n\n');
  
  // Step 2: Add comments if auto-add is enabled
  if (params.autoAdd) {
    output.push('## Step 2: Add Comments\n\n');
    output.push('⚠️ **Auto-add is not yet implemented**\n');
    output.push('Please review suggestions above and add comments manually using `/comment-add`\n');
    output.push('\n');
  } else {
    output.push('## Next Steps\n\n');
    output.push('Review the suggestions above and add comments using:\n');
    output.push('`/comment-add [file] [line] [type] "[title]" "[body]"`\n');
    output.push('\n');
  }
  
  return output.join('\n');
}

