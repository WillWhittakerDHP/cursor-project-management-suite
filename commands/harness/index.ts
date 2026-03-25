/**
 * Harness namespace: typed contracts, kernel runtime, and plugins (charter end-state).
 * tier-start, tier-end, and tier-reopen dispatch through defaultKernel; TierAdapter delegates to tier impls.
 * See .project-manager/HARNESS_CHARTER.md for contracts and step graph.
 */

export type {
  Tier,
  Action,
  ExecutionMode,
  Profile,
  PolicySet,
  ContextBudgetConfig,
  ConstraintSet,
  WorkflowSpec,
  StepId,
  StepPhase,
  StepDefinition,
  TierStatus,
  CascadeInfo,
  TierOutcome,
  FlowReasonCode,
  FailureReasonCode,
  ReasonCode,
  QuestionKey,
  ControlPlaneDecision,
  HarnessRunResult,
  SpecBuilder,
  RunTraceHandle,
  StepEvent,
  ContextPack,
  RunRecorderDecision,
  RunRecorder,
  ContextInjector,
  ContextInjectionPlan,
  ArtifactRequest,
  ContextArtifactKind,
  ContextPackFull,
  ContextArtifact,
  DroppedArtifact,
  ContextSources,
  FileSystemAdapter,
  GitStateAdapter,
  TierScopeReader,
  HarnessContext,
  TierScopeSnapshot,
  ProfileDefaultsResolver,
  StepRunResult,
  TierAdapter,
  HarnessDeps,
  HarnessRoutingContext,
  HarnessKernel,
  PluginCapability,
  PluginStepResult,
  PolicyPlugin,
  PluginRegistry,
} from './contracts';
export { createPluginRegistry } from './plugin-registry';

export { createContextInjector, createNodeFileSystemAdapter } from './context-injector';

export {
  createShadowRunRecorder,
  getDefaultShadowRecorder,
} from './run-recorder-shadow';
export type { ShadowTraceRecord } from './run-recorder-shadow';

export { defaultSpecBuilder } from './spec-builder';
export { parseReasonCode, isFailureReasonCode, isFlowReasonCode } from './reason-code';
export {
  adaptTierStartOutcomeToHarness,
  adaptTierEndOutcomeToHarness,
  adaptTierReopenOutcomeToHarness,
  createStepAdapter,
} from './step-adapter';
export type { TierActionParams, StepAdapterOptions } from './step-adapter';

export {
  getHarnessCutoverTiers,
  isHarnessDefaultForTier,
} from './cutover-config';
export { defaultKernel } from './kernel';
export { getStepGraph, getStepIdsForAction } from './step-graph';
export { buildSpecFromTierRun } from './build-spec-from-tier';
export type { BuildSpecFromTierRunParams } from './build-spec-from-tier';
export { defaultProfileDefaultsResolver, PROFILE_DEFAULTS } from './spec-builder';
