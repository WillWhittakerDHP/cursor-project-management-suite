/**
 * Harness contracts — canonical types for the chartered workflow harness.
 * Single source of truth for WorkflowSpec, HarnessRunResult, TierOutcome,
 * ReasonCode, ControlPlaneDecision, and StepDefinition.
 * See: .project-manager/HARNESS_CHARTER.md
 */

// --- Tier, action, mode (charter §7.1) ---
export type Tier = 'feature' | 'phase' | 'session' | 'task';
export type Action = 'start' | 'end' | 'reopen' | 'plan' | 'change' | 'validate' | 'checkpoint';
export type ExecutionMode = 'plan' | 'execute';
export type Profile = 'fast' | 'balanced' | 'strict' | 'debug';

// --- Policy and budget (charter §7.1) ---
export interface PolicySet {
  governance: 'off' | 'warn' | 'enforce';
  audits: 'off' | 'start_only' | 'end_only' | 'full';
  tests: 'skip' | 'changed_only' | 'full';
  docs: 'off' | 'minimal' | 'standard' | 'strict';
  git: 'off' | 'safe' | 'full';
  cascade: 'manual_confirm' | 'auto';
}

export interface ContextBudgetConfig {
  maxTokens: number;
  maxArtifacts: number;
  maxFiles: number;
  includeHistory: 'none' | 'recent' | 'full';
}

export interface ConstraintSet {
  dryRun: boolean;
  allowWrites: boolean;
  allowGit: boolean;
  allowNetwork: boolean;
}

// --- WorkflowSpec (charter §7.1) ---
export interface WorkflowSpec {
  specVersion: '1';
  runId: string;
  tier: Tier;
  action: Action;
  identifier: string;
  mode: ExecutionMode;
  profile: Profile;
  pass?: 1 | 2 | 3;
  featureContext: {
    featureId: string;
    featureName: string;
  };
  previousRunSummary?: {
    traceId: string;
    reasonCode: string;
    decisions: Record<string, string>;
  };
  policies: PolicySet;
  contextBudget: ContextBudgetConfig;
  constraints: ConstraintSet;
  userChoices?: {
    continuePastVerification?: boolean;
    pushConfirmed?: boolean;
    cascadeConfirmed?: boolean;
  };
  metadata?: {
    requestedBy?: string;
    sourceCommand?: string;
    note?: string;
    parentTraceId?: string;
  };
}

// --- Step graph (charter §7.2) ---
export type StepId =
  | 'validate_identifier'
  | 'preflight'
  | 'load_context'
  | 'gather_context'
  | 'plan_gate'
  | 'branch_ops'
  | 'doc_sync'
  | 'test_ops'
  | 'audit_ops'
  | 'scope_update'
  | 'cascade_eval'
  | 'finalize';

export type StepPhase = 'pre' | 'main' | 'post';

export interface StepDefinition {
  id: StepId;
  phase: StepPhase;
  requiredFor: Action[];
  requiresMode?: ExecutionMode;
  dependsOn?: StepId[];
  canFail: boolean;
  timeout?: number;
}

// --- Outcome (charter §8.1) ---
export type TierStatus = 'completed' | 'needs_input' | 'blocked' | 'failed' | 'plan_preview';

export interface CascadeInfo {
  direction: 'down' | 'up' | 'across';
  tier: Tier;
  identifier: string;
  command: string;
}

export interface TierOutcome {
  status: TierStatus;
  reasonCode: ReasonCode;
  nextAction: string;
  deliverables?: string;
  cascade?: CascadeInfo;
}

// --- Reason-code taxonomy (charter §9) ---
export type FlowReasonCode =
  | 'context_gathering'
  | 'planning_doc_incomplete'
  | 'start_ok'
  | 'end_ok'
  | 'task_complete'
  | 'pending_push'
  | 'verification_suggested'
  | 'reopen_ok'
  | 'uncommitted_blocking'
  | 'guide_fill_pending';

export type FailureReasonCode =
  | 'validation_failed'
  | 'audit_failed'
  | 'test_failed'
  | 'preflight_failed'
  | 'git_failed'
  | 'wrong_branch_before_commit'
  | 'unhandled_error';

export type ReasonCode = FlowReasonCode | FailureReasonCode;

// --- Control-plane decision (charter §8.2) ---
export type QuestionKey =
  | 'approve_execute'
  | 'context_gathering'
  | 'push_confirmation'
  | 'cascade_confirmation'
  | 'verification_options'
  | 'failure_options'
  | 'uncommitted_changes'
  | 'reopen_options';

export interface ControlPlaneDecision {
  requiredMode: 'plan' | 'agent';
  stop: boolean;
  message: string;
  questionKey?: QuestionKey;
  /** Full spec for re-invoke; charter uses this instead of loose params. */
  nextInvoke?: WorkflowSpec;
  cascadeCommand?: string;
}

// --- Harness run result (charter §7.2) ---
export interface HarnessRunResult {
  success: boolean;
  output: string;
  outcome: TierOutcome;
  controlPlaneDecision: ControlPlaneDecision;
  traceId: string;
  stepPath: StepId[];
}

// --- SpecBuilder contract (charter §7.4) ---
export interface SpecBuilder {
  fromSlashCommand(
    command: string,
    args: Record<string, string | undefined>,
    options?: Partial<WorkflowSpec>
  ): Promise<WorkflowSpec>;
}

// --- RunRecorder (charter §7.7): trace lifecycle for observability ---
export interface RunTraceHandle {
  traceId: string;
  runId: string;
  startedAt: string;
}

export interface StepEvent {
  step: string; // step id or logical name
  phase: 'enter' | 'exit_success' | 'exit_failure' | 'skip';
  ts: string;
  durationMs?: number;
  reasonCode?: string;
  pluginDiagnostics?: string[];
  details?: Record<string, unknown>;
}

/** ContextPack shape for contextReport (summary + budget with dropped artifacts). */
export interface ContextPack {
  summary?: string;
  budget?: { usedTokens: number; maxTokens: number; headroom?: number; dropped?: DroppedArtifact[] };
}

// --- ContextInjector (charter §7.6): two-phase context planning and building ---
export type ContextArtifactKind =
  | 'tier_guide'
  | 'tier_handoff'
  | 'tier_log'
  | 'governance_rule'
  | 'audit_baseline'
  | 'code_file'
  | 'previous_trace'
  | 'scope_state';

export interface ArtifactRequest {
  artifactId: string;
  path: string;
  kind: ContextArtifactKind;
  priority: 'required' | 'high' | 'medium' | 'low';
  estimatedTokens?: number;
}

export interface ContextInjectionPlan {
  requiredArtifacts: ArtifactRequest[];
  scoredCandidates: ArtifactRequest[];
  budget: ContextBudgetConfig;
}

export interface ContextArtifact {
  artifactId: string;
  path: string;
  kind: ContextArtifactKind;
  relevanceScore: number;
  freshnessScore: number;
  snippet: string;
  tokenCost: number;
}

export interface DroppedArtifact {
  artifactId: string;
  path: string;
  reason: 'over_budget' | 'low_relevance' | 'stale' | 'duplicate' | 'excluded_by_policy';
  score: number;
  wouldHaveCost: number;
}

export interface ContextPackFull {
  summary: string;
  artifacts: ContextArtifact[];
  budget: {
    usedTokens: number;
    maxTokens: number;
    headroom: number;
    dropped: DroppedArtifact[];
  };
}

/** Minimal adapter to read file content (for build phase). */
export interface FileSystemAdapter {
  readFile(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
}

/** Minimal git state for context (branch, dirty list). */
export interface GitStateAdapter {
  getBranch(): Promise<string>;
  getDirtyPaths(): Promise<string[]>;
}

/** Tier scope snapshot (e.g. .tier-scope content). */
export interface TierScopeReader {
  readScope(): Promise<Record<string, unknown>>;
}

export interface ContextSources {
  fs: FileSystemAdapter;
  git?: GitStateAdapter;
  scope?: TierScopeReader;
}

export interface ContextInjector {
  plan(spec: WorkflowSpec): ContextInjectionPlan;
  build(plan: ContextInjectionPlan, sources: ContextSources): Promise<ContextPackFull>;
}

/** Minimal decision shape for recorder.decision (avoids importing control-plane-types here). */
export interface RunRecorderDecision {
  requiredMode: 'plan' | 'agent';
  stop: boolean;
  message: string;
  questionKey?: string;
  cascadeCommand?: string;
}

/** Spec shape for RunRecorder.begin (includes optional telemetry flags). */
export type RunRecorderBeginSpec = Partial<WorkflowSpec> & {
  runId: string;
  tier: Tier;
  action: Action;
  identifier: string;
  /** Set when this tier is in HARNESS_CUTOVER_TIERS (telemetry only until kernel cutover). */
  harnessCutoverTier?: boolean;
};

export interface RunRecorder {
  begin(spec: RunRecorderBeginSpec): Promise<RunTraceHandle>;
  step(handle: RunTraceHandle, evt: StepEvent): Promise<void>;
  decision(handle: RunTraceHandle, decision: RunRecorderDecision): Promise<void>;
  contextReport(handle: RunTraceHandle, pack: ContextPack): Promise<void>;
  end(handle: RunTraceHandle, result: Partial<HarnessRunResult> & { traceId: string; stepPath: string[] }): Promise<void>;
}

// --- Harness kernel (charter §7.2, §7.3) ---

export interface TierScopeSnapshot {
  feature?: { id: string; name: string };
  phase?: { id: string; name: string };
  session?: { id: string; name: string };
  task?: { id: string; name: string };
}

export interface HarnessContext {
  spec: Readonly<WorkflowSpec>;
  traceHandle: RunTraceHandle;
  tierState: {
    scope: TierScopeSnapshot;
    status: string | null;
    branchName: string | null;
  };
  contextPack: ContextPack | null;
  output: string[];
  stepResults: Record<string, { success: boolean; output: string; durationMs: number }>;
  diagnostics: Array<{ plugin: string; step: string; message: string }>;
}

export interface ProfileDefaultsResolver {
  resolve(profile: Profile): { policies: PolicySet; contextBudget: ContextBudgetConfig };
}

/** Result of running a single step; null means continue to next step. */
export interface StepRunResult {
  success: boolean;
  output: string;
  outcome: TierOutcome;
  /** When set, kernel stops and returns this as final result. */
  exitEarly?: boolean;
}

export interface TierAdapter {
  /** Run one step; return result or null to continue. Exit early result stops the kernel. */
  runStep(ctx: HarnessContext, stepId: StepId): Promise<StepRunResult | null>;
}

/** Optional: when provided, kernel uses this to compute controlPlaneDecision (avoids harness importing tier routing). */
export interface HarnessRoutingContext {
  tier: Tier;
  action: Action;
  originalParams: unknown;
}

export interface HarnessDeps {
  contextInjector: ContextInjector;
  recorder: RunRecorder;
  adapter: TierAdapter;
  clock?: () => number;
  profileDefaults: ProfileDefaultsResolver;
  /** When set, kernel will use this to build control-plane decision (e.g. from routeByOutcome). */
  routingContext?: HarnessRoutingContext;
  /** Optional plugin registry; when set, kernel runs beforeStep/afterStep/onFailure and enforces capabilities. */
  plugins?: PluginRegistry;
}

export interface HarnessKernel {
  getStepGraph(spec: WorkflowSpec): StepDefinition[];
  run(spec: WorkflowSpec, deps: HarnessDeps): Promise<HarnessRunResult>;
}

// --- Policy plugins (charter §7.5) ---

export type PluginCapability =
  | 'read_context'
  | 'write_context'
  | 'mutate_outcome'
  | 'block_step'
  | 'emit_diagnostic';

export interface PluginStepResult {
  action: 'continue' | 'skip_step' | 'abort_run';
  diagnostic?: string;
}

export interface PolicyPlugin {
  name: string;
  version: string;
  priority: number;
  capabilities: PluginCapability[];
  appliesTo(spec: WorkflowSpec): boolean;
  beforeStep?(ctx: HarnessContext, step: StepId): Promise<PluginStepResult>;
  afterStep?(ctx: HarnessContext, step: StepId): Promise<PluginStepResult>;
  onFailure?(ctx: HarnessContext, step: StepId, error: unknown): Promise<void>;
  contributeOutcome?(ctx: HarnessContext): Partial<TierOutcome>;
}

export interface PluginRegistry {
  register(plugin: PolicyPlugin): void;
  getForSpec(spec: WorkflowSpec): PolicyPlugin[];
  validate(): void;
}
