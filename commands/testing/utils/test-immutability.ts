/**
 * Test Immutability Utilities
 * 
 * Shared utilities for checking and enforcing test immutability.
 * Tests marked as immutable should not be modified unless:
 * - Feature changed (test needs update)
 * - Test has bug (not code bug)
 * - Refactoring requires update
 */

import { readFile, access } from 'fs/promises';
import { join } from 'path';
import { PROJECT_ROOT } from '../../utils/utils';
import { runCommand } from '../../utils/utils';

export type ModificationReason = 'feature-change' | 'test-bug' | 'refactoring' | 'other';

export interface ImmutabilityCheckResult {
  isImmutable: boolean;
  hasMarker: boolean;
  testPasses: boolean | null; // null if check not performed
  reason?: string;
}

/**
 * Check if a test file has an immutability marker
 */
export function hasImmutableMarker(content: string): boolean {
  return /@immutable|IMMUTABLE:\s*true/.test(content);
}

/**
 * Check if a test file is marked as immutable
 */
export async function isTestImmutable(filePath: string): Promise<ImmutabilityCheckResult> {
  try {
    const fullPath = join(PROJECT_ROOT, filePath);
    
    // Check if file exists
    try {
      await access(fullPath);
    } catch {
      return {
        isImmutable: false,
        hasMarker: false,
        testPasses: null,
        reason: 'File not found',
      };
    }
    
    // Read file content
    const content = await readFile(fullPath, 'utf-8');
    
    // Check for immutable marker
    const hasMarker = hasImmutableMarker(content);
    
    if (!hasMarker) {
      return {
        isImmutable: false,
        hasMarker: false,
        testPasses: null,
      };
    }
    
    // If marker exists, check if test passes
    // This is a basic check - in production, you might want to run the actual test
    const testPasses = await checkTestStatus(filePath);
    
    return {
      isImmutable: hasMarker && (testPasses === true),
      hasMarker: true,
      testPasses,
    };
  } catch (error) {
    return {
      isImmutable: false,
      hasMarker: false,
      testPasses: null,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if a test file passes (basic check)
 * In a real implementation, this would run the actual test
 */
async function checkTestStatus(filePath: string): Promise<boolean | null> {
  try {
    // Determine target based on file path
    let target = 'vue';
    if (filePath.includes('/server/')) {
      target = 'server';
    } else if (filePath.includes('/client-vue/')) {
      target = 'vue';
    }
    
    // Extract test file name for targeted execution
    // For now, we'll do a basic check - in production, run the specific test
    // This is a placeholder - actual implementation would run: npm test -- filePath
    return null; // Return null to indicate check not performed (would require test execution)
  } catch {
    return null;
  }
}

/**
 * Determine if a test can be modified based on reason
 */
export function canModifyTest(
  isImmutable: boolean,
  reason: ModificationReason
): { allowed: boolean; message?: string } {
  if (!isImmutable) {
    return { allowed: true };
  }
  
  // Valid reasons for modifying immutable tests
  const validReasons: ModificationReason[] = ['feature-change', 'test-bug', 'refactoring'];
  
  if (validReasons.includes(reason)) {
    return { allowed: true };
  }
  
  return {
    allowed: false,
    message: `Cannot modify immutable test. Valid reasons: ${validReasons.join(', ')}. Provided reason: ${reason}`,
  };
}

/**
 * Get modification reason from string
 */
export function parseModificationReason(reason: string): ModificationReason {
  const lowerReason = reason.toLowerCase();
  
  if (lowerReason.includes('feature') || lowerReason.includes('change')) {
    return 'feature-change';
  }
  if (lowerReason.includes('bug') || lowerReason.includes('error')) {
    return 'test-bug';
  }
  if (lowerReason.includes('refactor')) {
    return 'refactoring';
  }
  
  return 'other';
}

