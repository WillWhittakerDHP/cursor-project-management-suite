/**
 * Build WorkflowSpec from tier start/end run parameters.
 */

import type {
  WorkflowSpec,
  Tier,
  Action,
  ExecutionMode,
  Profile,
  ProfileDefaultsResolver,
} from './contracts';
import type { WorkProfile } from './work-profile';
import { defaultProfileDefaultsResolver } from './spec-builder';

export interface BuildSpecFromTierRunParams {
  tier: Tier;
  action: Action;
  identifier: string;
  featureContext: { featureId: string; featureName: string };
  mode: ExecutionMode;
  userChoices?: WorkflowSpec['userChoices'];
  workProfile?: WorkProfile;
  metadata?: WorkflowSpec['metadata'];
  profile?: Profile;
  profileDefaults?: ProfileDefaultsResolver;
}

function runIdFor(tier: Tier, action: Action, identifier: string): string {
  const safe = identifier.replace(/\W/g, '_').slice(0, 80);
  return `run_${tier}_${action}_${safe}_${Date.now()}`;
}

function profileForMode(mode: ExecutionMode, explicit?: Profile): Profile {
  if (explicit) return explicit;
  return mode === 'plan' ? 'strict' : 'balanced';
}

export function buildSpecFromTierRun(params: BuildSpecFromTierRunParams): WorkflowSpec {
  const resolver = params.profileDefaults ?? defaultProfileDefaultsResolver;
  const profile = profileForMode(params.mode, params.profile);
  const { policies, contextBudget } = resolver.resolve(profile);

  return {
    specVersion: '1',
    runId: runIdFor(params.tier, params.action, params.identifier),
    tier: params.tier,
    action: params.action,
    identifier: params.identifier,
    mode: params.mode,
    profile,
    featureContext: params.featureContext,
    policies,
    contextBudget,
    constraints: {
      dryRun: params.mode === 'plan',
      allowWrites: params.mode === 'execute',
      allowGit: params.mode === 'execute',
      allowNetwork: false,
    },
    ...(params.userChoices != null && Object.keys(params.userChoices).length > 0
      ? { userChoices: params.userChoices }
      : {}),
    ...(params.workProfile != null && { workProfile: params.workProfile }),
    ...(params.metadata != null && { metadata: params.metadata }),
  };
}
