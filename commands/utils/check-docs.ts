/**
 * Atomic Command: /check-docs [type]
 * Check existing documentation, patterns, and reusable components before implementing
 * 
 * Types: component | transformer | pattern | migration
 * 
 * This command helps enforce Rule 22: Documentation Checks at Critical Junctures
 * 
 * @deprecated - Migrated to planning abstraction. See `.cursor/commands/planning/atomic/check-documentation.ts`
 * This file is kept for backward compatibility only. New code should use:
 * - `checkDocumentation()` from `.cursor/commands/planning/atomic/check-documentation.ts`
 * - `planWithChecks()` from `.cursor/commands/planning/composite/plan-with-checks.ts` for comprehensive planning
 */

import { PROJECT_ROOT, FRONTEND_ROOT } from './utils';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { MarkdownUtils } from './markdown-utils';
import { WorkflowCommandContext } from './command-context';

type DocCheckType = 'component' | 'transformer' | 'pattern' | 'migration';

export async function checkDocs(type: DocCheckType = 'migration'): Promise<string> {
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

async function checkComponentDocs(): Promise<string> {
  const sections: string[] = [];
  
  sections.push('## Generic/Reusable Components\n');
  sections.push(`**Location**: \`${FRONTEND_ROOT}/src/admin/components/generic/\`\n`);
  
  try {
    const genericDir = join(PROJECT_ROOT, FRONTEND_ROOT, 'src/admin/components/generic');
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
  } catch (_error) {
    const fullPath = join(PROJECT_ROOT, FRONTEND_ROOT, 'src/admin/components/generic');
    sections.push(`**ERROR: Could not read generic components directory**\n`);
    sections.push(`**Attempted:** ${FRONTEND_ROOT}/src/admin/components/generic\n`);
    sections.push(`**Full Path:** ${fullPath}\n`);
    sections.push(`**Expected:** Generic components directory\n`);
    sections.push(`**Suggestion:** Verify directory exists or create it\n`);
    sections.push(`**Error Details:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
  }
  
  sections.push('\n### Key Generic Components\n');
  sections.push('- `FieldRenderer` - Generic field rendering with type detection');
  sections.push('- `BaseField` - Base field wrapper with label, error, help');
  sections.push('- `PrimitiveFieldFactory` - Factory for primitive field types');
  sections.push('- `GenericInstance` - Generic instance component');
  sections.push('- `GenericCollection` - Generic collection component');
  
  sections.push('\n### Architecture Documentation\n');
  sections.push('- `SCHEDULER_COMPONENT_SPECS.md` - Component specifications');
  sections.push(`- \`${FRONTEND_ROOT}/src/scheduler/clineSchedulerWizardDirectives/README.md\` - Reusable patterns`);
  
  return sections.join('\n');
}

async function checkTransformerDocs(): Promise<string> {
  const sections: string[] = [];
  
  sections.push('## Transformer Patterns\n');
  sections.push('**Locations**:');
  sections.push(`- \`${FRONTEND_ROOT}/src/admin/dataTransformation/\``);
  sections.push(`- \`${FRONTEND_ROOT}/src/api/transformers/\`\n`);
  
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
  sections.push(`- \`${FRONTEND_ROOT}/src/admin/dataTransformation/bridgeToAdminTransformer.ts\``);
  sections.push(`- \`${FRONTEND_ROOT}/src/api/transformers/adminTransformer.ts\``);
  sections.push(`- \`${FRONTEND_ROOT}/src/api/transformers/globalTransformer.ts\``);
  
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
  sections.push(`- Generic components: \`${FRONTEND_ROOT}/src/admin/components/generic/\``);
  sections.push(`- Transformers: \`${FRONTEND_ROOT}/src/admin/dataTransformation/\``);
  sections.push(`- Composables: \`${FRONTEND_ROOT}/src/composables/\``);
  
  return sections.join('\n');
}

async function checkMigrationDocs(): Promise<string> {
  const sections: string[] = [];
  const context = await WorkflowCommandContext.getCurrent();

  sections.push('## Migration Documentation\n');
  sections.push('**Key documents for Vue migration:**\n');

  try {
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
  } catch (_error) {
    sections.push(`**ERROR: Could not read migration documents**\n`);
    sections.push(`**Suggestion:** Verify migration documents exist or create them\n`);
    sections.push(`**Error Details:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
  }
  
  sections.push('### Migration Reference Guides\n');
  sections.push('- `VUE_MIGRATION_HANDOFF.md` - Current migration status and patterns');
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


