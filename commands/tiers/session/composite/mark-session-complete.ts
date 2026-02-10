/**
 * Composite Command: /mark-session-complete [X.Y]
 * Mark session complete in phase guide and write to phase log
 * 
 * Tier: Session (Tier 2 - Medium-Level)
 * Operates on: Session-level sections in phase guide and phase log
 */

import { readProjectFile, writeProjectFile, PROJECT_ROOT, getCurrentDate } from '../../../utils/utils';
import { join } from 'path';
import { readFile } from 'fs/promises';
import { WorkflowId } from '../../../utils/id-utils';
import { WorkflowCommandContext } from '../../../utils/command-context';

// LEARNING: Centralized default feature name constant
// WHY: Avoids hardcoded fallback strings scattered across codebase
const DEFAULT_FEATURE_NAME = 'vue-migration';

export interface MarkSessionCompleteParams {
  sessionId: string;
  tasksCompleted?: string[]; // List of completed task IDs
  accomplishments?: string[]; // Key accomplishments
  featureName?: string; // Optional feature name (defaults to DEFAULT_FEATURE_NAME)
}

export async function markSessionComplete(params: MarkSessionCompleteParams): Promise<string> {
  const output: string[] = [];
  // LEARNING: Explicit default constant instead of hardcoded string
  // WHY: Avoids hardcoded fallbacks - use centralized constant
  const featureName = params.featureName || DEFAULT_FEATURE_NAME;
  const context = new WorkflowCommandContext(featureName);
  
  // Parse session ID to get phase number
  const parsed = WorkflowId.parseSessionId(params.sessionId);
  if (!parsed) {
    throw new Error(`ERROR: Invalid session ID format. Expected X.Y (e.g., 2.1)\nAttempted: ${params.sessionId}`);
  }
  
  const phase = parsed.phase;
  const phaseGuidePath = context.paths.getPhaseGuidePath(phase);
  const phaseLogPath = context.paths.getPhaseLogPath(phase);
  
  try {
    // Read phase guide
    let guideContent = await readProjectFile(phaseGuidePath);
    
    // Find and update session checkbox: - [ ] -> - [x]
    const sessionPattern = new RegExp(`(- \\[ \\]|### Session) (### Session )?${params.sessionId.replace(/\./g, '\\.')}:`, 'g');
    const updatedGuideContent = guideContent.replace(
      sessionPattern,
      (match) => {
        if (match.includes('- [ ]')) {
          return match.replace('- [ ]', '- [x]');
        }
        // If no checkbox found, add one
        return `- [x] ### Session ${params.sessionId}:`;
      }
    );
    
    // Write updated guide
    await writeProjectFile(phaseGuidePath, updatedGuideContent);
    output.push(`✅ Updated phase guide: ${phaseGuidePath}`);
    
    // Read or create phase log
    let logContent = '';
    try {
      logContent = await readProjectFile(phaseLogPath);
    } catch {} {
      // Create new log file with header
      const templatePath = join(PROJECT_ROOT, '.cursor/commands/tiers/phase/templates/phase-log.md');
      try {
        const template = await readFile(templatePath, 'utf-8');
        logContent = template.replace(/\[N\]/g, phase);
      } catch {
        // Fallback to minimal header
        logContent = `# Phase ${phase} Log\n\n**Status:** In Progress\n**Started:** ${getCurrentDate()}\n\n## Completed Sessions\n\n`;
      }
    }
    
    // Format session completion entry
    const tasksList = params.tasksCompleted && params.tasksCompleted.length > 0
      ? params.tasksCompleted.join(', ')
      : 'All tasks completed';
    
    const accomplishmentsList = params.accomplishments && params.accomplishments.length > 0
      ? params.accomplishments.map(a => `- ${a}`).join('\n')
      : '- Session completed successfully';
    
    // Try to extract session name from guide
    let sessionName = '[SESSION_NAME]';
    const sessionNameMatch = guideContent.match(new RegExp(`### Session ${params.sessionId.replace(/\./g, '\\.')}:\\s*([^\\n]+)`));
    if (sessionNameMatch && sessionNameMatch[1]) {
      sessionName = sessionNameMatch[1].trim();
    }
    
    const sessionEntry = `### Session ${params.sessionId}: ${sessionName} ✅
**Completed:** ${getCurrentDate()}
**Tasks Completed:** ${tasksList}
**Key Accomplishments:**
${accomplishmentsList}
`;
    
    // Append to Completed Sessions section
    const completedSessionsMarker = '## Completed Sessions';
    if (logContent.includes(completedSessionsMarker)) {
      // Insert after the marker
      const sections = logContent.split(completedSessionsMarker);
      logContent = sections[0] + completedSessionsMarker + '\n\n' + sessionEntry + '\n' + sections.slice(1).join(completedSessionsMarker);
    } else {
      // Add Completed Sessions section
      logContent += `\n\n${completedSessionsMarker}\n\n${sessionEntry}`;
    }
    
    await writeProjectFile(phaseLogPath, logContent);
    output.push(`✅ Updated phase log: ${phaseLogPath}`);
    
    return output.join('\n');
  } catch (error) {
    const fullPath = join(PROJECT_ROOT, phaseGuidePath);
    throw new Error(
      `ERROR: Failed to mark session complete\n` +
      `Session ID: ${params.sessionId}\n` +
      `Phase Guide Path: ${phaseGuidePath}\n` +
      `Full Path: ${fullPath}\n` +
      `Tier: Session (Tier 2 - Medium-Level)\n` +
      `Error Details: ${error instanceof Error ? error.message : String(error)}\n` +
      `Suggestion: Verify session ID format and phase guide exists`
    );
  }
}

