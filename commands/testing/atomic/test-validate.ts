/**
 * Atomic Command: /test-validate [file-path]
 * Validate test file structure and compliance with best practices
 * 
 * This command checks:
 * - Descriptive header comment (Rule 10 compliance)
 * - Proper test structure
 * - Test naming conventions
 * - Import organization
 * - Test immutability markers (if applicable)
 */

import { readFile, access } from 'fs/promises';
import { join } from 'path';
import { PROJECT_ROOT } from '../../utils/utils';

export interface TestValidationResult {
  success: boolean;
  isValid: boolean;
  issues: string[];
  warnings: string[];
}

/**
 * Validate a test file structure and compliance
 */
export async function testValidate(filePath: string): Promise<TestValidationResult> {
  const issues: string[] = [];
  const warnings: string[] = [];
  
  try {
    // Check if file exists
    const fullPath = join(PROJECT_ROOT, filePath);
    try {
      await access(fullPath);
    } catch {
      return {
        success: false,
        isValid: false,
        issues: [`Test file not found: ${filePath}`],
        warnings: [],
      };
    }
    
    // Read file content
    const content = await readFile(fullPath, 'utf-8');
    
    // Check for descriptive header comment (Rule 10)
    const hasHeaderComment = /\/\*\*[\s\S]*?\*\//.test(content.split('\n').slice(0, 10).join('\n'));
    if (!hasHeaderComment) {
      issues.push('Missing descriptive header comment (Rule 10 compliance)');
    }
    
    // Check header comment quality (should have description)
    if (hasHeaderComment) {
      const headerMatch = content.match(/\/\*\*([\s\S]*?)\*\//);
      if (headerMatch) {
        const headerContent = headerMatch[1];
        if (!headerContent.includes('test') && !headerContent.includes('Test')) {
          warnings.push('Header comment may not clearly describe what the test covers');
        }
      }
    }
    
    // Check for test imports (vitest/jest)
    const hasTestImports = /from ['"]vitest['"]|from ['"]@testing-library|from ['"]jest['"]/.test(content);
    if (!hasTestImports) {
      warnings.push('No test framework imports found (vitest/jest/testing-library)');
    }
    
    // Check for test structure (describe/it blocks)
    const hasDescribe = /describe\(/.test(content);
    const hasTestIt = /(it\(|test\()/.test(content);
    
    if (!hasDescribe && !hasTestIt) {
      issues.push('No test structure found (missing describe/it or test blocks)');
    }
    
    // Check for proper test naming
    if (hasDescribe) {
      const describeMatches = content.matchAll(/describe\(['"](.*?)['"]/g);
      for (const match of describeMatches) {
        const testName = match[1];
        if (testName.length < 5) {
          warnings.push(`Test suite name may be too short: "${testName}"`);
        }
      }
    }
    
    // Check file naming convention
    const isTestFile = /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filePath);
    if (!isTestFile) {
      warnings.push('File does not follow test naming convention (*.test.ts or *.spec.ts)');
    }
    
    // Check for immutability marker (optional, but good practice)
    const hasImmutableMarker = /@immutable|IMMUTABLE:\s*true/.test(content);
    if (!hasImmutableMarker) {
      warnings.push('No immutability marker found. Consider adding @immutable if test is stable');
    }
    
    return {
      success: true,
      isValid: issues.length === 0,
      issues,
      warnings,
    };
  } catch (error) {
    return {
      success: false,
      isValid: false,
      issues: [`Error validating test file: ${error instanceof Error ? error.message : String(error)}`],
      warnings: [],
    };
  }
}

