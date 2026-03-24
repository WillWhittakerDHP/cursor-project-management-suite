/**
 * Advisory-only model recommendation: reads `.project-manager/agent-model-config.json` each run.
 * Does not change Cursor's active model; surfaces guidance via pluginAdvisory + optional step diagnostic.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type {
  HarnessContext,
  PolicyPlugin,
  PluginCapability,
  PluginStepResult,
  Tier,
  TierOutcome,
  StepId,
} from '../contracts';
import type { GateProfile } from '../work-profile';
import { PROJECT_ROOT } from '../../utils/utils';
import { recordWorkflowFrictionWarning } from '../../utils/workflow-friction-log';

const CONFIG_REL = join('.project-manager', 'agent-model-config.json');

type ModelPreference = { model: string; reason: string };

type AgentModelConfigFile = {
  version?: number;
  modelPreferences?: Record<string, unknown>;
  gateProfileOverrides?: Partial<Record<GateProfile, unknown>>;
};

type ParsedRun = {
  advisoryMarkdown?: string;
  diagnosticLine?: string;
};

function isModelPreference(value: unknown): value is ModelPreference {
  if (value === null || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return typeof o.model === 'string' && typeof o.reason === 'string';
}

function resolveRecommendation(
  config: AgentModelConfigFile,
  tier: Tier,
  gateProfile?: GateProfile
): ModelPreference | null {
  const gp = gateProfile && config.gateProfileOverrides?.[gateProfile];
  if (gp !== undefined && isModelPreference(gp)) {
    return gp;
  }
  const tierPref = config.modelPreferences?.[tier];
  if (tierPref !== undefined && isModelPreference(tierPref)) {
    return tierPref;
  }
  return null;
}

function formatAdvisory(pref: ModelPreference): string {
  return [
    '---',
    `**Recommended agent/model for this run:** ${pref.model}`,
    `*${pref.reason}*`,
    'If you are not already using this model, consider switching before proceeding.',
    '---',
  ].join('\n');
}

export class ModelRecommendationPlugin implements PolicyPlugin {
  name = 'model_recommendation';
  version = '1.0.0';
  priority = 100;
  capabilities: PluginCapability[] = ['read_context', 'emit_diagnostic'];

  private memo: { runId: string; parsed: ParsedRun } | null = null;

  appliesTo(): boolean {
    return true;
  }

  private parseForRun(ctx: HarnessContext): ParsedRun {
    if (this.memo?.runId === ctx.spec.runId) {
      return this.memo.parsed;
    }
    const parsed = this.loadConfigAndResolve(ctx);
    this.memo = { runId: ctx.spec.runId, parsed };
    return parsed;
  }

  private frictionExtra(ctx: HarnessContext): {
    tier: string;
    action: 'start' | 'end' | 'reopen' | 'plan' | 'change' | 'validate' | 'checkpoint';
    identifier: string;
    featureName: string;
  } {
    return {
      tier: ctx.spec.tier,
      action: ctx.spec.action,
      identifier: ctx.spec.identifier,
      featureName: ctx.spec.featureContext.featureName,
    };
  }

  private logConfigFailure(ctx: HarnessContext, message: string): void {
    recordWorkflowFrictionWarning('model_recommendation_plugin', message, this.frictionExtra(ctx));
  }

  private loadConfigAndResolve(ctx: HarnessContext): ParsedRun {
    const abs = join(PROJECT_ROOT, CONFIG_REL);
    if (!existsSync(abs)) {
      return {};
    }
    let raw: string;
    try {
      raw = readFileSync(abs, 'utf8');
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      this.logConfigFailure(ctx, `Could not read agent model config: ${detail}`);
      return {};
    }
    let data: unknown;
    try {
      data = JSON.parse(raw) as unknown;
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      this.logConfigFailure(ctx, `Invalid JSON in agent model config: ${detail}`);
      return {};
    }
    if (data === null || typeof data !== 'object') {
      this.logConfigFailure(ctx, 'Agent model config must be a JSON object.');
      return {};
    }
    const file = data as AgentModelConfigFile;
    if (typeof file.version === 'number' && file.version !== 1) {
      this.logConfigFailure(
        ctx,
        `Agent model config version ${file.version} is not supported (expected 1).`
      );
      return {};
    }
    if (file.modelPreferences === undefined || typeof file.modelPreferences !== 'object') {
      this.logConfigFailure(ctx, 'Agent model config missing or invalid modelPreferences object.');
      return {};
    }
    const pref = resolveRecommendation(file, ctx.spec.tier, ctx.spec.workProfile?.gateProfile);
    if (!pref) {
      return {};
    }
    const advisoryMarkdown = formatAdvisory(pref);
    const diagnosticLine = `Model recommendation: ${pref.model} (see control plane message).`;
    return { advisoryMarkdown, diagnosticLine };
  }

  async beforeStep(ctx: HarnessContext, stepId: StepId): Promise<PluginStepResult> {
    if (stepId !== 'validate_identifier') {
      return { action: 'continue' };
    }
    const { diagnosticLine } = this.parseForRun(ctx);
    if (!diagnosticLine) {
      return { action: 'continue' };
    }
    return { action: 'continue', diagnostic: diagnosticLine };
  }

  contributeOutcome(ctx: HarnessContext): Partial<TierOutcome> {
    const { advisoryMarkdown } = this.parseForRun(ctx);
    if (!advisoryMarkdown) {
      return {};
    }
    return { pluginAdvisory: advisoryMarkdown };
  }
}
