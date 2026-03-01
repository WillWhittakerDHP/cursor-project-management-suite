/**
 * Build a full WorkflowSpec from tier dispatcher params (config, params, options, featureContext).
 * Used when tier-start/tier-end invoke the kernel path.
 */

import type { WorkflowSpec, ExecutionMode, Profile } from './contracts';
import { PROFILE_DEFAULTS, defaultProfileDefaultsResolver } from './spec-builder';

const DEFAULT_CONSTRAINTS = {
  dryRun: false,
  allowWrites: true,
  allowGit: true,
  allowNetwork: true,
} as const;

function randomRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export interface BuildSpecInput {
  tier: WorkflowSpec['tier'];
  action: 'start' | 'end';
  identifier: string;
  featureContext: { featureId: string; featureName: string };
  mode?: ExecutionMode;
  profile?: Profile;
  runId?: string;
  userChoices?: WorkflowSpec['userChoices'];
  metadata?: WorkflowSpec['metadata'];
}

/** Build a valid WorkflowSpec for kernel.run from tier run params. */
export function buildSpecFromTierRun(input: BuildSpecInput): WorkflowSpec {
  const profile: Profile = input.profile ?? 'balanced';
  const defaults = defaultProfileDefaultsResolver.resolve(profile);
  return {
    specVersion: '1',
    runId: input.runId ?? randomRunId(),
    tier: input.tier,
    action: input.action,
    identifier: input.identifier,
    mode: input.mode ?? 'execute',
    profile,
    featureContext: { ...input.featureContext },
    policies: { ...defaults.policies },
    contextBudget: { ...defaults.contextBudget },
    constraints: { ...DEFAULT_CONSTRAINTS },
    ...(input.userChoices && { userChoices: input.userChoices }),
    ...(input.metadata && { metadata: input.metadata }),
  };
}
