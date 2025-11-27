/**
 * Atomic Command: /readme-consolidate-findings [tempReadme] [targetReadme]
 * 
 * Tier: Cross-tier utility
 * Operates on: README files
 * 
 * Description: Extract valuable findings from temporary README and merge into permanent README
 */

import { readFile, writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { PROJECT_ROOT } from '../../utils/utils';
import { MarkdownUtils } from '../../utils/markdown-utils';

export interface ConsolidateFindingsParams {
  /** Temporary README file path */
  tempReadme: string;
  /** Target permanent README file path */
  targetReadme: string;
  /** Section in target to append findings to (default: "Findings" or creates new section) */
  targetSection?: string;
  /** Whether to remove temporary file after consolidation */
  removeTemp?: boolean;
}

/**
 * Consolidate findings from temporary README into permanent README
 * 
 * @param params Consolidation parameters
 * @returns Success message
 */
export async function consolidateFindings(params: ConsolidateFindingsParams): Promise<string> {
  try {
    const tempPath = join(PROJECT_ROOT, params.tempReadme);
    const targetPath = join(PROJECT_ROOT, params.targetReadme);
    
    // Read both files
    const tempContent = await readFile(tempPath, 'utf-8');
    const targetContent = await readFile(targetPath, 'utf-8');
    
    // Extract findings section from temporary README
    let findings = '';
    const findingsSection = MarkdownUtils.extractSection(tempContent, 'Findings');
    if (findingsSection) {
      findings = findingsSection;
    } else {
      // If no Findings section, extract main content (skip metadata)
      const lines = tempContent.split('\n');
      const startIndex = lines.findIndex(line => 
        line.trim().startsWith('#') && !line.includes('<!--')
      );
      if (startIndex >= 0) {
        findings = lines.slice(startIndex + 1).join('\n');
      }
    }
    
    if (!findings.trim()) {
      return `⚠️ No findings to consolidate from ${params.tempReadme}`;
    }
    
    // Append findings to target README
    const targetSection = params.targetSection || 'Findings';
    let updatedContent = targetContent;
    
    // Check if target section exists
    const existingSection = MarkdownUtils.extractSection(targetContent, targetSection);
    if (existingSection) {
      // Append to existing section
      updatedContent = targetContent.replace(
        new RegExp(`(## ${targetSection}[\\s\\S]*?)(?=##|$)`, 'i'),
        `$1\n\n${findings}\n\n`
      );
    } else {
      // Create new section at end
      updatedContent = targetContent + `\n\n## ${targetSection}\n\n${findings}\n`;
    }
    
    // Write updated target
    await writeFile(targetPath, updatedContent, 'utf-8');
    
    // Remove temporary file if requested
    if (params.removeTemp !== false) {
      await unlink(tempPath);
    }
    
    return `✅ Consolidated findings from ${params.tempReadme} into ${params.targetReadme}\n` +
           `   Section: ${targetSection}\n` +
           (params.removeTemp !== false ? `   Removed temporary file: ${params.tempReadme}` : '');
  } catch (error) {
    throw new Error(
      `Failed to consolidate findings: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

