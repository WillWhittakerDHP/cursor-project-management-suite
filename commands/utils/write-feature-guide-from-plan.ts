/**
 * One-off script: Write feature-guide-shaped content from PROJECT_PLAN to a duplicate file.
 * Use this to pick up changes from PROJECT_PLAN without overwriting the existing feature guide.
 * Merge desired sections from the output file into feature-{name}-guide.md manually.
 *
 * Usage: npx tsx .cursor/commands/utils/write-feature-guide-from-plan.ts [featureId]
 * Example: npx tsx .cursor/commands/utils/write-feature-guide-from-plan.ts appointment-workflow
 *          npx tsx .cursor/commands/utils/write-feature-guide-from-plan.ts 6
 */

import { getFeatureGuideFromProjectPlan } from './project-plan-adapter';
import { resolveFeatureId } from './feature-context';
import { writeProjectFile } from './utils';
import { WorkflowCommandContext } from './command-context';

async function main(): Promise<void> {
  const featureId = process.argv[2]?.trim();
  if (!featureId) {
    console.error('Usage: npx tsx write-feature-guide-from-plan.ts <featureId>');
    console.error('  featureId: feature number (e.g. 6) or directory name (e.g. appointment-workflow)');
    process.exit(1);
  }

  const featureName = await resolveFeatureId(featureId).catch((err) => {
    console.error('Failed to resolve feature:', err instanceof Error ? err.message : err);
    process.exit(1);
  });

  const content = await getFeatureGuideFromProjectPlan(featureName);
  if (!content.trim()) {
    console.error(`No Feature block found in PROJECT_PLAN for "${featureName}".`);
    process.exit(1);
  }

  const context = new WorkflowCommandContext(featureName);
  const outputPath = `${context.paths.getBasePath()}/feature-${featureName}-guide-from-plan.md`;
  await writeProjectFile(outputPath, content);

  console.log(`Wrote: ${outputPath}`);
  console.log('');
  console.log('Merge desired sections into feature-' + featureName + '-guide.md; do not overwrite existing content.');
}

main();
