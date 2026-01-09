/**
 * Atomic Command: /readme-mark-temporary [filePath] [reason] [expiry?] [consolidateInto?]
 * 
 * Tier: Cross-tier utility
 * Operates on: README files
 * 
 * Description: Mark a README file as temporary with metadata markers
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { PROJECT_ROOT } from '../../utils/utils';

export interface MarkTemporaryParams {
  /** File path to mark as temporary */
  filePath: string;
  /** Reason for temporary status */
  reason: string;
  /** Optional expiry date (YYYY-MM-DD) */
  expiryDate?: string;
  /** Optional target file for consolidation */
  consolidateInto?: string;
}

/**
 * Mark README as temporary
 * 
 * @param params Mark temporary parameters
 * @returns Success message
 */
export async function markTemporaryReadme(params: MarkTemporaryParams): Promise<string> {
  try {
    const fullPath = join(PROJECT_ROOT, params.filePath);
    let content = await readFile(fullPath, 'utf-8');
    
    // Check if already marked
    if (content.includes('<!-- TEMPORARY:') || content.includes('<!-- STATUS:')) {
      return `⚠️ README already marked as temporary: ${params.filePath}`;
    }
    
    // Build metadata block
    const metadataLines: string[] = [];
    metadataLines.push(`<!-- TEMPORARY: ${params.reason} -->`);
    if (params.expiryDate) {
      metadataLines.push(`<!-- EXPIRY: ${params.expiryDate} -->`);
    }
    if (params.consolidateInto) {
      metadataLines.push(`<!-- CONSOLIDATE_INTO: ${params.consolidateInto} -->`);
    }
    metadataLines.push('');
    
    // Insert metadata at the beginning
    const lines = content.split('\n');
    const titleIndex = lines.findIndex(line => line.trim().startsWith('#'));
    
    if (titleIndex >= 0) {
      // Insert after title
      lines.splice(titleIndex + 1, 0, ...metadataLines);
    } else {
      // Insert at beginning
      lines.unshift(...metadataLines);
    }
    
    content = lines.join('\n');
    await writeFile(fullPath, content, 'utf-8');
    
    return `✅ Marked README as temporary: ${params.filePath}\n` +
           `   Reason: ${params.reason}\n` +
           (params.expiryDate ? `   Expiry: ${params.expiryDate}\n` : '') +
           (params.consolidateInto ? `   Consolidate into: ${params.consolidateInto}\n` : '');
  } catch (error) {
    throw new Error(
      `Failed to mark README as temporary: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

