/**
 * Composite Command: /plan-feature [name] [description]
 * Plan a new feature with mandatory research phase
 * 
 * Tier: Feature (Tier 0 - Highest Level)
 * Operates on: Feature-level workflow (creates feature structure, initializes research phase)
 * 
 * Composition: /feature-create + /feature-research
 * 
 * IMPORTANT: Ask Mode Only
 * This command is for planning and should be used in Ask Mode.
 * It outputs a plan, not an implementation.
 * 
 * INTERPRETATION GUIDE: This command should use the plain language uploader design
 * Use `createFromPlainLanguage()` from `.cursor/commands/todo/composite/create-from-plain-language` as the guide
 * for interpreting user input. The plain language uploader provides criteria and patterns
 * for parsing natural language descriptions into structured planning information.
 * 
 * TODO INTEGRATION: After creating the feature guide, this command should create feature
 * todos using the todo management system. Use todo commands from `.cursor/commands/todo/`
 * for integration patterns.
 */

import { featureCreate } from '../atomic/feature-create';
import { featureResearch } from '../atomic/feature-research';
import { planWithChecks } from '../../../planning/composite/plan-with-checks';
import { createFromPlainLanguageProgrammatic } from '../../../todo/composite/create-from-plain-language';
import { findTodoById } from '../../../utils/todo-io';

export async function planFeature(featureName: string, description: string): Promise<string> {
  const output: string[] = [];
  
  output.push(`# Planning Feature: ${featureName}\n`);
  output.push(`**Date:** ${new Date().toISOString().split('T')[0]}\n`);
  output.push(`**Description:** ${description}\n\n`);
  
  output.push('---\n\n');
  
  // Step 0: Planning checks (optional but recommended)
  output.push('## Step 0: Planning Checks\n');
  output.push('**Running planning checks before feature creation...**\n');
  try {
    const planningOutput = await planWithChecks(
      description,
      'feature',
      featureName,
      undefined,
      undefined,
      undefined,
      'migration'
    );
    output.push(planningOutput);
    output.push('\n---\n\n');
  } catch (error) {
    output.push(`⚠️ **Warning: Planning checks failed**\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    output.push(`**Note:** Continuing with feature creation despite planning check failure.\n`);
    output.push('\n---\n\n');
  }
  
  // Step 1: Create feature structure
  output.push('## Step 1: Creating Feature Structure\n\n');
  try {
    const createOutput = await featureCreate(featureName, description);
    output.push(createOutput);
    output.push('\n---\n\n');
    
    // Create feature todo after structure is created (BLOCKING)
    output.push('## Step 1.5: Creating Feature Todo\n\n');
    const todoResult = await createFromPlainLanguageProgrammatic(
      featureName,
      `Feature: ${featureName}. ${description}`,
      { currentPhase: undefined }
    );
    
    // BLOCKING: Fail if todo creation fails
    if (!todoResult.success || !todoResult.todo) {
      const errorMessages: string[] = [];
      errorMessages.push(`❌ **ERROR: Feature todo creation failed (BLOCKING)**\n`);
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
      errorMessages.push(`\n**Feature planning cannot continue without a todo. Please fix the errors above and retry.**\n`);
      throw new Error(errorMessages.join(''));
    }
    
    const createdTodo = todoResult.todo;
    output.push(`✅ **Feature todo created:** ${createdTodo.id}\n`);
    output.push(`**Title:** ${createdTodo.title}\n`);
    output.push(`**Status:** ${createdTodo.status}\n`);
    
    // Verify todo exists after creation
    output.push('\n**Verifying todo exists...**\n');
    const verifiedTodo = await findTodoById(featureName, createdTodo.id);
    if (!verifiedTodo) {
      throw new Error(`❌ **ERROR: Todo verification failed**\nTodo ${createdTodo.id} was created but cannot be found. This indicates a critical issue with the todo system.\n`);
    }
    output.push(`✅ **Todo verified:** ${verifiedTodo.id}\n`);
    output.push('\n---\n\n');
  } catch (error) {
    // Re-throw todo creation errors (they're blocking and should propagate)
    if (error instanceof Error && (error.message.includes('todo') || error.message.includes('BLOCKING') || error.message.includes('Todo'))) {
      throw error;
    }
    output.push(`**ERROR:** Failed to create feature structure\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    output.push('\n---\n\n');
  }
  
  // Step 2: Initialize research phase
  output.push('## Step 2: Research Phase\n\n');
  output.push('**MANDATORY:** Every feature must include a research phase before implementation.\n\n');
  try {
    const researchOutput = await featureResearch(featureName);
    output.push(researchOutput);
  } catch (error) {
    output.push(`**ERROR:** Failed to initialize research phase\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
  }
  
  output.push('\n---\n\n');
  output.push('## Next Steps\n\n');
  output.push('1. Answer all research questions (30+ questions)\n');
  output.push('2. Document findings in feature guide\n');
  output.push('3. Update feature log with research phase entry\n');
  output.push('4. Run `/feature-start [name]` to begin feature work\n');
  
  return output.join('\n');
}

