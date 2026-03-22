/**
 * Atomic Command: /add-task-section [X.Y.Z]
 * Add formatted task section to session handoff
 * 
 * Tier: Task (Tier 3 - Low-Level)
 * Operates on: Task-level sections embedded in session handoff document
 */

import { WorkflowCommandContext } from '../../../utils/command-context';
import { resolveFeatureDirectoryFromPlan } from '../../../utils';

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

export async function addTaskSection(section: TaskSection, featureName?: string): Promise<void> {
  const resolved = await resolveFeatureDirectoryFromPlan(featureName);
  const context = new WorkflowCommandContext(resolved);
  const sessionId = section.id.split('.').slice(0, 2).join('.');
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
  await context.documents.updateHandoff('session', sessionId, (content) => {
    const lines = content.split('\n');
    const statusIndex = lines.findIndex(line =>
      line.trim().startsWith('##') && line.includes('Current Status')
    );
    if (statusIndex !== -1) {
      lines.splice(statusIndex, 0, formattedSection);
    } else {
      lines.push(formattedSection);
    }
    return lines.join('\n');
  });
}

