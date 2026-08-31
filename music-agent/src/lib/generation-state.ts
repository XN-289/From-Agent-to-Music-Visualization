import type { JobStatus } from '@/lib/providers/types';

export const GENERATION_STATUSES = [
  'draft',
  'submitted',
  'generating',
  'completed',
  'failed',
  'cancelled',
] as const;

export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

export const GENERATION_JOB_STATUSES = [
  'submitted',
  'generating',
  'completed',
  'failed',
  'cancelled',
] as const;

export type GenerationJobStatus = (typeof GENERATION_JOB_STATUSES)[number];

const ACTIVE_STATUSES: GenerationStatus[] = ['draft', 'submitted', 'generating'];
const TERMINAL_STATUSES: GenerationStatus[] = ['completed', 'failed', 'cancelled'];

const TRANSITIONS = new Map<GenerationStatus, GenerationStatus[]>([
  ['draft', ['submitted', 'failed']],
  ['submitted', ['generating', 'failed', 'cancelled']],
  ['generating', ['completed', 'failed', 'cancelled']],
  ['completed', []],
  ['failed', []],
  ['cancelled', []],
]);

export function isGenerationStatus(value: string): value is GenerationStatus {
  return GENERATION_STATUSES.includes(value as GenerationStatus);
}

export function isActiveGenerationStatus(status: GenerationStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export function isTerminalGenerationStatus(status: GenerationStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function canTransition(
  from: GenerationStatus,
  to: GenerationStatus,
): boolean {
  return TRANSITIONS.get(from)?.includes(to) ?? false;
}

export function transitionGenerationStatus(
  from: GenerationStatus,
  to: GenerationStatus,
): GenerationStatus {
  if (!canTransition(from, to)) {
    throw new Error(`非法生成状态转移：${from} -> ${to}`);
  }
  return to;
}

export function normalizeLegacyGenerationStatus(
  value: string,
): GenerationStatus {
  switch (value) {
    case 'draft':
      return 'draft';
    case 'pending':
    case 'submitted':
      return 'submitted';
    case 'processing':
    case 'generating':
      return 'generating';
    case 'success':
    case 'done':
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'failed';
  }
}

export function providerJobState(status: JobStatus): GenerationJobStatus {
  switch (status) {
    case 'pending':
      return 'submitted';
    case 'processing':
      return 'generating';
    case 'success':
      return 'completed';
    case 'failed':
      return 'failed';
  }
}

export function nextActiveGenerationStatus(
  current: GenerationStatus,
  providerStatus: JobStatus,
): GenerationStatus {
  if (isTerminalGenerationStatus(current)) return current;

  const target = providerJobState(providerStatus);
  if (target === current || target === 'submitted') return current;
  if (target === 'generating') return transitionGenerationStatus(current, 'generating');
  return current;
}
