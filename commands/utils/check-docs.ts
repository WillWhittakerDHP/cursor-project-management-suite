/**
 * Atomic Command: /check-docs [type]
 * Check existing documentation, patterns, and reusable components before implementing
 * 
 * Types: component | transformer | pattern | feature | migration (migration = alias of feature)
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
import { resolveActiveFeatureDirectory } from './workflow-scope';

type DocCheckType = 'component' | 'transformer' | 'pattern' | 'feature' | 'migration';

/** @see CheckDocumentationOptions in planning/atomic/check-documentation.ts */
export interface CheckDocsOptions {
  featureDirectory?: string;
}

export async function checkDocs(
  type: DocCheckType = 'feature',
  options?: CheckDocsOptions
): Promise<string> {
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
    case 'feature':
    case 'migration':
      output.push(await checkActiveFeatureWorkflowDocs(options));
      break;
  }
  
  output.push('\n---\n');
  output.push('## Documentation Check Checklist\n');
  output.push('- [ ] Checked architecture documentation for similar patterns');
  output.push('- [ ] Searched codebase for existing generic/reusable components');
  output.push('- [ ] Reviewed transformer patterns if creating data transformations');
  output.push('- [ ] Checked component documentation (README files)');
  output.push('- [ ] Reviewed active feature guide/handoff (`.project-manager/features/<feature>/`)');
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
  sections.push('- `.project-manager/ARCHITECTURE.md` - Domain map, data flow, type boundaries');
  sections.push('- Active feature guide under `.project-manager/features/<feature>/` (Feature 6 = `appointment-workflow`)\n');
  
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

async function checkActiveFeatureWorkflowDocs(options?: CheckDocsOptions): Promise<string> {
  const sections: string[] = [];
  const explicit = options?.featureDirectory?.trim();
  const featureDir = explicit ?? (await resolveActiveFeatureDirectory());
  const context = new WorkflowCommandContext(featureDir);

  sections.push('## Active feature workflow (tier docs)\n');
  const scopeNote = explicit
    ? `Excerpts use **\`${featureDir}\`** (explicit), not necessarily \`.project-manager/.tier-scope\`.`
    : 'Handoff below is from **your active feature** (`.project-manager/.tier-scope`).';
  sections.push(
    `**Canonical product context:** Feature 6 — \`.project-manager/features/appointment-workflow/\` (example). ${scopeNote}\n`
  );

  try {
    const handoffContent = await context.readFeatureHandoff();
    const featureGuideContent = await context.readFeatureGuide();

    sections.push('### Feature handoff (excerpt)\n');
    const handoffSections = [
      'Current Status',
      'Next Action',
      'Key Files Reference',
      'Backend API',
      'Development Commands',
    ];

    for (const section of handoffSections) {
      const content = MarkdownUtils.extractSection(handoffContent, section);
      if (content) {
        sections.push(`#### ${section}`);
        sections.push(content.substring(0, 500) + (content.length > 500 ? '...' : ''));
        sections.push('');
      }
    }

    sections.push('### Feature guide (excerpt)\n');
    const guideSections = ['Feature Overview', 'Architecture', 'Implementation Plan'];

    for (const section of guideSections) {
      const content = MarkdownUtils.extractSection(featureGuideContent, section);
      if (content) {
        sections.push(`#### ${section}`);
        sections.push(content.substring(0, 500) + (content.length > 500 ? '...' : ''));
        sections.push('');
      }
    }
  } catch (_error) {
    sections.push(`**ERROR: Could not read feature handoff or feature guide**\n`);
    sections.push(
      `**Suggestion:** Run a tier-start that writes \`.project-manager/.tier-scope\`, or open the feature handoff/guide under \`${featureDir}\`\n`
    );
    sections.push(`**Error Details:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
  }

  sections.push('### Reference documents\n');
  sections.push('- `.project-manager/ARCHITECTURE.md` — domains, data flow, type boundaries');
  sections.push(`- \`${context.paths.getBasePath()}/feature-*-guide.md\` — feature-level plan`);
  sections.push(`- \`${context.paths.getBasePath()}/sessions/session-[X.Y]-guide.md\` — session workflow`);
  sections.push(
    '- **Historical (React → Vue):** `VUE_MIGRATION_HANDOFF.md`, `clineDirectiveMarkdowns/vue-migration-reference/` — use only when digging into legacy notes'
  );

  sections.push('\n### Vue app patterns (current stack)\n');
  sections.push('- Composition API + composables under `client/src/composables/`');
  sections.push('- Pinia for shared client state where appropriate');
  sections.push('- Vuetify for UI primitives');
  sections.push('- Shared contracts in `shared/` per ARCHITECTURE.md');

  return sections.join('\n');
}


