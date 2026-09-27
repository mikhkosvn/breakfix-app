export const RUN_STATES = ['queued', 'running', 'done', 'failed'] as const;

export type RunState = (typeof RUN_STATES)[number];

export const JOB_KINDS = ['new', 'regression'] as const;

export type JobKind = (typeof JOB_KINDS)[number];

export type ClaimedRun = {
  runId: string;
  issueId: string;
  shortId: string;
  projectSlug: string;
  kind: JobKind;
  issueLastSeen: Date;
  attempt: number;
};

export type SubmittedRun = ClaimedRun & { batchJobId: string };

export type SubmitFailure = {
  issueId: string;
  shortId: string;
  failure: string;
};

export type TickResult = {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  watermark: string;
  scanned: number;
  claimed: number;
  submitted: number;
  failed: number;
  submitFailures: SubmitFailure[];
};
