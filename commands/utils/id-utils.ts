/**
 * ID Format Utilities
 * 
 * Hierarchy: Feature (X) → Phase (X.Y) → Session (X.Y.Z) → Task (X.Y.Z.A)
 * 
 * LEARNING: Centralized ID handling ensures consistency across the codebase
 * WHY: ID format conversion scattered across files leads to bugs and inconsistencies
 * PATTERN: Static utility class for pure functions that don't need instance state
 */

/**
 * Parsed task ID structure (X.Y.Z.A)
 */
export interface ParsedTaskId {
  feature: string;
  phase: string;
  session: string;
  task: string;
  phaseId: string;
  sessionId: string;
}

/**
 * Parsed session ID structure (X.Y.Z)
 */
export interface ParsedSessionId {
  feature: string;
  phase: string;
  session: string;
  phaseId: string;
}

/**
 * WorkflowId static class
 * 
 * Provides static methods for parsing, validating, and converting workflow IDs.
 * All methods are pure functions with no side effects.
 */
export class WorkflowId {
  /**
   * Parse task ID (e.g., "4.1.3.2")
   * Format: Feature.Phase.Session.Task (X.Y.Z.A)
   */
  static parseTaskId(id: string): ParsedTaskId | null {
    const parts = id.split('.');
    if (parts.length !== 4) return null;
    if (parts.some(part => part.trim() === '')) return null;
    
    return {
      feature: parts[0],
      phase: parts[1],
      session: parts[2],
      task: parts[3],
      phaseId: `${parts[0]}.${parts[1]}`,
      sessionId: `${parts[0]}.${parts[1]}.${parts[2]}`,
    };
  }

  /**
   * Parse session ID (e.g., "4.1.3")
   * Format: Feature.Phase.Session (X.Y.Z)
   */
  static parseSessionId(id: string): ParsedSessionId | null {
    const parts = id.split('.');
    if (parts.length !== 3) return null;
    if (parts.some(part => part.trim() === '')) return null;
    
    return {
      feature: parts[0],
      phase: parts[1],
      session: parts[2],
      phaseId: `${parts[0]}.${parts[1]}`,
    };
  }

  /**
   * Parse phase ID (e.g., "4.1")
   * Format: Feature.Phase (X.Y)
   */
  static parsePhaseId(id: string): string | null {
    const trimmed = id.trim();
    if (/^\d+\.\d+$/.test(trimmed)) return trimmed;
    return null;
  }

  /**
   * Convert ID to filename format
   * Converts dots to dashes (e.g., "4.1.3" -> "4-1-3")
   */
  static toFilename(id: string): string {
    return id.replace(/\./g, '-');
  }

  /**
   * Convert filename format to display format
   * Converts dashes to dots (e.g., "4-1-3" -> "4.1.3")
   */
  static fromFilename(filename: string): string {
    return filename.replace(/-/g, '.');
  }

  /**
   * Validate task ID format (X.Y.Z.A)
   */
  static isValidTaskId(id: string): boolean {
    return this.parseTaskId(id) !== null;
  }

  /**
   * Validate session ID format (X.Y.Z)
   */
  static isValidSessionId(id: string): boolean {
    return this.parseSessionId(id) !== null;
  }

  /**
   * Generate task ID from components
   * @returns Task ID in format X.Y.Z.A
   */
  static generateTaskId(feature: string, phase: string, session: string, task: string): string {
    return `${feature}.${phase}.${session}.${task}`;
  }

  /**
   * Generate session ID from components
   * @returns Session ID in format X.Y.Z
   */
  static generateSessionId(feature: string, phase: string, session: string): string {
    return `${feature}.${phase}.${session}`;
  }

  /**
   * Extract session ID from task ID (X.Y.Z.A → X.Y.Z)
   */
  static extractSessionId(taskId: string): string | null {
    const parsed = this.parseTaskId(taskId);
    if (!parsed) return null;
    return parsed.sessionId;
  }

  /**
   * Extract phase ID from session ID (X.Y.Z → X.Y) or task ID (X.Y.Z.A → X.Y)
   */
  static extractPhaseId(id: string): string | null {
    const parts = id.split('.');
    if (parts.length < 2) return null;
    return `${parts[0]}.${parts[1]}`;
  }
}

