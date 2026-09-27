import {
  BatchClient,
  SubmitJobCommand,
  type KeyValuePair,
} from '@aws-sdk/client-batch';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import type { ClaimedRun } from '../contracts/run';

const JOB_NAME_MAX_LENGTH = 128;
const CHARACTERS_NOT_ALLOWED_IN_A_JOB_NAME = /[^A-Za-z0-9_-]/g;
const REPLACEMENT_FOR_A_CHARACTER_NOT_ALLOWED = '-';
const JOB_NAME_STARTS_WITH_ALPHANUMERIC = /^[A-Za-z0-9]/;
const PREFIX_WHEN_FIRST_CHARACTER_IS_NOT_ALPHANUMERIC = 'j';
const DRY_RUN_JOB_ID_PREFIX = 'dry-run:';

export function batchJobNameOf(shortId: string, runId: string): string {
  const withAllowedCharacters = `${shortId}-${runId}`.replace(
    CHARACTERS_NOT_ALLOWED_IN_A_JOB_NAME,
    REPLACEMENT_FOR_A_CHARACTER_NOT_ALLOWED,
  );
  const startsWithAlphanumeric = JOB_NAME_STARTS_WITH_ALPHANUMERIC.test(
    withAllowedCharacters,
  );
  const jobName = startsWithAlphanumeric
    ? withAllowedCharacters
    : PREFIX_WHEN_FIRST_CHARACTER_IS_NOT_ALPHANUMERIC + withAllowedCharacters;
  return jobName.slice(0, JOB_NAME_MAX_LENGTH);
}

function scoutWorkerEnvironment(run: ClaimedRun): KeyValuePair[] {
  return [
    { name: 'RUN_ID', value: run.runId },
    { name: 'ISSUE_ID', value: run.issueId },
    { name: 'KIND', value: run.kind },
  ];
}

function consoleSearchTags(run: ClaimedRun): Record<string, string> {
  return {
    issueId: run.issueId,
    shortId: run.shortId,
    projectSlug: run.projectSlug,
  };
}

@Injectable()
export class BatchService {
  private readonly client: BatchClient;

  constructor(private readonly config: ConfigService) {
    this.client = new BatchClient({ region: this.config.awsRegion });
  }

  async submit(run: ClaimedRun): Promise<string> {
    if (!this.config.submitEnabled) {
      return `${DRY_RUN_JOB_ID_PREFIX}${run.runId}`;
    }

    const response = await this.client.send(
      new SubmitJobCommand({
        jobName: batchJobNameOf(run.shortId, run.runId),
        jobQueue: this.config.batchJobQueue,
        jobDefinition: this.config.batchJobDefinition,
        containerOverrides: { environment: scoutWorkerEnvironment(run) },
        tags: consoleSearchTags(run),
      }),
    );

    const jobId = response.jobId;
    if (!jobId) {
      throw new Error(
        `Amazon Web Services (AWS) Batch accepted the job for Issue ${run.shortId} and returned no job identifier.`,
      );
    }

    return jobId;
  }
}
