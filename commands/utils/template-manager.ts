/**
 * Template Manager
 * 
 * Centralizes template loading and rendering.
 * Implements caching to avoid redundant file reads.
 * 
 * LEARNING: Template management separates content structure from data
 * WHY: Templates provide consistent document structure while allowing customization
 * PATTERN: Manager class with caching for performance optimization
 */

import { WorkflowPathResolver } from './path-resolver';
import { FeatureContext } from './feature-context';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { access } from 'fs/promises';
import { readdir } from 'fs/promises';

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
 * TemplateManager class
 * 
 * Manages template loading, caching, and rendering.
 */
export class TemplateManager {
  private readonly paths: WorkflowPathResolver;
  private readonly cache: Map<string, string> = new Map();
  private readonly PROJECT_ROOT = process.cwd();

  /**
   * Create a new template manager
   * @param context Feature context (provides path resolver)
   */
  constructor(context: FeatureContext) {
    this.paths = context.paths;
  }

  /**
   * Load template from disk
   * 
   * Templates are cached after first load to improve performance.
   * 
   * @param tier Document tier
   * @param docType Document type
   * @param forceRefresh If true, bypass cache and reload from disk
   * @returns Template content
   */
  async loadTemplate(
    tier: DocumentTier,
    docType: DocumentType,
    forceRefresh: boolean = false
  ): Promise<string> {
    const templatePath = this.paths.getTemplatePath(tier, docType);
    const cacheKey = `${tier}-${docType}`;

    // Check cache
    if (!forceRefresh && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Load from disk
    const fullPath = join(this.PROJECT_ROOT, templatePath);
    
    try {
      await access(fullPath);
      const content = await readFile(fullPath, 'utf-8');
      
      // Cache template
      this.cache.set(cacheKey, content);
      
      return content;
    } catch (_error) {
      throw new Error(
        `Template not found: ${templatePath}\n` +
        `Full path: ${fullPath}\n` +
        `Error: ${_error instanceof Error ? _error.message : String(_error)}`
      );
    }
  }

  /**
   * Render template with replacements
   * 
   * Replaces placeholders in format [PLACEHOLDER] with values from replacements map.
   * 
   * @param template Template content
   * @param replacements Map of placeholder names to values
   * @returns Rendered template content
   */
  render(template: string, replacements: TemplateReplacements): string {
    let rendered = template;

    // Replace all placeholders in format [PLACEHOLDER]
    for (const [key, value] of Object.entries(replacements)) {
      const placeholder = `[${key.toUpperCase()}]`;
      rendered = rendered.replace(new RegExp(placeholder, 'g'), value);
    }

    return rendered;
  }

  /**
   * Create document from template
   * 
   * Loads template, renders with replacements, and optionally writes to file.
   * 
   * @param tier Document tier
   * @param id Document ID (phase number, session ID, etc.)
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
    // Load template
    const template = await this.loadTemplate(tier, docType);

    // Render with replacements
    return this.render(template, replacements);
  }

  /**
   * List available templates
   * 
   * Scans tier template directories and returns list of available templates.
   * 
   * @returns Array of template identifiers (e.g., ["feature-guide", "session-log"])
   */
  async listTemplates(): Promise<string[]> {
    const templates: string[] = [];
    const tierDirs = [
      join(this.PROJECT_ROOT, '.cursor/commands/tiers/feature/templates'),
      join(this.PROJECT_ROOT, '.cursor/commands/tiers/phase/templates'),
      join(this.PROJECT_ROOT, '.cursor/commands/tiers/session/templates'),
    ];

    for (const templatesDir of tierDirs) {
      try {
        const files = await readdir(templatesDir);
        
        for (const file of files) {
          if (file.endsWith('.md')) {
            // Extract template identifier (e.g., "session-guide.md" -> "session-guide")
            const identifier = file.replace(/\.md$/, '');
            templates.push(identifier);
          }
        }
      } catch (_error) {
        // Templates directory doesn't exist or can't be read - skip
        console.warn(
          `WARNING: Could not list templates from ${templatesDir}\n` +
          `Error: ${_error instanceof Error ? _error.message : String(_error)}`
        );
      }
    }

    return templates.sort();
  }

  /**
   * Clear template cache
   * 
   * Useful for testing or when templates are updated.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Invalidate specific template in cache
   * @param tier Document tier
   * @param docType Document type
   */
  invalidateTemplate(tier: DocumentTier, docType: DocumentType): void {
    const cacheKey = `${tier}-${docType}`;
    this.cache.delete(cacheKey);
  }
}

