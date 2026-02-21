/**
 * Simple runner script for audit-commands
 * Run with: npx tsx .cursor/commands/validation/run-audit.ts
 */

import { auditCommands } from './composite/audit-commands';

async function main() {
  try {
    const report = await auditCommands();
    console.log(report);
    process.exit(0);
  } catch (_error) {
    console.error('Audit failed:', _error);
    process.exit(1);
  }
}

main();

