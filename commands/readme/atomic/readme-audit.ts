/**
 * Atomic Command: /readme-audit [directory]
 * 
 * Tier: Cross-tier utility
 * Operates on: README files
 * 
 * Description: Audit READMEs in directory for duplicates, bloat, structure issues, and temporary files
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { PROJECT_ROOT } from '../../utils/utils';
import { ReadmeAuditResult } from '../types';
import { detectTemporaryReadme } from './readme-detect-temporary';
import { validateReadme } from './readme-validate';

/**
 * Audit READMEs in directory
 * 
 * @param directory Directory to audit
 * @returns Audit results
 */
export async function auditReadmes(directory: string): Promise<ReadmeAuditResult[]> {
  const results: ReadmeAuditResult[] = [];
  const fullDir = join(PROJECT_ROOT, directory);
  
  try {
    const entries = await readdir(fullDir, { withFileTypes: true });
    const readmeFiles: string[] = [];
    
    // Collect all README files recursively
    for (const entry of entries) {
      const fullPath = join(fullDir, entry.name);
      const relativePath = join(directory, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively audit subdirectories
        const subResults = await auditReadmes(relativePath);
        results.push(...subResults);
      } else if (entry.name.endsWith('.md')) {
        readmeFiles.push(relativePath);
      }
    }
    
    // Audit each README file
    for (const filePath of readmeFiles) {
      const result = await auditReadmeFile(filePath);
      results.push(result);
    }
    
    return results;
  } catch (error) {
    throw new Error(
      `Failed to audit READMEs: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Audit single README file
 */
async function auditReadmeFile(filePath: string): Promise<ReadmeAuditResult> {
  const fullPath = join(PROJECT_ROOT, filePath);
  const content = await readFile(fullPath, 'utf-8');
  const lines = content.split('\n');
  const lineCount = lines.length;
  
  // Check if temporary
  const tempInfo = await detectTemporaryReadme(filePath);
  
  // Validate structure
  const validation = await validateReadme(filePath);
  
  // Check for duplicates (simple content comparison - could be enhanced)
  const duplicates: string[] = [];
  // TODO: Implement duplicate detection by comparing content similarity
  
  const result: ReadmeAuditResult = {
    filePath,
    lineCount,
    isBloated: lineCount > 300,
    isTemporary: tempInfo !== null,
    temporaryMetadata: tempInfo?.metadata,
    structureIssues: validation.issues,
    missingSections: validation.missingSections,
    duplicates,
  };
  
  return result;
}

