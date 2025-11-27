/**
 * ID Format Utilities
 * 
 * Standardizes ID parsing, validation, and format conversion for workflow manager.
 * Handles conversion between display format (X.Y.Z) and filename format (X-Y-Z).
 * 
 * LEARNING: Centralized ID handling ensures consistency across the codebase
 * WHY: ID format conversion scattered across files leads to bugs and inconsistencies
 * PATTERN: Static utility class for pure functions that don't need instance state
 */

/**
 * Parsed task ID structure
 */
export interface ParsedTaskId {
  phase: string;
  session: string;
  task: string;
}

/**
 * Parsed session ID structure
 */
export interface ParsedSessionId {
  phase: string;
  session: string;
}

/**
 * WorkflowId static class
 * 
 * Provides static methods for parsing, validating, and converting workflow IDs.
 * All methods are pure functions with no side effects.
 */
export class WorkflowId {
  /**
   * Parse task ID (e.g., "1.3.1")
   * Format: Phase.Session.Task
   * @param id Task ID string
   * @returns Parsed task ID or null if invalid format
   */
  static parseTaskId(id: string): ParsedTaskId | null {
    const parts = id.split('.');
    if (parts.length !== 3) return null;
    
    // Validate all parts are non-empty
    if (parts.some(part => part.trim() === '')) return null;
    
    return {
      phase: parts[0],
      session: parts[1],
      task: parts[2]
    };
  }

  /**
   * Parse session ID (e.g., "1.3")
   * Format: Phase.Session
   * @param id Session ID string
   * @returns Parsed session ID or null if invalid format
   */
  static parseSessionId(id: string): ParsedSessionId | null {
    const parts = id.split('.');
    if (parts.length !== 2) return null;
    
    // Validate all parts are non-empty
    if (parts.some(part => part.trim() === '')) return null;
    
    return {
      phase: parts[0],
      session: parts[1]
    };
  }

  /**
   * Parse phase ID (e.g., "1")
   * Format: Phase
   * @param id Phase ID string
   * @returns Phase identifier or null if invalid format
   */
  static parsePhaseId(id: string): string | null {
    const trimmed = id.trim();
    if (trimmed === '' || trimmed.includes('.')) return null;
    return trimmed;
  }

  /**
   * Convert ID to filename format
   * Converts dots to dashes (e.g., "1.3.1" -> "1-3-1")
   * @param id ID in display format (X.Y.Z)
   * @returns ID in filename format (X-Y-Z)
   */
  static toFilename(id: string): string {
    return id.replace(/\./g, '-');
  }

  /**
   * Convert filename format to display format
   * Converts dashes to dots (e.g., "1-3-1" -> "1.3.1")
   * @param filename ID in filename format (X-Y-Z)
   * @returns ID in display format (X.Y.Z)
   */
  static fromFilename(filename: string): string {
    return filename.replace(/-/g, '.');
  }

  /**
   * Validate task ID format
   * @param id Task ID string
   * @returns true if valid task ID format (X.Y.Z)
   */
  static isValidTaskId(id: string): boolean {
    return this.parseTaskId(id) !== null;
  }

  /**
   * Validate session ID format
   * @param id Session ID string
   * @returns true if valid session ID format (X.Y)
   */
  static isValidSessionId(id: string): boolean {
    return this.parseSessionId(id) !== null;
  }

  /**
   * Generate task ID from components
   * @param phase Phase identifier
   * @param session Session identifier
   * @param task Task identifier
   * @returns Task ID in format X.Y.Z
   */
  static generateTaskId(phase: string, session: string, task: string): string {
    return `${phase}.${session}.${task}`;
  }

  /**
   * Generate session ID from components
   * @param phase Phase identifier
   * @param session Session identifier
   * @returns Session ID in format X.Y
   */
  static generateSessionId(phase: string, session: string): string {
    return `${phase}.${session}`;
  }

  /**
   * Extract session ID from task ID
   * @param taskId Task ID in format X.Y.Z
   * @returns Session ID in format X.Y
   */
  static extractSessionId(taskId: string): string | null {
    const parsed = this.parseTaskId(taskId);
    if (!parsed) return null;
    return this.generateSessionId(parsed.phase, parsed.session);
  }

  /**
   * Extract phase ID from session ID or task ID
   * @param id Session ID (X.Y) or task ID (X.Y.Z)
   * @returns Phase identifier
   */
  static extractPhaseId(id: string): string | null {
    const parts = id.split('.');
    if (parts.length < 1) return null;
    return parts[0] || null;
  }
}

