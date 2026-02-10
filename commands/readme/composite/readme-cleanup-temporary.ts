/**
 * Composite Command: /readme-cleanup-temporary [directory] [options]
 * 
 * Tier: Cross-tier utility
 * Operates on: README files
 * 
 * Description: Clean up temporary READMEs with options for auto-consolidation
 */

import { auditReadmes } from '../atomic/readme-audit';
import { consolidateFindings } from '../atomic/readme-consolidate-findings';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { PROJECT_ROOT } from '../../utils/utils';

export interface CleanupTemporaryOptions {
  /** Auto-consolidate findings into permanent docs */
  autoConsolidate?: boolean;
  /** Delete only (no consolidation) */
  deleteOnly?: boolean;
  /** Dry run (report only, no changes) */
  dryRun?: boolean;
}

/**
 * Clean up temporary READMEs
 * 
 * @param directory Directory to clean up
 * @param options Cleanup options
 * @returns Cleanup report
 */
export async function cleanupTemporaryReadmes(
  directory: string = '.cursor',
  options: CleanupTemporaryOptions = {}
): Promise<string> {
  try {
    const results = await auditReadmes(directory);
    const temporaryReadmes = results.filter(r => r.isTemporary);
    
    if (temporaryReadmes.length === 0) {
      return '✅ No temporary READMEs found';
    }
    
    const report: string[] = [];
    report.push(`# Temporary README Cleanup Report\n`);
    report.push(`**Directory:** ${directory}\n`);
    report.push(`**Found:** ${temporaryReadmes.length} temporary README(s)\n`);
    report.push('---\n\n');
    
    if (options.dryRun) {
      report.push('**DRY RUN MODE** - No changes will be made\n\n');
    }
    
    for (const readme of temporaryReadmes) {
      report.push(`## ${readme.filePath}\n`);
      
      if (readme.temporaryMetadata?.temporaryReason) {
        report.push(`**Reason:** ${readme.temporaryMetadata.temporaryReason}\n`);
      }
      
      if (readme.temporaryMetadata?.expiryDate) {
        const expiry = new Date(readme.temporaryMetadata.expiryDate);
        const today = new Date();
        const isExpired = expiry < today;
        report.push(`**Expiry:** ${readme.temporaryMetadata.expiryDate} ${isExpired ? '⚠️ EXPIRED' : ''}\n`);
      }
      
      if (readme.temporaryMetadata?.consolidateInto) {
        report.push(`**Consolidate into:** ${readme.temporaryMetadata.consolidateInto}\n`);
      }
      
      if (!options.dryRun) {
        if (options.autoConsolidate && readme.temporaryMetadata?.consolidateInto) {
          // Consolidate findings
          try {
            const result = await consolidateFindings({
              tempReadme: readme.filePath,
              targetReadme: readme.temporaryMetadata.consolidateInto,
              removeTemp: true,
            });
            report.push(`✅ ${result}\n`);
          } catch (error) {
            report.push(`❌ Failed to consolidate: ${error instanceof Error ? error.message : String(error)}\n`);
          }
        } else if (options.deleteOnly || !readme.temporaryMetadata?.consolidateInto) {
          // Delete only
          try {
            const fullPath = join(PROJECT_ROOT, readme.filePath);
            await unlink(fullPath);
            report.push(`✅ Deleted: ${readme.filePath}\n`);
          } catch (error) {
            report.push(`❌ Failed to delete: ${error instanceof Error ? error.message : String(error)}\n`);
          }
        } else {
          report.push(`⚠️ Skipped (no consolidation target specified)\n`);
        }
      }
      
      report.push('');
    }
    
    return report.join('\n');
  } catch (error) {
    throw new Error(
      `Failed to cleanup temporary READMEs: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

