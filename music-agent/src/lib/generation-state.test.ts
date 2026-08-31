import { describe, expect, it } from 'vitest';
import {
  nextActiveGenerationStatus,
  canTransition,
  normalizeLegacyGenerationStatus,
  providerJobState,
  transitionGenerationStatus,
} from './generation-state';

describe('generation state machine', () => {
  it('allows only the PRD generation lifecycle', () => {
    expect(canTransition('draft', 'submitted')).toBe(true);
    expect(canTransition('submitted', 'generating')).toBe(true);
    expect(canTransition('generating', 'completed')).toBe(true);
    expect(canTransition('generating', 'failed')).toBe(true);
    expect(canTransition('generating', 'cancelled')).toBe(true);

    expect(canTransition('draft', 'generating')).toBe(false);
    expect(canTransition('submitted', 'completed')).toBe(false);
    expect(canTransition('completed', 'failed')).toBe(false);
    expect(canTransition('failed', 'generating')).toBe(false);
    expect(canTransition('cancelled', 'generating')).toBe(false);
  });

  it('normalizes legacy persisted statuses', () => {
    expect(normalizeLegacyGenerationStatus('draft')).toBe('draft');
    expect(normalizeLegacyGenerationStatus('pending')).toBe('submitted');
    expect(normalizeLegacyGenerationStatus('processing')).toBe('generating');
    expect(normalizeLegacyGenerationStatus('success')).toBe('completed');
    expect(normalizeLegacyGenerationStatus('done')).toBe('completed');
    expect(normalizeLegacyGenerationStatus('failed')).toBe('failed');
    expect(normalizeLegacyGenerationStatus('cancelled')).toBe('cancelled');
  });

  it('returns the target state or throws on an illegal transition', () => {
    expect(transitionGenerationStatus('draft', 'submitted')).toBe('submitted');
    expect(transitionGenerationStatus('generating', 'completed')).toBe('completed');

    expect(() => transitionGenerationStatus('completed', 'failed')).toThrow(
      '非法生成状态转移：completed -> failed',
    );
  });

  it('maps provider job statuses into the generation lifecycle', () => {
    expect(providerJobState('pending')).toBe('submitted');
    expect(providerJobState('processing')).toBe('generating');
    expect(providerJobState('success')).toBe('completed');
    expect(providerJobState('failed')).toBe('failed');
  });

  it('keeps queued provider jobs in submitted and protects terminal states', () => {
    expect(nextActiveGenerationStatus('submitted', 'pending')).toBe('submitted');
    expect(nextActiveGenerationStatus('generating', 'pending')).toBe('generating');
    expect(nextActiveGenerationStatus('submitted', 'processing')).toBe('generating');

    expect(nextActiveGenerationStatus('completed', 'failed')).toBe('completed');
    expect(nextActiveGenerationStatus('failed', 'processing')).toBe('failed');
    expect(nextActiveGenerationStatus('cancelled', 'success')).toBe('cancelled');
  });
});
