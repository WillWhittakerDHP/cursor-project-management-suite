/**
 * Composite Command: /mark-phase-complete [phase]
 * Mark phase complete in phase guide, update handoff, and write to phase log
 * 
 * Tier: Phase (Tier 1 - High-Level)
 * Operates on: Phase-level status in phase guide, handoff, and phase log
 */

import { readProjectFile, writeProjectFile, PROJECT_ROOT, getCurrentDate } from '../../../utils/utils';
import { join } from 'path';
import { readFile } from 'fs/promises';
import { WorkflowCommandContext } from '../../../utils/command-context';

export interface MarkPhaseCompleteParams {
  phase: string;
  sessionsCompleted?: string[]; // List of completed session IDs
  totalTasks?: number; // Total tasks completed in phase
  // Feature name is auto-detected from git branch or config file - no parameter needed
}

export async function markPhaseComplete(params: MarkPhaseCompleteParams): Promise<string> {
  const output: string[] = [];
  
  // Auto-detect feature context
  const context = await WorkflowCommandContext.getCurrent();
  const phaseGuidePath = context.paths.getPhaseGuidePath(params.phase);
  const phaseLogPath = context.paths.getPhaseLogPath(params.phase);
  const handoffPath = context.paths.getFeatureHandoffPath();
  
  try {
    // Read phase guide
    let guideContent = await readProjectFile(phaseGuidePath);
    
    // Update Status field: "Not Started" -> "Complete"
    const statusPattern = /(\*\*Status:\*\*)\s*(Not Started|In Progress)/i;
    guideContent = guideContent.replace(statusPattern, (match, label) => {
      return `${label} Complete`;
    });
    
    // Update Success Criteria checkboxes: - [ ] -> - [x]
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
    
    // Write updated guide
    await writeProjectFile(phaseGuidePath, guideContent);
    output.push(`✅ Updated phase guide: ${phaseGuidePath}`);
    
    // Update main handoff
    try {
      let handoffContent = await readProjectFile(handoffPath);
      
      // Update Current Phase
      handoffContent = handoffContent.replace(
        /(\*\*Current Phase:\*\*)\s*Phase \d+ (Complete|In Progress)/i,
        (match, label) => {
          const nextPhase = parseInt(params.phase) + 1;
          return `${label} Phase ${nextPhase} (Next)`;
        }
      );
      
      // Update Last Completed
      const lastSession = params.sessionsCompleted && params.sessionsCompleted.length > 0
        ? params.sessionsCompleted[params.sessionsCompleted.length - 1]
        : `Phase ${params.phase}`;
      handoffContent = handoffContent.replace(
        /(\*\*Last Completed:\*\*)\s*.*/,
        `$1 ${lastSession}`
      );
      
      await writeProjectFile(handoffPath, handoffContent);
      output.push(`✅ Updated handoff: ${handoffPath}`);
    } catch (error) {
      output.push(`⚠️ Could not update handoff: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Read or create phase log
    let logContent = '';
    try {
      logContent = await readProjectFile(phaseLogPath);
    } catch {} {
      // Create new log file with header
      const templatePath = join(PROJECT_ROOT, '.cursor/commands/tiers/phase/templates/phase-log.md');
      try {
        const template = await readFile(templatePath, 'utf-8');
        logContent = template.replace(/\[N\]/g, params.phase);
      } catch {
        // Fallback to minimal header
        logContent = `# Phase ${params.phase} Log\n\n**Status:** Complete\n**Started:** [Date]\n**Completed:** ${getCurrentDate()}\n\n`;
      }
    }
    
    // Update phase log status
    logContent = logContent.replace(
      /(\*\*Status:\*\*)\s*(In Progress|Not Started)/i,
      (match, label) => `${label} Complete`
    );
    
    // Add completion date if not present
    if (!logContent.includes('**Completed:**')) {
      logContent = logContent.replace(
        /(\*\*Status:\*\* Complete)/,
        `$1\n**Completed:** ${getCurrentDate()}`
      );
    }
    
    // Add completion summary if Phase Completion Summary section exists
    const summaryPattern = /## Phase Completion Summary/;
    if (logContent.includes('## Phase Completion Summary')) {
      const sessionsList = params.sessionsCompleted && params.sessionsCompleted.length > 0
        ? params.sessionsCompleted.join(', ')
        : 'All sessions';
      
      const totalTasks = params.totalTasks || 0;
      
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
        `$1 Yes - All success criteria met`
      );
    } else {
      // Add completion summary section
      const sessionsList = params.sessionsCompleted && params.sessionsCompleted.length > 0
        ? params.sessionsCompleted.join(', ')
        : 'All sessions';
      
      const totalTasks = params.totalTasks || 0;
      
      logContent += `\n\n## Phase Completion Summary\n\n**Sessions Completed:** ${sessionsList}\n**Total Tasks Completed:** ${totalTasks}\n**Success Criteria Met:** Yes - All success criteria met\n`;
    }
    
    await writeProjectFile(phaseLogPath, logContent);
    output.push(`✅ Updated phase log: ${phaseLogPath}`);
    
    return output.join('\n');
  } catch (error) {
    const fullPath = join(PROJECT_ROOT, phaseGuidePath);
    throw new Error(
      `ERROR: Failed to mark phase complete\n` +
      `Phase: ${params.phase}\n` +
      `Phase Guide Path: ${phaseGuidePath}\n` +
      `Full Path: ${fullPath}\n` +
      `Tier: Phase (Tier 1 - High-Level)\n` +
      `Error Details: ${error instanceof Error ? error.message : String(error)}\n` +
      `Suggestion: Verify phase number and phase guide exists`
    );
  }
}

