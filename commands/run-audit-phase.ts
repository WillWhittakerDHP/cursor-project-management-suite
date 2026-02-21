/**
 * Run audit-phase command
 * Usage: npx tsx .cursor/commands/run-audit-phase.ts [phase] [feature-name]
 */

import { auditPhase } from './audit/composite/audit-phase';
import { resolveFeatureName } from './utils';

const phase = process.argv[2] || '3';

void resolveFeatureName(process.argv[3])
  .then((featureName) => {
    console.log(`Running audit for Phase ${phase} of feature ${featureName}...\n`);
    return auditPhase({ phase, featureName });
  })
  .then((result) => {
    console.log(result.output);
    if (result.fullReportPath) {
      console.log(`\n📄 Full report: ${result.fullReportPath}`);
    }
    process.exit(result.success ? 0 : 1);
  })
  .catch((error: unknown) => {
    console.error('Error running audit:', error);
    process.exit(1);
  });

