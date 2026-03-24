/**
 * In-memory RunRecorder for harness traces (charter §7.7).
 */

import { createHash } from 'crypto';
import type {
  RunRecorder,
  RunTraceHandle,
  RunRecorderBeginSpec,
  StepEvent,
  RunRecorderDecision,
  ContextPack,
  HarnessRunResult,
  StepId,
} from './contracts';

export interface ShadowTraceRecord {
  runId: string;
  traceId: string;
  startedAt: string;
  stepEvents: StepEvent[];
  decision?: RunRecorderDecision;
  contextPack?: ContextPack;
  result?: Partial<HarnessRunResult> & { traceId: string; stepPath: string[] };
  stepPath?: StepId[];
  stepPathChecksum?: string;
  harnessCutoverTier?: boolean;
}

function checksumStepPath(path: string[]): string {
  const h = createHash('sha1').update(path.join('|')).digest('hex');
  return `sha1_${h}`;
}

export type ShadowRunRecorder = RunRecorder & {
  getTrace(traceId: string): ShadowTraceRecord | undefined;
};

function createRecorderInstance(): ShadowRunRecorder {
  const traces = new Map<string, ShadowTraceRecord>();

  return {
    async begin(spec: RunRecorderBeginSpec): Promise<RunTraceHandle> {
      const traceId = `trace_${spec.runId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const startedAt = new Date().toISOString();
      const rec: ShadowTraceRecord = {
        runId: spec.runId,
        traceId,
        startedAt,
        stepEvents: [],
        ...(spec.harnessCutoverTier === true && { harnessCutoverTier: true }),
      };
      traces.set(traceId, rec);
      return { traceId, runId: spec.runId, startedAt };
    },

    async step(handle: RunTraceHandle, evt: StepEvent): Promise<void> {
      const t = traces.get(handle.traceId);
      if (t) t.stepEvents.push(evt);
    },

    async decision(handle: RunTraceHandle, decision: RunRecorderDecision): Promise<void> {
      const t = traces.get(handle.traceId);
      if (t) t.decision = decision;
    },

    async contextReport(handle: RunTraceHandle, pack: ContextPack): Promise<void> {
      const t = traces.get(handle.traceId);
      if (t) t.contextPack = pack;
    },

    async end(
      handle: RunTraceHandle,
      result: Partial<HarnessRunResult> & { traceId: string; stepPath: string[] }
    ): Promise<void> {
      const t = traces.get(handle.traceId);
      if (t) {
        t.result = result;
        const path = result.stepPath as StepId[];
        t.stepPath = path;
        t.stepPathChecksum = checksumStepPath(path);
      }
    },

    getTrace(traceId: string): ShadowTraceRecord | undefined {
      return traces.get(traceId);
    },
  };
}

export function createShadowRunRecorder(): ShadowRunRecorder {
  return createRecorderInstance();
}

let defaultRecorder: ShadowRunRecorder | null = null;

export function getDefaultShadowRecorder(): ShadowRunRecorder {
  if (!defaultRecorder) defaultRecorder = createRecorderInstance();
  return defaultRecorder;
}
