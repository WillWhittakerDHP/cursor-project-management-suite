/**
 * Composite Command: /check-before-implement [type] [description]
 * Consolidated documentation and pattern reuse check
 * 
 * Combines /check-docs and /check-reuse into single command
 * Use before implementing similar functionality
 */

import { checkDocumentation } from '../planning/atomic/check-documentation';
import { checkReuse } from '../planning/atomic/check-reuse';

type DocCheckType = 'component' | 'transformer' | 'pattern' | 'migration';

export async function checkBeforeImplement(
  type: DocCheckType = 'migration',
  description?: string
): Promise<string> {
  const output: string[] = [];
  
  output.push(`# Pre-Implementation Check\n`);
  
  if (description) {
    output.push(`**Implementing:** ${description}\n`);
  }
  
  output.push('---\n');
  
  // Always check docs
  output.push('## Documentation Check\n');
  output.push('**Rule 22: Check documentation before implementing similar functionality**\n');
  output.push(await checkDocumentation(type));
  output.push('\n---\n');
  
  // If description provided, also check for reuse
  if (description) {
    output.push('## Pattern Reuse Check\n');
    output.push('**Rule 23: Identify reusable patterns before duplicating code**\n');
    output.push(await checkReuse(description));
    output.push('\n---\n');
  }
  
  // Unified checklist
  output.push('## Pre-Implementation Checklist\n');
  output.push('- [ ] Checked architecture documentation for similar patterns');
  output.push('- [ ] Searched codebase for existing generic/reusable components');
  output.push('- [ ] Reviewed transformer patterns if creating data transformations');
  output.push('- [ ] Checked component documentation (README files)');
  if (description) {
    output.push('- [ ] Searched for similar code patterns (2+ occurrences suggest generic solution)');
    output.push('- [ ] Identified if existing pattern can be reused or extended');
  }
  output.push('- [ ] Determined if generic solution needed (pattern appears 2+ times)');
  
  return output.join('\n');
}

