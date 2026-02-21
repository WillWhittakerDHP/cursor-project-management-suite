/**
 * Path Resolver Utility
 * 
 * Centralizes all path construction logic for workflow manager documents.
 * Eliminates hardcoded paths throughout the codebase.
 * 
 * LEARNING: Centralized path management reduces duplication and makes refactoring easier
 * WHY: Hardcoded paths scattered across files make changes difficult and error-prone
 * PATTERN: Single source of truth for path construction logic
 */

/**
 * WorkflowPathResolver class
 * 
 * Provides methods for constructing all workflow manager document paths.
 * All paths are relative to project root.
 */
export class WorkflowPathResolver {
  private readonly featureName: string;
  private readonly basePath: string;

  /**
   * Create a new path resolver for a specific feature
   * @param featureName Feature name (e.g. from .current-feature or git branch)
   */
  constructor(featureName: string) {
    this.featureName = featureName;
    this.basePath = `.project-manager/features/${featureName}`;
  }

  /**
   * Get feature guide path
   * @returns Path to feature guide: `.project-manager/features/{feature}/feature-{feature}-guide.md`
   */
  getFeatureGuidePath(): string {
    return `${this.basePath}/feature-${this.featureName}-guide.md`;
  }

  /**
   * Get feature log path
   * @returns Path to feature log: `.project-manager/features/{feature}/feature-{feature}-log.md`
   */
  getFeatureLogPath(): string {
    return `${this.basePath}/feature-${this.featureName}-log.md`;
  }

  /**
   * Get feature handoff path
   * @returns Path to feature handoff: `.project-manager/features/{feature}/feature-{feature}-handoff.md`
   */
  getFeatureHandoffPath(): string {
    return `${this.basePath}/feature-${this.featureName}-handoff.md`;
  }

  /**
   * Get feature plan path (feature planning input used to generate workflow docs)
   * @returns Path to feature plan: `.project-manager/features/{feature}/feature-plan.md`
   */
  getFeaturePlanPath(): string {
    return `${this.basePath}/feature-plan.md`;
  }

  /**
   * Get feature README path (optional, when maintaining a README alongside the feature plan)
   * @returns Path to feature README: `.project-manager/features/{feature}/README.md`
   */
  getFeatureReadmePath(): string {
    return `${this.basePath}/README.md`;
  }

  /**
   * Get phase guide path
   * @param phase Phase identifier (e.g., "4.1", "4.2")
   * @returns Path to phase guide: `.project-manager/features/{feature}/phases/phase-{phase}-guide.md`
   */
  getPhaseGuidePath(phase: string): string {
    return `${this.basePath}/phases/phase-${phase}-guide.md`;
  }

  /**
   * Get phase log path
   * @param phase Phase identifier (e.g., "4.1", "4.2")
   * @returns Path to phase log: `.project-manager/features/{feature}/phases/phase-{phase}-log.md`
   */
  getPhaseLogPath(phase: string): string {
    return `${this.basePath}/phases/phase-${phase}-log.md`;
  }

  /**
   * Get phase handoff path
   * @param phase Phase identifier (e.g., "4.1", "4.2")
   * @returns Path to phase handoff: `.project-manager/features/{feature}/phases/phase-{phase}-handoff.md`
   */
  getPhaseHandoffPath(phase: string): string {
    return `${this.basePath}/phases/phase-${phase}-handoff.md`;
  }

  /**
   * Get session guide path
   * @param sessionId Session ID in format X.Y.Z (e.g., "4.1.3")
   * @returns Path to session guide: `.project-manager/features/{feature}/sessions/session-{X.Y}-guide.md`
   */
  getSessionGuidePath(sessionId: string): string {
    // Use dots in filename to match actual file naming convention
    return `${this.basePath}/sessions/session-${sessionId}-guide.md`;
  }

  /**
   * Get session log path
   * @param sessionId Session ID in format X.Y.Z (e.g., "4.1.3")
   * @returns Path to session log: `.project-manager/features/{feature}/sessions/session-{X.Y}-log.md`
   */
  getSessionLogPath(sessionId: string): string {
    // Use dots in filename to match actual file naming convention
    return `${this.basePath}/sessions/session-${sessionId}-log.md`;
  }

  /**
   * Get session handoff path
   * @param sessionId Session ID in format X.Y.Z (e.g., "4.1.3")
   * @returns Path to session handoff: `.project-manager/features/{feature}/sessions/session-{X.Y}-handoff.md`
   */
  getSessionHandoffPath(sessionId: string): string {
    // Use dots in filename to match actual file naming convention
    return `${this.basePath}/sessions/session-${sessionId}-handoff.md`;
  }

  /**
   * Get task guide path
   * Task guides are derived from session guides, so this returns the session guide path
   * @param taskId Task ID in format X.Y.Z.A (e.g., "4.1.3.1")
   * @returns Path to session guide (tasks don't have separate guides): `.project-manager/features/{feature}/sessions/session-{X-Y}-guide.md`
   */
  getTaskGuidePath(taskId: string): string {
    // Extract session ID from task ID (X.Y.Z -> X.Y)
    const parts = taskId.split('.');
    if (parts.length < 2) {
      throw new Error(`Invalid task ID format: ${taskId}. Expected format: X.Y.Z.A`);
    }
    const sessionId = `${parts[0]}.${parts[1]}`;
    return this.getSessionGuidePath(sessionId);
  }

  /**
   * Get template path
   * @param tier Document tier: "feature", "phase", "session", or "planning"
   * @param docType Document type: "guide", "log", "handoff", or planning template type ("architecture", "technology", "pattern", "risk", "general")
   * @returns Path to template: `.cursor/commands/tiers/{tier}/templates/{tier}-{docType}.md` or `.cursor/commands/planning/templates/planning-{docType}.md`
   */
  getTemplatePath(tier: 'feature' | 'phase' | 'session' | 'planning', docType: 'guide' | 'log' | 'handoff' | 'architecture' | 'technology' | 'pattern' | 'risk' | 'general'): string {
    if (tier === 'planning') {
      return `.cursor/commands/planning/templates/planning-${docType}.md`;
    }
    return `.cursor/commands/tiers/${tier}/templates/${tier}-${docType}.md`;
  }

  /**
   * Get feature name
   * @returns The feature name this resolver is configured for
   */
  getFeatureName(): string {
    return this.featureName;
  }

  /**
   * Get base path for feature
   * @returns Base path: `.project-manager/features/{feature}`
   */
  getBasePath(): string {
    return this.basePath;
  }
}

