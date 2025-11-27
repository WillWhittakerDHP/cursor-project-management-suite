/**
 * Composite Command: /plan-task [X.Y.Z] [description]
 * Task planning (identify files, set approach)
 * 
 * Tier: Task (Tier 3 - Low-Level)
 * Operates on: Task-level planning (fills out task embeds in session guide)
 * 
 * Mode: Ask Mode (planning/documenting)
 * 
 * IMPORTANT: This command must be used in Ask Mode. It plans tasks and updates documentation
 * but does NOT implement changes. Implementation requires switching to Agent Mode after explicit
 * approval from the user.
 * 
 * Called during session-start to fill out task details in session guide
 * 
 * See Rule 23 in `.cursor/rules/USER_CODING_RULES.md` for Ask Mode vs Agent Mode guidelines.
 * 
 * INTERPRETATION GUIDE: This command should use the plain language uploader design
 * Use `createFromPlainLanguage()` from `.cursor/commands/todo/composite/create-from-plain-language` as the guide
 * for interpreting user input. The plain language uploader provides criteria and patterns
 * for parsing natural language descriptions into structured planning information.
 * 
 * TODO INTEGRATION: After creating the task documentation, this command should create task todos
 * using the todo management system. Use todo commands from `.cursor/commands/todo/`
 * for integration patterns. Task operations should delegate to todo management utilities instead
 * of directly parsing guides.
 */

import { planWithChecks } from '../../../planning/composite/plan-with-checks';
import { createFromPlainLanguageProgrammatic } from '../../../todo/composite/create-from-plain-language';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { WorkflowId } from '../../../utils/id-utils';
import { MarkdownUtils } from '../../../utils/markdown-utils';

export async function planTask(
  taskId: string,
  description: string,
  featureName: string = 'vue-migration'
): Promise<string> {
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];
  
  // Mode warning (soft check - doesn't stop execution)
  output.push('⚠️ **MODE REMINDER:** This command should be used in **Ask Mode** for planning.');
  output.push('If you\'re in Agent Mode, switch to Ask Mode for planning, then switch back to Agent Mode after approval.\n');
  output.push('---\n');
  
  output.push(`# Task Planning: ${taskId} - ${description}\n`);
  output.push('---\n');
  
  // Parse task ID to get session ID
  const parsed = WorkflowId.parseTaskId(taskId);
  if (!parsed) {
    return 'Error: Invalid task ID format. Expected X.Y.Z (e.g., 1.3.1)';
  }
  
  const sessionId = WorkflowId.generateSessionId(parsed.phase, parsed.session);
  
  // Planning checks (lightweight for task-level)
  output.push('## Planning Checks\n');
  output.push('**Running planning checks...**\n');
  try {
    const planningOutput = await planWithChecks(
      description,
      'task',
      featureName,
      parsed.phase,
      sessionId,
      taskId,
      'component'
    );
    output.push(planningOutput);
    output.push('\n---\n');
  } catch (error) {
    output.push(`⚠️ **Warning: Planning checks failed**\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    output.push(`**Note:** Continuing with task planning despite planning check failure.\n`);
    output.push('\n---\n');
  }
  const sessionGuidePath = context.paths.getSessionGuidePath(sessionId);
  
  // Try to load session guide
  try {
    let sessionGuideContent = await context.readSessionGuide(sessionId);
    
    // Find task section and update it
    const taskSectionPattern = new RegExp(`### Task ${taskId.replace('.', '\\.')}:.*?(?=### Task|$)`, 's');
    const taskSectionMatch = sessionGuideContent.match(taskSectionPattern);
    
    if (taskSectionMatch) {
      output.push('## Task Section Found\n');
      output.push('**Updating task section in session guide...**\n');
      
      // Update task section with planning details
      const updatedTaskSection = `### Task ${taskId}: ${description}
**Goal:** [Fill in task goal]
**Files:** 
- [Files to work with]
**Approach:** [Fill in approach]
**Checkpoint:** [What needs to be verified]
`;
      
      sessionGuideContent = sessionGuideContent.replace(taskSectionPattern, updatedTaskSection + '\n\n');
      await context.documents.writeGuide('session', sessionId, sessionGuideContent);
      output.push('**Task section updated in session guide.**\n');
    } else {
      output.push('## Task Section Not Found\n');
      output.push('**Adding new task section to session guide...**\n');
      
      // Add new task section
      const newTaskSection = `\n### Task ${taskId}: ${description}
**Goal:** [Fill in task goal]
**Files:** 
- [Files to work with]
**Approach:** [Fill in approach]
**Checkpoint:** [What needs to be verified]
`;
      
      sessionGuideContent += newTaskSection;
      await context.documents.writeGuide('session', sessionId, sessionGuideContent);
      output.push('**New task section added to session guide.**\n');
    }
    
    // Create task todo after guide is updated (BLOCKING)
    output.push('\n---\n');
    output.push('## Creating Task Todo\n');
    const feature = context.feature.name;
    const currentPhase = parsed.phase;
    const currentSession = sessionId;
    
    const todoResult = await createFromPlainLanguageProgrammatic(
      feature,
      `Task ${taskId}: ${description}`,
      { currentPhase, currentSession }
    );
    
    // BLOCKING: Fail if todo creation fails
    if (!todoResult.success || !todoResult.todo) {
      const errorMessages: string[] = [];
      errorMessages.push(`❌ **ERROR: Task todo creation failed (BLOCKING)**\n`);
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
      errorMessages.push(`\n**Task planning cannot continue without a todo. Please fix the errors above and retry.**\n`);
      throw new Error(errorMessages.join(''));
    }
    
    const createdTodo = todoResult.todo;
    output.push(`✅ **Task todo created:** ${createdTodo.id}\n`);
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
  } catch (error) {
    // Re-throw todo creation errors (they're blocking and should propagate)
    if (error instanceof Error && (error.message.includes('todo') || error.message.includes('BLOCKING') || error.message.includes('Todo'))) {
      throw error;
    }
    output.push('## Session Guide Not Found\n');
    output.push(`**ERROR: Session guide not found**\n`);
    output.push(`**Attempted:** ${sessionGuidePath}\n`);
    output.push(`**Expected:** Session guide file for session ${sessionId}\n`);
    output.push(`**Suggestion:** Create it first using \`/plan-session ${sessionId} [description]\`\n`);
    output.push(`**Template:** Use \`.cursor/commands/tiers/session/templates/session-guide.md\` as a starting point\n`);
    output.push(`**Tier:** Task (Tier 3 - Low-Level)\n`);
    output.push(`**Error Details:** ${error instanceof Error ? error.message : String(error)}\n`);
  }
  
  output.push('\n---\n');
  output.push('## Task Planning Checklist\n');
  output.push('- [ ] Files identified\n');
  output.push('- [ ] Approach defined\n');
  output.push('- [ ] Checkpoint criteria set\n');
  output.push('- [ ] Task todo created\n');
  
  return output.join('\n');
}

