/**
 * Background Audit Runner — standalone script spawned by stepStartAudit.
 *
 * Runs the tier-appropriate npm audit scripts, reads resulting JSON files,
 * computes governance scores, and appends a "start" entry to the baseline log.
 *
 * Invoked via:  npx tsx .cursor/commands/audit/background-audit-runner.ts <argsJson>
 *
 * argsJson shape: { tier, identifier, featureName, tierStamp }
 */

import { execSync } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { PROJECT_ROOT, FRONTEND_ROOT } from '../utils/utils';
import { appendBaselineEntry } from './baseline-log';
import type { AuditTier } from './types';

const CLIENT_ROOT = join(PROJECT_ROOT, FRONTEND_ROOT);
const AUDIT_DIR = join(CLIENT_ROOT, '.audit-reports');

interface RunnerArgs {
  tier: AuditTier;
  identifier: string;
  featureName: string;
  tierStamp: string;
}

const TIER_NPM_SCRIPTS: Record<AuditTier, string> = {
  task: 'audit:tier-task',
  session: 'audit:tier-session',
  phase: 'audit:tier-phase',
  feature: 'audit:tier-feature',
};

async function readJsonScore(jsonPath: string): Promise<Record<string, unknown> | null> {
  if (!existsSync(jsonPath)) return null;
  try {
    return JSON.parse(await readFile(jsonPath, 'utf-8'));
  } catch {
    return null;
  }
}

async function computeGovernanceScores(tier: AuditTier): Promise<Record<string, number>> {
  const scores: Record<string, number> = {};

  if (tier === 'session') {
    // Type constant inventory
    const tciPath = join(AUDIT_DIR, 'type-constant-inventory-audit.json');
    const tciData = await readJsonScore(tciPath) as {
      summary?: { classificationIssues?: Record<string, number> };
    } | null;
    if (tciData?.summary?.classificationIssues) {
      const issues = tciData.summary.classificationIssues;
      let s = 100;
      s -= (issues.mixedTypeConstantFiles ?? 0) * 2;
      s -= (issues.inlineTypesInComposables ?? 0) * 1;
      s -= (issues.duplicateTypeNames ?? 0) * 5;
      s -= (issues.configsWithLogic ?? 0) * 2;
      s -= (issues.cleanupCandidates ?? 0) * 3;
      scores['type-constant-inventory'] = Math.max(0, s);
    }

    // Composable governance
    const chPath = join(AUDIT_DIR, 'composable-health-audit.json');
    const chData = await readJsonScore(chPath) as {
      findings?: Array<{ ruleId?: string }>;
    } | null;
    if (chData) {
      let s = 100;
      for (const f of chData.findings ?? []) {
        const id = f.ruleId ?? '';
        if (id === 'missing-return-type') s -= 5;
        else if (id === 'oversized-return') s -= 2;
        else if (id === 'excessive-composable-imports') s -= 2;
        else if (id === 'untyped-provide') s -= 2;
      }
      const fcPath = join(AUDIT_DIR, 'function-complexity-audit.json');
      const fcData = await readJsonScore(fcPath) as {
        files?: Array<{ priority?: string }>;
      } | null;
      if (fcData) {
        const p0 = (fcData.files ?? []).filter(f => f.priority === 'P0').length;
        s -= p0 * 3;
      }
      scores['composable-governance'] = Math.max(0, s);
    }

    // Function governance
    const fgPath = join(AUDIT_DIR, 'function-complexity-audit.json');
    const fgData = await readJsonScore(fgPath) as {
      files?: Array<{ priority?: string }>;
    } | null;
    if (fgData) {
      const files = fgData.files ?? [];
      const p0 = files.filter(f => f.priority === 'P0').length;
      const p1 = files.filter(f => f.priority === 'P1').length;
      scores['function-governance'] = Math.max(0, 100 - p0 * 3 - p1 * 1);
    }

    // Component governance
    const cgPath = join(AUDIT_DIR, 'component-health-audit.json');
    const cgData = await readJsonScore(cgPath) as {
      files?: Array<{ priority?: string }>;
    } | null;
    if (cgData) {
      const files = cgData.files ?? [];
      const p0 = files.filter(f => f.priority === 'P0').length;
      const p1 = files.filter(f => f.priority === 'P1').length;
      scores['component-governance'] = Math.max(0, 100 - p0 * 3 - p1 * 1);
    }
  }

  return scores;
}

async function main(): Promise<void> {
  const rawArgs = process.argv[2];
  if (!rawArgs) {
    process.stderr.write('background-audit-runner: missing args\n');
    process.exit(1);
  }

  let args: RunnerArgs;
  try {
    args = JSON.parse(rawArgs);
  } catch {
    process.stderr.write('background-audit-runner: invalid args JSON\n');
    process.exit(1);
  }

  const { tier, identifier, featureName, tierStamp } = args;
  const npmScript = TIER_NPM_SCRIPTS[tier];

  // 1. Run the npm audit script (writes JSON files to client/.audit-reports/)
  if (existsSync(CLIENT_ROOT)) {
    try {
      execSync(`npm run ${npmScript}`, {
        cwd: CLIENT_ROOT,
        stdio: 'pipe',
        timeout: 600_000,
      });
    } catch {
      // Non-fatal: we still read whatever JSON was produced
    }
  }

  // 2. Read tier-quality score from the generated JSON files
  const scores: Record<string, number> = {};

  // The tier-quality audit JSON files are specific to each tier's config.
  // We read what exists and compute a simple tier-quality score.
  const tierQualityJsons: Record<AuditTier, string[]> = {
    task: ['typecheck/typecheck-audit.json', 'loop-mutation-audit.json', 'hardcoding-audit.json', 'error-handling-audit.json', 'naming-convention-audit.json', 'security-audit.json'],
    session: ['component-logic-audit.json', 'composables-logic-audit.json', 'function-complexity-audit.json', 'constants-consolidation-audit.json', 'todo-aging-audit.json', 'component-health-audit.json', 'composable-health-audit.json', 'type-escape-audit.json', 'type-constant-inventory-audit.json'],
    phase: ['typecheck/typecheck-audit.json', 'type-similarity-audit.json', 'duplication-audit.json', 'unused-code-audit.json', 'pattern-detection-audit.json', 'import-graph-audit.json', 'file-cohesion-audit.json', 'deprecation-audit.json', 'api-contract-audit.json', 'data-flow-audit.json', 'type-health-audit.json', 'data-flow-health-audit.json'],
    feature: ['test-audit.json', 'coverage-risk-crossref-audit.json', 'bundle-size-budget-audit.json', 'api-versioning-audit.json', 'dep-freshness-audit.json', 'security-audit.json', 'audit-meta-report.json'],
  };

  let auditFilesFound = 0;
  for (const relPath of tierQualityJsons[tier]) {
    if (existsSync(join(AUDIT_DIR, relPath))) auditFilesFound++;
  }
  const total = tierQualityJsons[tier].length;
  if (total > 0) {
    scores['tier-quality-coverage'] = Math.round((auditFilesFound / total) * 100);
  }

  // 3. Compute governance scores (session tier gets the detailed ones)
  const govScores = await computeGovernanceScores(tier);
  Object.assign(scores, govScores);

  // 4. Append to baseline log
  await appendBaselineEntry({
    tierStamp,
    tier,
    identifier,
    phase: 'start',
    timestamp: new Date().toISOString(),
    scores,
    featureName,
  });
}

main().catch((err) => {
  process.stderr.write(`background-audit-runner failed: ${err}\n`);
  process.exit(1);
});
