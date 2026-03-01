/**
 * Shadow recorder inspection: step path, checksum, and trace lifecycle.
 * Uses getDefaultShadowRecorder() and getTrace(traceId) to assert on recorded data.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createShadowRunRecorder,
  getDefaultShadowRecorder,
} from './run-recorder-shadow';

describe('RunRecorder shadow', () => {
  describe('createShadowRunRecorder', () => {
    it('records begin, step, decision, end and exposes stepPath and checksum via getTrace', async () => {
      const recorder = createShadowRunRecorder();
      const spec = {
        runId: 'run_test_1',
        tier: 'session' as const,
        action: 'start' as const,
        identifier: '6.3.1',
      };
      const handle = await recorder.begin(spec);
      expect(handle.traceId).toBeDefined();
      expect(handle.runId).toBe(spec.runId);

      await recorder.step(handle, { step: 'validate', phase: 'enter', ts: new Date().toISOString() });
      await recorder.step(handle, { step: 'validate', phase: 'exit_success', ts: new Date().toISOString() });
      await recorder.step(handle, { step: 'ensure_branch', phase: 'enter', ts: new Date().toISOString() });
      await recorder.step(handle, { step: 'ensure_branch', phase: 'exit_success', ts: new Date().toISOString() });

      await recorder.decision(handle, {
        requiredMode: 'agent',
        stop: false,
        message: 'Started.',
      });

      await recorder.end(handle, {
        traceId: handle.traceId,
        stepPath: ['validate', 'ensure_branch'],
        success: true,
        output: 'OK',
      });

      const trace = recorder.getTrace(handle.traceId);
      expect(trace).toBeDefined();
      expect(trace!.stepPath).toEqual(['validate', 'ensure_branch']);
      expect(trace!.stepPathChecksum).toBeDefined();
      expect(trace!.stepPathChecksum).toMatch(/^sha1_[a-f0-9]+$/);
      expect(trace!.stepEvents).toHaveLength(4);
      expect(trace!.decision?.requiredMode).toBe('agent');
      expect(trace!.decision?.stop).toBe(false);
      expect(trace!.result?.success).toBe(true);
    });

    it('step path checksum is stable for same step path', async () => {
      const recorder = createShadowRunRecorder();
      const spec = { runId: 'r1', tier: 'session' as const, action: 'start' as const, identifier: '6.3.1' };
      const handle1 = await recorder.begin(spec);
      await recorder.step(handle1, { step: 'a', phase: 'exit_success', ts: '' });
      await recorder.step(handle1, { step: 'b', phase: 'exit_success', ts: '' });
      await recorder.end(handle1, { traceId: handle1.traceId, stepPath: ['a', 'b'] });

      const handle2 = await recorder.begin({ ...spec, runId: 'r2' });
      await recorder.step(handle2, { step: 'a', phase: 'exit_success', ts: '' });
      await recorder.step(handle2, { step: 'b', phase: 'exit_success', ts: '' });
      await recorder.end(handle2, { traceId: handle2.traceId, stepPath: ['a', 'b'] });

      const trace1 = recorder.getTrace(handle1.traceId);
      const trace2 = recorder.getTrace(handle2.traceId);
      expect(trace1!.stepPathChecksum).toBe(trace2!.stepPathChecksum);
    });

    it('step path checksum differs for different step paths', async () => {
      const recorder = createShadowRunRecorder();
      const spec = { runId: 'r1', tier: 'task' as const, action: 'start' as const, identifier: '6.4.4.1' };
      const handle1 = await recorder.begin(spec);
      await recorder.end(handle1, { traceId: handle1.traceId, stepPath: ['validate', 'plan'] });
      const handle2 = await recorder.begin({ ...spec, runId: 'r2' });
      await recorder.end(handle2, { traceId: handle2.traceId, stepPath: ['validate', 'audit', 'plan'] });

      const trace1 = recorder.getTrace(handle1.traceId);
      const trace2 = recorder.getTrace(handle2.traceId);
      expect(trace1!.stepPathChecksum).not.toBe(trace2!.stepPathChecksum);
    });
  });

  describe('getDefaultShadowRecorder', () => {
    beforeEach(() => {
      // Reset module singleton by re-importing would require resetModules; instead we just
      // assert that getDefaultShadowRecorder returns an object with getTrace.
    });

    it('returns recorder with getTrace and full lifecycle methods', () => {
      const recorder = getDefaultShadowRecorder();
      expect(recorder.begin).toBeDefined();
      expect(recorder.step).toBeDefined();
      expect(recorder.decision).toBeDefined();
      expect(recorder.contextReport).toBeDefined();
      expect(recorder.end).toBeDefined();
      expect(recorder.getTrace).toBeDefined();
    });

    it('getTrace returns undefined for unknown traceId', () => {
      const recorder = getDefaultShadowRecorder();
      expect(recorder.getTrace('nonexistent_trace_id')).toBeUndefined();
    });
  });

  describe('harnessCutoverTier telemetry', () => {
    it('stores harnessCutoverTier on trace when passed in begin(spec)', async () => {
      const recorder = createShadowRunRecorder();
      const handle = await recorder.begin({
        runId: 'run_cutover',
        tier: 'session',
        action: 'start',
        identifier: '6.3.1',
        harnessCutoverTier: true,
      });
      await recorder.end(handle, { traceId: handle.traceId, stepPath: [] });
      const trace = recorder.getTrace(handle.traceId);
      expect(trace?.harnessCutoverTier).toBe(true);
    });

    it('harnessCutoverTier is undefined when not passed', async () => {
      const recorder = createShadowRunRecorder();
      const handle = await recorder.begin({
        runId: 'run_normal',
        tier: 'task',
        action: 'start',
        identifier: '6.4.4.1',
      });
      await recorder.end(handle, { traceId: handle.traceId, stepPath: [] });
      const trace = recorder.getTrace(handle.traceId);
      expect(trace?.harnessCutoverTier).toBeUndefined();
    });
  });
});
