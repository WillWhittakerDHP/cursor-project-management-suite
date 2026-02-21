/**
 * Composite Command: Test File Fix Permission Manager
 * 
 * Manages conversation-based permissions for fixing test files.
 * Permissions are granted in current conversation turn and persist for follow-up messages.
 */

import { TestErrorAnalysis } from './test-error-analyzer';

export interface TestFileFixPermission {
  granted: boolean;
  testFiles: string[]; // Files that can be modified
  grantedAt: Date;
  reason: string; // Why permission was granted
  conversationTurn: string; // Track which conversation turn granted this
}

/**
 * In-memory permission store (resets after agent response completes)
 * This simulates conversation context tracking
 */
class PermissionStore {
  private permissions: Map<string, TestFileFixPermission> = new Map();
  
  grant(testFiles: string[], reason: string, conversationTurn: string): void {
    for (const file of testFiles) {
      this.permissions.set(file, {
        granted: true,
        testFiles: [file],
        grantedAt: new Date(),
        reason,
        conversationTurn,
      });
    }
  }
  
  check(testFilePath: string, _conversationTurn: string): boolean {
    const permission = this.permissions.get(testFilePath);
    if (!permission) {
      return false;
    }
    
    // Check if permission is from current or recent conversation turn
    // For now, allow if permission exists (conversation turn matching handled by agent)
    return permission.granted;
  }
  
  revoke(testFilePath: string): void {
    this.permissions.delete(testFilePath);
  }
  
  revokeAll(): void {
    this.permissions.clear();
  }
  
  getAll(): TestFileFixPermission[] {
    return Array.from(this.permissions.values());
  }
}

// Global permission store instance
const permissionStore = new PermissionStore();

/**
 * Request permission to fix test files
 * This should be called by the agent workflow, which will prompt the user
 */
export async function requestTestFileFixPermission(
  errorAnalysis: TestErrorAnalysis,
  conversationContext: string
): Promise<TestFileFixPermission> {
  // Extract test files from error analysis
  const testFiles = errorAnalysis.affectedFiles.filter(file =>
    /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file)
  );
  
  if (testFiles.length === 0) {
    return {
      granted: false,
      testFiles: [],
      grantedAt: new Date(),
      reason: 'No test files identified in error',
      conversationTurn: conversationContext,
    };
  }

  // Return permission object (granted will be set by agent based on user response)
  return {
    granted: false, // Will be set to true by agent after user approval
    testFiles,
    grantedAt: new Date(),
    reason: errorAnalysis.recommendation,
    conversationTurn: conversationContext,
  };
}

/**
 * Grant permission for test file fixes
 * Called by agent workflow after user approves
 */
export function grantTestFileFixPermission(
  permission: TestFileFixPermission,
  conversationTurn: string
): void {
  permissionStore.grant(
    permission.testFiles,
    permission.reason,
    conversationTurn
  );
}

/**
 * Check if permission exists for a test file
 */
export function checkTestFileFixPermission(
  testFilePath: string,
  conversationTurn: string
): boolean {
  return permissionStore.check(testFilePath, conversationTurn);
}

/**
 * Revoke permission for a test file
 */
export function revokeTestFileFixPermission(testFilePath: string): void {
  permissionStore.revoke(testFilePath);
}

/**
 * Revoke all permissions (called after agent response completes)
 */
export function revokeAllTestFileFixPermissions(): void {
  permissionStore.revokeAll();
}

/**
 * Get all active permissions
 */
export function getAllTestFileFixPermissions(): TestFileFixPermission[] {
  return permissionStore.getAll();
}

