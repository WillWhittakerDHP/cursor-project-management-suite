/**
 * Unified Command Context
 * 
 * Single entry point providing all utilities to commands.
 * Simplifies command implementation by providing pre-configured utilities.
 * 
 * LEARNING: Context objects reduce boilerplate and provide consistent configuration
 * WHY: Commands need multiple utilities; context provides them in one place
 * PATTERN: Facade pattern providing simplified interface to complex utility system
 */

import { FeatureContext } from './feature-context';
import { WorkflowPathResolver } from './path-resolver';
import { DocumentManager } from './document-manager';
import { TemplateManager } from './template-manager';
import { FileCache } from './file-cache';
import { WorkflowId } from './id-utils';

/**
 * Document tier types
 */
export type DocumentTier = 'feature' | 'phase' | 'session';

/**
 * WorkflowCommandContext class
 * 
 * Provides single entry point with all workflow utilities.
 * Commands should create one instance at the start and use it throughout.
 */
export class WorkflowCommandContext {
  readonly feature: FeatureContext;
  readonly paths: WorkflowPathResolver;
  readonly documents: DocumentManager;
  readonly templates: TemplateManager;
  readonly cache: FileCache;

  /**
   * Create a new command context
   * @param featureName Feature name (e.g., "vue-migration")
   * @param cache Optional file cache (creates new one if not provided)
   */
  constructor(featureName: string, cache?: FileCache) {
    this.feature = FeatureContext.fromName(featureName);
    this.paths = this.feature.paths;
    this.cache = cache || new FileCache();
    this.documents = new DocumentManager(this.feature, this.cache);
    this.templates = new TemplateManager(this.feature);
  }

  /**
   * Create context from current feature (auto-detected)
   * @param cache Optional file cache
   * @returns Command context with auto-detected feature
   */
  static async getCurrent(cache?: FileCache): Promise<WorkflowCommandContext> {
    const feature = await FeatureContext.getCurrent();
    return new WorkflowCommandContext(feature.name, cache);
  }

  // Convenience methods for common operations

  /**
   * Read feature guide
   * @returns Feature guide content
   */
  async readFeatureGuide(): Promise<string> {
    return this.documents.readGuide('feature');
  }

  /**
   * Read phase guide
   * @param phase Phase identifier (e.g., "1", "2")
   * @returns Phase guide content
   */
  async readPhaseGuide(phase: string): Promise<string> {
    return this.documents.readGuide('phase', phase);
  }

  /**
   * Read session guide
   * @param sessionId Session ID in format X.Y (e.g., "2.1")
   * @returns Session guide content
   */
  async readSessionGuide(sessionId: string): Promise<string> {
    return this.documents.readGuide('session', sessionId);
  }

  /**
   * Read feature log
   * @returns Feature log content
   */
  async readFeatureLog(): Promise<string> {
    return this.documents.readLog('feature');
  }

  /**
   * Read phase log
   * @param phase Phase identifier (e.g., "1", "2")
   * @returns Phase log content
   */
  async readPhaseLog(phase: string): Promise<string> {
    return this.documents.readLog('phase', phase);
  }

  /**
   * Read session log
   * @param sessionId Session ID in format X.Y (e.g., "2.1")
   * @returns Session log content
   */
  async readSessionLog(sessionId: string): Promise<string> {
    return this.documents.readLog('session', sessionId);
  }

  /**
   * Read feature handoff
   * @returns Feature handoff content
   */
  async readFeatureHandoff(): Promise<string> {
    return this.documents.readHandoff('feature');
  }

  /**
   * Read phase handoff
   * @param phase Phase identifier (e.g., "1", "2")
   * @returns Phase handoff content
   */
  async readPhaseHandoff(phase: string): Promise<string> {
    return this.documents.readHandoff('phase', phase);
  }

  /**
   * Read session handoff
   * @param sessionId Session ID in format X.Y (e.g., "2.1")
   * @returns Session handoff content
   */
  async readSessionHandoff(sessionId: string): Promise<string> {
    return this.documents.readHandoff('session', sessionId);
  }

  /**
   * Append to feature log
   * @param content Content to append
   */
  async appendFeatureLog(content: string): Promise<void> {
    return this.documents.appendLog('feature', undefined, content);
  }

  /**
   * Append to phase log
   * @param phase Phase identifier
   * @param content Content to append
   */
  async appendPhaseLog(phase: string, content: string): Promise<void> {
    return this.documents.appendLog('phase', phase, content);
  }

  /**
   * Append to session log
   * @param sessionId Session ID in format X.Y
   * @param content Content to append
   */
  async appendSessionLog(sessionId: string, content: string): Promise<void> {
    return this.documents.appendLog('session', sessionId, content);
  }

  /**
   * Get ID utilities (for parsing, validation, etc.)
   * @returns WorkflowId static class reference
   */
  get idUtils(): typeof WorkflowId {
    return WorkflowId;
  }
}

