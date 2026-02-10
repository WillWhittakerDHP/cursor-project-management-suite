/**
 * Atomic Planning Command: /planning-check-documentation [type]
 * Check existing documentation, patterns, and reusable components before planning
 * 
 * Types: component | transformer | pattern | migration
 * 
 * This command helps enforce Rule 22: Documentation Checks at Critical Junctures
 * 
 * Moved from `.cursor/commands/utils/check-docs.ts` as part of planning abstraction.
 * Function renamed from `checkDocs()` to `checkDocumentation()` for clarity.
 */

import { readProjectFile } from '../../utils/utils';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { MarkdownUtils } from '../../utils/markdown-utils';
import { WorkflowCommandContext } from '../../utils/command-context';

const PROJECT_ROOT = process.cwd();

type DocCheckType = 'component' | 'transformer' | 'pattern' | 'migration';

interface _DocCheckResult {
  type: DocCheckType;
  sections: string[];
}

/**
 * Check documentation before planning
 * 
 * @param type Type of documentation check to perform
 * @returns Formatted documentation check output
 */
export async function checkDocumentation(type: DocCheckType = 'migration'): Promise<string> {
  const output: string[] = [];
  
  output.push(`# Documentation Check: ${type}\n`);
  output.push('**Rule 22: Check documentation before implementing similar functionality**\n');
  
  switch (type) {
    case 'component':
      output.push(await checkComponentDocs());
      break;
    case 'transformer':
      output.push(await checkTransformerDocs());
      break;
    case 'pattern':
      output.push(await checkPatternDocs());
      break;
    case 'migration':
      output.push(await checkMigrationDocs());
      break;
  }
  
  output.push('\n---\n');
  output.push('## Documentation Check Checklist\n');
  output.push('- [ ] Checked architecture documentation for similar patterns');
  output.push('- [ ] Searched codebase for existing generic/reusable components');
  output.push('- [ ] Reviewed transformer patterns if creating data transformations');
  output.push('- [ ] Checked component documentation (README files)');
  output.push('- [ ] Reviewed migration guides if porting between frameworks');
  output.push('- [ ] Identified if existing pattern can be reused or extended');
  
  return output.join('\n');
}

/**
 * Backward compatibility: Export as checkDocs for existing code
 * @deprecated Use checkDocumentation() instead
 */
export const checkDocs = checkDocumentation;

async function checkComponentDocs(): Promise<string> {
  const sections: string[] = [];
  
  sections.push('## Generic/Reusable Components\n');
  sections.push('**Location**: `client/src/admin/components/generic/`\n');
  
  try {
    const genericDir = join(PROJECT_ROOT, 'client/src/admin/components/generic');
    const entries = await readdir(genericDir, { withFileTypes: true });
    
    const components: string[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        components.push(`- \`${entry.name}/\` - Generic ${entry.name} components`);
      } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
        const name = entry.name.replace(/\.(tsx|ts)$/, '');
        components.push(`- \`${name}\` - Reusable component`);
      }
    }
    
    if (components.length > 0) {
      sections.push(components.join('\n'));
    } else {
      sections.push('*No generic components found in expected location*');
    }
  } catch (error) {
    const fullPath = join(PROJECT_ROOT, 'client/src/admin/components/generic');
    sections.push(`**ERROR: Could not read generic components directory**\n`);
    sections.push(`**Attempted:** client/src/admin/components/generic\n`);
    sections.push(`**Full Path:** ${fullPath}\n`);
    sections.push(`**Expected:** Generic components directory\n`);
    sections.push(`**Suggestion:** Verify directory exists or create it\n`);
    sections.push(`**Error Details:** ${error instanceof Error ? error.message : String(error)}\n`);
  }
  
  sections.push('\n### Key Generic Components\n');
  sections.push('- `FieldRenderer` - Generic field rendering with type detection');
  sections.push('- `BaseField` - Base field wrapper with label, error, help');
  sections.push('- `PrimitiveFieldFactory` - Factory for primitive field types');
  sections.push('- `GenericInstance` - Generic instance component');
  sections.push('- `GenericCollection` - Generic collection component');
  
  sections.push('\n### Architecture Documentation\n');
  sections.push('- `SCHEDULER_COMPONENT_SPECS.md` - Component specifications');
  sections.push('- `client/src/scheduler/clineSchedulerWizardDirectives/README.md` - Reusable patterns');
  
  return sections.join('\n');
}

async function checkTransformerDocs(): Promise<string> {
  const sections: string[] = [];
  
  sections.push('## Transformer Patterns\n');
  sections.push('**Locations**:');
  sections.push('- `client/src/admin/dataTransformation/`');
  sections.push('- `client/src/api/transformers/`\n');
  
  sections.push('### Existing Transformer Classes\n');
  sections.push('- `AdminTransformer` - Transforms GlobalEntity → AdminEntity');
  sections.push('  - Pattern: `transformGlobalToAdmin()` method');
  sections.push('  - Pattern: `transformSingleEntity<GE>()` private method');
  sections.push('  - Pattern: Generic entity type handling\n');
  
  sections.push('- `GlobalTransformer` - Transforms raw API data → GlobalEntity');
  sections.push('  - Pattern: Two-phase transformation (stage → hydrate)');
  sections.push('  - Pattern: Primitive value conversion\n');
  
  sections.push('- `SchedulerTransformer` - Transforms GlobalEntity → SchedulerEntity');
  sections.push('  - Pattern: Similar to AdminTransformer structure\n');
  
  sections.push('### Transformer Pattern Structure\n');
  sections.push('```typescript');
  sections.push('export class MyTransformer {');
  sections.push('  transformSourceToTarget(source: SourceMap): TargetMap {');
  sections.push('    // Transform each entity type');
  sections.push('    // Use transformSingleEntity for individual entities');
  sections.push('  }');
  sections.push('  ');
  sections.push('  private transformSingleEntity<GE extends GlobalEntityKey>(');
  sections.push('    entity: SourceEntity<GE>,');
  sections.push('    entityKey: GE');
  sections.push('  ): TargetEntity<GE> {');
  sections.push('    // Individual entity transformation');
  sections.push('  }');
  sections.push('}');
  sections.push('```\n');
  
  sections.push('### Codebase References\n');
  sections.push('- `client/src/admin/dataTransformation/bridgeToAdminTransformer.ts`');
  sections.push('- `client/src/api/transformers/adminTransformer.ts`');
  sections.push('- `client/src/api/transformers/globalTransformer.ts`');
  
  return sections.join('\n');
}

async function checkPatternDocs(): Promise<string> {
  const sections: string[] = [];
  
  sections.push('## Pattern Documentation\n');
  sections.push('**Before implementing similar functionality, check:**\n');
  
  sections.push('### Architecture Patterns\n');
  sections.push('- `SCHEDULER_COMPONENT_SPECS.md` - Component patterns and APIs');
  sections.push('- `SCHEDULER_ARCHITECTURE_DECISIONS.md` - Architectural decisions');
  sections.push('- `VUE_MIGRATION_HANDOFF.md` - Migration patterns and decisions\n');
  
  sections.push('### Reusable Patterns\n');
  sections.push('- ListMaker pattern - Card-based selection UI');
  sections.push('- Context pattern - State management with providers');
  sections.push('- Transformer pattern - Data transformation classes');
  sections.push('- Generic component pattern - Configuration-driven components\n');
  
  sections.push('### Component Documentation\n');
  sections.push('Check README files in component directories for usage patterns.\n');
  
  sections.push('### Codebase Search\n');
  sections.push('Search for similar patterns before implementing:');
  sections.push('- Generic components: `client/src/admin/components/generic/`');
  sections.push('- Transformers: `client/src/admin/dataTransformation/`');
  sections.push('- Composables: `client/src/composables/`');
  
  return sections.join('\n');
}

async function checkMigrationDocs(): Promise<string> {
  const sections: string[] = [];
  
  sections.push('## Migration Documentation\n');
  sections.push('**Key documents for Vue migration:**\n');
  
  try {
    // Use WorkflowCommandContext to get paths dynamically
    const context = await WorkflowCommandContext.getCurrent();
    const handoffContent = await context.readFeatureHandoff();
    const sessionGuideContent = await context.readSessionGuide('1.1'); // Default to first session
    
    sections.push('### Handoff Document\n');
    const handoffSections = [
      'Current Status',
      'Next Action',
      'Key Files Reference',
      'Backend API',
      'Development Commands'
    ];
    
    for (const section of handoffSections) {
      const content = MarkdownUtils.extractSection(handoffContent, section);
      if (content) {
        sections.push(`#### ${section}`);
        sections.push(content.substring(0, 500) + (content.length > 500 ? '...' : ''));
        sections.push('');
      }
    }
    
    sections.push('### Session Guide\n');
    const guideSections = [
      'Session Structure',
      'Learning Checkpoints',
      'Task Template' // Updated from "Sub-Session Template"
    ];
    
    for (const section of guideSections) {
      const content = MarkdownUtils.extractSection(sessionGuideContent, section);
      if (content) {
        sections.push(`#### ${section}`);
        sections.push(content.substring(0, 500) + (content.length > 500 ? '...' : ''));
        sections.push('');
      }
    }
  } catch (error) {
    sections.push(`**ERROR: Could not read migration documents**\n`);
    sections.push(`**Suggestion:** Verify migration documents exist or create them\n`);
    sections.push(`**Error Details:** ${error instanceof Error ? error.message : String(error)}\n`);
  }
  
  sections.push('### Migration Reference Guides\n');
  sections.push('- `VUE_MIGRATION_HANDOFF.md` - Current migration status and patterns');
  const context = new WorkflowCommandContext('vue-migration');
  sections.push(`- \`${context.paths.getBasePath()}/sessions/session-[X.Y]-guide.md\` - Session structure and workflow`);
  sections.push('- `clineDirectiveMarkdowns/vue-migration-reference/VUE_QUICK_REFERENCE.md` - React → Vue patterns');
  sections.push('- `clineDirectiveMarkdowns/vue-migration-reference/VUE_MIGRATION_CHECKLIST.md` - Migration checklist');
  
  sections.push('\n### Key Migration Patterns\n');
  sections.push('- React Context → Vue Composables (Pinia stores)');
  sections.push('- React Hooks → Vue Composables');
  sections.push('- React Query → Vue Query (same API)');
  sections.push('- Ant Design → Vuetify components');
  sections.push('- TypeScript patterns remain the same');
  
  return sections.join('\n');
}

