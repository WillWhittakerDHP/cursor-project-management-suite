/**
 * Atomic Command: /update-handoff-minimal
 * Update session handoff document with minimal transition context only
 * 
 * Tier: Session (Tier 2 - Medium-Level)
 * Operates on: Session handoff document (transition context between sessions)
 * 
 * Focus: Where we left off, what's next (not instructions or detailed notes)
 */

import { readProjectFile, writeProjectFile, getCurrentDate, getCurrentBranch, PROJECT_ROOT } from './utils';
import { WorkflowCommandContext } from './command-context';
import { resolveFeatureName } from './feature-context';
import { readFile } from 'fs/promises';
import { join } from 'path';

export interface MinimalHandoffUpdate {
  lastCompletedTask: string; // Format: X.Y.Z (e.g., "1.3.4") - last task completed
  nextSession: string; // Format: X.Y (e.g., "1.4") - next session to start
  transitionNotes?: string; // Minimal notes about what changed/where we left off
  sessionId?: string; // Current session ID (extracted from lastCompletedTask if not provided)
  featureName?: string; // Optional: resolved from .current-feature or git branch if not set
}

/**
 * Check if file exists, create from template if it doesn't
 */
async function ensureHandoffFileExists(handoffPath: string, sessionId: string, context: WorkflowCommandContext): Promise<void> {
  try {
    // Try to read the file - if it exists, we're done
    await readProjectFile(handoffPath);
    return;
  } catch (err) {
    console.warn('Update handoff minimal: handoff file not found, creating from template', handoffPath, err);
    const templatePath = context.paths.getTemplatePath('session', 'handoff');
    const templateContent = await readFile(join(PROJECT_ROOT, templatePath), 'utf-8');
    
    // Replace template placeholders with actual values
    const initialContent = templateContent
      .replace(/\[SESSION_ID\]/g, sessionId)
      .replace(/\[DESCRIPTION\]/g, `Session ${sessionId}`)
      .replace(/\[Date\]/g, getCurrentDate())
      .replace(/\[Complete \/ In Progress\]/g, 'In Progress')
      .replace(/\[NEXT_SESSION\]/g, '')
      .replace(/\[LAST_TASK\]/g, '')
      .replace(/\[PHASE\]/g, sessionId.split('.')[0]);
    
    // Write the initial handoff file
    await writeProjectFile(handoffPath, initialContent);
  }
}

export async function updateHandoffMinimal(update: MinimalHandoffUpdate): Promise<void> {
  const featureName = await resolveFeatureName(update.featureName);
  const context = new WorkflowCommandContext(featureName);
  // Extract session ID from lastCompletedTask if not provided (X.Y.Z -> X.Y)
  const sessionId = update.sessionId || update.lastCompletedTask.split('.').slice(0, 2).join('.');
  const handoffPath = context.paths.getSessionHandoffPath(sessionId);
  
  // Ensure handoff file exists (create from template if it doesn't)
  await ensureHandoffFileExists(handoffPath, sessionId, context);
  
  const content = await readProjectFile(handoffPath);
  const lines = content.split('\n');
  
  const branch = await getCurrentBranch();
  const date = getCurrentDate();
  
  // Update or create "Current Status" section
  const statusSection = `## Current Status

**Last Completed:** Task ${update.lastCompletedTask}
**Next Session:** Session ${update.nextSession}
**Git Branch:** \`${branch}\`
**Last Updated:** ${date}`;
  
  // Update or create "Next Action" section
  const nextActionSection = `## Next Action

Start Session ${update.nextSession}`;
  
  // Update or create "Transition Context" section
  const transitionSection = update.transitionNotes
    ? `## Transition Context

**Where we left off:**
${update.transitionNotes}

**What you need to start:**
- Review Task ${update.lastCompletedTask} completion
- Begin Session ${update.nextSession}`
    : `## Transition Context

**Where we left off:**
Completed Task ${update.lastCompletedTask}

**What you need to start:**
- Begin Session ${update.nextSession}`;
  
  // Find existing sections and replace, or insert if not found
  const statusIndex = lines.findIndex(line => line.trim().startsWith('##') && line.includes('Current Status'));
  const nextActionIndex = lines.findIndex(line => line.trim().startsWith('##') && line.includes('Next Action'));
  const transitionIndex = lines.findIndex(line => line.trim().startsWith('##') && line.includes('Transition Context'));
  
  // Replace or insert sections
  const updatedLines: string[] = [];
  let i = 0;
  
  // Keep everything before Current Status
  if (statusIndex !== -1) {
    updatedLines.push(...lines.slice(0, statusIndex));
  } else {
    updatedLines.push(...lines);
  }
  
  // Add/update Current Status
  updatedLines.push(statusSection);
  updatedLines.push('');
  
  // Find end of Current Status section
  if (statusIndex !== -1) {
    for (i = statusIndex + 1; i < lines.length; i++) {
      if (lines[i].trim().startsWith('##')) break;
    }
  }
  
  // Add/update Next Action
  updatedLines.push(nextActionSection);
  updatedLines.push('');
  
  // Add/update Transition Context
  updatedLines.push(transitionSection);
  updatedLines.push('');
  
  // Keep everything after Transition Context (or after Current Status if Transition Context didn't exist)
  if (transitionIndex !== -1) {
    for (i = transitionIndex + 1; i < lines.length; i++) {
      if (lines[i].trim().startsWith('##')) {
        // Skip sections we've already added
        const sectionName = lines[i].trim();
        if (sectionName.includes('Current Status') || sectionName.includes('Next Action') || sectionName.includes('Transition Context')) {
          continue;
        }
      }
      updatedLines.push(lines[i]);
    }
  } else if (statusIndex !== -1) {
    // Skip old Next Action if it existed
    if (nextActionIndex !== -1) {
      for (i = nextActionIndex + 1; i < lines.length; i++) {
        if (lines[i].trim().startsWith('##')) break;
      }
    }
    if (i < lines.length) {
      updatedLines.push(...lines.slice(i));
    }
  }
  
  await writeProjectFile(handoffPath, updatedLines.join('\n'));
}

