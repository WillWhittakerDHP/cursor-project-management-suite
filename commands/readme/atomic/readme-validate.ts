/**
 * Atomic Command: /readme-validate [filePath]
 * 
 * Tier: Cross-tier utility
 * Operates on: README files
 * 
 * Description: Validate README structure against standards
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { PROJECT_ROOT } from '../../utils/utils';

export interface ValidationResult {
  /** Whether validation passed */
  isValid: boolean;
  /** Missing sections */
  missingSections: string[];
  /** Structure issues */
  issues: string[];
  /** Line count */
  lineCount: number;
  /** Whether exceeds 300 lines */
  isBloated: boolean;
}

/**
 * Required sections for standard README
 */
const REQUIRED_SECTIONS = [
  'Title',
  'Purpose',
  'Overview',
];

/**
 * Validate README structure
 * 
 * @param filePath Path to README file
 * @returns Validation result
 */
export async function validateReadme(filePath: string): Promise<ValidationResult> {
  try {
    const fullPath = join(PROJECT_ROOT, filePath);
    const content = await readFile(fullPath, 'utf-8');
    const lines = content.split('\n');
    const lineCount = lines.length;
    
    const result: ValidationResult = {
      isValid: true,
      missingSections: [],
      issues: [],
      lineCount,
      isBloated: lineCount > 300,
    };
    
    // Check for title (first # heading)
    const hasTitle = lines.some(line => line.trim().startsWith('#') && !line.trim().startsWith('##'));
    if (!hasTitle) {
      result.missingSections.push('Title');
      result.isValid = false;
    }
    
    // Check for purpose (should be near top, can be in title or first paragraph)
    const hasPurpose = content.toLowerCase().includes('purpose') || 
                       content.toLowerCase().includes('one sentence') ||
                       lines.slice(0, 10).some(line => line.length > 0 && !line.trim().startsWith('#'));
    if (!hasPurpose) {
      result.missingSections.push('Purpose');
      result.issues.push('Purpose should be clearly stated near the top');
    }
    
    // Check for overview
    const hasOverview = content.toLowerCase().includes('overview') ||
                        lines.slice(0, 20).some(line => line.length > 50);
    if (!hasOverview) {
      result.missingSections.push('Overview');
      result.issues.push('Overview section recommended');
    }
    
    // Check for bloat
    if (result.isBloated) {
      result.issues.push(`README exceeds 300 lines (${lineCount} lines). Consider splitting into README.md + GUIDE.md`);
    }
    
    // Check for Quick Reference link (if applicable)
    const isModuleReadme = filePath.includes('/commands/') && filePath.endsWith('README.md');
    if (isModuleReadme && !content.includes('QUICK_REFERENCE')) {
      result.issues.push('Consider adding Quick Reference link for module READMEs');
    }
    
    return result;
  } catch (error) {
    throw new Error(
      `Failed to validate README: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

