/**
 * /resolve-question: Record a design decision for an open question and mark it resolved.
 *
 * Locates the question in the specified file (or auto-discovers it from PROJECT_PLAN.md
 * or the current tier's guide), marks it `[x]`, and appends the decision inline.
 * Does NOT create branches or start workflows.
 */

import { resolveQuestionInFile, extractOpenQuestions, getUnresolvedQuestions, type OpenQuestion } from '../../utils/open-questions';
import { readProjectFile, PROJECT_ROOT } from '../../utils/utils';
import { join } from 'path';
import { readdir } from 'fs/promises';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ResolveQuestionParams {
  /** File path (repo-relative) containing the question. If omitted, searches PROJECT_PLAN.md first, then feature guides. */
  filePath?: string;
  /** Substring to match the section heading (e.g. "Feature 7" matches "Open Questions (Feature 7)"). */
  section?: string;
  /** 1-based question number within the section. */
  questionNumber: number;
  /** The decision or answer to record. */
  decision: string;
}

export interface ResolveQuestionResult {
  success: boolean;
  output: string;
}

// ─── Discovery ──────────────────────────────────────────────────────────────

const PROJECT_PLAN_PATH = '.project-manager/PROJECT_PLAN.md';
const FEATURES_DIR = '.project-manager/features';

async function discoverFilesWithOpenQuestions(): Promise<{ path: string; questions: OpenQuestion[] }[]> {
  const results: { path: string; questions: OpenQuestion[] }[] = [];

  try {
    const planContent = await readProjectFile(PROJECT_PLAN_PATH);
    const blocks = extractOpenQuestions(planContent);
    const unresolved = getUnresolvedQuestions(blocks);
    if (unresolved.length > 0) {
      results.push({ path: PROJECT_PLAN_PATH, questions: unresolved });
    }
  } catch {
    // PROJECT_PLAN.md not found
  }

  try {
    const featuresRoot = join(PROJECT_ROOT, FEATURES_DIR);
    const featureDirs = await readdir(featuresRoot, { withFileTypes: true });
    for (const dir of featureDirs) {
      if (!dir.isDirectory()) continue;
      const featureDir = join(featuresRoot, dir.name);
      const files = await readdir(featureDir).catch(() => [] as string[]);
      for (const file of files) {
        if (!file.endsWith('-guide.md') && !file.endsWith('-planning.md')) continue;
        const relPath = `${FEATURES_DIR}/${dir.name}/${file}`;
        try {
          const content = await readProjectFile(relPath);
          const blocks = extractOpenQuestions(content);
          const unresolved = getUnresolvedQuestions(blocks);
          if (unresolved.length > 0) {
            results.push({ path: relPath, questions: unresolved });
          }
        } catch {
          // skip unreadable files
        }
      }

      // Also scan subdirectories (phases/, sessions/)
      for (const subdir of ['phases', 'sessions']) {
        const subdirPath = join(featureDir, subdir);
        const subFiles = await readdir(subdirPath).catch(() => [] as string[]);
        for (const file of subFiles) {
          if (!file.endsWith('-guide.md') && !file.endsWith('-planning.md')) continue;
          const relPath = `${FEATURES_DIR}/${dir.name}/${subdir}/${file}`;
          try {
            const content = await readProjectFile(relPath);
            const blocks = extractOpenQuestions(content);
            const unresolved = getUnresolvedQuestions(blocks);
            if (unresolved.length > 0) {
              results.push({ path: relPath, questions: unresolved });
            }
          } catch {
            // skip
          }
        }
      }
    }
  } catch {
    // features dir not found
  }

  return results;
}

// ─── List ───────────────────────────────────────────────────────────────────

/** List all unresolved open questions across project docs. */
export async function listOpenQuestions(): Promise<ResolveQuestionResult> {
  const discovered = await discoverFilesWithOpenQuestions();

  if (discovered.length === 0) {
    return { success: true, output: 'No unresolved open questions found across project documents.' };
  }

  const lines: string[] = ['# Unresolved Open Questions', ''];

  for (const { path, questions } of discovered) {
    lines.push(`## \`${path}\``, '');
    for (const q of questions) {
      lines.push(`${q.index}. **[${q.sectionHeading}]** ${q.text.slice(0, 200)}${q.text.length > 200 ? '…' : ''}`);
    }
    lines.push('');
  }

  lines.push(
    '---',
    'To resolve a question, run `/resolve-question` with:',
    '- `filePath`: repo-relative path (from list above)',
    '- `section`: section name substring (e.g. "Feature 7")',
    '- `questionNumber`: the question number',
    '- `decision`: your design decision',
  );

  return { success: true, output: lines.join('\n') };
}

// ─── Resolve ────────────────────────────────────────────────────────────────

/** Resolve a specific open question by marking it [x] and recording the decision. */
export async function resolveQuestion(params: ResolveQuestionParams): Promise<ResolveQuestionResult> {
  const { questionNumber, decision, section } = params;
  let { filePath } = params;

  if (!decision?.trim()) {
    return { success: false, output: 'A decision is required to resolve a question.' };
  }

  if (!filePath) {
    const discovered = await discoverFilesWithOpenQuestions();
    if (discovered.length === 0) {
      return { success: false, output: 'No files with unresolved open questions found.' };
    }

    if (section) {
      const match = discovered.find(d =>
        d.questions.some(q => q.sectionHeading.toLowerCase().includes(section.toLowerCase()))
      );
      if (match) {
        filePath = match.path;
      } else {
        return {
          success: false,
          output: `No open questions section matching "${section}" found. Use /resolve-question --list to see all.`,
        };
      }
    } else {
      filePath = discovered[0].path;
    }
  }

  const sectionMatch = section ?? '';
  const result = await resolveQuestionInFile(filePath, sectionMatch, questionNumber, decision);

  const output: string[] = [
    `# Resolve Question #${questionNumber}`,
    '',
    result.message,
  ];

  if (result.success && result.filePath) {
    output.push('', `Updated file: \`${result.filePath}\``);
  }

  return { success: result.success, output: output.join('\n') };
}
