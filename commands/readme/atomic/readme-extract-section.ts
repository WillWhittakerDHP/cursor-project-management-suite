/**
 * Atomic Command: /readme-extract-section [filePath] [section]
 * 
 * Tier: Cross-tier utility
 * Operates on: README files
 * 
 * Description: Extract specific section from README for creating focused docs
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { PROJECT_ROOT } from '../../utils/utils';
import { MarkdownUtils } from '../../utils/markdown-utils';

/**
 * Extract section from README
 * 
 * @param filePath Path to README file
 * @param sectionTitle Section title to extract
 * @param includeSubsections Whether to include subsections
 * @returns Extracted section content
 */
export async function extractReadmeSection(
  filePath: string,
  sectionTitle: string,
  includeSubsections: boolean = true
): Promise<string> {
  try {
    const fullPath = join(PROJECT_ROOT, filePath);
    const content = await readFile(fullPath, 'utf-8');
    
    const section = MarkdownUtils.extractSection(content, sectionTitle, {
      includeSubsections,
    });
    
    if (!section) {
      throw new Error(`Section "${sectionTitle}" not found in ${filePath}`);
    }
    
    return section;
  } catch (_error) {
    throw new Error(
      `Failed to extract section: ${_error instanceof Error ? _error.message : String(_error)}`
    );
  }
}

