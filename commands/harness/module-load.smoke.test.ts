import { describe, expect, it } from 'vitest';
import { runTierStart } from '../tiers/shared/tier-start';
import { runTierEnd } from '../tiers/shared/tier-end';
import { buildSpecFromTierRun } from './build-spec-from-tier';
import { defaultKernel } from './kernel';
import { createTierAdapter } from './tier-adapter';

describe('command module load smoke', () => {
  it('loads shared tier entrypoints', () => {
    expect(typeof runTierStart).toBe('function');
    expect(typeof runTierEnd).toBe('function');
  });

  it('loads kernel and harness adapters', () => {
    expect(typeof defaultKernel.run).toBe('function');
    expect(typeof createTierAdapter).toBe('function');
  });

  it('builds a valid start workflow spec', () => {
    const spec = buildSpecFromTierRun({
      tier: 'session',
      action: 'start',
      identifier: '1.1.1',
      featureContext: { featureId: '1', featureName: 'test-feature' },
      mode: 'plan',
    });

    expect(spec.tier).toBe('session');
    expect(spec.action).toBe('start');
    expect(spec.identifier).toBe('1.1.1');
    expect(spec.mode).toBe('plan');
    expect(spec.constraints.allowWrites).toBe(true);
    expect(spec.constraints.allowGit).toBe(true);
  });
});
