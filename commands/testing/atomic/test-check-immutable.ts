/**
 * Atomic Command: /test-check-immutable [file-path]
 * Check if a test file is marked as immutable and protected from modification
 * 
 * This command checks:
 * - Presence of immutability marker (@immutable or IMMUTABLE: true)
 * - Test status (whether test passes)
 * - Protection status
 * 
 * ENHANCEMENT: Now supports context-aware checking for automatic classification
 */

import { 
  isTestImmutable, 
  canModifyTest, 
  parseModificationReason,
  testCheckImmutableWithContext,
  ImmutabilityContext 
} from '../utils/test-immutability';

export interface ImmutabilityCheckCommandResult {
  success: boolean;
  isImmutable: boolean;
  hasMarker: boolean;
  testPasses: boolean | null;
  canModify: boolean;
  message: string;
  autoClassifiedReason?: string; // NEW: Auto-classified reason from context
}

/**
 * Check if a test file is immutable (basic version)
 */
export async function testCheckImmutable(
  filePath: string,
  modificationReason?: string
): Promise<ImmutabilityCheckCommandResult> {
  try {
    const checkResult = await isTestImmutable(filePath);
    
    let canModify = true;
    let message = '';
    
    if (checkResult.isImmutable) {
      if (modificationReason) {
        const reason = parseModificationReason(modificationReason);
        const modifyCheck = canModifyTest(checkResult.isImmutable, reason);
        canModify = modifyCheck.allowed;
        message = modifyCheck.message || '';
      } else {
        canModify = false;
        message = 'Test is marked as immutable. Provide a valid modification reason to proceed.';
      }
    } else {
      message = checkResult.hasMarker
        ? 'Test has immutability marker but may not be passing'
        : 'Test is not marked as immutable';
    }
    
    return {
      success: true,
      isImmutable: checkResult.isImmutable,
      hasMarker: checkResult.hasMarker,
      testPasses: checkResult.testPasses,
      canModify,
      message: message || (checkResult.isImmutable ? 'Test is immutable' : 'Test is not immutable'),
    };
  } catch (error) {
    return {
      success: false,
      isImmutable: false,
      hasMarker: false,
      testPasses: null,
      canModify: false,
      message: `Error checking immutability: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Check if a test file is immutable with context awareness
 * 
 * NEW: Context-aware version that auto-classifies based on recent changes
 * 
 * @param filePath Path to test file
 * @param context Context about recent changes and intent
 */
export async function testCheckImmutableWithContextCommand(
  filePath: string,
  context: ImmutabilityContext
): Promise<ImmutabilityCheckCommandResult> {
  try {
    const checkResult = await testCheckImmutableWithContext(filePath, context);
    
    return {
      success: true,
      isImmutable: checkResult.isImmutable,
      hasMarker: checkResult.hasMarker,
      testPasses: checkResult.testPasses,
      canModify: checkResult.canModify,
      message: checkResult.message,
      autoClassifiedReason: checkResult.autoClassifiedReason,
    };
  } catch (error) {
    return {
      success: false,
      isImmutable: false,
      hasMarker: false,
      testPasses: null,
      canModify: false,
      message: `Error checking immutability: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

