/**
 * LLM review packet for tier-end gap_analysis: facts + rubric for agent/subagent (no harness API).
 */

import type { PlanningTier } from '../../utils/planning-doc-paths';

const PACKET_TITLE = '## LLM review packet (v1)';
const MAX_EXCERPT_CHARS = 8000;
const MAX_CHANGED_FILES = 40;

export type GapPacketDataQuality = 'full' | 'partial';

export interface GapOverbuildPacketInput {
  planningTier: PlanningTier;
  identifier: string;
  featureName: string;
  /** Relative path from repo root, or null if no doc */
  planningDocRelativePath: string | null;
  /** Markdown body for ### Drift summary (bullets or short paragraphs) */
  driftSummaryBody: string;
  /** Truncated excerpt or null; use excerptNote when unavailable */
  planningExcerpt: string | null;
  planningExcerptNote?: string;
  /** Repo-relative paths, or null if listing failed */
  changedFilesSample: string[] | null;
  changedFilesNote?: string;
  dataQuality: GapPacketDataQuality;
  /** Shown under ### Confidence and data quality in harness packet + rubric */
  dataQualityNotes: string[];
}

function escapePlanningForExcerpt(s: string): string {
  return s.length <= MAX_EXCERPT_CHARS ? s : `${s.slice(0, MAX_EXCERPT_CHARS)}\n\n… (truncated at ${MAX_EXCERPT_CHARS} characters)`;
}

/**
 * Pull Goal, Plan, Deliverables, Acceptance sections when present; else first N chars of doc.
 */
export function extractPlanningExcerptForPacket(content: string): { excerpt: string | null; note?: string } {
  const headings = ['Goal', 'Plan', 'Deliverables', 'Acceptance', 'Acceptance Criteria', 'Analysis', 'Story'];
  const chunks: string[] = [];
  for (const h of headings) {
    const re = new RegExp(`\\n##\\s+${h.replace(/\s+/g, '\\s+')}\\s*[\\r\\n]+([\\s\\S]*?)(?=\\n##\\s+|$)`, 'i');
    const m = content.match(re);
    if (m?.[1]?.trim()) {
      chunks.push(`### ${h}\n\n${m[1].trim()}`);
    }
  }
  if (chunks.length > 0) {
    return { excerpt: escapePlanningForExcerpt(chunks.join('\n\n')) };
  }
  const trimmed = content.trim();
  if (!trimmed) {
    return { excerpt: null, note: 'Planning doc content was empty.' };
  }
  return { excerpt: escapePlanningForExcerpt(trimmed), note: 'Used full doc start (no matching ## sections).' };
}

const RUBRIC_TAIL = `
### Rubric for reviewer

Interpret drift (if any), flag follow-up tiers when appropriate, and watch for **over-build** (unnecessary CRUD depth, branchy abstractions without payoff). Ask YAGNI-style questions when complexity exceeds the stated goal.

#### Respond in chat using these exact headings

Reply in chat with your analysis — **do not** paste empty copies of the harness sections above. Use only these headings:

- **### Review — Context** — One short paragraph tying this tier's goal to what changed.
- **### Review — Drift interpretation** — What drift (or clean match) means for completeness / scope; avoid re-listing raw paths unless necessary.
- **### Review — Over-build signals** — Unnecessary complexity or YAGNI flags, or **none noted**.
- **### Review — Suggested follow-ups** — Concrete next checks, tiers, or doc updates.
- **### Review — Confidence and data quality** — State **full** or **partial** and cite any missing packet inputs.

**Agent instruction:** Perform this review in chat (you or a **subagent** when context is large/branchy). Log only **material** workflow friction to \`.project-manager/WORKFLOW_FRICTION_LOG.md\` (repeated confusion, contradictory guidance, or workflow-blocking ambiguity).
`.trim();

/**
 * Pure builder: single v1 packet markdown for stdout / control-plane deliverables.
 */
export function buildGapOverbuildReviewPacket(input: GapOverbuildPacketInput): string {
  const pathLine =
    input.planningDocRelativePath != null && input.planningDocRelativePath !== ''
      ? `\`${input.planningDocRelativePath}\``
      : '*(none — planning doc missing or path unavailable)*';

  const dqLines =
    input.dataQualityNotes.length > 0
      ? input.dataQualityNotes.map(l => `- ${l}`).join('\n')
      : '- *(no additional notes)*';

  const excerptBlock =
    input.planningExcerpt != null && input.planningExcerpt.trim() !== ''
      ? input.planningExcerpt.trim()
      : `*Unavailable.*${input.planningExcerptNote ? ` ${input.planningExcerptNote}` : ''}`;

  let changedBlock: string;
  if (input.changedFilesSample != null && input.changedFilesSample.length > 0) {
    const listed = input.changedFilesSample.slice(0, MAX_CHANGED_FILES);
    changedBlock = listed.map(f => `- \`${f}\``).join('\n');
    if (input.changedFilesSample.length > MAX_CHANGED_FILES) {
      changedBlock += `\n\n… and ${input.changedFilesSample.length - MAX_CHANGED_FILES} more (cap ${MAX_CHANGED_FILES}).`;
    }
  } else {
    changedBlock = `*Unavailable.*${input.changedFilesNote ? ` ${input.changedFilesNote}` : ''}`;
  }

  const lines: string[] = [
    PACKET_TITLE,
    '',
    'Packet version: v1',
    '',
    '### Metadata',
    '',
    `- **Tier:** ${input.planningTier}`,
    `- **Identifier:** \`${input.identifier}\``,
    `- **Feature:** ${input.featureName}`,
    `- **Planning doc:** ${pathLine}`,
    '',
    '### Drift summary',
    '',
    input.driftSummaryBody.trim() || '*No drift analysis for this run.*',
    '',
    '### Planning excerpt',
    '',
    excerptBlock,
    '',
    '### Changed files sample',
    '',
    changedBlock,
    '',
    '### Confidence and data quality (harness)',
    '',
    `- **Level:** **${input.dataQuality}**`,
    '',
    dqLines,
    '',
    RUBRIC_TAIL,
    '',
  ];

  return lines.join('\n').trimEnd();
}
