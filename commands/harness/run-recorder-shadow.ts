/**
 * Shadow RunRecorder: in-memory trace lifecycle for observability.
 * Does not change execution; records begin/step/decision/end and step-path checksum.
 */

import type {
  RunRecorder,
  RunTraceHandle,
  StepEvent,
  ContextPack,
  RunRecorderDecision,
  HarnessRunResult,
} from './contracts';

export interface ShadowTraceRecord {
  traceId: string;
  runId: string;
  startedAt: string;
  stepPath: string[];
  stepEvents: StepEvent[];
  decision?: RunRecorderDecision;
  result?: Partial<HarnessRunResult> & { traceId: string; stepPath: string[] };
  stepPathChecksum?: string;
  /** True when this run was for a tier that has been cut over to harness default (HARNESS_CUTOVER_TIERS). */
  harnessCutoverTier?: boolean;
}

/** Simple stable checksum for step path (deterministic for same inputs). */
function stepPathChecksum(stepPath: string[]): string {
  const str = stepPath.join('\n');
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h = (h << 5) - h + c;
    h = h & h;
  }
  return `sha1_${Math.abs(h).toString(16)}`;
}

export function createShadowRunRecorder(): RunRecorder & { getTrace(traceId: string): ShadowTraceRecord | undefined } {
  const traces = new Map<string, ShadowTraceRecord>();

  const recorder: RunRecorder = {
    async begin(spec): Promise<RunTraceHandle> {
      const traceId = `trace_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const handle: RunTraceHandle = {
        traceId,
        runId: spec.runId,
        startedAt: new Date().toISOString(),
      };
      traces.set(traceId, {
        traceId,
        runId: spec.runId,
        startedAt: handle.startedAt,
        stepPath: [],
        stepEvents: [],
        harnessCutoverTier: spec.harnessCutoverTier,
      });
      return handle;
    },

    async step(handle, evt): Promise<void> {
      const record = traces.get(handle.traceId);
      if (!record) return;
      record.stepEvents.push(evt);
      if (evt.phase === 'exit_success' || evt.phase === 'exit_failure' || evt.phase === 'skip') {
        record.stepPath.push(evt.step);
      }
    },

    async decision(handle, decision): Promise<void> {
      const record = traces.get(handle.traceId);
      if (!record) return;
      record.decision = decision;
    },

    async contextReport(handle, pack): Promise<void> {
      const record = traces.get(handle.traceId);
      if (!record) return;
      // Store minimal; Phase 3 will add dropped-artifact reporting
    },

    async end(handle, result): Promise<void> {
      const record = traces.get(handle.traceId);
      if (!record) return;
      record.result = result;
      record.stepPathChecksum = stepPathChecksum(result.stepPath);
    },
  };

  return Object.assign(recorder, {
    getTrace(traceId: string): ShadowTraceRecord | undefined {
      return traces.get(traceId);
    },
  });
}

/** Default singleton shadow recorder for current process (shadow mode). */
let defaultShadowRecorder: (RunRecorder & { getTrace(traceId: string): ShadowTraceRecord | undefined }) | null = null;

export function getDefaultShadowRecorder(): RunRecorder & { getTrace(traceId: string): ShadowTraceRecord | undefined } {
  if (!defaultShadowRecorder) {
    defaultShadowRecorder = createShadowRunRecorder();
  }
  return defaultShadowRecorder;
}
