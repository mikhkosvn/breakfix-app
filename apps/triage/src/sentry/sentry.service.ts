import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { SecretsService } from '../secrets/secrets.service';
import { TriageIssuePage, nextCursorOf } from './sentry.types';
import type { TriageIssue } from './sentry.types';

const UTC_SECONDS_STAMP_LENGTH = 19;
const ISSUES_EACH_PAGE = '100';
const MAX_PAGES_EACH_TICK = 20;
const MAX_ATTEMPTS = 3;
const TOO_MANY_REQUESTS = 429;
const MILLISECONDS_EACH_SECOND = 1000;
const DEFAULT_RETRY_AFTER_SECONDS = 1;
const ERROR_BODY_PREVIEW_LENGTH = 300;
const REPORTED_PROBLEM_LIMIT = 2;

type SentryResponse<T> = {
  body: T;
  headers: Headers;
};

type IssuePageResult = {
  issues: TriageIssue[];
  nextCursor: string | null;
};

function utcSecondsStampWithoutMilliseconds(when: Date): string {
  return when.toISOString().slice(0, UTC_SECONDS_STAMP_LENGTH);
}

@Injectable()
export class SentryService {
  constructor(
    private readonly config: ConfigService,
    private readonly secrets: SecretsService,
  ) {}

  async issuesSince(since: Date): Promise<TriageIssue[]> {
    const stamp = utcSecondsStampWithoutMilliseconds(since);
    const cap = this.config.maxIssuesPerTick;
    const collected: TriageIssue[] = [];

    let cursor: string | null = null;
    let pagesRead = 0;

    while (pagesRead < MAX_PAGES_EACH_TICK) {
      const page = await this.issuePage(stamp, cursor);
      pagesRead += 1;
      collected.push(...page.issues);
      cursor = page.nextCursor;
      if (!cursor) break;
      if (collected.length >= cap) break;
    }

    if (collected.length > cap) {
      return collected.slice(0, cap);
    }

    return collected;
  }

  private async issuePage(
    stamp: string,
    cursor: string | null,
  ): Promise<IssuePageResult> {
    const params = new URLSearchParams({
      environment: this.config.sentryEnvironment,
      query: `is:unresolved lastSeen:>${stamp}`,
      sort: 'date',
      limit: ISSUES_EACH_PAGE,
    });
    if (cursor) params.set('cursor', cursor);

    const org = this.config.sentryOrg;
    const path = `/organizations/${org}/issues/?${params.toString()}`;
    const response = await this.get<unknown>(path);

    const parsed = TriageIssuePage.safeParse(response.body);
    if (!parsed.success) {
      const problems = parsed.error.issues
        .slice(0, REPORTED_PROBLEM_LIMIT)
        .map((problem) => `${problem.path.join('.')}: ${problem.message}`)
        .join(', ');
      throw new Error(
        `Sentry sent an issue page that does not match the schema. First problems: ${problems}`,
      );
    }

    return {
      issues: parsed.data,
      nextCursor: nextCursorOf(response.headers.get('link')),
    };
  }

  private async get<T>(path: string, attempt = 1): Promise<SentryResponse<T>> {
    const token = await this.secrets.sentryToken();
    const url = `${this.config.sentryBaseUrl}/api/0${path}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    if (response.status === TOO_MANY_REQUESTS && attempt <= MAX_ATTEMPTS) {
      const retryAfterSeconds = Number(
        response.headers.get('retry-after') ?? DEFAULT_RETRY_AFTER_SECONDS,
      );
      const waitMs = retryAfterSeconds * MILLISECONDS_EACH_SECOND * attempt;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return this.get<T>(path, attempt + 1);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Sentry ${response.status} on ${path}: ${body.slice(0, ERROR_BODY_PREVIEW_LENGTH)}`,
      );
    }

    return { body: (await response.json()) as T, headers: response.headers };
  }
}
