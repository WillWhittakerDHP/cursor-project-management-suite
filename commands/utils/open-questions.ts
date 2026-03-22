/**
 * Utility for extracting, parsing, and managing "Open Questions" sections in
 * markdown planning/guide documents.
 *
 * Convention: `### Open Questions` or `### Open Questions (Feature N)` headings
 * contain numbered question items. Items prefixed with `[x]` are resolved;
 * unprefixed or `[ ]` are unresolved.
 */

import { readProjectFile, writeProjectFile } from './utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OpenQuestion {
  /** 1-based index within its section. */
  index: number;
  /** Raw markdown text of the question (without leading number/checkbox). */
  text: string;
  /** Whether the question has been marked resolved (`[x]`). */
  resolved: boolean;
  /** The section heading this question belongs to (e.g. "Open Questions (Feature 7)"). */
  sectionHeading: string;
}

export interface OpenQuestionsBlock {
  /** Full heading text (e.g. "### Open Questions (Feature 7)"). */
  heading: string;
  /** All questions in this block. */
  questions: OpenQuestion[];
  /** Start line index (0-based) in the original content. */
  startLine: number;
  /** End line index (exclusive) — next heading or EOF. */
  endLine: number;
}

export interface ResolveQuestionResult {
  success: boolean;
  message: string;
  filePath?: string;
}

// ─── Extraction ─────────────────────────────────────────────────────────────

const OPEN_QUESTIONS_RE = /^#{2,4}\s+Open\s+Questions/i;

/**
 * Extract all "Open Questions" sections from markdown content.
 * Returns structured blocks with individual questions parsed.
 */
export function extractOpenQuestions(content: string): OpenQuestionsBlock[] {
  const lines = content.split('\n');
  const blocks: OpenQuestionsBlock[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!OPEN_QUESTIONS_RE.test(line)) continue;

    const headingDepth = (line.match(/^#+/) ?? [''])[0].length;
    const heading = line.replace(/^#+\s+/, '');
    const startLine = i;

    let endLine = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      const candidate = lines[j].trim();
      if (candidate.startsWith('#')) {
        const depth = (candidate.match(/^#+/) ?? [''])[0].length;
        if (depth <= headingDepth) {
          endLine = j;
          break;
        }
      }
    }

    const bodyLines = lines.slice(startLine + 1, endLine);
    const questions = parseQuestionItems(bodyLines, heading);
    blocks.push({ heading, questions, startLine, endLine });
  }

  return blocks;
}

/**
 * Parse numbered question items from the body of an Open Questions section.
 * Supports formats: `1. Question text`, `1. [x] Question text`, `1. [ ] Question text`.
 */
function parseQuestionItems(bodyLines: string[], sectionHeading: string): OpenQuestion[] {
  const items: OpenQuestion[] = [];
  let currentText = '';
  let currentResolved = false;
  let currentIndex = 0;

  for (const rawLine of bodyLines) {
    const line = rawLine.trim();
    if (!line) {
      if (currentIndex > 0 && currentText) {
        items.push({ index: currentIndex, text: currentText.trim(), resolved: currentResolved, sectionHeading });
        currentText = '';
        currentIndex = 0;
      }
      continue;
    }

    const numberedMatch = line.match(/^(\d+)\.\s+(?:\[([ x])\]\s+)?(.+)/i);
    if (numberedMatch) {
      if (currentIndex > 0 && currentText) {
        items.push({ index: currentIndex, text: currentText.trim(), resolved: currentResolved, sectionHeading });
      }
      currentIndex = parseInt(numberedMatch[1], 10);
      currentResolved = numberedMatch[2]?.toLowerCase() === 'x';
      currentText = numberedMatch[3];
    } else if (currentIndex > 0) {
      currentText += ' ' + line;
    }
  }

  if (currentIndex > 0 && currentText) {
    items.push({ index: currentIndex, text: currentText.trim(), resolved: currentResolved, sectionHeading });
  }

  return items;
}

// ─── Filtering ──────────────────────────────────────────────────────────────

/** Return only unresolved questions from all blocks. */
export function getUnresolvedQuestions(blocks: OpenQuestionsBlock[]): OpenQuestion[] {
  return blocks.flatMap(b => b.questions.filter(q => !q.resolved));
}

/** Check whether content has any unresolved open questions. */
export function hasUnresolvedOpenQuestions(content: string): boolean {
  const blocks = extractOpenQuestions(content);
  return getUnresolvedQuestions(blocks).length > 0;
}

// ─── Formatting ─────────────────────────────────────────────────────────────

/**
 * Format unresolved open questions as an "Inherited Open Questions" block
 * for injection into a child planning doc.
 */
export function formatInheritedQuestionsBlock(
  unresolvedQuestions: OpenQuestion[],
  sourceTier: string,
  sourceIdentifier: string
): string {
  if (unresolvedQuestions.length === 0) return '';

  const lines: string[] = [
    `## Inherited Open Questions (from ${sourceTier} ${sourceIdentifier})`,
    '',
    `> Unresolved items from the parent **Open Questions** sections — **planning input** for the agent, not a hard gate.`,
    '',
  ];

  for (let i = 0; i < unresolvedQuestions.length; i++) {
    const q = unresolvedQuestions[i];
    lines.push(`${i + 1}. **[${q.sectionHeading}]** ${q.text}`);
  }

  return lines.join('\n');
}

/**
 * Full section for the short tier planning doc: inherited notes + explicit agent synthesis contract.
 */
export function formatInheritedQuestionsPlanningDocSection(
  unresolvedQuestions: OpenQuestion[],
  sourceTier: string,
  sourceIdentifier: string
): string {
  if (unresolvedQuestions.length === 0) return '';
  const block = formatInheritedQuestionsBlock(unresolvedQuestions, sourceTier, sourceIdentifier);
  return (
    `${block}\n` +
    `### Agent: required synthesis\n\n` +
    `- Treat each item as **design input**: fold decisions, alternatives, and structure hints into **Goal**, **Approach**, **Checkpoint**, and **How we build the tierDown** where they affect scope or sequencing.\n` +
    `- If an item is **deferred**, say so in **Approach** or **Checkpoint** (where and when it will be decided).\n` +
    `- **Do not** require the human to run \`/resolve-question\` before continuing tier-start; **filling this planning doc** is the contract. Optionally record decisions in the parent guide later with \`/resolve-question\`.\n`
  );
}

/**
 * Format a concise warning for ctx.output when parent has unresolved questions.
 */
export function formatOpenQuestionsWarning(
  unresolvedQuestions: OpenQuestion[],
  sourceTier: string,
  sourceIdentifier: string
): string {
  const count = unresolvedQuestions.length;
  const plural = count === 1 ? 'question' : 'questions';
  const preview = unresolvedQuestions
    .slice(0, 3)
    .map(q => `  - ${q.text.slice(0, 120)}${q.text.length > 120 ? '…' : ''}`)
    .join('\n');
  const moreNote = count > 3 ? `\n  *(+${count - 3} more — see Inherited Open Questions in planning doc)*` : '';

  return [
    `**${count} open ${plural} inherited from ${sourceTier} ${sourceIdentifier}** (design notes — not a block):`,
    preview,
    moreNote,
    '',
    'The agent must **synthesize** these into the planning doc (Goal / Approach / tierDown). Optional later: `/resolve-question` on the parent guide to record decisions.',
  ].filter(Boolean).join('\n');
}

// ─── Resolve (mutate document) ──────────────────────────────────────────────

/**
 * Mark a question as resolved in a markdown file and record the decision.
 * Finds the question by index within the specified section, replaces with `[x]`,
 * and appends a "Decision:" line.
 */
export async function resolveQuestionInFile(
  filePath: string,
  sectionSubstring: string,
  questionIndex: number,
  decision: string
): Promise<ResolveQuestionResult> {
  let content: string;
  try {
    content = await readProjectFile(filePath);
  } catch {
    return { success: false, message: `Could not read file: ${filePath}` };
  }

  const blocks = extractOpenQuestions(content);
  const targetBlock = blocks.find(b =>
    b.heading.toLowerCase().includes(sectionSubstring.toLowerCase())
  );

  if (!targetBlock) {
    return {
      success: false,
      message: `No "Open Questions" section matching "${sectionSubstring}" found in ${filePath}.`,
    };
  }

  const targetQuestion = targetBlock.questions.find(q => q.index === questionIndex);
  if (!targetQuestion) {
    return {
      success: false,
      message: `Question #${questionIndex} not found in "${targetBlock.heading}" in ${filePath}.`,
    };
  }

  if (targetQuestion.resolved) {
    return { success: true, message: `Question #${questionIndex} is already resolved.`, filePath };
  }

  const lines = content.split('\n');
  const sectionLines = lines.slice(targetBlock.startLine + 1, targetBlock.endLine);
  const pattern = new RegExp(`^(\\s*${questionIndex}\\.\\s+)(?:\\[[ ]\\]\\s+)?`);

  let found = false;
  for (let i = 0; i < sectionLines.length; i++) {
    const lineIdx = targetBlock.startLine + 1 + i;
    if (pattern.test(lines[lineIdx])) {
      lines[lineIdx] = lines[lineIdx].replace(
        pattern,
        `$1[x] `
      );
      const insertIdx = findQuestionEndLine(lines, lineIdx, targetBlock.endLine);
      lines.splice(insertIdx, 0, `   **Decision:** ${decision}`);
      found = true;
      break;
    }
  }

  if (!found) {
    return {
      success: false,
      message: `Could not locate question #${questionIndex} text in "${targetBlock.heading}".`,
    };
  }

  await writeProjectFile(filePath, lines.join('\n'), { overwriteForTierEnd: true });
  return {
    success: true,
    message: `Resolved question #${questionIndex} in "${targetBlock.heading}" — decision recorded.`,
    filePath,
  };
}

/** Find where a numbered question ends (next numbered item, blank line after content, or section end). */
function findQuestionEndLine(lines: string[], startLine: number, sectionEnd: number): number {
  for (let i = startLine + 1; i < sectionEnd; i++) {
    const trimmed = lines[i].trim();
    if (/^\d+\.\s+/.test(trimmed)) return i;
    if (trimmed === '' && i + 1 < sectionEnd && /^\d+\.\s+/.test(lines[i + 1].trim())) return i;
  }
  return Math.min(startLine + 1, sectionEnd);
}
