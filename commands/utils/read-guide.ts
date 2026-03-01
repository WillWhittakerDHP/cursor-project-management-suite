/**
 * Atomic Command: /read-guide
 * Read and display relevant sections from session guide
 * 
 * @param sessionId Optional session ID (X.Y format). If provided, reads session-specific guide.
 *                  If not provided, reads template guide.
 * @param featureName Optional: resolved from .current-feature or git branch
 */

import { WorkflowCommandContext } from './command-context';
import { MarkdownUtils } from './markdown-utils';
import { resolveFeatureName } from './feature-context';
import { WorkflowId } from './id-utils';

function extractSessionTaskBlocks(guideContent: string, sessionId: string): string[] {
  const escaped = sessionId.replace(/\./g, '\\.');
  const pattern = new RegExp(
    `(?:-\\s*\\[[ x]\\]\\s*)?(?:####|###)\\s*Task\\s+${escaped}\\.\\d+:[\\s\\S]*?(?=(?:\\n(?:-\\s*\\[[ x]\\]\\s*)?(?:####|###)\\s*Task\\s+${escaped}\\.\\d+:)|\\n##\\s+|\\n#\\s+|$)`,
    'gi'
  );
  const matches = guideContent.match(pattern);
  if (!matches) return [];
  return matches.map(m => m.trim()).filter(Boolean);
}

function extractPhaseSessionEntry(phaseGuide: string, sessionId: string): string {
  const escaped = sessionId.replace(/\./g, '\\.');
  const pattern = new RegExp(
    `(?:-\\s*\\[[ x]\\]\\s*)?###\\s*Session\\s+${escaped}:[\\s\\S]*?(?=(?:\\n(?:-\\s*\\[[ x]\\]\\s*)?###\\s*Session\\s+\\d+\\.\\d+\\.\\d+:)|\\n##\\s+|\\n#\\s+|$)`,
    'i'
  );
  return phaseGuide.match(pattern)?.[0]?.trim() ?? '';
}

function buildSessionSpecificGuideOutput(
  guideContent: string,
  templateContent: string,
  sessionId: string
): string {
  const output: string[] = ['# Session Guide - Session-Specific Context', ''];

  const sessionOverview = MarkdownUtils.extractSection(guideContent, 'Session Overview');
  if (sessionOverview) {
    output.push(sessionOverview, '');
  }

  const sessionObjectives = MarkdownUtils.extractSection(guideContent, 'Session Objectives');
  if (sessionObjectives) {
    output.push(sessionObjectives, '');
  }

  const taskBlocks = extractSessionTaskBlocks(guideContent, sessionId);
  if (taskBlocks.length > 0) {
    output.push(`## Tasks for Session ${sessionId}`, '', ...taskBlocks, '');
  } else {
    output.push(`## Tasks for Session ${sessionId}`, '', '**Warning:** No session-specific task sections found in session guide.', '');
  }

  const fallbackSections = ['Learning Checkpoints', 'Task Template'];
  for (const section of fallbackSections) {
    let sectionContent = MarkdownUtils.extractSection(guideContent, section);
    let source = 'session guide';
    if (!sectionContent && templateContent) {
      sectionContent = MarkdownUtils.extractSection(templateContent, section);
      source = 'template (fallback)';
    }
    if (sectionContent) {
      output.push(sectionContent, '');
      if (source === 'template (fallback)') {
        output.push('*[Note: Section extracted from template - consider adding to session guide]*', '');
      }
    }
  }

  return output.join('\n');
}

export async function readGuide(
  sessionId?: string,
  featureName?: string
): Promise<string> {
  const resolved = await resolveFeatureName(featureName);
  const context = new WorkflowCommandContext(resolved);
  
  let guideContent: string;
  let usingTemplate = false;
  
  // Read guide content
  if (sessionId) {
    try {
      guideContent = await context.readSessionGuide(sessionId);
    } catch (_error) {
      // Session-specific guide doesn't exist - fail explicitly
      const attemptedPath = context.paths.getSessionGuidePath(sessionId);
      throw new Error(
        `ERROR: Session-specific guide not found\n` +
        `Attempted: ${attemptedPath}\n` +
        `Expected: Session-specific guide file for session ${sessionId}\n` +
        `Suggestion: Create the file at ${attemptedPath} or use template guide explicitly by omitting sessionId`
      );
    }
  } else {
    // No session ID specified, use template guide
    try {
      guideContent = await context.templates.loadTemplate('session', 'guide');
      usingTemplate = true;
    } catch (_error) {
      throw new Error(
        `ERROR: Template guide not found\n` +
        `Attempted: ${context.paths.getTemplatePath('session', 'guide')}\n` +
        `Error: ${_error instanceof Error ? _error.message : String(_error)}`
      );
    }
  }
  
  // Always load template guide for fallback
  let templateContent = '';
  try {
    templateContent = await context.templates.loadTemplate('session', 'guide');
  } catch (_error) {
    // Template not found - log warning but continue with session guide only
    console.warn(
      `WARNING: Template guide not found for fallback\n` +
      `Attempted: ${context.paths.getTemplatePath('session', 'guide')}\n` +
      `Error: ${_error instanceof Error ? _error.message : String(_error)}\n`
    );
  }
  
  if (usingTemplate) {
    const output: string[] = [
      '# Session Guide - Key Sections',
      '',
      '**Note:** Using template guide. Create session-specific guide for custom content.',
      '',
    ];
    const sections = ['Session Structure', 'Learning Checkpoints', 'Task Template'];
    for (const section of sections) {
      const sectionContent = MarkdownUtils.extractSection(guideContent, section);
      if (sectionContent) output.push(sectionContent, '');
    }
    return output.join('\n');
  }

  if (sessionId) {
    const parsed = WorkflowId.parseSessionId(sessionId);
    let phaseContext = '';
    if (parsed) {
      try {
        const phaseGuide = await context.readPhaseGuide(parsed.phaseId);
        const phaseSessionEntry = extractPhaseSessionEntry(phaseGuide, sessionId);
        if (phaseSessionEntry) {
          phaseContext = `## Phase Guide Context\n\n${phaseSessionEntry}\n`;
        }
      } catch {
        // Non-blocking: phase context may be absent.
      }
    }

    const sessionSpecific = buildSessionSpecificGuideOutput(guideContent, templateContent, sessionId);
    return [sessionSpecific, phaseContext].filter(Boolean).join('\n');
  }

  return guideContent;
}

