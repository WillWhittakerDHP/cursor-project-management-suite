/**
 * Unified Command Context
 * 
 * Single entry point providing all utilities to commands.
 * Simplifies command implementation by providing pre-configured utilities.
 * 
 * WHY: Commands need multiple utilities; context provides them in one place
 * PATTERN: Facade pattern providing simplified interface to complex utility system
 */

import { FeatureContext, resolveFeatureId } from './feature-context';
import { WorkflowPathResolver } from './path-resolver';
import { DocumentManager } from './document-manager';
import { TemplateManager } from './template-manager';
import { FileCache } from './file-cache';
import { WorkflowId } from './id-utils';
import { readProjectFile, writeProjectFile } from './utils';

/**
 * Document tier types
 */
export type DocumentTier = 'feature' | 'phase' | 'session';

/** Params bag for contextFromParams: start and end both pass a shape with tier-specific ids. */
export type TierParamsBag = {
  featureId?: string;
  featureName?: string;
  phaseId?: string;
  phaseNumber?: string;
  sessionId?: string;
  taskId?: string;
};

export type TierName = 'feature' | 'phase' | 'session' | 'task';

/**
 * WorkflowCommandContext class
 * 
 * Provides single entry point with all workflow utilities.
 * Commands should create one instance at the start and use it throughout.
 * When built via contextFromParams, tier and identifier are set so context carries "what param" was used.
 */
export class WorkflowCommandContext {
  readonly feature: FeatureContext;
  readonly paths: WorkflowPathResolver;
  readonly documents: DocumentManager;
  readonly templates: TemplateManager;
  readonly cache: FileCache;
  /** Set when created via contextFromParams; the tier for this command. */
  readonly tier?: TierName;
  /** Set when created via contextFromParams; the identifier (featureId, phaseId, sessionId, taskId) used. */
  readonly identifier?: string;

  /**
   * Create a new command context
   * @param featureName Feature name (e.g. from contextFromParams or explicit)
   * @param cache Optional file cache (creates new one if not provided)
   * @param tier Optional; set when built from contextFromParams
   * @param identifier Optional; set when built from contextFromParams
   */
  constructor(featureName: string, cache?: FileCache, tier?: TierName, identifier?: string) {
    this.feature = FeatureContext.fromName(featureName);
    this.paths = this.feature.paths;
    this.cache = cache || new FileCache();
    this.documents = new DocumentManager(this.feature, this.cache);
    this.templates = new TemplateManager(this.feature);
    this.tier = tier;
    this.identifier = identifier;
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

  /**
   * Create context from tier + params (F/P/S/T). Single entry point for "params → context".
   * Sets tier and identifier on the returned context so it carries "what param" was used.
   */
  static async contextFromParams(
    tier: TierName,
    params: TierParamsBag,
    cache?: FileCache
  ): Promise<WorkflowCommandContext> {
    let featureName: string;
    let identifier: string;
    switch (tier) {
      case 'feature': {
        const id = (params.featureId ?? params.featureName ?? '').trim();
        if (!id) throw new Error('contextFromParams(feature): featureId or featureName required');
        featureName = await resolveFeatureId(id);
        identifier = id;
        break;
      }
      case 'phase': {
        const phaseId = (params.phaseId ?? params.phaseNumber ?? '').trim();
        if (!phaseId) throw new Error('contextFromParams(phase): phaseId or phaseNumber required');
        featureName = await FeatureContext.featureNameFromTierAndId('phase', phaseId);
        identifier = phaseId;
        break;
      }
      case 'session': {
        const sessionId = (params.sessionId ?? '').trim();
        if (!sessionId) throw new Error('contextFromParams(session): sessionId required');
        featureName = await FeatureContext.featureNameFromTierAndId('session', sessionId);
        identifier = sessionId;
        break;
      }
      case 'task': {
        const taskId = (params.taskId ?? '').trim();
        if (!taskId) throw new Error('contextFromParams(task): taskId required');
        if (params.featureId?.trim()) {
          featureName = await resolveFeatureId(params.featureId.trim());
        } else {
          featureName = await FeatureContext.featureNameFromTierAndId('task', taskId);
        }
        identifier = taskId;
        break;
      }
      default:
        throw new Error(`contextFromParams: unknown tier ${tier}`);
    }
    return new WorkflowCommandContext(featureName, cache, tier, identifier);
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
   * @param sessionId Session ID in format X.Y.Z (e.g., "4.1.3")
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
   * @param sessionId Session ID in format X.Y.Z (e.g., "4.1.3")
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
   * @param sessionId Session ID in format X.Y.Z (e.g., "4.1.3")
   * @returns Session handoff content
   */
  async readSessionHandoff(sessionId: string): Promise<string> {
    return this.documents.readHandoff('session', sessionId);
  }

  /**
   * Read task handoff
   * @param taskId Task ID in format X.Y.Z.A (e.g., "4.1.3.1")
   * @returns Task handoff content (empty string if file does not exist)
   */
  async readTaskHandoff(taskId: string): Promise<string> {
    try {
      return await readProjectFile(this.paths.getTaskHandoffPath(taskId));
    } catch {
      return '';
    }
  }

  /**
   * Write task handoff (e.g. at task-end so next task or session can read it)
   * @param taskId Task ID in format X.Y.Z.A
   * @param content Handoff content (what was done, what's next)
   */
  async writeTaskHandoff(taskId: string, content: string): Promise<void> {
    await writeProjectFile(this.paths.getTaskHandoffPath(taskId), content);
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

