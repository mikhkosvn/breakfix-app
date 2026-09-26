import { z } from 'zod';

/** What triage sends to scout. One job investigates one Sentry issue. */
export const ScoutJob = z
  .object({
    /** Our own identifier for this run. Triage creates it. */
    runId: z.string().min(1),

    /** The Sentry issue identifier. */
    issueId: z.string().min(1),

    /**
     * Why this job exists.
     * - `new`: Sentry saw this issue for the first time.
     * - `regression`: the issue was resolved and it returned.
     */
    kind: z.enum(['new', 'regression']),
  })
  .strict();

export type ScoutJob = z.infer<typeof ScoutJob>;

/** Every step scout runs, in order. The heartbeat reports the current one. */
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

/** How long a phase may stay silent before we call the run stuck. */
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
  /** The phase scout reached. On a failure, this is where it stopped. */
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
