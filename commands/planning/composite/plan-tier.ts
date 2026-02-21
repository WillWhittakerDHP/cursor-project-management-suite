/**
 * Composite Planning Command: /planning-plan-tier
 * Tier-agnostic planning command
 * 
 * Routes to appropriate tier-specific logic and uses tier-appropriate templates and validation.
 */

import { planComplete } from './plan-complete';
import { PlanningTier, AlternativeType, CriticalCheckType } from '../../utils/planning-types';
import { resolveFeatureName } from '../../utils';

/**
 * Plan for a specific tier
 * 
 * @param tier Planning tier (feature/phase/session/task)
 * @param identifier Tier identifier (feature name, phase number, session ID, or task ID)
 * @param description Natural language description
 * @param feature Feature name (required for phase/session/task tiers)
 * @param options Planning options
 * @returns Planning result
 */
export async function planTier(
  tier: PlanningTier,
  identifier: string,
  description: string,
  feature?: string,
  options: {
    docCheckType?: 'component' | 'transformer' | 'pattern' | 'migration';
    requireAlternatives?: boolean;
    alternativeType?: AlternativeType;
    requireDecision?: boolean;
    criticalChecks?: CriticalCheckType[];
    requireCriticalChecks?: boolean;
  } = {}
): Promise<string> {
  const output: string[] = [];
  
  output.push(`# ${tier.charAt(0).toUpperCase() + tier.slice(1)} Planning: ${identifier}\n`);
  output.push(`**Description:** ${description}\n`);
  output.push('\n---\n');
  
  // Determine tier-specific options
  const tierOptions = getTierOptions(tier, options);
  
  // Extract context based on tier
  let phase: number | undefined;
  let sessionId: string | undefined;
  let taskId: string | undefined;
  let featureName: string | undefined;
  
  switch (tier) {
    case 'feature':
      featureName = identifier;
      break;
    case 'phase': {
      featureName = await resolveFeatureName(feature);
      phase = parseInt(identifier, 10);
      if (isNaN(phase)) {
        return `Error: Invalid phase number: ${identifier}`;
      }
      break;
    }
    case 'session': {
      featureName = await resolveFeatureName(feature);
      sessionId = identifier;
      // Validate session ID format (X.Y.Z)
      if (!/^\d+\.\d+\.\d+$/.test(identifier)) {
        return `Error: Invalid session ID format. Expected X.Y.Z (e.g., 4.1.3), got: ${identifier}`;
      }
      break;
    }
    case 'task': {
      featureName = await resolveFeatureName(feature);
      taskId = identifier;
      // Validate task ID format (X.Y.Z.A)
      if (!/^\d+\.\d+\.\d+\.\d+$/.test(identifier)) {
        return `Error: Invalid task ID format. Expected X.Y.Z.A (e.g., 4.1.3.1), got: ${identifier}`;
      }
      // Extract session ID from task ID (X.Y.Z.A → X.Y.Z)
      const parts = identifier.split('.');
      sessionId = `${parts[0]}.${parts[1]}.${parts[2]}`;
      break;
    }
  }
  
  // Call plan-complete with tier-specific context
  const planResult = await planComplete(
    description,
    tier,
    featureName,
    phase,
    sessionId,
    taskId,
    tierOptions
  );
  
  output.push(planResult);
  
  return output.join('\n');
}

/**
 * Get tier-specific planning options
 */
function getTierOptions(
  tier: PlanningTier,
  providedOptions: {
    docCheckType?: 'component' | 'transformer' | 'pattern' | 'migration';
    requireAlternatives?: boolean;
    alternativeType?: AlternativeType;
    requireDecision?: boolean;
    criticalChecks?: CriticalCheckType[];
    requireCriticalChecks?: boolean;
  }
): typeof providedOptions {
  const defaults: Record<PlanningTier, Partial<typeof providedOptions>> = {
    feature: {
      docCheckType: 'migration',
      requireAlternatives: true,
      alternativeType: 'architecture',
      requireDecision: true,
      requireCriticalChecks: true,
    },
    phase: {
      docCheckType: 'pattern',
      requireAlternatives: false,
      alternativeType: 'approach',
      requireDecision: false,
      requireCriticalChecks: true,
    },
    session: {
      docCheckType: 'component',
      requireAlternatives: false,
      alternativeType: 'pattern',
      requireDecision: false,
      requireCriticalChecks: true,
    },
    task: {
      docCheckType: 'component',
      requireAlternatives: false,
      alternativeType: 'approach',
      requireDecision: false,
      requireCriticalChecks: false,
    },
  };
  
  return {
    ...defaults[tier],
    ...providedOptions,
  };
}

