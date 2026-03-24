/**
 * Golden tests: reason-code → control-plane decision.
 * Ensures exhaustive routing and charter-aligned decision shape (requiredMode, stop, questionKey).
 */

import { describe, it, expect } from 'vitest';
import { routeByOutcome } from './control-plane-route';
import type { CommandResultForRouting, ControlPlaneContext, ControlPlaneOutcome } from './control-plane-types';
const baseCtx: ControlPlaneContext = {
  tier: 'session',
  action: 'start',
  originalParams: { sessionId: '6.3.1' },
};

function resultFor(reasonCode: string, success: boolean, nextAction: string, cascade?: ControlPlaneOutcome['cascade']): CommandResultForRouting {
  return {
    success,
    output: '',
    outcome: {
      reasonCode,
      nextAction,
      ...(cascade && { cascade }),
    },
  };
}

describe('routeByOutcome', () => {
  it('returns decision with requiredMode, stop, message for every flow reason code', () => {
    const flowCodes: string[] = [
      'context_gathering',
      'pending_push',
      'verification_suggested',
      'task_complete',
      'reopen_ok',
      'uncommitted_blocking',
      'start_ok',
      'end_ok',
    ];
    for (const code of flowCodes) {
      const result = resultFor(code, true, 'Next');
      const decision = routeByOutcome(result, baseCtx);
      expect(decision).toHaveProperty('requiredMode');
      expect(decision.requiredMode).toMatch(/^plan|agent$/);
      expect(decision).toHaveProperty('stop');
      expect(typeof decision.stop).toBe('boolean');
      expect(decision).toHaveProperty('message');
      expect(typeof decision.message).toBe('string');
    }
  });

  it('returns decision with requiredMode plan and questionKey for failure reason codes', () => {
    const failureCodes: string[] = [
      'validation_failed',
      'audit_failed',
      'test_failed',
      'preflight_failed',
      'git_failed',
      'unhandled_error',
    ];
    for (const code of failureCodes) {
      const result = resultFor(code, false, 'Failed');
      const decision = routeByOutcome(result, baseCtx);
      expect(decision.requiredMode).toBe('plan');
      expect(decision.stop).toBe(true);
      expect(decision.questionKey).toBeDefined();
    }
  });

  it('plan_mode: maps to context_gathering, stop true, requiredMode plan (command-gated: no questionKey)', () => {
    const result = resultFor('plan_mode', true, 'Review deliverables');
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.stop).toBe(true);
    expect(decision.requiredMode).toBe('plan');
    expect(decision.message).toBe('Review deliverables');
    // plan_mode maps to context_gathering; command-gated flow has no questionKey
  });

  it('context_gathering: stop true, requiredMode plan (command-gated: no questionKey)', () => {
    const result = resultFor('context_gathering', true, 'Answer context questions');
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.stop).toBe(true);
    expect(decision.requiredMode).toBe('plan');
    expect(decision.message).toBe('Answer context questions');
  });

  it('pending_push: stop true, requiredMode plan (command-gated: no questionKey)', () => {
    const result = resultFor('pending_push', true, 'Push then cascade');
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.stop).toBe(true);
    expect(decision.requiredMode).toBe('plan');
    expect(decision.message).toContain('Push');
  });

  it('verification_suggested: stop true, questionKey verification_options', () => {
    const result = resultFor('verification_suggested', true, 'Add follow-up or continue');
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.stop).toBe(true);
    expect(decision.questionKey).toBe('verification_options');
  });

  it('reopen_ok: stop true, questionKey reopen_options', () => {
    const result = resultFor('reopen_ok', true, 'Choose plan file or scratch');
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.stop).toBe(true);
    expect(decision.questionKey).toBe('reopen_options');
  });

  it('uncommitted_blocking: stop true, questionKey uncommitted_changes', () => {
    const result = resultFor('uncommitted_blocking', true, 'Commit or stash');
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.stop).toBe(true);
    expect(decision.questionKey).toBe('uncommitted_changes');
  });

  it('missing outcome: returns failure decision', () => {
    const result: CommandResultForRouting = { success: false, output: 'No outcome' };
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.stop).toBe(true);
    expect(decision.requiredMode).toBe('plan');
    expect(decision.questionKey).toBe('failure_options');
  });

  // --- Additional golden cases: task_complete, start_ok/end_ok, failure message, cascade ---

  it('task_complete with cascade: stop true, requiredMode plan, questionKey cascade, cascadeCommand set', () => {
    const result = resultFor('task_complete', true, 'Cascade to next task', {
      direction: 'across',
      tier: 'session',
      identifier: '6.4.5',
      command: '/task-start 6.4.5',
    });
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.stop).toBe(true);
    expect(decision.requiredMode).toBe('plan');
    expect(decision.questionKey).toBe('cascade');
    expect(decision.cascadeCommand).toBe('/task-start 6.4.5');
    expect(decision.message).toBe('Cascade to next task');
  });

  it('task_complete without cascade: stop false, requiredMode agent, no questionKey', () => {
    const result = resultFor('task_complete', true, 'Task complete.');
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.stop).toBe(false);
    expect(decision.requiredMode).toBe('agent');
    expect(decision.questionKey).toBeUndefined();
    expect(decision.cascadeCommand).toBeUndefined();
  });

  it('start_ok with cascade: stop true, questionKey cascade, cascadeCommand present', () => {
    const result = resultFor('start_ok', true, 'Start OK; cascade?', {
      direction: 'down',
      tier: 'session',
      identifier: '6.3.1',
      command: '/session-start 6.3.1',
    });
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.stop).toBe(true);
    expect(decision.questionKey).toBe('cascade');
    expect(decision.cascadeCommand).toBe('/session-start 6.3.1');
  });

  it('start_ok without cascade: stop false, requiredMode agent', () => {
    const result = resultFor('start_ok', true, 'Started.');
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.stop).toBe(false);
    expect(decision.requiredMode).toBe('agent');
  });

  it('end_ok with cascade: stop true, cascadeCommand set', () => {
    const result = resultFor('end_ok', true, 'End OK; cascade up', {
      direction: 'up',
      tier: 'phase',
      identifier: '6',
      command: '/phase-end 6',
    });
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.stop).toBe(true);
    expect(decision.cascadeCommand).toBe('/phase-end 6');
  });

  it('end_ok without cascade: stop false', () => {
    const result = resultFor('end_ok', true, 'Session ended.');
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.stop).toBe(false);
  });

  it('failure codes: message comes from outcome.nextAction or output fallback', () => {
    const result = resultFor('unhandled_error', false, 'Validation failed: invalid ID');
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.message).toBe('Validation failed: invalid ID');
    expect(decision.questionKey).toBe('failure_options');
  });

  it('failure with empty nextAction: uses output fallback', () => {
    const result: CommandResultForRouting = {
      success: false,
      output: 'Command failed with exit code 1',
      outcome: { reasonCode: 'audit_failed', nextAction: '' },
    };
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.message).toContain('Command failed with exit code 1');
    // audit_failed gets work-profile suffix (Phase 8)
  });

  it('audit_failed with deliverables: message is full audit report (deliverables)', () => {
    const fullReport = '## Audit results\nwarn: 2\nfail: 1\n\n**STOP — Fix in compliance with governance rules.**';
    const result: CommandResultForRouting = {
      success: false,
      output: 'Audit failed',
      outcome: {
        reasonCode: 'audit_failed',
        nextAction: 'Fix audit issues',
        deliverables: fullReport,
      },
    };
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.message).toContain(fullReport);
    expect(decision.stop).toBe(true);
    expect(decision.questionKey).toBe('audit_failed_options');
  });

  it('handleMissingOutcome: uses output as message when provided', () => {
    const result: CommandResultForRouting = {
      success: false,
      output: 'Uncaught exception in step validate',
    };
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.message).toContain('Uncaught exception');
    expect(decision.questionKey).toBe('failure_options');
  });
});
