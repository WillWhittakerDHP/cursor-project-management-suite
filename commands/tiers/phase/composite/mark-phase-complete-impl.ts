/**
 * Phase mark-complete implementation. Used by tier-complete and by mark-phase-complete (thin wrapper).
 */

import { readProjectFile, writeProjectFile, PROJECT_ROOT, getCurrentDate } from '../../../utils/utils';
import { join } from 'path';
import { readFile } from 'fs/promises';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { PHASE_CONFIG } from '../../configs/phase';

export interface MarkPhaseCompleteParams {
  phase: string;
  sessionsCompleted?: string[];
  totalTasks?: number;
}

export async function markPhaseCompleteImpl(params: MarkPhaseCompleteParams): Promise<string> {
  const output: string[] = [];
  const context = await WorkflowCommandContext.getCurrent();
  const phaseGuidePath = context.paths.getPhaseGuidePath(params.phase);
  const phaseLogPath = context.paths.getPhaseLogPath(params.phase);
  const handoffPath = context.paths.getFeatureHandoffPath();

  try {
    await PHASE_CONFIG.controlDoc.writeStatus(context, params.phase, 'complete');

    let guideContent = await readProjectFile(phaseGuidePath);
  const successCriteriaPattern = /(- \[ \] All sessions completed)/g;
  guideContent = guideContent.replace(successCriteriaPattern, '- [x] All sessions completed');

  const otherCriteriaPatterns = [
    /(- \[ \] All learning goals achieved)/g,
    /(- \[ \] Code quality checks passing)/g,
    /(- \[ \] Documentation updated)/g,
    /(- \[ \] Ready for next phase)/g,
  ];
  otherCriteriaPatterns.forEach(pattern => {
    guideContent = guideContent.replace(pattern, (match) => match.replace('- [ ]', '- [x]'));
  });

  await writeProjectFile(phaseGuidePath, guideContent);
  output.push(`✅ Updated phase guide: ${phaseGuidePath}`);

  try {
    let handoffContent = await readProjectFile(handoffPath);
    const nextPhase = parseInt(params.phase) + 1;
    handoffContent = handoffContent.replace(
      /(\*\*Current Phase:\*\*)\s*Phase \d+ (Complete|In Progress)/i,
      (_match, label) => `${label} Phase ${nextPhase} (Next)`
    );
    const lastSession = params.sessionsCompleted?.length
      ? params.sessionsCompleted[params.sessionsCompleted.length - 1]
      : `Phase ${params.phase}`;
    handoffContent = handoffContent.replace(
      /(\*\*Last Completed:\*\*)\s*.*/,
      `$1 ${lastSession}`
    );
    await writeProjectFile(handoffPath, handoffContent);
    output.push(`✅ Updated handoff: ${handoffPath}`);
  } catch (_error) {
    output.push(`⚠️ Could not update handoff: ${_error instanceof Error ? _error.message : String(_error)}`);
  }

  let logContent = '';
  try {
    logContent = await readProjectFile(phaseLogPath);
  } catch (err) {
    console.warn('Mark phase complete: phase log not found, using template', phaseLogPath, err);
    const templatePath = join(PROJECT_ROOT, '.cursor/commands/tiers/phase/templates/phase-log.md');
    try {
      const template = await readFile(templatePath, 'utf-8');
      logContent = template.replace(/\[N\]/g, params.phase);
    } catch (templateErr) {
      console.warn('Mark phase complete: phase log template not found, using default', templatePath, templateErr);
      logContent = `# Phase ${params.phase} Log\n\n**Status:** Complete\n**Started:** [Date]\n**Completed:** ${getCurrentDate()}\n\n`;
    }
  }

  logContent = logContent.replace(
    /(\*\*Status:\*\*)\s*(Not Started|Planning|In Progress|Partial|Blocked|Reopened)/i,
    (_match, label) => `${label} Complete`
  );
  if (!logContent.includes('**Completed:**')) {
    logContent = logContent.replace(
      /(\*\*Status:\*\* Complete)/,
      `$1\n**Completed:** ${getCurrentDate()}`
    );
  }

  const sessionsList = params.sessionsCompleted?.length ? params.sessionsCompleted.join(', ') : 'All sessions';
  const totalTasks = params.totalTasks ?? 0;

  if (logContent.includes('## Phase Completion Summary')) {
    logContent = logContent.replace(
      /(\*\*Sessions Completed:\*\*)\s*\[List all session IDs\]/,
      `$1 ${sessionsList}`
    );
    logContent = logContent.replace(
      /(\*\*Total Tasks Completed:\*\*)\s*\[Number\]/,
      `$1 ${totalTasks}`
    );
    logContent = logContent.replace(
      /(\*\*Success Criteria Met:\*\*)\s*\[Yes\/No with details\]/,
      '$1 Yes - All success criteria met'
    );
  } else {
    logContent += `\n\n## Phase Completion Summary\n\n**Sessions Completed:** ${sessionsList}\n**Total Tasks Completed:** ${totalTasks}\n**Success Criteria Met:** Yes - All success criteria met\n`;
  }

  await writeProjectFile(phaseLogPath, logContent);
  output.push(`✅ Updated phase log: ${phaseLogPath}`);

  return output.join('\n');
  } catch (_error) {
    const fullPath = join(PROJECT_ROOT, phaseGuidePath);
    throw new Error(
      `ERROR: Failed to mark phase complete\n` +
      `Phase: ${params.phase}\n` +
      `Phase Guide Path: ${phaseGuidePath}\n` +
      `Full Path: ${fullPath}\n` +
      `Tier: Phase (Tier 1 - High-Level)\n` +
      `Error Details: ${_error instanceof Error ? _error.message : String(_error)}\n` +
      `Suggestion: Verify phase number and phase guide exists`
    );
  }
}
