/**
 * Atomic Planning Command: /planning-check-reuse [description]
 * Check for reusable patterns before duplicating code
 * 
 * This command helps enforce Rule 23: Pattern Reuse and Generic Component Creation
 * 
 * Searches for similar patterns and suggests reusable solutions when patterns appear 2+ times
 * 
 * Moved from `.cursor/commands/utils/check-reuse.ts` as part of planning abstraction.
 */

import { readdir } from 'fs/promises';
import { join } from 'path';
import { PROJECT_ROOT, FRONTEND_ROOT } from '../../utils/utils';

interface ReuseCheckResult {
  similarPatterns: string[];
  genericComponents: string[];
  suggestions: string[];
}

/**
 * Check for reusable patterns before planning
 * 
 * @param description Description of what is being planned
 * @returns Formatted reuse check output
 */
export async function checkReuse(description: string): Promise<string> {
  const output: string[] = [];
  
  output.push(`# Pattern Reuse Check: "${description}"\n`);
  output.push('**Rule 23: Identify reusable patterns before duplicating code**\n');
  
  // Search for similar patterns
  const results = await searchForPatterns(description);
  
  output.push('## Search Results\n');
  
  if (results.similarPatterns.length > 0) {
    output.push('### Similar Patterns Found\n');
    results.similarPatterns.forEach(pattern => {
      output.push(`- ${pattern}`);
    });
    output.push('');
  } else {
    output.push('### Similar Patterns\n');
    output.push('*No similar patterns found. Consider searching codebase manually.*\n');
  }
  
  if (results.genericComponents.length > 0) {
    output.push('### Existing Generic Components\n');
    output.push('**Check these generic components before creating new ones:**\n');
    results.genericComponents.forEach(component => {
      output.push(`- ${component}`);
    });
    output.push('');
  }
  
  output.push('## Generic Component Locations\n');
  output.push('### Field Components\n');
  output.push(`- \`${FRONTEND_ROOT}/src/admin/components/generic/fields/FieldRenderer.tsx\` - Generic field renderer`);
  output.push(`- \`${FRONTEND_ROOT}/src/admin/components/generic/fields/BaseField.tsx\` - Base field wrapper`);
  output.push(`- \`${FRONTEND_ROOT}/src/admin/components/generic/fields/PrimitiveFieldFactory.tsx\` - Primitive field factory`);
  output.push(`- \`${FRONTEND_ROOT}/src/admin/components/generic/fields/SelectFieldFactory.tsx\` - Select field factory\n`);
  
  output.push('### Instance Components\n');
  output.push(`- \`${FRONTEND_ROOT}/src/admin/components/generic/instances/GenericInstance.tsx\` - Generic instance component`);
  output.push(`- \`${FRONTEND_ROOT}/src/admin/components/generic/instances/GenericCollection.tsx\` - Generic collection component\n`);
  
  output.push('### Transformers\n');
  output.push(`- \`${FRONTEND_ROOT}/src/admin/dataTransformation/bridgeToAdminTransformer.ts\` - Admin transformer pattern`);
  output.push(`- \`${FRONTEND_ROOT}/src/api/transformers/adminTransformer.ts\` - Vue admin transformer`);
  output.push(`- \`${FRONTEND_ROOT}/src/api/transformers/globalTransformer.ts\` - Global transformer pattern\n`);
  
  if (results.suggestions.length > 0) {
    output.push('## Suggestions\n');
    results.suggestions.forEach(suggestion => {
      output.push(`- ${suggestion}`);
    });
    output.push('');
  }
  
  output.push('## Pattern Reuse Checklist\n');
  output.push('- [ ] Searched codebase for similar code patterns');
  output.push('- [ ] Checked generic components directory');
  output.push('- [ ] Identified if pattern appears 2+ times (suggests creating generic solution)');
  output.push('- [ ] Determined if existing generic component can be reused');
  output.push('- [ ] If pattern found 2+ times, plan to create generic/reusable solution');
  output.push('- [ ] If creating generic component, ensure it handles all use cases');
  
  output.push('\n## When to Create Generic Components\n');
  output.push('**Create when:**');
  output.push('- ✅ Similar code appears 2+ times with same structure');
  output.push('- ✅ Pattern is clear and well-understood');
  output.push('- ✅ Multiple use cases share common logic');
  output.push('- ✅ Pattern is stable (won\'t change frequently)\n');
  
  output.push('**Don\'t create when:**');
  output.push('- ❌ Only one use case exists (premature abstraction)');
  output.push('- ❌ Pattern is unclear or still evolving');
  output.push('- ❌ Use cases are too different to generalize');
  output.push('- ❌ Abstraction would make code harder to understand');
  
  return output.join('\n');
}

async function searchForPatterns(description: string): Promise<ReuseCheckResult> {
  const result: ReuseCheckResult = {
    similarPatterns: [],
    genericComponents: [],
    suggestions: []
  };
  
  // Extract keywords from description
  const keywords = description.toLowerCase().split(/\s+/).filter(word => 
    word.length > 3 && !['the', 'and', 'for', 'with', 'from', 'that'].includes(word)
  );
  
  // Search generic components directory
  try {
    const genericDir = join(PROJECT_ROOT, FRONTEND_ROOT, 'src/admin/components/generic');
    const entries = await readdir(genericDir, { withFileTypes: true, recursive: true });
    
    for (const entry of entries) {
      if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
        const name = entry.name.replace(/\.(tsx|ts)$/, '');
        const path = entry.path || genericDir;
        const relativePath = path.replace(PROJECT_ROOT + '/', '');
        
        // Check if any keywords match component name
        const nameLower = name.toLowerCase();
        if (keywords.some(keyword => nameLower.includes(keyword) || keyword.includes(nameLower))) {
          result.genericComponents.push(`\`${relativePath}/${entry.name}\` - ${name}`);
        }
      }
    }
  } catch (_error) {
    const fullPath = join(PROJECT_ROOT, FRONTEND_ROOT, 'src/admin/components/generic');
    console.warn(
      `WARNING: Could not read generic components directory\n` +
      `Attempted: ${FRONTEND_ROOT}/src/admin/components/generic\n` +
      `Full Path: ${fullPath}\n` +
      `Suggestion: Directory might not exist yet, which is okay\n` +
      `Error: ${_error instanceof Error ? _error.message : String(_error)}\n`
    );
  }
  
  // Search transformer directory
  try {
    const transformerDirs = [
      join(PROJECT_ROOT, FRONTEND_ROOT, 'src/admin/dataTransformation'),
      join(PROJECT_ROOT, FRONTEND_ROOT, 'src/api/transformers')
    ];
    
    for (const dir of transformerDirs) {
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith('.ts')) {
            const name = entry.name.replace(/\.ts$/, '');
            const nameLower = name.toLowerCase();
            
            if (keywords.some(keyword => 
              nameLower.includes(keyword) || 
              keyword.includes('transform') || 
              keyword.includes('transformer')
            )) {
              const relativePath = dir.replace(PROJECT_ROOT + '/', '');
              result.similarPatterns.push(`\`${relativePath}/${entry.name}\` - Transformer pattern`);
            }
          }
        }
      } catch (_error) {
        const fullPath = join(PROJECT_ROOT, dir);
        console.warn(
          `WARNING: Could not read transformer directory\n` +
          `Attempted: ${dir}\n` +
          `Full Path: ${fullPath}\n` +
          `Suggestion: Directory might not exist yet, which is okay\n` +
          `Error: ${_error instanceof Error ? _error.message : String(_error)}\n`
        );
      }
    }
  } catch (_error) {
    console.warn(
      `WARNING: Error during transformer directory search\n` +
      `Error: ${_error instanceof Error ? _error.message : String(_error)}\n`
    );
  }
  
  // Generate suggestions based on keywords
  if (keywords.some(k => k.includes('field') || k.includes('input'))) {
    result.suggestions.push('Check `FieldRenderer` and `BaseField` components for field rendering patterns');
  }
  
  if (keywords.some(k => k.includes('transform') || k.includes('convert'))) {
    result.suggestions.push('Review transformer patterns: `AdminTransformer`, `GlobalTransformer`');
    result.suggestions.push('Follow pattern: `transformXToY()` method with `transformSingleEntity<GE>()` helper');
  }
  
  if (keywords.some(k => k.includes('list') || k.includes('collection') || k.includes('table'))) {
    result.suggestions.push('Check `GenericCollection` component for list/collection patterns');
  }
  
  if (keywords.some(k => k.includes('instance') || k.includes('item') || k.includes('row'))) {
    result.suggestions.push('Check `GenericInstance` component for instance/item rendering patterns');
  }
  
  if (result.similarPatterns.length >= 2) {
    result.suggestions.push('⚠️ Pattern appears multiple times - consider creating generic/reusable solution');
  }
  
  return result;
}

