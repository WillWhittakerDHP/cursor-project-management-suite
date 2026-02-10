/**
 * Composite Command: /task-start [X.Y.Z]
 * Load task context from session guide and handoff
 * 
 * Tier: Task (Tier 3 - Low-Level)
 * Operates on: Task-level workflow (loads task details from session guide and handoff)
 * 
 * TODO MANAGEMENT INTEGRATION: This command should load task todos from todo management
 * instead of parsing guides directly. Use todo commands from `.cursor/commands/todo/` for integration.
 * Task operations should delegate to todo management utilities using `findTodo()` or `getAllTodosCommand()`
 * instead of directly parsing guides.
 */

import { readHandoff } from '../../../utils/read-handoff';
import { findTodoById } from '../../../utils/todo-io';
import { lookupCitations } from '../../../utils/todo-citations';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { WorkflowId } from '../../../utils/id-utils';
import { MarkdownUtils } from '../../../utils/markdown-utils';
import { extractFilePaths, gatherFileStatuses } from '../../../../utils/context-gatherer';
import { formatFileStatusList } from '../../../../utils/context-templates';
import { CommandExecutionOptions, isPlanMode, resolveCommandExecutionMode } from '../../../utils/command-execution-mode';

export async function taskStart(
  taskId: string,
  featureName: string = 'vue-migration',
  options?: CommandExecutionOptions
): Promise<string> {
  const context = new WorkflowCommandContext(featureName);
  const mode = resolveCommandExecutionMode(options);
  const output: string[] = [];
  
  output.push(`# Task Start: ${taskId}\n`);
  output.push('---\n');
  
  // Parse task ID to get session ID
  const parsed = WorkflowId.parseTaskId(taskId);
  if (!parsed) {
    return 'Error: Invalid task ID format. Expected X.Y.Z (e.g., 1.3.1)';
  }
  
  const sessionId = WorkflowId.generateSessionId(parsed.phase, parsed.session);
  const feature = context.feature.name;

  if (isPlanMode(mode)) {
    const taskTodoId = `session-${sessionId}-${parsed.task}`;
    const sessionGuidePath = context.paths.getSessionGuidePath(sessionId);
    const sessionHandoffPath = context.paths.getSessionHandoffPath(sessionId);
    const sessionLogPath = context.paths.getSessionLogPath(sessionId);

    output.push('## Mode: Plan (no side effects)\n');
    output.push('This is a deterministic preview. No todo reads, file reads, or git operations will be executed.\n');
    output.push('\n### What would run (execute mode)\n');
    output.push(`- Todo: lookup task todo by id: \`${taskTodoId}\` (feature: \`${feature}\`)`)
    output.push(`- Todo: lookup citations for \`${taskTodoId}\` (junction: task-start)`)
    output.push(`- Docs: read task handoff context (from session handoff): \`${sessionHandoffPath}\``)
    output.push(`- Docs: read session guide (fallback task parsing): \`${sessionGuidePath}\``)
    output.push(`- Docs: (reference) session log path (task updates happen at task-end): \`${sessionLogPath}\``)
    output.push('- Output: show task details, citations, and auto-gathered file context (if present)')
    return output.join('\n');
  }
  
  // Try to load task todo from todo management
  const taskTodoId = `session-${sessionId}-${parsed.task}`;
  let taskTodo = null;
  
  try {
    taskTodo = await findTodoById(feature, taskTodoId);
  } catch {}
  
  if (taskTodo) {
    // Display task info from todo
    output.push('## Task Details\n');
    output.push(`**Title:** ${taskTodo.title}\n`);
    output.push(`**Status:** ${taskTodo.status}\n`);
    if (taskTodo.description) {
      output.push(`**Description:** ${taskTodo.description}\n`);
    }
    if (taskTodo.planningDocPath) {
      output.push(`**Planning Doc:** ${taskTodo.planningDocPath}\n`);
    }
    if (taskTodo.tags && taskTodo.tags.length > 0) {
      output.push(`**Tags:** ${taskTodo.tags.join(', ')}\n`);
    }
    output.push('\n---\n');
    
    // Lookup citations for this task
    try {
      const citations = await lookupCitations(feature, taskTodoId, 'task-start');
      if (citations.length > 0) {
        output.push('## Citations\n');
        output.push(`**Found ${citations.length} citation(s) for review:**\n`);
        for (const citation of citations) {
          output.push(`- **${citation.priority.toUpperCase()}** (${citation.type}): Change ${citation.changeLogId}\n`);
          if (citation.metadata?.reason) {
            output.push(`  - Reason: ${citation.metadata.reason}\n`);
          }
        }
        output.push('\n---\n');
      }
    } catch {}
  } else {
    output.push('## Task Details\n');
    output.push(`**WARNING: Task todo not found: ${taskTodoId}**\n`);
    output.push(`**Suggestion:** Use \`/plan-task ${taskId} [description]\` to create task todo\n`);
    output.push('\n---\n');
  }
  
  // Load task-level handoff context (task context is in session handoff)
  try {
    const handoffContent = await readHandoff('task', taskId);
    output.push('## Task Handoff Context\n');
    output.push(handoffContent);
    output.push('\n---\n');
  } catch {} {
    // Handoff not found - log explicitly but continue
    output.push('## Task Handoff Context\n');
    output.push(`**Note:** Handoff context not available. Use \`/read-handoff session ${sessionId}\` to check session context\n`);
    output.push('\n---\n');
  }
  
  // Fallback: Try to load task details from session guide if todo not found
  let taskSectionContent = '';
  if (!taskTodo) {
    try {
      const sessionGuideContent = await context.readSessionGuide(sessionId);
      
      // Extract task section using markdown utils
      const taskSectionPattern = new RegExp(`### Task ${taskId.replace('.', '\\.')}:.*?(?=### Task|##|$)`, 's');
      const taskSectionMatch = sessionGuideContent.match(taskSectionPattern);
      
      if (taskSectionMatch) {
        taskSectionContent = taskSectionMatch[0];
        output.push('## Task Context (from guide)\n');
        output.push(taskSectionContent);
        output.push('\n---\n');
      }
    } catch {}
  } else if (taskTodo.description) {
    taskSectionContent = taskTodo.description;
  }
  
  // Auto-gather context (non-blocking)
  try {
    if (taskSectionContent) {
      const filePaths = extractFilePaths(taskSectionContent);
      if (filePaths.length > 0) {
        const fileStatuses = await gatherFileStatuses(filePaths);
        const reactFiles = fileStatuses.filter(f => f.isReact);
        const vueFiles = fileStatuses.filter(f => f.isVue);
        
        if (reactFiles.length > 0 || vueFiles.length > 0) {
          output.push('## Auto-Gathered Context\n');
          output.push('**Files mentioned in task:**\n');
          
          if (reactFiles.length > 0) {
            output.push('\n**React Source Files:**');
            output.push(formatFileStatusList(reactFiles));
          }
          
          if (vueFiles.length > 0) {
            output.push('\n**Vue Target Files:**');
            output.push(formatFileStatusList(vueFiles));
          }
          
          output.push('\n---\n');
        }
      }
    }
  } catch {} {
    // Non-blocking - don't fail task start if context gathering fails
    // Silently continue - context gathering is optional enhancement
  }
  
  output.push('## Ready to Start\n');
  output.push('**Begin working on task:** ' + taskId + '\n');
  
  return output.join('\n');
}

