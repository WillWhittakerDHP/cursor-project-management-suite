/**
 * Document Manager
 * 
 * Unified API for all document operations.
 * Provides read, write, section manipulation, and template operations.
 * 
 * LEARNING: Unified APIs simplify complex operations and reduce code duplication
 * WHY: Scattered file operations make code harder to maintain and test
 * PATTERN: Facade pattern providing simplified interface to complex subsystem
 */

import { FeatureContext } from './feature-context';
import { MarkdownUtils } from './markdown-utils';
import { TemplateManager } from './template-manager';
import { FileCache } from './file-cache';
import { WorkflowId } from './id-utils';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { access } from 'fs/promises';
import { writeProjectFile } from './utils';
import {
  isProjectManagerProtectedPath,
  type ShouldBlockProjectManagerWriteOptions,
} from './project-manager-write-guard';
import {
  REQUIRED_GUIDE_SECTIONS,
  REQUIRED_HANDOFF_SECTIONS,
  ensureGuideHasRequiredSections,
  ensureHandoffHasRequiredSections,
  type GuideTier,
  type HandoffTierForSections,
} from '../tiers/shared/guide-required-sections';
import { resolvePlanningDocRelativePath } from './planning-doc-paths';
import type { PlanningTier } from './planning-doc-paths';

export type { PlanningTier } from './planning-doc-paths';

/**
 * Document tier types
 */
export type DocumentTier = 'feature' | 'phase' | 'session';

/**
 * Handoff tier: feature, phase, session, or task (task has handoff but no guide/log).
 */
export type HandoffTier = DocumentTier | 'task';

/**
 * Document type types
 */
export type DocumentType = 'guide' | 'log' | 'handoff';

/**
 * Result of document verification (guide or handoff).
 */
export interface DocVerifyResult {
  ok: boolean;
  missingSections: string[];
  shortSections: string[];
  path: string;
}

/**
 * Thrown when verifyGuide or verifyHandoff fails (strict enforcement).
 */
export class DocVerifyError extends Error {
  constructor(public readonly result: DocVerifyResult) {
    super(
      `Document verification failed: ${result.path} missing [${result.missingSections.join(', ')}]${result.shortSections.length ? ` short [${result.shortSections.join(', ')}]` : ''}`
    );
    this.name = 'DocVerifyError';
  }
}

/**
 * Template replacements map
 */
export type TemplateReplacements = Record<string, string>;

const EXCERPT_SESSION_MARKER = '<!-- end excerpt session -->';

/** First line that looks like a session log task heading (### / #### Task X.Y.Z:). */
function extractFirstTaskLogHeadingLine(content: string): string | null {
  const lines = content.split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (/^#{2,4}\s+Task\s+[\d.]+\s*:/.test(t)) {
      return line.trimEnd();
    }
  }
  return null;
}

function headingPrefixLength(line: string): number {
  const m = line.match(/^(\s*)(#+)\s/);
  return m ? m[2].length : 99;
}

/**
 * Replace the block starting at headingLine, or append if not found.
 * Block ends at the next line whose # prefix length is <= that of the task heading.
 */
function upsertMarkdownBlockByHeading(
  existing: string,
  headingLine: string,
  newBlock: string
): string {
  const lines = existing.split('\n');
  const startLevel = headingPrefixLength(headingLine);
  const normalizedHeading = headingLine.trim();
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === normalizedHeading || lines[i].trimEnd() === normalizedHeading) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) {
    const sep = existing.trim() ? '\n\n' : '';
    return `${existing}${sep}${newBlock}`.trimEnd();
  }
  let endIdx = lines.length;
  for (let j = startIdx + 1; j < lines.length; j++) {
    const line = lines[j];
    if (/^\s*#+\s/.test(line)) {
      const lvl = headingPrefixLength(line);
      if (lvl <= startLevel) {
        endIdx = j;
        break;
      }
    }
  }
  const before = lines.slice(0, startIdx).join('\n');
  const after = lines.slice(endIdx).join('\n');
  const mid = newBlock.trimEnd();
  return [before.trimEnd(), mid, after.trimStart()].filter(Boolean).join('\n\n').trimEnd();
}

function dedupeFirstLevel2Section(content: string, sectionTitle: string): string {
  const lines = content.split('\n');
  const re = new RegExp(`^##\\s+${sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
  const out: string[] = [];
  let seen = false;
  let skipping = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().match(/^##\s+/) && re.test(line.trim())) {
      if (seen) {
        skipping = true;
        continue;
      }
      seen = true;
      skipping = false;
      out.push(line);
      continue;
    }
    if (skipping) {
      if (line.trim().match(/^##\s+/)) {
        skipping = false;
        out.push(line);
      }
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

function dedupeExcerptSessionMarkers(content: string): string {
  const lines = content.split('\n');
  const out: string[] = [];
  let kept = false;
  for (const line of lines) {
    if (line.trim() === EXCERPT_SESSION_MARKER) {
      if (!kept) {
        out.push(line);
        kept = true;
      }
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

function normalizeSessionLogAfterAppend(content: string): string {
  let c = dedupeExcerptSessionMarkers(content);
  c = dedupeFirstLevel2Section(c, 'Test Status');
  c = dedupeFirstLevel2Section(c, 'Completed Tasks');
  return c;
}

/**
 * DocumentManager class
 * 
 * Provides unified API for all document operations.
 * Integrates path resolution, caching, markdown manipulation, and template management.
 */
export class DocumentManager {
  private readonly context: FeatureContext;
  private readonly markdown: typeof MarkdownUtils;
  private readonly templates: TemplateManager;
  private readonly cache: FileCache;
  private readonly PROJECT_ROOT = process.cwd();

  /**
   * Create a new document manager
   * @param context Feature context
   * @param cache Optional file cache (creates new one if not provided)
   */
  constructor(context: FeatureContext, cache?: FileCache) {
    this.context = context;
    this.markdown = MarkdownUtils;
    this.templates = new TemplateManager(context);
    this.cache = cache || new FileCache();
  }

  /**
   * Read guide document
   * @param tier Document tier
   * @param id Optional ID (phase number, session ID, etc.)
   * @returns Document content
   */
  async readGuide(tier: DocumentTier, id?: string): Promise<string> {
    const path = this.getDocumentPath(tier, id, 'guide');
    return this.readFile(path);
  }

  /**
   * Read log document
   * @param tier Document tier
   * @param id Optional ID (phase number, session ID, etc.)
   * @returns Document content
   */
  async readLog(tier: DocumentTier, id?: string): Promise<string> {
    const path = this.getDocumentPath(tier, id, 'log');
    return this.readFile(path);
  }

  /**
   * Read handoff document (feature, phase, session, or task).
   * @param tier Handoff tier (DocumentTier or 'task')
   * @param id Optional ID (phase number, session ID, task ID)
   * @returns Document content
   */
  async readHandoff(tier: HandoffTier, id?: string): Promise<string> {
    const path = this.getHandoffPath(tier, id);
    return this.readFile(path);
  }

  /**
   * Project-relative path to planning doc for tier + id (canonical; replaces ad-hoc path assembly).
   */
  getPlanningDocRelativePath(tier: PlanningTier, id: string): string {
    return resolvePlanningDocRelativePath(this.context.paths.getBasePath(), tier, id);
  }

  async readPlanningDoc(tier: PlanningTier, id: string): Promise<string> {
    const path = this.getPlanningDocRelativePath(tier, id);
    return this.readFile(path);
  }

  /** @returns true if the file was written; false if the write guard blocked it. */
  async writePlanningDoc(
    tier: PlanningTier,
    id: string,
    content: string,
    options?: ShouldBlockProjectManagerWriteOptions
  ): Promise<boolean> {
    const path = this.getPlanningDocRelativePath(tier, id);
    return this.writeFile(path, content, options);
  }

  /**
   * True if the tier planning file exists on disk (same path as {@link readPlanningDoc}).
   * Prefer this over try/catch around `readPlanningDoc` when branching on presence.
   */
  async planningDocExists(tier: PlanningTier, id: string): Promise<boolean> {
    return this.projectFileExists(this.getPlanningDocRelativePath(tier, id));
  }

  async guideExists(tier: DocumentTier, id?: string): Promise<boolean> {
    return this.projectFileExists(this.getDocumentPath(tier, id, 'guide'));
  }

  /**
   * Write guide document, then verify (throws DocVerifyError if verification fails).
   * If the write guard blocks the write, verification is skipped (the on-disk content
   * was not changed, so verifying stale content would produce misleading errors).
   * @param tier Document tier
   * @param id Document ID (required for phase/session, optional for feature)
   * @param content Document content (must be structurally valid for verification to pass)
   * @param options Optional; use overwriteForTierEnd for tier-end workflow (e.g. task-end, phase complete)
   */
  async writeGuide(
    tier: DocumentTier,
    id: string | undefined,
    content: string,
    options?: ShouldBlockProjectManagerWriteOptions
  ): Promise<void> {
    const path = this.getDocumentPath(tier, id, 'guide');
    const written = await this.writeFile(path, content, options);
    if (!written) {
      console.warn(`[DocumentManager] writeGuide blocked by guard for ${path} — skipping verification`);
      return;
    }
    const result = await this.verifyGuide(tier, id);
    if (!result.ok) {
      throw new DocVerifyError(result);
    }
  }

  /**
   * Ensure guide exists: create from template with required sections if missing; otherwise ensure sections and write only if changed.
   * @param tier Document tier
   * @param id Document ID (required for phase/session, optional for feature)
   * @param description Display name for minimal section content
   */
  async ensureGuide(tier: DocumentTier, id: string | undefined, description: string): Promise<void> {
    const path = this.getDocumentPath(tier, id, 'guide');
    let content: string;
    try {
      content = await this.readFile(path);
    } catch {
      const template = await this.templates.loadTemplate(tier, 'guide');
      const replacements: TemplateReplacements = {
        DESCRIPTION: description,
        NAME: description,
        DATE: new Date().toISOString().split('T')[0],
        ...(tier === 'feature' ? { FEATURE_NAME: this.context.name } : {}),
        ...(id ? { IDENTIFIER: id, N: id, SESSION_ID: id, PHASE: id.split('.').slice(0, 2).join('.') } : {}),
      };
      content = this.templates.render(template, replacements);
      content = ensureGuideHasRequiredSections(content, tier as GuideTier, id ?? '', description);
      await this.writeGuide(tier, id, content);
      return;
    }
    const normalized = ensureGuideHasRequiredSections(content, tier as GuideTier, id ?? '', description);
    if (normalized !== content) {
      await this.writeGuide(tier, id, normalized);
    }
  }

  /**
   * Update guide: read, apply updater, write (with verification).
   * @param tier Document tier
   * @param id Document ID
   * @param updater Function that returns updated content (sync or async)
   * @param options Optional; use overwriteForTierEnd for tier-end workflow (e.g. task-end, phase complete)
   */
  async updateGuide(
    tier: DocumentTier,
    id: string | undefined,
    updater: (content: string) => string | Promise<string>,
    options?: ShouldBlockProjectManagerWriteOptions
  ): Promise<void> {
    const path = this.getDocumentPath(tier, id, 'guide');
    const content = await this.readFile(path);
    const updated = await updater(content);
    await this.writeGuide(tier, id, updated, options);
  }

  /**
   * Verify guide has all REQUIRED_GUIDE_SECTIONS with sufficient content. Returns result and throws DocVerifyError if not ok.
   */
  async verifyGuide(tier: DocumentTier, id?: string): Promise<DocVerifyResult> {
    const path = this.getDocumentPath(tier, id, 'guide');
    let content: string;
    try {
      content = await this.readFile(path);
    } catch {
      const result: DocVerifyResult = {
        ok: false,
        missingSections: [...REQUIRED_GUIDE_SECTIONS[tier]],
        shortSections: [],
        path,
      };
      throw new DocVerifyError(result);
    }
    const sections = REQUIRED_GUIDE_SECTIONS[tier];
    const missingSections: string[] = [];
    const shortSections: string[] = [];
    const MIN_LENGTH = 30;
    for (const sectionTitle of sections) {
      const sectionContent = this.markdown.extractSection(content, sectionTitle);
      if (!sectionContent || sectionContent.trim().length === 0) {
        missingSections.push(sectionTitle);
      } else if (sectionContent.trim().length < MIN_LENGTH) {
        shortSections.push(sectionTitle);
      }
    }
    const ok = missingSections.length === 0 && shortSections.length === 0;
    const result: DocVerifyResult = { ok, missingSections, shortSections, path };
    if (!ok) {
      throw new DocVerifyError(result);
    }
    return result;
  }

  /**
   * Write handoff document, then verify (throws DocVerifyError if verification fails). Task handoffs skip verification.
   */
  async writeHandoff(tier: HandoffTier, id: string | undefined, content: string): Promise<void> {
    const path = this.getHandoffPath(tier, id);
    await this.writeFile(path, content);
    const result = await this.verifyHandoff(tier, id);
    if (!result.ok) {
      throw new DocVerifyError(result);
    }
  }

  /**
   * True if project-relative path exists (.project-manager/… or legacy project-manager/…).
   * Silent — used by ensureHandoff so first-run create does not log spurious readFile warnings.
   */
  private async projectFileExists(projectRelativePath: string): Promise<boolean> {
    const existsAt = async (rel: string): Promise<boolean> => {
      try {
        await access(join(this.PROJECT_ROOT, rel));
        return true;
      } catch {
        return false;
      }
    };
    if (await existsAt(projectRelativePath)) return true;
    if (projectRelativePath.startsWith('.project-manager/')) {
      const fallback = projectRelativePath.replace('.project-manager/', 'project-manager/');
      return existsAt(fallback);
    }
    return false;
  }

  /**
   * Ensure handoff exists: create from template with required sections if missing. Task: create minimal file if missing (no template).
   */
  async ensureHandoff(tier: HandoffTier, id: string | undefined, description?: string): Promise<void> {
    const path = this.getHandoffPath(tier, id);
    if (await this.projectFileExists(path)) {
      await this.readFile(path);
      return;
    }
    const desc = description ?? id ?? '';
    if (tier === 'task') {
      await this.writeFile(path, `# Task ${id} handoff\n\n**Status:** [Fill in]\n\n`);
      return;
    }
    const template = await this.templates.loadTemplate(tier, 'handoff');
    const replacements: TemplateReplacements = {
      DESCRIPTION: desc,
      DATE: new Date().toISOString().split('T')[0],
      ...(id ? { IDENTIFIER: id, SESSION_ID: id, PHASE: id.split('.').slice(0, 2).join('.') } : {}),
    };
    let content = this.templates.render(template, replacements);
    content = ensureHandoffHasRequiredSections(content, tier as HandoffTierForSections, id ?? '', desc);
    await this.writeFile(path, content);
    const result = await this.verifyHandoff(tier, id);
    if (!result.ok) {
      throw new DocVerifyError(result);
    }
  }

  /**
   * Update handoff: read, apply updater, write (with verification). Task handoffs skip section verification.
   */
  async updateHandoff(
    tier: HandoffTier,
    id: string | undefined,
    updater: (content: string) => string | Promise<string>
  ): Promise<void> {
    const path = this.getHandoffPath(tier, id);
    const content = await this.readFile(path);
    const updated = await updater(content);
    await this.writeFile(path, updated);
    const result = await this.verifyHandoff(tier, id);
    if (!result.ok) {
      throw new DocVerifyError(result);
    }
  }

  /**
   * Verify handoff has all REQUIRED_HANDOFF_SECTIONS. Task handoffs skip verification (return ok: true).
   */
  async verifyHandoff(tier: HandoffTier, id?: string): Promise<DocVerifyResult> {
    const path = this.getHandoffPath(tier, id);
    if (tier === 'task') {
      return { ok: true, missingSections: [], shortSections: [], path };
    }
    let content: string;
    try {
      content = await this.readFile(path);
    } catch {
      const result: DocVerifyResult = {
        ok: false,
        missingSections: [...REQUIRED_HANDOFF_SECTIONS],
        shortSections: [],
        path,
      };
      throw new DocVerifyError(result);
    }
    const missingSections: string[] = [];
    const shortSections: string[] = [];
    const MIN_LENGTH = 30;
    for (const sectionTitle of REQUIRED_HANDOFF_SECTIONS) {
      const sectionContent = this.markdown.extractSection(content, sectionTitle);
      if (!sectionContent || sectionContent.trim().length === 0) {
        missingSections.push(sectionTitle);
      } else if (sectionContent.trim().length < MIN_LENGTH) {
        shortSections.push(sectionTitle);
      }
    }
    const ok = missingSections.length === 0 && shortSections.length === 0;
    const result: DocVerifyResult = { ok, missingSections, shortSections, path };
    if (!ok) {
      throw new DocVerifyError(result);
    }
    return result;
  }

  /**
   * Append to log document
   * @param tier Document tier
   * @param id Document ID (required for phase/session, optional for feature)
   * @param content Content to append
   */
  async appendLog(tier: DocumentTier, id: string | undefined, content: string): Promise<void> {
    const path = this.getDocumentPath(tier, id, 'log');

    let existingContent = '';
    try {
      existingContent = await this.readFile(path);
    } catch (err) {
      console.warn('Document manager: readFile failed (file may not exist)', path, err);
      existingContent = '';
    }

    const taskHeading = extractFirstTaskLogHeadingLine(content);
    let merged: string;
    if (taskHeading) {
      merged = upsertMarkdownBlockByHeading(existingContent, taskHeading, content);
    } else {
      merged = existingContent + (existingContent ? '\n\n' : '') + content;
    }
    merged = normalizeSessionLogAfterAppend(merged);
    await this.writeFile(path, merged);
  }

  /**
   * Re-apply the same markdown normalization as {@link appendLog} to an existing feature/phase/session log
   * (dedupe `<!-- end excerpt session -->`, duplicate `## Test Status`, duplicate `## Completed Tasks`).
   * Use to repair logs that accumulated duplicates before idempotent `appendLog` behavior existed.
   * @returns Whether the file was rewritten and its project-relative path.
   */
  async coalesceLogNormalization(
    tier: DocumentTier,
    id: string | undefined
  ): Promise<{ changed: boolean; path: string }> {
    const path = this.getDocumentPath(tier, id, 'log');
    let raw = '';
    try {
      raw = await this.readFile(path);
    } catch {
      return { changed: false, path };
    }
    const normalized = normalizeSessionLogAfterAppend(raw);
    if (normalized === raw) {
      return { changed: false, path };
    }
    const written = await this.writeFile(path, normalized);
    if (!written) {
      console.warn('[DocumentManager] coalesceLogNormalization: write blocked by guard', path);
      return { changed: false, path };
    }
    return { changed: true, path };
  }

  /**
   * Read specific section from document
   * @param tier Document tier
   * @param id Document ID
   * @param sectionTitle Section title to extract
   * @returns Section content
   */
  async readSection(
    tier: DocumentTier,
    id: string | undefined,
    sectionTitle: string
  ): Promise<string> {
    const docType = 'guide'; // Sections are typically in guides
    const path = this.getDocumentPath(tier, id, docType);
    const content = await this.readFile(path);
    return this.markdown.extractSection(content, sectionTitle);
  }

  /**
   * Update section in document
   * @param tier Document tier
   * @param id Document ID
   * @param sectionTitle Section title to update
   * @param content New section content
   * @param append If true, append to section instead of replacing
   */
  async updateSection(
    tier: DocumentTier,
    id: string | undefined,
    sectionTitle: string,
    content: string,
    append: boolean = false
  ): Promise<void> {
    const docType = 'guide'; // Sections are typically in guides
    const path = this.getDocumentPath(tier, id, docType);
    const fullContent = await this.readFile(path);

    // Update section
    const updatedContent = append
      ? this.markdown.appendToSection(fullContent, sectionTitle, content)
      : this.markdown.replaceSection(fullContent, sectionTitle, content);

    // Write back
    await this.writeFile(path, updatedContent);
  }

  /**
   * Load template
   * @param tier Document tier
   * @param docType Document type
   * @returns Template content
   */
  async loadTemplate(tier: DocumentTier, docType: DocumentType): Promise<string> {
    return this.templates.loadTemplate(tier, docType);
  }

  /**
   * Create document from template
   * @param tier Document tier
   * @param id Document ID
   * @param docType Document type
   * @param replacements Template replacements
   * @returns Rendered document content
   */
  async createFromTemplate(
    tier: DocumentTier,
    id: string | undefined,
    docType: DocumentType,
    replacements: TemplateReplacements
  ): Promise<string> {
    return this.templates.createFromTemplate(tier, id, docType, replacements);
  }

  /**
   * Get document path for tier and ID
   * @private
   */
  private getDocumentPath(tier: DocumentTier, id: string | undefined, docType: DocumentType): string {
    const paths = this.context.paths;

    switch (tier) {
      case 'feature':
        switch (docType) {
          case 'guide':
            return paths.getFeatureGuidePath();
          case 'log':
            return paths.getFeatureLogPath();
          case 'handoff':
            return paths.getFeatureHandoffPath();
        }
        break;

      case 'phase':
        if (!id) {
          throw new Error('Phase ID is required for phase documents');
        }
        switch (docType) {
          case 'guide':
            return paths.getPhaseGuidePath(id);
          case 'log':
            return paths.getPhaseLogPath(id);
          case 'handoff':
            return paths.getPhaseHandoffPath(id);
        }
        break;

      case 'session':
        if (!id) {
          throw new Error('Session ID is required for session documents');
        }
        if (!WorkflowId.isValidSessionId(id)) {
          throw new Error(`Invalid session ID format: ${id}. Expected format: X.Y.Z`);
        }
        switch (docType) {
          case 'guide':
            return paths.getSessionGuidePath(id);
          case 'log':
            return paths.getSessionLogPath(id);
          case 'handoff':
            return paths.getSessionHandoffPath(id);
        }
        break;
    }
    throw new Error(`Unsupported tier/docType: ${tier}/${docType}`);
  }

  /**
   * Get handoff path for HandoffTier (includes task).
   * @private
   */
  private getHandoffPath(tier: HandoffTier, id: string | undefined): string {
    if (tier === 'task') {
      if (!id) throw new Error('Task ID is required for task handoff');
      return this.context.paths.getTaskHandoffPath(id);
    }
    return this.getDocumentPath(tier, id, 'handoff');
  }

  /**
   * Read file with caching
   * Falls back to project-manager/ if file not found in .project-manager/
   * @private
   */
  private async readFile(path: string): Promise<string> {
    return this.cache.get(path, false, async (filePath: string) => {
      // Try .project-manager/ location first
      let fullPath = join(this.PROJECT_ROOT, filePath);
      try {
        await access(fullPath);
        return await readFile(fullPath, 'utf-8');
      } catch (err) {
        console.warn('Document manager: primary path not found, trying fallback', filePath, err);
        if (filePath.startsWith('.project-manager/')) {
          const fallbackPath = filePath.replace('.project-manager/', 'project-manager/');
          fullPath = join(this.PROJECT_ROOT, fallbackPath);
          try {
            await access(fullPath);
            return await readFile(fullPath, 'utf-8');
          } catch (fallbackErr) {
            console.warn('Document manager: fallback path also failed', fallbackPath, fallbackErr);
            throw new Error(`File not found: ${filePath} or ${fallbackPath}`);
          }
        }
        throw new Error(`File not found: ${filePath}`);
      }
    });
  }

  /**
   * Write file and invalidate cache.
   * Protected paths (guides/planning under .project-manager) go through writeProjectFile for guard and audit.
   * @returns true if the file was written; false if the write guard blocked it.
   * @private
   */
  private async writeFile(
    path: string,
    content: string,
    options?: ShouldBlockProjectManagerWriteOptions
  ): Promise<boolean> {
    let written = true;
    if (isProjectManagerProtectedPath(path)) {
      written = await writeProjectFile(path, content, options);
    } else {
      const fullPath = join(this.PROJECT_ROOT, path);
      await writeFile(fullPath, content, 'utf-8');
    }
    this.cache.invalidate(path);
    return written;
  }
}

