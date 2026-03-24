/**
 * Profile defaults resolver for WorkflowSpec (charter §7.1, §7.4).
 */

import type { Profile, PolicySet, ContextBudgetConfig, ProfileDefaultsResolver } from './contracts';

const BASE_BUDGET: ContextBudgetConfig = {
  maxTokens: 8000,
  maxArtifacts: 15,
  maxFiles: 10,
  includeHistory: 'recent',
};

/** Matrix: profile → policies + context budget. */
export const PROFILE_DEFAULTS: Record<
  Profile,
  { policies: PolicySet; contextBudget: ContextBudgetConfig }
> = {
  fast: {
    policies: {
      governance: 'warn',
      audits: 'start_only',
      tests: 'skip',
      docs: 'minimal',
      git: 'safe',
      cascade: 'manual_confirm',
    },
    contextBudget: { ...BASE_BUDGET, maxTokens: 6000, maxArtifacts: 10 },
  },
  balanced: {
    policies: {
      governance: 'warn',
      audits: 'end_only',
      tests: 'changed_only',
      docs: 'standard',
      git: 'safe',
      cascade: 'manual_confirm',
    },
    contextBudget: BASE_BUDGET,
  },
  strict: {
    policies: {
      governance: 'enforce',
      audits: 'full',
      tests: 'full',
      docs: 'strict',
      git: 'full',
      cascade: 'manual_confirm',
    },
    contextBudget: { ...BASE_BUDGET, maxTokens: 12000, maxArtifacts: 25 },
  },
  debug: {
    policies: {
      governance: 'warn',
      audits: 'full',
      tests: 'full',
      docs: 'strict',
      git: 'safe',
      cascade: 'manual_confirm',
    },
    contextBudget: { ...BASE_BUDGET, maxTokens: 16000, maxArtifacts: 30 },
  },
};

export const defaultProfileDefaultsResolver: ProfileDefaultsResolver = {
  resolve(profile: Profile): { policies: PolicySet; contextBudget: ContextBudgetConfig } {
    return PROFILE_DEFAULTS[profile] ?? PROFILE_DEFAULTS.balanced;
  },
};
