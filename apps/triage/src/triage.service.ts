import { Injectable, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ConfigService } from './config/config.service';
import { SentryService } from './sentry/sentry.service';
import { RunsRepository } from './db/runs.repository';
import { BatchService } from './batch/batch.service';
import type { ClaimedRun, SubmitFailure, TickResult } from './contracts/run';

const SCHEDULED_TICK_NAME = 'triage-poll';

const WATERMARK_BEFORE_THE_FIRST_TICK = new Date(0).toISOString();

type SubmitOutcome = {
  submitted: number;
  submitFailures: SubmitFailure[];
};

type TickTotals = SubmitOutcome & {
  watermark: string;
  scanned: number;
  claimed: number;
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class TriageService implements OnModuleInit {
  private running = false;
  private lastWatermark = WATERMARK_BEFORE_THE_FIRST_TICK;

  constructor(
    private readonly config: ConfigService,
    private readonly sentry: SentryService,
    private readonly runs: RunsRepository,
    private readonly batch: BatchService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.runs.ensureSchema();
    this.startScheduledTick();
  }

  async tick(): Promise<TickResult> {
    const startedAt = new Date();

    if (this.running) {
      return this.skippedTickResult(startedAt);
    }

    this.running = true;
    try {
      const watermark = await this.runs.watermark();
      this.lastWatermark = watermark.toISOString();

      const issues = await this.sentry.issuesSince(watermark);
      const claimed = await this.runs.claim(issues);
      const outcome = await this.submitClaimedRuns(claimed);

      return this.resultOf(startedAt, {
        watermark: this.lastWatermark,
        scanned: issues.length,
        claimed: claimed.length,
        ...outcome,
      });
    } finally {
      this.running = false;
    }
  }

  private async submitClaimedRuns(
    claimed: ClaimedRun[],
  ): Promise<SubmitOutcome> {
    const submitFailures: SubmitFailure[] = [];
    let submitted = 0;

    for (const run of claimed) {
      let batchJobId: string;

      try {
        batchJobId = await this.batch.submit(run);
      } catch (error) {
        const failure = messageOf(error);
        await this.recordSubmitFailure(run, failure);
        submitFailures.push({
          issueId: run.issueId,
          shortId: run.shortId,
          failure,
        });
        continue;
      }

      await this.recordSubmitted(run, batchJobId);
      submitted += 1;
    }

    return { submitted, submitFailures };
  }

  private async recordSubmitted(
    run: ClaimedRun,
    batchJobId: string,
  ): Promise<void> {
    await this.runs.markSubmitted(run.runId, batchJobId).catch(() => undefined);
  }

  private async recordSubmitFailure(
    run: ClaimedRun,
    failure: string,
  ): Promise<void> {
    await this.runs.markSubmitFailed(run.runId, failure).catch(() => undefined);
  }

  private skippedTickResult(startedAt: Date): TickResult {
    return this.resultOf(startedAt, {
      watermark: this.lastWatermark,
      scanned: 0,
      claimed: 0,
      submitted: 0,
      submitFailures: [],
    });
  }

  private resultOf(startedAt: Date, totals: TickTotals): TickResult {
    const finishedAt = new Date();
    return {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      watermark: totals.watermark,
      scanned: totals.scanned,
      claimed: totals.claimed,
      submitted: totals.submitted,
      failed: totals.submitFailures.length,
      submitFailures: totals.submitFailures,
    };
  }

  private startScheduledTick(): void {
    const job = CronJob.from({
      cronTime: this.config.pollCron,
      onTick: () => {
        void this.tick().catch(() => undefined);
      },
    });

    this.scheduler.addCronJob(SCHEDULED_TICK_NAME, job);
    job.start();
  }
}
