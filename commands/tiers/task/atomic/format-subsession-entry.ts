/**
 * Atomic Command: /format-task-entry [X.Y.Z]
 * Format task log entry using template
 * 
 * Tier: Task (Tier 3 - Low-Level)
 * Operates on: Task-level log entries embedded in session log
 */

export interface TaskEntry {
  id: string;
  description: string;
  goal: string;
  filesCreated: string[];
  filesModified: string[];
  vueConceptsLearned: string[];
  reactVueDifferences?: string[]; // Optional - only during migration phase
  keyMethodsPorted: string[];
  architectureNotes: string[];
  learningCheckpoint: string[];
  questionsAnswered: string[];
  nextTask: string;
}

export function formatTaskEntry(entry: TaskEntry): string {
  const filesCreatedSection = entry.filesCreated.length > 0
    ? `**Files Created:**\n${entry.filesCreated.map(f => `- \`${f}\` - [Description]`).join('\n')}\n`
    : '';
  
  const filesModifiedSection = entry.filesModified.length > 0
    ? `**Files Modified:**\n${entry.filesModified.map(f => `- \`${f}\` - [Description]`).join('\n')}\n`
    : '';
  
  const vueConceptsSection = entry.vueConceptsLearned.length > 0
    ? `**Vue.js Concepts Learned:**\n${entry.vueConceptsLearned.map(c => `- **${c}**: [Explanation]`).join('\n')}\n`
    : '';
  
  const differencesSection = entry.reactVueDifferences && entry.reactVueDifferences.length > 0
    ? `**React → Vue Differences:**\n${entry.reactVueDifferences.map(d => `- ${d}`).join('\n')}\n`
    : '';
  
  const methodsSection = entry.keyMethodsPorted.length > 0
    ? `**Key Methods/Functions Ported:**\n${entry.keyMethodsPorted.map(m => `- \`${m}()\` - [Description]`).join('\n')}\n`
    : '';
  
  const architectureSection = entry.architectureNotes.length > 0
    ? `**Architecture Notes:**\n${entry.architectureNotes.map(n => `- **${n}**: [Explanation]`).join('\n')}\n`
    : '';
  
  const checkpointSection = entry.learningCheckpoint.length > 0
    ? `**Learning Checkpoint:**\n${entry.learningCheckpoint.map(c => `- [x] ${c} ✅`).join('\n')}\n`
    : '';
  
  const questionsSection = entry.questionsAnswered.length > 0
    ? `**Questions Answered:**\n${entry.questionsAnswered.map(q => `- **${q}** - [Answer]`).join('\n')}\n`
    : '';
  
  return `### Task ${entry.id}: ${entry.description} ✅
**Goal:** ${entry.goal}

${filesCreatedSection}${filesModifiedSection}${vueConceptsSection}${differencesSection}${methodsSection}${architectureSection}${checkpointSection}${questionsSection}**Next Task:**
- ${entry.nextTask}
`;
}

