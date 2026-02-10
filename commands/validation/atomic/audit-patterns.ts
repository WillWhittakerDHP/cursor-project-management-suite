/**
 * Atomic Command: Audit Pattern Consistency
 * Checks for missing commands, naming consistency, and pattern adherence
 */

import { readdir, access } from 'fs/promises';
import { join } from 'path';
import { PROJECT_ROOT } from '../../utils/utils';
import { AuditResult, AuditIssue } from './audit-types';

const TIERS = ['feature', 'phase', 'session', 'task'] as const;
const EXPECTED_COMMANDS = {
  start: true,
  change: true,
  end: true,
  checkpoint: true,
} as const;

const TIER_EXCEPTIONS: Record<string, string[]> = {
  feature: ['close'], // feature has 'close' instead of just 'end'
  phase: [], // phase doesn't have 'change' yet
  session: [], // session has all commands
  task: [], // task doesn't have 'change' yet
};

/**
 * Check pattern consistency across tiers
 */
export async function auditPatterns(): Promise<AuditResult> {
  const issues: AuditIssue[] = [];
  const recommendations: string[] = [];

  // Check each tier for expected commands
  for (const tier of TIERS) {
    const tierPath = join(PROJECT_ROOT, '.cursor/commands/tiers', tier);
    
    try {
      // Check composite directory
      const compositePath = join(tierPath, 'composite');
      let compositeFiles: string[] = [];
      try {
        compositeFiles = await readdir(compositePath);
      } catch (error) {
        issues.push({
          severity: 'warning',
          message: `Composite directory not found for tier ${tier}`,
          file: compositePath,
        });
        continue;
      }

      // Check atomic directory
      const atomicPath = join(tierPath, 'atomic');
      let atomicFiles: string[] = [];
      try {
        atomicFiles = await readdir(atomicPath);
      } catch {}

      // Check for expected commands
      const allFiles = [...compositeFiles, ...atomicFiles];
      const commandNames = allFiles
        .filter(f => f.endsWith('.ts'))
        .map(f => f.replace('.ts', ''));

      // Check for start command
      const hasStart = commandNames.some(c => c === `${tier}-start` || c.includes('start'));
      if (!hasStart && EXPECTED_COMMANDS.start) {
        issues.push({
          severity: 'critical',
          message: `Missing ${tier}-start command`,
          file: compositePath,
          suggestion: `Create ${tier}-start.ts in composite directory`,
        });
      }

      // Check for change command
      const hasChange = commandNames.some(c => c === `${tier}-change` || c.includes('change'));
      const exceptions = TIER_EXCEPTIONS[tier] || [];
      if (!hasChange && EXPECTED_COMMANDS.change && !exceptions.includes('change')) {
        issues.push({
          severity: 'warning',
          message: `Missing ${tier}-change command`,
          file: compositePath,
          suggestion: `Consider creating ${tier}-change.ts following the pattern from feature-change.ts or session-change.ts`,
        });
        recommendations.push(`Create ${tier}-change.ts for consistency with other tiers`);
      }

      // Check for end command
      const hasEnd = commandNames.some(c => 
        c === `${tier}-end` || 
        c === `${tier}-complete` || 
        c === `${tier}-close` ||
        c.includes('end') || 
        c.includes('complete') || 
        c.includes('close')
      );
      if (!hasEnd && EXPECTED_COMMANDS.end) {
        issues.push({
          severity: 'critical',
          message: `Missing ${tier}-end command`,
          file: compositePath,
          suggestion: `Create ${tier}-end.ts or ${tier}-complete.ts in composite directory`,
        });
      }

      // Check for checkpoint command
      const hasCheckpoint = commandNames.some(c => c === `${tier}-checkpoint` || c.includes('checkpoint'));
      if (!hasCheckpoint && EXPECTED_COMMANDS.checkpoint) {
        issues.push({
          severity: 'info',
          message: `Missing ${tier}-checkpoint command (may be optional)`,
          file: compositePath,
        });
      }

      // Check naming consistency
      const inconsistentNames = commandNames.filter(c => {
        const expectedPrefix = `${tier}-`;
        return !c.startsWith(expectedPrefix) && !c.includes('plan-') && !c.includes('mark-') && !c.includes('update-') && !c.includes('create-') && !c.includes('log-') && !c.includes('new-');
      });
      
      if (inconsistentNames.length > 0) {
        issues.push({
          severity: 'warning',
          message: `Inconsistent naming in ${tier} tier: ${inconsistentNames.join(', ')}`,
          file: compositePath,
          suggestion: 'Commands should follow {tier}-{action} pattern',
        });
      }

    } catch (error) {
      issues.push({
        severity: 'error',
        message: `Failed to audit tier ${tier}: ${error instanceof Error ? error.message : String(error)}`,
        file: tierPath,
      });
    }
  }

  // Check for plan commands (should exist for all tiers)
  for (const tier of TIERS) {
    const compositePath = join(PROJECT_ROOT, '.cursor/commands/tiers', tier, 'composite');
    try {
      const files = await readdir(compositePath);
      const hasPlan = files.some(f => f === `plan-${tier}.ts`);
      if (!hasPlan) {
        issues.push({
          severity: 'info',
          message: `Missing plan-${tier} command (may be optional)`,
          file: compositePath,
        });
      }
    } catch {}
  }

  const status = issues.some(i => i.severity === 'critical' || i.severity === 'error')
    ? 'error'
    : issues.some(i => i.severity === 'warning')
    ? 'warning'
    : 'pass';

  return {
    check: 'Pattern Consistency',
    status,
    issues,
    recommendations,
    summary: `Found ${issues.length} pattern issues across ${TIERS.length} tiers`,
  };
}

