/**
 * Session mark-complete implementation. Used by tier-complete and by mark-session-complete (thin wrapper).
 */

import { readProjectFile, writeProjectFile, PROJECT_ROOT, getCurrentDate } from '../../../utils/utils';
import { join } from 'path';
import { readFile } from 'fs/promises';
import { WorkflowId } from '../../../utils/id-utils';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { resolveFeatureName } from '../../../utils';

export interface MarkSessionCompleteParams {
  sessionId: string;
  tasksCompleted?: string[];
  accomplishments?: string[];
  featureName?: string;
}

export async function markSessionCompleteImpl(params: MarkSessionCompleteParams): Promise<string> {
  const output: string[] = [];
  const featureName = await resolveFeatureName(params.featureName);
  const context = new WorkflowCommandContext(featureName);

  const parsed = WorkflowId.parseSessionId(params.sessionId);
  if (!parsed) {
    throw new Error(`ERROR: Invalid session ID format. Expected X.Y.Z (e.g., 4.1.3)\nAttempted: ${params.sessionId}`);
  }

  const phase = parsed.phaseId;
  const phaseGuidePath = context.paths.getPhaseGuidePath(phase);
  const phaseLogPath = context.paths.getPhaseLogPath(phase);

  try {
    const guideContent = await readProjectFile(phaseGuidePath);

  const sessionPattern = new RegExp(`(- \\[ \\]|### Session) (### Session )?${params.sessionId.replace(/\./g, '\\.')}:`, 'g');
  const updatedGuideContent = guideContent.replace(sessionPattern, (match) => {
    if (match.includes('- [ ]')) return match.replace('- [ ]', '- [x]');
    return `- [x] ### Session ${params.sessionId}:`;
  });

  await writeProjectFile(phaseGuidePath, updatedGuideContent);
  output.push(`✅ Updated phase guide: ${phaseGuidePath}`);

  let logContent = '';
  try {
    logContent = await readProjectFile(phaseLogPath);
  } catch (err) {
    console.warn('Mark session complete: phase log not found, using template', phaseLogPath, err);
    const templatePath = join(PROJECT_ROOT, '.cursor/commands/tiers/phase/templates/phase-log.md');
    try {
      const template = await readFile(templatePath, 'utf-8');
      logContent = template.replace(/\[N\]/g, phase);
    } catch (templateErr) {
      console.warn('Mark session complete: phase log template not found, using default', templatePath, templateErr);
      logContent = `# Phase ${phase} Log\n\n**Status:** In Progress\n**Started:** ${getCurrentDate()}\n\n## Completed Sessions\n\n`;
    }
  }

  const tasksList = params.tasksCompleted?.length ? params.tasksCompleted.join(', ') : 'All tasks completed';
  const accomplishmentsList = params.accomplishments?.length
    ? params.accomplishments.map(a => `- ${a}`).join('\n')
    : '- Session completed successfully';

  let sessionName = '[SESSION_NAME]';
  const sessionNameMatch = guideContent.match(new RegExp(`### Session ${params.sessionId.replace(/\./g, '\\.')}:\\s*([^\\n]+)`));
  if (sessionNameMatch?.[1]) sessionName = sessionNameMatch[1].trim();

  const sessionEntry = `### Session ${params.sessionId}: ${sessionName} ✅
**Completed:** ${getCurrentDate()}
**Tasks Completed:** ${tasksList}
**Key Accomplishments:**
${accomplishmentsList}
`;

  const completedSessionsMarker = '## Completed Sessions';
  if (logContent.includes(completedSessionsMarker)) {
    const sections = logContent.split(completedSessionsMarker);
    logContent = sections[0] + completedSessionsMarker + '\n\n' + sessionEntry + '\n' + sections.slice(1).join(completedSessionsMarker);
  } else {
    logContent += `\n\n${completedSessionsMarker}\n\n${sessionEntry}`;
  }

  await writeProjectFile(phaseLogPath, logContent);
  output.push(`✅ Updated phase log: ${phaseLogPath}`);

  return output.join('\n');
  } catch (_error) {
    const fullPath = join(PROJECT_ROOT, phaseGuidePath);
    throw new Error(
      `ERROR: Failed to mark session complete\n` +
      `Session ID: ${params.sessionId}\n` +
      `Phase Guide Path: ${phaseGuidePath}\n` +
      `Full Path: ${fullPath}\n` +
      `Tier: Session (Tier 2 - Medium-Level)\n` +
      `Error Details: ${_error instanceof Error ? _error.message : String(_error)}\n` +
      `Suggestion: Verify session ID format and phase guide exists`
    );
  }
}
