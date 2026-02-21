/**
 * Composite Command: /checkpoint [tier] [identifier]
 * Unified checkpoint across all tiers
 * 
 * Tier: Cross-tier utility
 * Operates on: Checkpoint operations across feature/phase/session/task
 */

import { resolveFeatureName } from '../../utils';
import { createCheckpoint, CheckpointTier, CreateCheckpointParams } from '../atomic/create-checkpoint';
import { featureCheckpoint } from '../../tiers/feature/atomic/feature-checkpoint';
import { phaseCheckpoint } from '../../tiers/phase/composite/phase';
import { sessionCheckpoint } from '../../tiers/session/composite/session';
import { taskCheckpoint } from '../../tiers/task/atomic/checkpoint';

/**
 * Unified checkpoint command
 * 
 * Delegates to tier-specific checkpoint commands for full functionality,
 * but provides consistent interface across all tiers.
 * 
 * @param tier Checkpoint tier
 * @param identifier Optional identifier (required for phase/session/task)
 * @param featureName Optional feature name (from .current-feature or git branch if omitted)
 * @param runQualityChecks Whether to run quality checks (default: false)
 * @param notes Optional checkpoint notes
 * @returns Formatted checkpoint output
 */
export async function checkpoint(
  tier: CheckpointTier,
  identifier?: string,
  featureName?: string,
  runQualityChecks: boolean = false,
  notes?: string
): Promise<string> {
  const resolved = await resolveFeatureName(featureName);
  // For task tier, delegate to task checkpoint (includes quality checks)
  if (tier === 'task') {
    if (!identifier) {
      return 'Error: Task identifier is required for task checkpoints';
    }
    const result = await taskCheckpoint(identifier, notes);
    return result.output;
  }
  
  // For other tiers, use unified checkpoint logic
  const params: CreateCheckpointParams = {
    tier,
    identifier,
    featureName: resolved,
    runQualityChecks,
    notes
  };
  
  const result = await createCheckpoint(params);
  
  if (!result.success) {
    return result.output;
  }
  
  // For feature/phase/session, also call tier-specific commands for full functionality
  let tierSpecificOutput = '';
  
  try {
    switch (tier) {
      case 'feature':
        tierSpecificOutput = await featureCheckpoint(resolved);
        break;
      case 'phase':
        if (!identifier) {
          return 'Error: Phase identifier is required for phase checkpoints';
        }
        tierSpecificOutput = await phaseCheckpoint(identifier, resolved);
        break;
      case 'session':
        if (!identifier) {
          return 'Error: Session ID is required for session checkpoints';
        }
        tierSpecificOutput = await sessionCheckpoint(identifier, resolved);
        break;
    }
  } catch (_error) {
    // If tier-specific command fails, still return unified checkpoint result
    tierSpecificOutput = `\n⚠️ Tier-specific checkpoint failed: ${_error instanceof Error ? _error.message : String(_error)}\n`;
  }
  
  // Combine outputs
  const combinedOutput = result.output + '\n\n---\n\n' + tierSpecificOutput;
  
  return combinedOutput;
}

/**
 * Review checkpoint quality
 * 
 * @param tier Checkpoint tier
 * @param identifier Optional identifier
 * @param featureName Optional feature name (from .current-feature or git branch if omitted)
 * @returns Checkpoint review output
 */
export async function checkpointReview(
  tier: CheckpointTier,
  identifier?: string,
  featureName?: string
): Promise<string> {
  const resolved = await resolveFeatureName(featureName);
  const output: string[] = [];
  
  output.push(`# Checkpoint Review: ${tier}${identifier ? ` ${identifier}` : ''}\n`);
  output.push('---\n\n');
  
  // Create checkpoint with quality checks enabled
  const params: CreateCheckpointParams = {
    tier,
    identifier,
    featureName: resolved,
    runQualityChecks: true
  };
  
  const result = await createCheckpoint(params);
  
  if (!result.success) {
    return result.output;
  }
  
  output.push(result.output);
  
  // Add review checklist
  output.push('\n---\n');
  output.push('## Review Checklist\n');
  output.push('- [ ] All quality checks passed\n');
  output.push('- [ ] Progress is on track\n');
  output.push('- [ ] No blockers identified\n');
  output.push('- [ ] Next steps are clear\n');
  
  if (result.qualityChecks) {
    output.push('\n### Quality Check Results\n');
    output.push(`**Lint:** ${result.qualityChecks.results.lint.success ? '✅ Passed' : '❌ Failed'}\n`);
    output.push(`**Type Check:** ${result.qualityChecks.results.typeCheck.success ? '✅ Passed' : '❌ Failed'}\n`);
    if (result.qualityChecks.results.test) {
      output.push(`**Tests:** ${result.qualityChecks.results.test.success ? '✅ Passed' : '❌ Failed'}\n`);
    }
  }
  
  return output.join('\n');
}

