/**
 * Composite Command: /mark-task-complete [X.Y.Z]
 * Mark task complete in session guide and write to session log
 * 
 * Tier: Task (Tier 3 - Low-Level)
 * Operates on: Task-level sections in session guide and session log
 */

import { readProjectFile, writeProjectFile, PROJECT_ROOT, getCurrentDate } from '../../../utils/utils';
import { join } from 'path';
import { formatTaskEntry, TaskEntry } from '../atomic/format-task-entry';
import { WorkflowId } from '../../../utils/id-utils';
import { WorkflowCommandContext } from '../../../utils/command-context';

export interface MarkTaskCompleteParams {
  taskId: string;
  entry?: Partial<TaskEntry>; // Optional log entry details
  featureName?: string; // Optional feature name (defaults to 'vue-migration')
}

export async function markTaskComplete(params: MarkTaskCompleteParams): Promise<string> {
  const output: string[] = [];
  const featureName = params.featureName || 'vue-migration';
  const context = new WorkflowCommandContext(featureName);
  
  // Parse task ID to get session ID
  const parsed = WorkflowId.parseTaskId(params.taskId);
  if (!parsed) {
    throw new Error(`ERROR: Invalid task ID format. Expected X.Y.Z (e.g., 2.1.1)\nAttempted: ${params.taskId}`);
  }
  
  const sessionId = `${parsed.phase}.${parsed.session}`;
  const sessionGuidePath = context.paths.getSessionGuidePath(sessionId);
  const sessionLogPath = context.paths.getSessionLogPath(sessionId);
  
  try {
    // Read session guide
    let guideContent = await readProjectFile(sessionGuidePath);
    
    // Find and update task checkbox: - [ ] -> - [x]
    const taskPattern = new RegExp(`(- \\[ \\]|#### Task) (#### Task )?${params.taskId.replace(/\./g, '\\.')}:`, 'g');
    const updatedGuideContent = guideContent.replace(
      taskPattern,
      (match) => {
        if (match.includes('- [ ]')) {
          return match.replace('- [ ]', '- [x]');
        }
        // If no checkbox found, add one
        return `- [x] #### Task ${params.taskId}:`;
      }
    );
    
    // Update Status field if present in session overview
    const statusPattern = /(\*\*Status:\*\*)\s*(Not Started|In Progress)/i;
    const updatedWithStatus = updatedGuideContent.replace(statusPattern, (match, label) => {
      return `${label} In Progress`;
    });
    
    // Write updated guide
    await writeProjectFile(sessionGuidePath, updatedWithStatus);
    output.push(`✅ Updated session guide: ${sessionGuidePath}`);
    
    // Write to session log
    const logEntry: TaskEntry = {
      id: params.taskId,
      description: params.entry?.description || `Task ${params.taskId}`,
      goal: params.entry?.goal || 'Task completed',
      filesCreated: params.entry?.filesCreated || [],
      filesModified: params.entry?.filesModified || [],
      vueConceptsLearned: params.entry?.vueConceptsLearned || [],
      reactVueDifferences: params.entry?.reactVueDifferences,
      keyMethodsPorted: params.entry?.keyMethodsPorted || [],
      architectureNotes: params.entry?.architectureNotes || [],
      learningCheckpoint: params.entry?.learningCheckpoint || [],
      questionsAnswered: params.entry?.questionsAnswered || [],
      nextTask: params.entry?.nextTask || `Task ${parsed.phase}.${parsed.session}.${parseInt(parsed.task) + 1}`,
    };
    
    // Read session log or create if doesn't exist
    let logContent = '';
    try {
      logContent = await readProjectFile(sessionLogPath);
    } catch (error) {
      // Create new log file with header
      const { readFile } = await import('fs/promises');
      const templatePath = join(PROJECT_ROOT, '.cursor/commands/tiers/session/templates/session-log.md');
      try {
        const template = await readFile(templatePath, 'utf-8');
        logContent = template
          .replace(/\[SESSION_ID\]/g, sessionId)
          .replace(/\[DESCRIPTION\]/g, 'Session Log')
          .replace(/\[Date\]/g, getCurrentDate());
      } catch {
        // Fallback to minimal header
        logContent = `# Session ${sessionId} Log\n\n**Status:** In Progress\n**Started:** ${getCurrentDate()}\n\n## Completed Tasks\n\n`;
      }
    }
    
    // Format and append task entry
    const formattedEntry = formatTaskEntry(logEntry);
    
    // Append to Completed Tasks section
    const completedTasksMarker = '## Completed Tasks';
    if (logContent.includes(completedTasksMarker)) {
      // Insert after the marker
      const sections = logContent.split(completedTasksMarker);
      logContent = sections[0] + completedTasksMarker + '\n\n' + formattedEntry + '\n' + sections.slice(1).join(completedTasksMarker);
    } else {
      // Add Completed Tasks section if it doesn't exist
      logContent += `\n\n${completedTasksMarker}\n\n${formattedEntry}`;
    }
    
    await writeProjectFile(sessionLogPath, logContent);
    output.push(`✅ Updated session log: ${sessionLogPath}`);
    
    return output.join('\n');
  } catch (error) {
    const fullPath = join(PROJECT_ROOT, sessionGuidePath);
    throw new Error(
      `ERROR: Failed to mark task complete\n` +
      `Task ID: ${params.taskId}\n` +
      `Session Guide Path: ${sessionGuidePath}\n` +
      `Full Path: ${fullPath}\n` +
      `Tier: Task (Tier 3 - Low-Level)\n` +
      `Error Details: ${error instanceof Error ? error.message : String(error)}\n` +
      `Suggestion: Verify task ID format and session guide exists`
    );
  }
}

