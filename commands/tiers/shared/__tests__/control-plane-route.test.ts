/**
 * Unit tests for control-plane routing. Ensures reasonCode -> decision behavior
 * and prevents plan-only stall (plan_mode must yield approve_execute question).
 */

import { describe, it, expect } from 'vitest';
import { routeByOutcome } from '../control-plane-route';
import { reinvokeStartExecute } from '../control-plane-reinvoke';
import { formatChoiceForChat } from '../control-plane-choice-display';
import type { ControlPlaneDecision } from '../control-plane-types';
import { REASON_CODE, QUESTION_KEYS } from '../control-plane-types';
import type { CommandResultForRouting, ControlPlaneContext } from '../control-plane-types';

const baseCtx: ControlPlaneContext = {
  tier: 'session',
  action: 'start',
  originalParams: { sessionId: '6.2.1', description: undefined },
};

describe('control-plane routeByOutcome', () => {
  it('plan_mode maps to context_gathering (command-gated: no questionKey)', () => {
    const result: CommandResultForRouting = {
      success: true,
      output: 'Plan preview',
      outcome: {
        reasonCode: REASON_CODE.PLAN_MODE,
        nextAction: 'Plan preview complete. Awaiting approval to execute.',
      },
    };
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.stop).toBe(true);
    expect(decision.requiredMode).toBe('plan');
    // Command-gated: user runs /accepted-plan or /accepted-build (feature/phase/session) or /accepted-code (task); no choice block
    expect(decision.questionKey).toBeUndefined();
    expect(decision.message).toBe('Plan preview complete. Awaiting approval to execute.');
  });

  it('plan_mode with deliverables shows deliverables in message', () => {
    const result: CommandResultForRouting = {
      success: true,
      output: 'Plan preview',
      outcome: {
        reasonCode: REASON_CODE.PLAN_MODE,
        nextAction: 'Plan preview complete. Awaiting approval to execute.',
        deliverables: '**Task 6.2.1.1:** Add validation\n**Goal:** Implement Zod schema',
      },
    };
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.message).toBe('**Task 6.2.1.1:** Add validation\n**Goal:** Implement Zod schema');
    expect(decision.questionKey).toBeUndefined();
  });

  it('plan_mode for task tier maps to context_gathering (command-gated)', () => {
    const taskCtx = { ...baseCtx, tier: 'task' as const, originalParams: { taskId: '6.4.4.1' } };
    const result: CommandResultForRouting = {
      success: true,
      output: 'Task plan',
      outcome: {
        reasonCode: REASON_CODE.PLAN_MODE,
        nextAction: 'Approve design to begin coding.',
      },
    };
    const decision = routeByOutcome(result, taskCtx);
    expect(decision.questionKey).toBeUndefined();
    expect(decision.message).toBe('Approve design to begin coding.');
  });

  it('plan_mode without deliverables falls back to nextAction for message', () => {
    const result: CommandResultForRouting = {
      success: true,
      output: 'Plan preview',
      outcome: {
        reasonCode: REASON_CODE.PLAN_MODE,
        nextAction: 'Plan preview complete. Awaiting approval to execute.',
      },
    };
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.message).toBe('Plan preview complete. Awaiting approval to execute.');
  });

  it('failure (success false) returns failure_options and no cascade', () => {
    const result: CommandResultForRouting = {
      success: false,
      output: 'Error output',
      outcome: {
        reasonCode: 'validation_failed',
        nextAction: 'Cannot start. Fix the issues above.',
      },
    };
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.stop).toBe(true);
    expect(decision.requiredMode).toBe('plan');
    expect(decision.questionKey).toBe(QUESTION_KEYS.FAILURE_OPTIONS);
    expect(decision.cascadeCommand).toBeUndefined();
    expect(decision.nextInvoke).toBeUndefined();
  });

  it('success with cascade returns cascade question and cascadeCommand', () => {
    const result: CommandResultForRouting = {
      success: true,
      output: 'Done',
      outcome: {
        reasonCode: 'start_ok',
        nextAction: 'Cascade to first task.',
        cascade: {
          direction: 'down',
          tier: 'task',
          identifier: '6.2.1.1',
          command: '/task-start 6.2.1.1',
        },
      },
    };
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.stop).toBe(true);
    expect(decision.requiredMode).toBe('plan');
    expect(decision.questionKey).toBe(QUESTION_KEYS.CASCADE);
    expect(decision.cascadeCommand).toBe('/task-start 6.2.1.1');
  });

  it('success without cascade returns no stop and agent mode', () => {
    const result: CommandResultForRouting = {
      success: true,
      output: 'Done',
      outcome: {
        reasonCode: 'start_ok',
        nextAction: 'Proceed with session.',
      },
    };
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.stop).toBe(false);
    expect(decision.requiredMode).toBe('agent');
    expect(decision.questionKey).toBeUndefined();
  });

  it('missing outcome (crash) returns failure_options and plan mode', () => {
    const result: CommandResultForRouting = {
      success: false,
      output: 'Unhandled error',
    };
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.stop).toBe(true);
    expect(decision.requiredMode).toBe('plan');
    expect(decision.questionKey).toBe(QUESTION_KEYS.FAILURE_OPTIONS);
  });

  it('pending_push_confirmation is command-gated (no questionKey)', () => {
    const result: CommandResultForRouting = {
      success: true,
      output: 'Checks passed',
      outcome: {
        reasonCode: REASON_CODE.PENDING_PUSH_CONFIRMATION,
        nextAction: 'Proceed with push to remote?',
        cascade: { direction: 'up', tier: 'session', identifier: '6.2.1', command: '/session-end 6.2.1' },
      },
    };
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.questionKey).toBeUndefined();
    expect(decision.message).toContain('/accepted-push');
  });

  it('verification_work_suggested returns verification_options question', () => {
    const result: CommandResultForRouting = {
      success: true,
      output: 'Checklist',
      outcome: {
        reasonCode: REASON_CODE.VERIFICATION_WORK_SUGGESTED,
        nextAction: 'Suggested verification work. How to proceed?',
      },
    };
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.questionKey).toBe(QUESTION_KEYS.VERIFICATION_OPTIONS);
  });

  it('verification_work_suggested with deliverables shows checklist in message', () => {
    const checklist = '## What to verify (what we built)\n\n- Calendar displays available slots\n- Booking form validates inputs';
    const result: CommandResultForRouting = {
      success: true,
      output: 'Full output with checklist',
      outcome: {
        reasonCode: REASON_CODE.VERIFICATION_WORK_SUGGESTED,
        nextAction: 'Verification checklist suggested. See steps.verificationCheck.',
        deliverables: checklist,
      },
    };
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.message).toBe(checklist);
    expect(decision.questionKey).toBe(QUESTION_KEYS.VERIFICATION_OPTIONS);
  });

  it('verification_work_suggested without deliverables falls back to nextAction', () => {
    const result: CommandResultForRouting = {
      success: true,
      output: 'Checklist',
      outcome: {
        reasonCode: REASON_CODE.VERIFICATION_WORK_SUGGESTED,
        nextAction: 'Verification checklist suggested. See steps.verificationCheck.',
      },
    };
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.message).toBe('Verification checklist suggested. See steps.verificationCheck.');
  });

  it('reopen_ok returns reopen_options question', () => {
    const result: CommandResultForRouting = {
      success: true,
      output: 'Reopened. Plan next step.',
      outcome: {
        reasonCode: REASON_CODE.REOPEN_OK,
        nextAction: 'Reopened. Plan next step.',
      },
    };
    const ctx: ControlPlaneContext = { tier: 'session', action: 'reopen', originalParams: { identifier: '6.2.1' } };
    const decision = routeByOutcome(result, ctx);
    expect(decision.questionKey).toBe(QUESTION_KEYS.REOPEN_OPTIONS);
    expect(decision.requiredMode).toBe('plan');
  });

  it('task_complete with cascade returns cascade question', () => {
    const result: CommandResultForRouting = {
      success: true,
      output: 'Task done',
      outcome: {
        reasonCode: REASON_CODE.TASK_COMPLETE,
        nextAction: 'Start next task?',
        cascade: { direction: 'across', tier: 'task', identifier: '6.2.1.2', command: '/task-start 6.2.1.2' },
      },
    };
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.questionKey).toBe(QUESTION_KEYS.CASCADE);
    expect(decision.cascadeCommand).toBe('/task-start 6.2.1.2');
  });

  it('context_gathering returns context_gathering questionKey and deliverables as message', () => {
    const deliverables =
      'Planning document created: `.project-manager/features/6/sessions/session-6.2.1-planning.md`\n\n' +
      '**From the docs (insight + proposal + decision):**\n' +
      '1. *Insight:* Session intent and tasks from the guide.\n' +
      '   *Proposal:* We\'ll plan all necessary items and follow governance.\n' +
      '   *Decision:* After reading the planning doc and context, what do you want to lock in or adjust before we proceed?\n' +
      '   *Options:* Let\'s discuss in chat | I\'m ready to lock the plan as-is\n\n' +
      "When satisfied, choose: **I'm satisfied with our plan and ready to begin**";
    const result: CommandResultForRouting = {
      success: true,
      output: 'Context loaded',
      outcome: {
        reasonCode: REASON_CODE.CONTEXT_GATHERING,
        nextAction: 'Context gathering: answer questions and update the planning doc.',
        deliverables,
      },
    };
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.stop).toBe(true);
    expect(decision.requiredMode).toBe('plan');
    // Command-gated: user runs /accepted-plan or /accepted-build (feature/phase/session) or /accepted-code (task); no choice block
    expect(decision.questionKey).toBeUndefined();
    expect(decision.message).toBe(deliverables);
  });

  it('context_gathering deliverables include doc-grounded insight and satisfaction option (regression guard)', () => {
    const deliverables =
      '**From the docs (insight + proposal + decision):**\n' +
      '1. *Insight:* Feature intent and phases from the guide.\n' +
      '   *Decision:* After reading the planning doc and context, what do you want to lock in or adjust before we proceed?\n' +
      '   *Options:* Let\'s discuss in chat | I\'m ready to lock the plan as-is\n\n' +
      "When satisfied, choose: **I'm satisfied with our plan and ready to begin**";
    const result: CommandResultForRouting = {
      success: true,
      output: '',
      outcome: {
        reasonCode: REASON_CODE.CONTEXT_GATHERING,
        nextAction: 'Refine plan then re-invoke.',
        deliverables,
      },
    };
    const decision = routeByOutcome(result, baseCtx);
    expect(decision.message).toContain('Insight');
    expect(decision.message).toContain("I'm satisfied with our plan and ready to begin");
    expect(decision.questionKey).toBeUndefined();
  });
});

describe('Choice display for chat', () => {
  it('context_gathering has no QUESTION_KEY_OPTIONS so returns empty', () => {
    const decision = {
      stop: true,
      message: 'Planning doc path and insight/proposal/decision blocks',
      requiredMode: 'plan' as const,
      questionKey: QUESTION_KEYS.CONTEXT_GATHERING,
    };
    const block = formatChoiceForChat(decision);
    expect(block).toBe('');
  });

  it('cascade produces message and options block with cascade command hint', () => {
    const decision = {
      stop: true,
      message: 'Cascade to task 6.7.1.1',
      requiredMode: 'plan' as const,
      questionKey: QUESTION_KEYS.CASCADE,
      cascadeCommand: '/task-start 6.7.1.1',
    };
    const block = formatChoiceForChat(decision);
    expect(block).toContain('User choice required');
    expect(block).toContain('Yes — run cascade command');
    expect(block).toContain('No — stop here');
    expect(block).toContain('/task-start 6.7.1.1');
  });

  it('failure produces message and options block with retry/audit-fix/skip', () => {
    const decision = {
      stop: true,
      message: 'Command failed.',
      requiredMode: 'plan' as const,
      questionKey: QUESTION_KEYS.FAILURE_OPTIONS,
    };
    const block = formatChoiceForChat(decision);
    expect(block).toContain('User choice required');
    expect(block).toContain('Retry the command');
    expect(block).toContain('Fix audit with governance context');
    expect(block).toContain('Skip and continue manually');
  });

  it('returns empty for unknown questionKey', () => {
    const decision = {
      stop: true,
      message: 'Unknown.',
      requiredMode: 'plan' as const,
      questionKey: 'nonexistent_key',
    } as unknown as ControlPlaneDecision;
    const block = formatChoiceForChat(decision);
    expect(block).toBe('');
  });
});

describe('control-plane reinvoke adapter contract', () => {
  it('reinvokeStartExecute returns a Promise for known tiers', () => {
    const p1 = reinvokeStartExecute('feature', { featureId: '6' });
    const p2 = reinvokeStartExecute('session', { sessionId: '6.2.1' });
    const p3 = reinvokeStartExecute('task', { taskId: '6.2.1.1' });
    const p4 = reinvokeStartExecute('task', { taskId: '6.2.1.1', featureId: '6' });
    expect(p1).toBeInstanceOf(Promise);
    expect(p2).toBeInstanceOf(Promise);
    expect(p3).toBeInstanceOf(Promise);
    expect(p4).toBeInstanceOf(Promise);
  });

  it('reinvokeStartExecute throws for unknown tier', async () => {
    await expect(reinvokeStartExecute('unknown' as 'feature', {})).rejects.toThrow('Unknown tier');
  });
});
