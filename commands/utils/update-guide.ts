/**
 * Atomic Command: /update-guide
 * Update session guide with instructions, patterns, or architectural notes
 * Used for adding reusable patterns, editing advice, or code-reuse suggestions
 * 
 * @param update Guide update specification
 * @param sessionId Optional session ID (X.Y format). If provided, updates session-specific guide.
 *                  If not provided, updates template guide for backward compatibility.
 * @param featureName Optional feature name (defaults to "vue-migration" for backward compatibility)
 */

import { WorkflowCommandContext } from './command-context';

export interface GuideUpdate {
  section: string; // Section to update (e.g., "Patterns", "Architecture Notes")
  content: string; // Content to add
  append?: boolean; // If true, append to section; if false, replace section
}

export async function updateGuide(
  update: GuideUpdate,
  sessionId?: string,
  featureName: string = 'vue-migration'
): Promise<void> {
  const context = new WorkflowCommandContext(featureName);

  if (sessionId) {
    // Update session-specific guide
    await context.documents.updateSection(
      'session',
      sessionId,
      update.section,
      update.content,
      update.append ?? false
    );
  } else {
    // For backward compatibility, try to update template guide
    // Note: This is unusual - typically guides are feature/session-specific
    // This maintains backward compatibility with old behavior
    try {
      const templatePath = context.paths.getTemplatePath('session', 'guide');
      const templateContent = await context.templates.loadTemplate('session', 'guide');
      
      // Use markdown utils to update template
      const { MarkdownUtils } = await import('./markdown-utils');
      const updatedContent = update.append
        ? MarkdownUtils.appendToSection(templateContent, update.section, update.content)
        : MarkdownUtils.replaceSection(templateContent, update.section, update.content);
      
      // Write back to template (this is unusual - consider deprecating)
      const { writeFile } = await import('fs/promises');
      const { join } = await import('path');
      const PROJECT_ROOT = process.cwd();
      await writeFile(join(PROJECT_ROOT, templatePath), updatedContent, 'utf-8');
      context.cache.invalidate(templatePath);
    } catch (error) {
      throw new Error(
        `ERROR: Could not update guide\n` +
        `Session ID: ${sessionId || 'none (template)'}\n` +
        `Error: ${error instanceof Error ? error.message : String(error)}\n` +
        `Suggestion: Provide sessionId to update session-specific guide`
      );
    }
  }
}

