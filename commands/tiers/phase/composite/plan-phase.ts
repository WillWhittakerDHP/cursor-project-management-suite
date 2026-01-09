/**
 * Composite Command: /plan-phase [phase] [description]
 * Phase-level planning with documentation checks
 * 
 * Tier: Phase (Tier 1 - High-Level)
 * Operates on: Phase-level planning (creates phase guide with session breakdown)
 * 
 * Mode: Ask Mode (planning/documenting)
 * 
 * IMPORTANT: This command must be used in Ask Mode. It plans phases and creates documentation
 * but does NOT implement changes. Implementation requires switching to Agent Mode after explicit
 * approval from the user.
 * 
 * Use before large-scale, phase-level planning (not at session start)
 * Includes documentation and pattern reuse checks
 * 
 * Note: Phase planning typically happens with original feature plan.
 * This command is for reviewing/refreshing phase plans.
 * 
 * See Rule 23 in `.cursor/rules/USER_CODING_RULES.md` for Ask Mode vs Agent Mode guidelines.
 * 
 * INTERPRETATION GUIDE: This command should use the plain language uploader design
 * Use `createFromPlainLanguage()` from `.cursor/commands/todo/composite/create-from-plain-language` as the guide
 * for interpreting user input. The plain language uploader provides criteria and patterns
 * for parsing natural language descriptions into structured planning information.
 * 
 * TODO INTEGRATION: After creating the phase guide, this command should create phase todos
 * using the todo management system. Use todo commands from `.cursor/commands/todo/`
 * for integration patterns.
 */

import { checkDocumentation } from '../../../planning/atomic/check-documentation';
import { checkReuse } from '../../../planning/atomic/check-reuse';
import { planWithChecks } from '../../../planning/composite/plan-with-checks';
import { createFromPlainLanguageProgrammatic } from '../../../todo/composite/create-from-plain-language';
import { findTodoById } from '../../../utils/todo-io';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { MarkdownUtils } from '../../../utils/markdown-utils';

export async function planPhase(
  phase: string,
  description?: string,
  featureName: string = 'vue-migration'
): Promise<string> {
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];
  
  // Mode warning (soft check - doesn't stop execution)
  output.push('⚠️ **MODE REMINDER:** This command should be used in **Ask Mode** for planning.');
  output.push('If you\'re in Agent Mode, switch to Ask Mode for planning, then switch back to Agent Mode after approval.\n');
  output.push('---\n');
  
  output.push(`# Phase Planning: ${phase}\n`);
  
  if (description) {
    output.push(`**Description:** ${description}\n`);
  }
  
  output.push('---\n');
  
  // Use planning abstraction for comprehensive checks
  if (description) {
    output.push('## Planning with Checks\n');
    output.push('**Using planning abstraction for documentation and pattern reuse checks:**\n');
    const phaseNum = parseInt(phase);
    const planningOutput = await planWithChecks(
      description,
      'phase',
      featureName,
      phaseNum,
      undefined,
      undefined,
      'migration'
    );
    output.push(planningOutput);
    output.push('\n---\n');
  } else {
    // Fallback to individual checks if no description
    output.push('## Documentation Check\n');
    output.push('**Before phase-level planning, check documentation and patterns:**\n');
    output.push(await checkDocumentation('migration'));
    output.push('\n---\n');
  }
  
  // Try to load phase guide with explicit error handling
  const phaseGuidePath = context.paths.getPhaseGuidePath(phase);
  try {
    const phaseGuideContent = await context.readPhaseGuide(phase);
    const phaseSection = MarkdownUtils.extractSection(phaseGuideContent, `Phase ${phase}`);
    
    if (phaseSection) {
      output.push('## Phase Guide\n');
      output.push(phaseSection);
      output.push('\n---\n');
    } else {
      output.push('## Phase Guide\n');
      output.push(`**WARNING: Section 'Phase ${phase}' not found in phase guide**\n`);
      output.push(`**File:** ${phaseGuidePath}\n`);
      output.push(`**Suggestion:** Add 'Phase ${phase}' section to phase guide or verify section name\n`);
      output.push('\n---\n');
    }
  } catch (error) {
    output.push('## Phase Guide\n');
    output.push(`**ERROR: Phase guide not found**\n`);
    output.push(`**Attempted:** ${phaseGuidePath}\n`);
    output.push(`**Expected:** Phase guide file for phase ${phase}\n`);
    output.push(`**Suggestion:** Create the file at ${phaseGuidePath}\n`);
    output.push(`**Template:** Use \`.cursor/commands/tiers/phase/templates/phase-guide.md\` as a starting point\n`);
    output.push(`**Tier:** Phase (Tier 1 - High-Level)\n`);
    output.push(`**Error Details:** ${error instanceof Error ? error.message : String(error)}\n`);
    output.push('\n---\n');
  }
  
  // Create phase todo after guide is reviewed (BLOCKING)
  output.push('## Creating Phase Todo\n');
  const feature = context.feature.name;
  const phaseNum = parseInt(phase);
  
  // Get feature todo to set as parent
  const featureTodo = await findTodoById(feature, `feature-${feature}`);
  const parentId = featureTodo ? featureTodo.id : undefined;
  
  const phaseDescription = description || `Phase ${phase} planning`;
  const todoResult = await createFromPlainLanguageProgrammatic(
    feature,
    `Phase ${phase}: ${phaseDescription}`,
    { currentPhase: phaseNum }
  );
  
  // BLOCKING: Fail if todo creation fails
  if (!todoResult.success || !todoResult.todo) {
    const errorMessages: string[] = [];
    errorMessages.push(`❌ **ERROR: Phase todo creation failed (BLOCKING)**\n`);
    if (todoResult.errors && todoResult.errors.length > 0) {
      errorMessages.push(`**Errors:**\n`);
      for (const error of todoResult.errors) {
        errorMessages.push(`- ${error.type}${error.field ? ` (${error.field})` : ''}: ${error.message}\n`);
      }
    }
    if (todoResult.suggestions && todoResult.suggestions.length > 0) {
      errorMessages.push(`**Suggestions:**\n`);
      for (const suggestion of todoResult.suggestions) {
        errorMessages.push(`- ${suggestion}\n`);
      }
    }
    errorMessages.push(`\n**Phase planning cannot continue without a todo. Please fix the errors above and retry.**\n`);
    throw new Error(errorMessages.join(''));
  }
  
  const createdTodo = todoResult.todo;
  output.push(`✅ **Phase todo created:** ${createdTodo.id}\n`);
  output.push(`**Title:** ${createdTodo.title}\n`);
  output.push(`**Status:** ${createdTodo.status}\n`);
  if (createdTodo.parentId) {
    output.push(`**Parent:** ${createdTodo.parentId}\n`);
  }
  
  // Verify todo exists after creation
  output.push('\n**Verifying todo exists...**\n');
  const verifiedTodo = await findTodoById(feature, createdTodo.id);
  if (!verifiedTodo) {
    throw new Error(`❌ **ERROR: Todo verification failed**\nTodo ${createdTodo.id} was created but cannot be found. This indicates a critical issue with the todo system.\n`);
  }
  output.push(`✅ **Todo verified:** ${verifiedTodo.id}\n`);
  output.push('\n---\n');
  
  // Test strategy section
  output.push('## Test Strategy\n');
  output.push('**Document test requirements for this phase:**\n');
  output.push('- [ ] Test strategy defined\n');
  output.push('- [ ] Test requirements documented in phase guide\n');
  output.push('- [ ] Test todos created (if tests required)\n');
  output.push('- [ ] Test justification documented (if tests deferred)\n');
  output.push('\n**Note:** Tests should be created during implementation or documented justification if deferred.\n');
  output.push('If tests are deferred, document:\n');
  output.push('- Why tests are deferred\n');
  output.push('- When tests will be added (which phase/session)\n');
  output.push('- Test requirements for future implementation\n');
  output.push('\n---\n');
  
  // Planning checklist
  output.push('## Phase Planning Checklist\n');
  output.push('- [ ] Documentation reviewed');
  output.push('- [ ] Patterns checked for reuse');
  output.push('- [ ] Phase guide reviewed');
  output.push('- [ ] Sessions identified');
  output.push('- [ ] Learning goals set');
  output.push('- [ ] Dependencies identified');
  output.push('- [ ] Success criteria defined');
  output.push('- [ ] Phase todo created');
  output.push('- [ ] Test strategy documented');
  
  return output.join('\n');
}

