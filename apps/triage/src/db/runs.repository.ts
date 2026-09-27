import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { DbService } from './db.service';
import type { ClaimedRun, JobKind } from '../contracts/run';
import type { TriageIssue } from '../sentry/sentry.types';

const SCHEMA_FILE_NAME = 'schema.sql';
const FAILURE_TEXT_LIMIT = 1000;

export const MAX_SUBMIT_ATTEMPTS = 3;

const WATERMARK_SQL = `
  select coalesce(
    (select min(issue_last_seen) from scout_run
      where state in ('queued', 'running')
         or (state = 'failed'
             and (submitted_at is not null or attempt < $3::int)))
      - make_interval(mins => $1::int),
    (select max(issue_last_seen) from scout_run)
      - make_interval(mins => $1::int),
    now() - make_interval(days => $2::int)
  ) as watermark
`;

const ISSUE_REGRESSED_SQL = `excluded.issue_last_seen > r.issue_last_seen
      and excluded.substatus = any($7::text[])`;

const SUBMISSION_HAS_AN_ATTEMPT_LEFT_SQL = `r.state = 'failed'
      and r.submitted_at is null
      and r.attempt < $8::int`;

const CLAIM_SQL = `
  with candidate as (
    select *
    from unnest($1::text[], $2::text[], $3::text[], $4::timestamptz[], $5::text[], $6::uuid[])
      as t(issue_id, short_id, project_slug, issue_last_seen, substatus, run_id)
  )
  insert into scout_run as r (
    issue_id, short_id, project_slug, run_id, kind, state,
    attempt, issue_last_seen, substatus, first_queued_at, updated_at
  )
  select
    c.issue_id, c.short_id, c.project_slug, c.run_id, 'new', 'queued',
    1, c.issue_last_seen, c.substatus, now(), now()
  from candidate c
  on conflict (issue_id) do update
  set run_id = excluded.run_id,
      kind = case
        when ${ISSUE_REGRESSED_SQL}
        then 'regression'
        else r.kind
      end,
      state = 'queued',
      attempt = r.attempt + 1,
      issue_last_seen = excluded.issue_last_seen,
      substatus = excluded.substatus,
      batch_job_id = null,
      failure = null,
      submitted_at = null,
      finished_at = null,
      updated_at = now()
  where r.state in ('done', 'failed')
    and (
      (${ISSUE_REGRESSED_SQL})
      or (${SUBMISSION_HAS_AN_ATTEMPT_LEFT_SQL})
    )
  returning issue_id, short_id, project_slug, run_id, kind, attempt, issue_last_seen
`;

const MARK_SUBMITTED_SQL = `
  update scout_run
  set batch_job_id = $2,
      submitted_at = now(),
      updated_at = now()
  where run_id = $1::uuid
  returning run_id
`;

const MARK_SUBMIT_FAILED_SQL = `
  update scout_run
  set state = 'failed',
      failure = $2,
      finished_at = now(),
      updated_at = now()
  where run_id = $1::uuid
  returning run_id
`;

type WatermarkRow = { watermark: Date | string };

type ClaimedRunRow = {
  issue_id: string;
  short_id: string;
  project_slug: string;
  run_id: string;
  kind: JobKind;
  attempt: number;
  issue_last_seen: Date | string;
};

type RunIdRow = { run_id: string };

type ClaimColumns = {
  issueIds: string[];
  shortIds: string[];
  projectSlugs: string[];
  lastSeens: string[];
  substatuses: (string | null)[];
  runIds: string[];
};

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function schemaFileCandidates(): string[] {
  return [
    join(__dirname, SCHEMA_FILE_NAME),
    join(__dirname, '..', '..', 'src', 'db', SCHEMA_FILE_NAME),
    join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'apps',
      'triage',
      'src',
      'db',
      SCHEMA_FILE_NAME,
    ),
    join(process.cwd(), 'apps', 'triage', 'src', 'db', SCHEMA_FILE_NAME),
  ];
}

function claimColumnsOf(issues: TriageIssue[]): ClaimColumns {
  const columns: ClaimColumns = {
    issueIds: [],
    shortIds: [],
    projectSlugs: [],
    lastSeens: [],
    substatuses: [],
    runIds: [],
  };
  for (const issue of issues) {
    columns.issueIds.push(issue.id);
    columns.shortIds.push(issue.shortId);
    columns.projectSlugs.push(issue.project.slug);
    columns.lastSeens.push(issue.lastSeen.toISOString());
    columns.substatuses.push(issue.substatus);
    columns.runIds.push(randomUUID());
  }
  return columns;
}

function claimedRunOf(row: ClaimedRunRow): ClaimedRun {
  return {
    runId: row.run_id,
    issueId: row.issue_id,
    shortId: row.short_id,
    projectSlug: row.project_slug,
    kind: row.kind,
    issueLastSeen: toDate(row.issue_last_seen),
    attempt: row.attempt,
  };
}

@Injectable()
export class RunsRepository {
  constructor(
    private readonly db: DbService,
    private readonly config: ConfigService,
  ) {}

  async ensureSchema(): Promise<void> {
    const sql = await this.readSchemaFile();
    await this.db.query<unknown>(sql);
  }

  async watermark(): Promise<Date> {
    const rows = await this.db.query<WatermarkRow>(WATERMARK_SQL, [
      this.config.watermarkMarginMinutes,
      this.config.coldStartDays,
      MAX_SUBMIT_ATTEMPTS,
    ]);
    const row = rows[0];
    if (!row) {
      throw new Error('The watermark query returned no row.');
    }
    const watermark = toDate(row.watermark);
    return watermark;
  }

  async claim(issues: TriageIssue[]): Promise<ClaimedRun[]> {
    if (issues.length === 0) return [];

    const columns = claimColumnsOf(issues);
    const rows = await this.db.query<ClaimedRunRow>(CLAIM_SQL, [
      columns.issueIds,
      columns.shortIds,
      columns.projectSlugs,
      columns.lastSeens,
      columns.substatuses,
      columns.runIds,
      this.config.reprocessSubstatuses,
      MAX_SUBMIT_ATTEMPTS,
    ]);
    return rows.map(claimedRunOf);
  }

  async markSubmitted(runId: string, batchJobId: string): Promise<void> {
    await this.db.query<RunIdRow>(MARK_SUBMITTED_SQL, [runId, batchJobId]);
  }

  async markSubmitFailed(runId: string, failure: string): Promise<void> {
    await this.db.query<RunIdRow>(MARK_SUBMIT_FAILED_SQL, [
      runId,
      failure.slice(0, FAILURE_TEXT_LIMIT),
    ]);
  }

  private async readSchemaFile(): Promise<string> {
    const candidates = schemaFileCandidates();
    for (const path of candidates) {
      try {
        return await readFile(path, 'utf8');
      } catch {
        continue;
      }
    }
    throw new Error(
      `The file ${SCHEMA_FILE_NAME} is missing. Looked in: ${candidates.join(', ')}`,
    );
  }
}
