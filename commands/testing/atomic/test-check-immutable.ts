/**
 * Atomic Command: /test-check-immutable [file-path]
 * Check if a test file is marked as immutable and protected from modification
 * 
 * This command checks:
 * - Presence of immutability marker (@immutable or IMMUTABLE: true)
 * - Test status (whether test passes)
 * - Protection status
 */

import { isTestImmutable, canModifyTest, parseModificationReason } from '../utils/test-immutability';

export interface ImmutabilityCheckCommandResult {
  success: boolean;
  isImmutable: boolean;
  hasMarker: boolean;
  testPasses: boolean | null;
  canModify: boolean;
  message: string;
}

/**
 * Check if a test file is immutable
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

