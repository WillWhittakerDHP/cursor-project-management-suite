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

/**
 * Document tier types
 */
export type DocumentTier = 'feature' | 'phase' | 'session';

/**
 * Document type types
 */
export type DocumentType = 'guide' | 'log' | 'handoff';

/**
 * Template replacements map
 */
export type TemplateReplacements = Record<string, string>;

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
   * Read handoff document
   * @param tier Document tier
   * @param id Optional ID (phase number, session ID, etc.)
   * @returns Document content
   */
  async readHandoff(tier: DocumentTier, id?: string): Promise<string> {
    const path = this.getDocumentPath(tier, id, 'handoff');
    return this.readFile(path);
  }

  /**
   * Write guide document
   * @param tier Document tier
   * @param id Document ID (required for phase/session, optional for feature)
   * @param content Document content
   */
  async writeGuide(tier: DocumentTier, id: string | undefined, content: string): Promise<void> {
    const path = this.getDocumentPath(tier, id, 'guide');
    await this.writeFile(path, content);
  }

  /**
   * Append to log document
   * @param tier Document tier
   * @param id Document ID (required for phase/session, optional for feature)
   * @param content Content to append
   */
  async appendLog(tier: DocumentTier, id: string | undefined, content: string): Promise<void> {
    const path = this.getDocumentPath(tier, id, 'log');
    
    // Read existing content
    let existingContent = '';
    try {
      existingContent = await this.readFile(path);
    } catch (err) {
      console.warn('Document manager: readFile failed (file may not exist)', path, err);
      existingContent = '';
    }

    // Append new content
    const newContent = existingContent + (existingContent ? '\n\n' : '') + content;
    await this.writeFile(path, newContent);
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
   * Write file and invalidate cache
   * @private
   */
  private async writeFile(path: string, content: string): Promise<void> {
    const fullPath = join(this.PROJECT_ROOT, path);
    await writeFile(fullPath, content, 'utf-8');
    
    // Invalidate cache for this file
    this.cache.invalidate(path);
  }
}

