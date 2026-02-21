/**
 * Composite Command: /readme-audit-all
 * 
 * Tier: Cross-tier utility
 * Operates on: README files
 * 
 * Description: Audit all READMEs in .cursor folder and generate report
 */

import { auditReadmes } from '../atomic/readme-audit';
import { ReadmeAuditResult } from '../types';

export interface AuditAllResult {
  /** Total READMEs audited */
  total: number;
  /** Bloated READMEs (>300 lines) */
  bloated: ReadmeAuditResult[];
  /** Temporary READMEs */
  temporary: ReadmeAuditResult[];
  /** READMEs with structure issues */
  structureIssues: ReadmeAuditResult[];
  /** READMEs with missing sections */
  missingSections: ReadmeAuditResult[];
  /** All results */
  allResults: ReadmeAuditResult[];
}

/**
 * Audit all READMEs in .cursor folder
 * 
 * @returns Audit report
 */
export async function auditAllReadmes(): Promise<string> {
  try {
    const results = await auditReadmes('.cursor');
    
    const auditResult: AuditAllResult = {
      total: results.length,
      bloated: results.filter(r => r.isBloated),
      temporary: results.filter(r => r.isTemporary),
      structureIssues: results.filter(r => r.structureIssues.length > 0),
      missingSections: results.filter(r => r.missingSections.length > 0),
      allResults: results,
    };
    
    return formatAuditReport(auditResult);
  } catch (_error) {
    throw new Error(
      `Failed to audit all READMEs: ${_error instanceof Error ? _error.message : String(_error)}`
    );
  }
}

/**
 * Format audit report
 */
function formatAuditReport(result: AuditAllResult): string {
  const lines: string[] = [];
  
  lines.push('# README Audit Report\n');
  lines.push(`**Date:** ${new Date().toISOString().split('T')[0]}\n`);
  lines.push(`**Total READMEs:** ${result.total}\n`);
  lines.push('---\n\n');
  
  // Bloated READMEs
  if (result.bloated.length > 0) {
    lines.push('## ⚠️ Bloated READMEs (>300 lines)\n');
    result.bloated.forEach(r => {
      lines.push(`- **${r.filePath}** (${r.lineCount} lines)`);
    });
    lines.push('');
  }
  
  // Temporary READMEs
  if (result.temporary.length > 0) {
    lines.push('## 🔴 Temporary READMEs\n');
    result.temporary.forEach(r => {
      lines.push(`- **${r.filePath}**`);
      if (r.temporaryMetadata?.temporaryReason) {
        lines.push(`  - Reason: ${r.temporaryMetadata.temporaryReason}`);
      }
      if (r.temporaryMetadata?.expiryDate) {
        lines.push(`  - Expiry: ${r.temporaryMetadata.expiryDate}`);
      }
      if (r.temporaryMetadata?.consolidateInto) {
        lines.push(`  - Consolidate into: ${r.temporaryMetadata.consolidateInto}`);
      }
    });
    lines.push('');
  }
  
  // Structure issues
  if (result.structureIssues.length > 0) {
    lines.push('## ⚠️ Structure Issues\n');
    result.structureIssues.forEach(r => {
      lines.push(`- **${r.filePath}**`);
      r.structureIssues.forEach(issue => {
        lines.push(`  - ${issue}`);
      });
    });
    lines.push('');
  }
  
  // Missing sections
  if (result.missingSections.length > 0) {
    lines.push('## ⚠️ Missing Sections\n');
    result.missingSections.forEach(r => {
      lines.push(`- **${r.filePath}**`);
      r.missingSections.forEach(section => {
        lines.push(`  - Missing: ${section}`);
      });
    });
    lines.push('');
  }
  
  // Summary
  lines.push('## Summary\n');
  lines.push(`- ✅ Total: ${result.total}`);
  lines.push(`- ⚠️ Bloated: ${result.bloated.length}`);
  lines.push(`- 🔴 Temporary: ${result.temporary.length}`);
  lines.push(`- ⚠️ Structure Issues: ${result.structureIssues.length}`);
  lines.push(`- ⚠️ Missing Sections: ${result.missingSections.length}`);
  
  return lines.join('\n');
}

