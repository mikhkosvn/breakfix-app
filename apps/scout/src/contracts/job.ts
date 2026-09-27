import { z } from 'zod';

export const ScoutJob = z
  .object({
    runId: z.string().min(1),

    issueId: z.string().min(1),

    kind: z.enum(['new', 'regression']),
  })
  .strict();

export type ScoutJob = z.infer<typeof ScoutJob>;

export const PHASES = [
  'starting',
  'sentry',
  'clone',
  'collect',
  'agent:model',
  'agent:tool',
  'validate',
  'publish',
] as const;

export type Phase = (typeof PHASES)[number];

export const STALE_AFTER_MS: Record<Phase, number> = {
  starting: 60_000,
  sentry: 120_000,
  clone: 300_000,
  collect: 120_000,
  'agent:model': 180_000,
  'agent:tool': 600_000,
  validate: 60_000,
  publish: 120_000,
};

export type ScoutResult = {
  runId: string;
  issueId: string;
  ok: boolean;
  phase: Phase;
  failure?: string;
  report?: unknown;
  usage: {
    input: number;
    output: number;
    reasoning: number;
    cacheRead: number;
    cacheWrite: number;
  };
  toolCalls: number;
};
