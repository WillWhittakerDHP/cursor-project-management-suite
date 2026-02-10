/**
 * Composite Command: /plan-session [X.Y] [description]
 * Session planning (identify tasks, set learning goals)
 * 
 * Tier: Session (Tier 2 - Medium-Level)
 * Operates on: Session-level planning (creates session guide with task breakdown)
 * 
 * Mode: Ask Mode (planning/documenting)
 * 
 * IMPORTANT: This command must be used in Ask Mode. It plans sessions and creates documentation
 * but does NOT implement changes. Implementation requires switching to Agent Mode after explicit
 * approval from the user.
 * 
 * Called during phase-start to create session plan files
 * 
 * See Rule 23 in `.cursor/rules/USER_CODING_RULES.md` for Ask Mode vs Agent Mode guidelines.
 * 
 * INTERPRETATION GUIDE: This command should use the plain language uploader design
 * Use `createFromPlainLanguage()` from `.cursor/commands/todo/composite/create-from-plain-language` as the guide
 * for interpreting user input. The plain language uploader provides criteria and patterns
 * for parsing natural language descriptions into structured planning information.
 * 
 * TODO INTEGRATION: After creating the session guide, this command should create session todos
 * and task todos using the todo management system. Use todo commands from `.cursor/commands/todo/`
 * for integration patterns.
 */

import { checkDocumentation } from '../../../planning/atomic/check-documentation';
import { checkReuse } from '../../../planning/atomic/check-reuse';
import { planWithChecks } from '../../../planning/composite/plan-with-checks';
import { createFromPlainLanguageProgrammatic } from '../../../todo/composite/create-from-plain-language';
import { findTodoById } from '../../../utils/todo-io';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { WorkflowId } from '../../../utils/id-utils';

export async function planSession(
  sessionId: string,
  description: string,
  featureName: string = 'vue-migration'
): Promise<string> {
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];
  
  // Validate session ID format
  if (!WorkflowId.isValidSessionId(sessionId)) {
    return `Error: Invalid session ID format. Expected X.Y (e.g., 2.1)\nAttempted: ${sessionId}`;
  }
  
  // Mode warning (soft check - doesn't stop execution)
  output.push('⚠️ **MODE REMINDER:** This command should be used in **Ask Mode** for planning.');
  output.push('If you\'re in Agent Mode, switch to Ask Mode for planning, then switch back to Agent Mode after approval.\n');
  output.push('---\n');
  
  output.push(`# Session Planning: ${sessionId} - ${description}\n`);
  output.push('---\n');
  
  // Use planning abstraction for comprehensive checks
  output.push('## Planning with Checks\n');
  output.push('**Using planning abstraction for documentation and pattern reuse checks:**\n');
  const parsed = WorkflowId.parseSessionId(sessionId);
  const phaseNum = parsed ? parsed.phase : undefined;
  const planningOutput = await planWithChecks(
    description,
    'session',
    featureName,
    phaseNum,
    sessionId,
    undefined,
    'component'
  );
  output.push(planningOutput);
  output.push('\n---\n');
  
  // Load session guide template
  const sessionGuidePath = context.paths.getSessionGuidePath(sessionId);
  let sessionGuideTemplate = '';
  
  try {
    // Try to load template from file
    sessionGuideTemplate = await context.templates.loadTemplate('session', 'guide');
    // Replace template placeholders with actual values
    sessionGuideTemplate = context.templates.render(sessionGuideTemplate, {
      SESSION_ID: sessionId,
      DESCRIPTION: description,
      DATE: new Date().toISOString().split('T')[0]
    });
  } catch (error) {
    // LEARNING: Fail explicitly instead of using fallback template
    // WHY: Fallback templates hide configuration errors and can lead to incomplete session guides
    const templatePath = context.paths.getTemplatePath('session', 'guide');
    throw new Error(
      `ERROR: Session guide template not found\n` +
      `Attempted: ${templatePath}\n` +
      `Expected: Session guide template file\n` +
      `Suggestion: Create template at ${templatePath}\n` +
      `Tier: Session (Tier 2 - Medium-Level)\n` +
      `Error: ${error instanceof Error ? error.message : String(error)}\n` +
      `Action Required: Create the session guide template file before proceeding.`
    );
  }
  
  // LEARNING: Explicit failure prevents incomplete session guides
  // WHY: Fallback templates hide configuration errors
  if (!sessionGuideTemplate) {
    throw new Error(`Session guide template is empty after loading from ${context.paths.getTemplatePath('session', 'guide')}`);
  }
  
  output.push('## Session Guide Template\n');
  output.push('**Created:** `' + sessionGuidePath + '`\n');
  output.push('**Template:** Based on `.cursor/commands/tiers/session/templates/session-guide.md`\n');
  output.push('```markdown\n');
  output.push(sessionGuideTemplate);
  output.push('```\n');
  
  // Create the file
  try {
    await context.documents.writeGuide('session', sessionId, sessionGuideTemplate);
    output.push('\n**Session guide file created successfully.**\n');
    
    // Create session todo after guide is created (BLOCKING)
    output.push('\n---\n');
    output.push('## Creating Session Todo\n');
    const feature = context.feature.name;
    const parsed = WorkflowId.parseSessionId(sessionId);
    const currentPhase = parsed ? parsed.phase : undefined;
    
    // Get phase todo to set as parent
    let parentId: string | undefined;
    if (currentPhase) {
      const phaseTodo = await findTodoById(feature, `phase-${currentPhase}`);
      if (phaseTodo) {
        parentId = phaseTodo.id;
      }
    }
    
    const todoResult = await createFromPlainLanguageProgrammatic(
      feature,
      `Session ${sessionId}: ${description}`,
      { currentPhase, currentSession: sessionId }
    );
    
    // BLOCKING: Fail if todo creation fails
    if (!todoResult.success || !todoResult.todo) {
      const errorMessages: string[] = [];
      errorMessages.push(`❌ **ERROR: Session todo creation failed (BLOCKING)**\n`);
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
      errorMessages.push(`\n**Session planning cannot continue without a todo. Please fix the errors above and retry.**\n`);
      throw new Error(errorMessages.join(''));
    }
    
    const createdTodo = todoResult.todo;
    output.push(`✅ **Session todo created:** ${createdTodo.id}\n`);
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
    
    // Try to extract tasks from guide and create task todos (BLOCKING)
    const taskMatches = sessionGuideTemplate.match(/#### Task ([\d.]+):\s*(.+?)(?=\n|$)/g);
    if (taskMatches && taskMatches.length > 0) {
      output.push(`\n**Found ${taskMatches.length} task(s) in guide. Creating task todos...**\n`);
      for (const match of taskMatches) {
        const taskMatch = match.match(/#### Task ([\d.]+):\s*(.+?)(?=\n|$)/);
        if (taskMatch) {
          const taskId = taskMatch[1];
          const taskTitle = taskMatch[2].trim();
          const taskTodoResult = await createFromPlainLanguageProgrammatic(
            feature,
            `Task ${taskId}: ${taskTitle}`,
            { currentPhase, currentSession: sessionId }
          );
          
          // BLOCKING: Fail if task todo creation fails
          if (!taskTodoResult.success || !taskTodoResult.todo) {
            const taskErrorMessages: string[] = [];
            taskErrorMessages.push(`❌ **ERROR: Task todo creation failed for ${taskId} (BLOCKING)**\n`);
            if (taskTodoResult.errors && taskTodoResult.errors.length > 0) {
              taskErrorMessages.push(`**Errors:**\n`);
              for (const error of taskTodoResult.errors) {
                taskErrorMessages.push(`- ${error.type}${error.field ? ` (${error.field})` : ''}: ${error.message}\n`);
              }
            }
            taskErrorMessages.push(`\n**Session planning cannot continue without task todos. Please fix the errors above and retry.**\n`);
            throw new Error(taskErrorMessages.join(''));
          }
          
          // Verify task todo exists
          const verifiedTaskTodo = await findTodoById(feature, taskTodoResult.todo.id);
          if (!verifiedTaskTodo) {
            throw new Error(`❌ **ERROR: Task todo verification failed**\nTodo ${taskTodoResult.todo.id} was created but cannot be found. This indicates a critical issue with the todo system.\n`);
          }
          output.push(`  ✅ Task todo created and verified: ${taskTodoResult.todo.id}\n`);
        }
      }
    }
  } catch (error) {
    // Re-throw todo creation errors (they're blocking and should propagate)
    if (error instanceof Error && (error.message.includes('todo') || error.message.includes('BLOCKING') || error.message.includes('Todo'))) {
      throw error;
    }
    output.push('\n**ERROR: Could not create session guide file automatically**\n');
    output.push(`**Attempted:** ${sessionGuidePath}\n`);
    output.push(`**Expected:** Session guide file for session ${sessionId}\n`);
    output.push(`**Suggestion:** Create it manually using \`.cursor/commands/tiers/session/templates/session-guide.md\` as a template\n`);
    output.push(`**Tier:** Session (Tier 2 - Medium-Level)\n`);
    output.push(`**Error Details:** ${error instanceof Error ? error.message : String(error)}\n`);
  }
  
  // Test strategy section
  output.push('\n---\n');
  output.push('## Test Strategy\n');
  output.push('**Document test requirements for this session:**\n');
  output.push('- [ ] Test strategy defined\n');
  output.push('- [ ] Test requirements documented in session guide\n');
  output.push('- [ ] Test todos created (if tests required)\n');
  output.push('- [ ] Test justification documented (if tests deferred)\n');
  output.push('\n**Note:** Tests should be created during implementation or documented justification if deferred.\n');
  output.push('If tests are deferred, document:\n');
  output.push('- Why tests are deferred\n');
  output.push('- When tests will be added (which phase/session)\n');
  output.push('- Test requirements for future implementation\n');
  
  return output.join('\n');
}

