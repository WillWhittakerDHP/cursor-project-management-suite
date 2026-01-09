/**
 * Deprecated Utility: addTaskSection
 *
 * NOTE:
 * This file is kept for backward compatibility, but the canonical exported command is
 * `.cursor/commands/tiers/task/atomic/add-task-section.ts`.
 * 
 * Tier: Task (Tier 3 - Low-Level)
 * Operates on: Task-level sections embedded in session handoff document
 */

import { readProjectFile, writeProjectFile } from '../../../utils/utils';
import { WorkflowCommandContext } from '../../../utils/command-context';

export interface TaskSection {
  id: string;
  name: string;
  goal: string;
  sourceFiles: string[];
  targetFiles: string[];
  keyFeatures: string[];
  importantNotes: string[];
  architectureNotes: string[];
  vueNotes: string[];
  completionSummary: string[];
}

export async function addTaskSection(section: TaskSection, featureName: string = 'vue-migration'): Promise<void> {
  const context = new WorkflowCommandContext(featureName);
  // Extract session ID from task ID (X.Y.Z -> X.Y)
  const sessionId = section.id.split('.').slice(0, 2).join('.');
  const handoffPath = context.paths.getSessionHandoffPath(sessionId);
  const content = await readProjectFile(handoffPath);
  
  const formattedSection = `### Task ${section.id}: ${section.name} ✅

**Goal:** ${section.goal}

**Source Files:**
${section.sourceFiles.map(f => `- \`${f}\``).join('\n')}

**Target Files:**
${section.targetFiles.map(f => `- \`${f}\` ✅`).join('\n')}

**Key Features:**
${section.keyFeatures.map(f => `- **${f}**: [Description]`).join('\n')}

**Important Notes:**
${section.importantNotes.map(n => `- ✅ **Completed**: ${n}`).join('\n')}

**Architecture Notes:**
${section.architectureNotes.map(n => `- **${n}**: [Explanation]`).join('\n')}

**Vue.js Notes:**
${section.vueNotes.map(n => `- ${n}`).join('\n')}

**Completion Summary:**
${section.completionSummary.map(s => `- ✅ ${s}`).join('\n')}
`;
  
  // Find the "Current Status" section and insert before it, or append to end
  const lines = content.split('\n');
  const statusIndex = lines.findIndex(line => 
    line.trim().startsWith('##') && line.includes('Current Status')
  );
  
  if (statusIndex !== -1) {
    // Insert before Current Status section
    lines.splice(statusIndex, 0, formattedSection);
  } else {
    // Append to end
    lines.push(formattedSection);
  }
  
  await writeProjectFile(handoffPath, lines.join('\n'));
}

