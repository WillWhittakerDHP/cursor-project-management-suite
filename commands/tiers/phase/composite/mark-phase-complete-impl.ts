/**
 * Phase mark-complete implementation. Used by tier-complete and by mark-phase-complete (thin wrapper).
 */

import { readProjectFile, writeProjectFile, PROJECT_ROOT, getCurrentDate } from '../../../utils/utils';
import { assertExistingPhaseLogReadableOrThrow } from '../../../utils/phase-log-guard';
import { join } from 'path';
import { readFile } from 'fs/promises';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { resolveWorkflowScope } from '../../../utils/workflow-scope';
import { PHASE_CONFIG } from '../../configs/phase';
import { getExcerptEndMarker } from '../../shared/context-policy';
import { getNextPhaseInFeature } from '../../../utils/phase-session-utils';

export interface MarkPhaseCompleteParams {
  phase: string;
  sessionsCompleted?: string[];
  totalTasks?: number;
  /** Numeric # or feature directory slug (required). */
  featureId?: string;
  featureName?: string;
}

export async function markPhaseCompleteImpl(params: MarkPhaseCompleteParams): Promise<string> {
  const output: string[] = [];
  const { featureName } = await resolveWorkflowScope({
    mode: 'fromTierParams',
    tier: 'feature',
    params: {
      ...(params.featureId?.trim() ? { featureId: params.featureId.trim() } : {}),
      ...(params.featureName?.trim() ? { featureName: params.featureName.trim() } : {}),
    },
  });
  const context = new WorkflowCommandContext(featureName);
  const phaseGuidePath = context.paths.getPhaseGuidePath(params.phase);
  const phaseLogPath = context.paths.getPhaseLogPath(params.phase);
  const handoffPath = context.paths.getFeatureHandoffPath();

  try {
    await PHASE_CONFIG.controlDoc.writeStatus(context, params.phase, 'complete');

    await context.documents.updateGuide(
      'phase',
      params.phase,
      (guideContent) => {
        let content = guideContent.replace(/(- \[ \] All sessions completed)/g, '- [x] All sessions completed');
        const otherCriteriaPatterns = [
          /(- \[ \] Code quality checks passing)/g,
          /(- \[ \] Documentation updated)/g,
          /(- \[ \] Ready for next phase)/g,
        ];
        otherCriteriaPatterns.forEach((pattern) => {
          content = content.replace(pattern, (match) => match.replace('- [ ]', '- [x]'));
        });
        const phaseGuideMarker = getExcerptEndMarker('phase');
        if (!content.includes(phaseGuideMarker)) {
          content = content.trimEnd() + '\n\n' + phaseGuideMarker;
        }
        return content;
      },
      { overwriteForTierEnd: true }
    );
    output.push(`✅ Updated phase guide: ${phaseGuidePath}`);

  try {
    await context.documents.updateHandoff('feature', undefined, (handoffContent) => {
      const nextPhase = parseInt(params.phase, 10) + 1;
      let content = handoffContent.replace(
        /(\*\*Current Phase:\*\*)\s*Phase \d+ (Complete|In Progress)/i,
        (_match, label) => `${label} Phase ${nextPhase} (Next)`
      );
      const lastSession = params.sessionsCompleted?.length
        ? params.sessionsCompleted[params.sessionsCompleted.length - 1]
        : `Phase ${params.phase}`;
      content = content.replace(/(\*\*Last Completed:\*\*)\s*.*/, `$1 ${lastSession}`);
      const featureHandoffMarker = getExcerptEndMarker('feature');
      if (!content.includes(featureHandoffMarker)) {
        content = content.trimEnd() + '\n\n' + featureHandoffMarker;
      }
      return content;
    });
    output.push(`✅ Updated handoff: ${handoffPath}`);
  } catch (_error) {
    output.push(`⚠️ Could not update feature handoff: ${_error instanceof Error ? _error.message : String(_error)}`);
  }

  try {
    const sessionsList = params.sessionsCompleted?.length ? params.sessionsCompleted.join(', ') : 'All sessions';
    const lastSession = params.sessionsCompleted?.length
      ? params.sessionsCompleted[params.sessionsCompleted.length - 1]
      : `Phase ${params.phase}`;
    const nextPhaseId = await getNextPhaseInFeature(context.feature.name, params.phase);
    const nextPhaseLabel = nextPhaseId ?? 'TBD';

    const phaseHandoff = [
      `# Phase ${params.phase} Handoff`,
      '',
      `**Phase Status:** Complete`,
      `**Last Updated:** ${getCurrentDate()}`,
      `**Next Phase:** ${nextPhaseLabel}`,
      '',
      '---',
      '',
      '## Current Status',
      '',
      `**Phase ${params.phase}:** Complete`,
      `**Last Completed Session:** ${lastSession}`,
      `**Next Phase:** ${nextPhaseLabel}`,
      '',
      '---',
      '',
      '## Transition Context',
      '',
      '**Where we left off:**',
      `Phase ${params.phase} completed with sessions: ${sessionsList}.`,
      '',
      `**What you need to start Phase ${nextPhaseLabel}:**`,
      `- Review phase ${params.phase} guide for any outstanding notes`,
      `- Check feature handoff for overall feature status`,
      '',
      '---',
      '',
      '## Phase Summary',
      '',
      `**Sessions Completed:** ${sessionsList}`,
      '',
      '---',
      '',
    ].join('\n');

    await context.documents.writeHandoff('phase', params.phase, phaseHandoff);
    const phaseHandoffPath = context.paths.getPhaseHandoffPath(params.phase);
    output.push(`✅ Created phase handoff: ${phaseHandoffPath}`);
  } catch (_error) {
    output.push(`⚠️ Could not create phase handoff: ${_error instanceof Error ? _error.message : String(_error)}`);
  }

  let logContent = '';
  try {
    logContent = await readProjectFile(phaseLogPath);
  } catch (err) {
    assertExistingPhaseLogReadableOrThrow(phaseLogPath, err, 'mark-phase-complete');
    console.warn('Mark phase complete: phase log missing; bootstrapping from template', phaseLogPath, err);
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

  const phaseLogMarker = getExcerptEndMarker('phase');
  if (!logContent.includes(phaseLogMarker)) {
    logContent = logContent.trimEnd() + '\n\n' + phaseLogMarker;
  }
  await writeProjectFile(phaseLogPath, logContent, { overwriteForTierEnd: true });
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
