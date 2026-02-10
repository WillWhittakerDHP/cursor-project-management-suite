/**
 * Composite Planning Command: /planning-plan-tier
 * Tier-agnostic planning command
 * 
 * Routes to appropriate tier-specific logic and uses tier-appropriate templates and validation.
 */

import { planComplete } from './plan-complete';
import { PlanningTier, AlternativeType } from '../../utils/planning-types';

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
    criticalChecks?: import('../../../project-manager/utils/planning-types').CriticalCheckType[];
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
      featureName = feature || 'vue-migration';
      phase = parseInt(identifier, 10);
      if (isNaN(phase)) {
        return `Error: Invalid phase number: ${identifier}`;
      }
      break;
    }
    case 'session': {
      featureName = feature || 'vue-migration';
      sessionId = identifier;
      // Validate session ID format (X.Y)
      if (!/^\d+\.\d+$/.test(identifier)) {
        return `Error: Invalid session ID format. Expected X.Y (e.g., 2.1), got: ${identifier}`;
      }
      break;
    }
    case 'task': {
      featureName = feature || 'vue-migration';
      taskId = identifier;
      // Validate task ID format (X.Y.Z)
      if (!/^\d+\.\d+\.\d+$/.test(identifier)) {
        return `Error: Invalid task ID format. Expected X.Y.Z (e.g., 2.1.1), got: ${identifier}`;
      }
      // Extract session ID from task ID
      const parts = identifier.split('.');
      sessionId = `${parts[0]}.${parts[1]}`;
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
    criticalChecks?: import('../../../project-manager/utils/planning-types').CriticalCheckType[];
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

