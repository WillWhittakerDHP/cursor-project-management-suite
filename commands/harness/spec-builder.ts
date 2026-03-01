/**
 * SpecBuilder: converts slash command + args into validated WorkflowSpec.
 * Entry boundary only — kernel never parses slash commands.
 * Charter §7.4: validate before return; invalid specs fail fast.
 */

import type {
  WorkflowSpec,
  Tier,
  Action,
  PolicySet,
  ContextBudgetConfig,
  ConstraintSet,
  Profile,
  SpecBuilder,
  ProfileDefaultsResolver,
} from './contracts';

export const PROFILE_DEFAULTS: Record<
  Profile,
  { policies: PolicySet; contextBudget: ContextBudgetConfig }
> = {
  fast: {
    policies: {
      governance: 'warn',
      audits: 'off',
      tests: 'skip',
      docs: 'minimal',
      git: 'safe',
      cascade: 'manual_confirm',
    },
    contextBudget: { maxTokens: 4000, maxArtifacts: 8, maxFiles: 5, includeHistory: 'recent' },
  },
  balanced: {
    policies: {
      governance: 'warn',
      audits: 'end_only',
      tests: 'changed_only',
      docs: 'standard',
      git: 'full',
      cascade: 'manual_confirm',
    },
    contextBudget: { maxTokens: 8000, maxArtifacts: 15, maxFiles: 10, includeHistory: 'recent' },
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
    contextBudget: { maxTokens: 12000, maxArtifacts: 25, maxFiles: 20, includeHistory: 'full' },
  },
  debug: {
    policies: {
      governance: 'warn',
      audits: 'end_only',
      tests: 'changed_only',
      docs: 'standard',
      git: 'safe',
      cascade: 'manual_confirm',
    },
    contextBudget: { maxTokens: 10000, maxArtifacts: 20, maxFiles: 15, includeHistory: 'recent' },
  },
};

const DEFAULT_CONSTRAINTS: ConstraintSet = {
  dryRun: false,
  allowWrites: true,
  allowGit: true,
  allowNetwork: true,
};

/** Parse command name to tier and action. e.g. "session-start" -> session, start. */
function parseCommand(command: string): { tier: Tier; action: Action } | null {
  const normalized = command.replace(/^\/+/, '').toLowerCase();
  const match = normalized.match(/^(feature|phase|session|task)-(start|end|reopen|plan|change|validate|checkpoint|complete)$/);
  if (!match) return null;
  return { tier: match[1] as Tier, action: match[2] as Action };
}

/** Extract identifier from args (first positional or tier-specific key). */
function getIdentifier(
  tier: Tier,
  args: Record<string, string | undefined>
): string | undefined {
  const key = tier === 'feature' ? 'featureName' : tier === 'phase' ? 'phaseNumber' : tier === 'session' ? 'sessionId' : 'taskId';
  if (args[key] !== undefined && args[key] !== '') return args[key];
  const first = args['0'] ?? args['identifier'];
  return first;
}

function randomRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Default SpecBuilder implementation.
 * Validates: featureContext present (from options or derived), identifier valid for tier, pass in 1..3 when set.
 */
export const defaultSpecBuilder: SpecBuilder = {
  async fromSlashCommand(
    command: string,
    args: Record<string, string | undefined>,
    options?: Partial<WorkflowSpec>
  ): Promise<WorkflowSpec> {
    const parsed = parseCommand(command);
    if (!parsed) {
      throw new Error(
        `Invalid slash command for harness: "${command}". Expected form: <tier>-<action> (e.g. session-start, task-end).`
      );
    }
    const { tier, action } = parsed;
    const identifier = getIdentifier(tier, args) ?? options?.identifier ?? '';
    if (!identifier.trim()) {
      throw new Error(
        `WorkflowSpec validation failed: missing identifier for ${tier}-${action}. Provide via args or options.identifier.`
      );
    }
    const profile: Profile = options?.profile ?? 'balanced';
    const defaults = PROFILE_DEFAULTS[profile];
    const featureContext = options?.featureContext;
    if (!featureContext?.featureId || !featureContext?.featureName) {
      throw new Error(
        `WorkflowSpec validation failed: featureContext is required (featureId and featureName). Provide via options.featureContext.`
      );
    }
    const pass = options?.pass;
    if (pass !== undefined && (pass < 1 || pass > 3)) {
      throw new Error(
        `WorkflowSpec validation failed: pass must be 1, 2, or 3 when set; got ${pass}.`
      );
    }
    const spec: WorkflowSpec = {
      specVersion: '1',
      runId: options?.runId ?? randomRunId(),
      tier,
      action,
      identifier: identifier.trim(),
      mode: options?.mode ?? 'execute',
      profile,
      featureContext: { ...featureContext },
      policies: { ...defaults.policies, ...options?.policies },
      contextBudget: { ...defaults.contextBudget, ...options?.contextBudget },
      constraints: { ...DEFAULT_CONSTRAINTS, ...options?.constraints },
      ...(pass !== undefined && { pass }),
      ...(options?.previousRunSummary && { previousRunSummary: options.previousRunSummary }),
      ...(options?.userChoices && { userChoices: options.userChoices }),
      ...(options?.metadata && { metadata: options.metadata }),
    };
    return spec;
  },
};

/** Profile defaults resolver for kernel deps (charter §7.2). */
export const defaultProfileDefaultsResolver: ProfileDefaultsResolver = {
  resolve(profile: Profile) {
    return PROFILE_DEFAULTS[profile];
  },
};
