/**
 * Utility: Create retroactive todos from planning documents
 * 
 * This utility creates todos for phases/sessions that were created manually
 * without going through the planning commands. Used for retroactive fixes.
 */

import { createFromPlainLanguageProgrammatic } from './create-from-plain-language';
import { findTodoById, saveTodo } from '../../utils/todo-io';
import { WorkflowCommandContext } from '../../utils/command-context';
import { WorkflowId } from '../../utils/id-utils';
import { readFile } from 'fs/promises';
import { join } from 'path';

export interface RetroactiveTodoParams {
  feature: string;
  phase: number;
  sessionId?: string; // If provided, only create todos for this session
}

/**
 * Create retroactive todos for a phase from planning documents
 */
export async function createRetroactiveTodos(params: RetroactiveTodoParams): Promise<{
  success: boolean;
  created: string[];
  errors: string[];
}> {
  const context = new WorkflowCommandContext(params.feature);
  const created: string[] = [];
  const errors: string[] = [];

  try {
    // Step 0: Verify feature todo exists (required parent for phase todos)
    const featureTodo = await findTodoById(params.feature, `feature-${params.feature}`);
    if (!featureTodo) {
      errors.push(`Feature todo does not exist: feature-${params.feature}. Please create the feature todo first.`);
      return {
        success: false,
        created,
        errors,
      };
    }

    // Step 1: Create phase todo
    const phaseGuide = await context.readPhaseGuide(params.phase.toString());
    const phaseDescription = extractPhaseDescription(phaseGuide);
    
    const phaseTodoResult = await createFromPlainLanguageProgrammatic(
      params.feature,
      `Phase ${params.phase}: ${phaseDescription}`,
      { currentPhase: params.phase }
    );

    if (!phaseTodoResult.success || !phaseTodoResult.todo) {
      errors.push(`Failed to create phase todo: ${phaseTodoResult.errors?.map(e => e.message).join(', ') || 'Unknown error'}`);
    } else {
      await saveTodo(params.feature, phaseTodoResult.todo);
      created.push(phaseTodoResult.todo.id);
    }

    // Step 2: Extract sessions from phase guide and create session todos
    const sessionIds = extractSessionIds(phaseGuide);
    
    for (const sessionId of sessionIds) {
      // Skip if specific session requested and doesn't match
      if (params.sessionId && sessionId !== params.sessionId) {
        continue;
      }

      try {
        // Try to read session guide, fallback to phase guide if not found
        let sessionGuide: string | null = null;
        let sessionDescription: string;
        
        try {
          sessionGuide = await readSessionGuideWithFallback(context, sessionId);
          sessionDescription = extractSessionDescription(sessionGuide);
        } catch (_error) {
          // If guide doesn't exist, extract description from phase guide
          sessionDescription = extractSessionDescriptionFromPhaseGuide(phaseGuide, sessionId);
          // Continue without guide - we'll create session todo but skip tasks
        }

        const sessionTodoResult = await createFromPlainLanguageProgrammatic(
          params.feature,
          `Session ${sessionId}: ${sessionDescription}`,
          { currentPhase: params.phase, currentSession: sessionId }
        );

        if (!sessionTodoResult.success || !sessionTodoResult.todo) {
          errors.push(`Failed to create session todo for ${sessionId}: ${sessionTodoResult.errors?.map(e => e.message).join(', ') || 'Unknown error'}`);
          continue;
        }

        await saveTodo(params.feature, sessionTodoResult.todo);
        created.push(sessionTodoResult.todo.id);

        // Step 3: Extract tasks from session guide and create task todos (only if guide exists)
        if (sessionGuide) {
          const taskIds = extractTaskIds(sessionGuide);
          for (const taskId of taskIds) {
            const taskDescription = extractTaskDescription(sessionGuide, taskId);

            const taskTodoResult = await createFromPlainLanguageProgrammatic(
              params.feature,
              `Task ${taskId}: ${taskDescription}`,
              { currentPhase: params.phase, currentSession: sessionId }
            );

            if (!taskTodoResult.success || !taskTodoResult.todo) {
              errors.push(`Failed to create task todo for ${taskId}: ${taskTodoResult.errors?.map(e => e.message).join(', ') || 'Unknown error'}`);
              continue;
            }

            await saveTodo(params.feature, taskTodoResult.todo);
            created.push(taskTodoResult.todo.id);
          }
        }
      } catch (_error) {
        errors.push(`Error processing session ${sessionId}: ${_error instanceof Error ? _error.message : String(_error)}`);
      }
    }

    return {
      success: errors.length === 0,
      created,
      errors,
    };
  } catch (_error) {
    return {
      success: false,
      created,
      errors: [...errors, `Fatal error: ${_error instanceof Error ? _error.message : String(_error)}`],
    };
  }
}

/**
 * Read session guide with fallback for legacy naming conventions
 * 
 * LEARNING: Backward compatibility allows handling legacy file naming without breaking existing workflows
 * WHY: Phase 2 uses dash format (session-2-1-guide.md) while current standard uses dot format (session-2.1-guide.md)
 * PATTERN: Try current standard first, fallback to legacy format if needed
 * 
 * @param context Workflow command context
 * @param sessionId Session ID in format X.Y.Z (e.g., "4.1.3")
 * @returns Session guide content
 */
async function readSessionGuideWithFallback(
  context: WorkflowCommandContext,
  sessionId: string
): Promise<string> {
  try {
    // Try dot format first (current standard)
    return await context.readSessionGuide(sessionId);
  } catch (_error) {
    // Fallback to dash format (legacy Phase 2)
    const dashFormatId = sessionId.replace(/\./g, '-');
    const basePath = context.paths.getBasePath();
    const legacyPath = join(process.cwd(), `${basePath}/sessions/session-${dashFormatId}-guide.md`);
    try {
      return await readFile(legacyPath, 'utf-8');
    } catch (_legacyError) {
      // Re-throw original error if legacy path also fails
      throw _error;
    }
  }
}

/**
 * Extract phase description from phase guide
 */
function extractPhaseDescription(guide: string): string {
  // Look for "Phase Name:" or "Description:" after phase number
  const nameMatch = guide.match(/Phase Name:\s*(.+?)(?:\n|$)/i);
  if (nameMatch) {
    return nameMatch[1].trim();
  }
  
  const descMatch = guide.match(/Description:\s*(.+?)(?:\n|$)/i);
  if (descMatch) {
    return descMatch[1].trim();
  }

  // Fallback: use first line after "Phase Overview"
  const overviewMatch = guide.match(/## Phase Overview[\s\S]*?\*\*Phase Name:\*\*\s*(.+?)(?:\n|$)/i);
  if (overviewMatch) {
    return overviewMatch[1].trim();
  }

  return 'Property System Refactor'; // Default fallback
}

/**
 * Extract session IDs from phase guide
 */
function extractSessionIds(guide: string): string[] {
  const sessionMatches = guide.matchAll(/Session\s+(\d+\.\d+\.\d+):/g);
  const sessionIds: string[] = [];
  for (const match of sessionMatches) {
    if (WorkflowId.isValidSessionId(match[1])) {
      sessionIds.push(match[1]);
    }
  }
  return sessionIds;
}

/**
 * Extract session description from session guide
 */
function extractSessionDescription(guide: string): string {
  const nameMatch = guide.match(/Session Name:\s*(.+?)(?:\n|$)/i);
  if (nameMatch) {
    return nameMatch[1].trim();
  }
  
  const descMatch = guide.match(/Description:\s*(.+?)(?:\n|$)/i);
  if (descMatch) {
    return descMatch[1].trim();
  }

  return 'Session work'; // Default fallback
}

/**
 * Extract session description from phase guide when session guide doesn't exist
 * 
 * LEARNING: Fallback extraction allows creating todos even when session guides are missing
 * WHY: Some sessions may not have dedicated guide files but are still tracked in phase guides
 * PATTERN: Extract from phase guide structure as fallback
 * 
 * @param phaseGuide Phase guide content
 * @param sessionId Session ID in format X.Y
 * @returns Session description
 */
function extractSessionDescriptionFromPhaseGuide(phaseGuide: string, sessionId: string): string {
  // Look for session entry in phase guide: "Session 2.1: Description"
  const sessionRegex = new RegExp(`Session\\s+${sessionId.replace(/\./g, '\\.')}:\\s*(.+?)(?:\\n|$)`, 'i');
  const match = phaseGuide.match(sessionRegex);
  if (match) {
    return match[1].trim();
  }

  // Try to find description field in session breakdown
  const sessionSectionRegex = new RegExp(`Session\\s+${sessionId.replace(/\./g, '\\.')}[\\s\\S]*?\\*\\*Description:\\*\\*\\s*(.+?)(?:\\n|$)`, 'i');
  const descMatch = phaseGuide.match(sessionSectionRegex);
  if (descMatch) {
    return descMatch[1].trim();
  }

  return `Session ${sessionId}`; // Default fallback
}

/**
 * Extract task IDs from session guide
 */
function extractTaskIds(guide: string): string[] {
  const taskMatches = guide.matchAll(/Task\s+(\d+\.\d+\.\d+):/g);
  const taskIds: string[] = [];
  for (const match of taskMatches) {
    if (WorkflowId.isValidTaskId(match[1])) {
      taskIds.push(match[1]);
    }
  }
  return taskIds;
}

/**
 * Extract task description from session guide
 */
function extractTaskDescription(guide: string, taskId: string): string {
  const taskRegex = new RegExp(`Task\\s+${taskId.replace(/\./g, '\\.')}:\\s*(.+?)(?:\\n|$)`, 'i');
  const match = guide.match(taskRegex);
  if (match) {
    return match[1].trim();
  }

  // Try to find goal field
  const goalMatch = guide.match(new RegExp(`Task\\s+${taskId.replace(/\./g, '\\.')}[\\s\\S]*?\\*\\*Goal:\\*\\*\\s*(.+?)(?:\\n|$)`, 'i'));
  if (goalMatch) {
    return goalMatch[1].trim();
  }

  return `Task ${taskId}`; // Default fallback
}

