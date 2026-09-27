import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { SecretsService } from '../secrets/secrets.service';
import type { SentryEvent, SentryIssue } from './sentry.types';

export type EventSelector = 'latest' | 'oldest' | 'recommended' | (string & {});

@Injectable()
export class SentryService {
  private readonly log = new Logger(SentryService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly secrets: SecretsService,
  ) {}

  async newIssues(withinMinutes: number): Promise<SentryIssue[]> {
    const params = new URLSearchParams({
      environment: this.config.sentryEnvironment,
      query: `is:unresolved firstSeen:-${withinMinutes}m`,
      limit: '25',
    });
    return this.get<SentryIssue[]>(
      `/organizations/${this.config.sentryOrg}/issues/?${params}`,
    );
  }

  async issue(issueId: string): Promise<SentryIssue> {
    return this.get<SentryIssue>(
      `/organizations/${this.config.sentryOrg}/issues/${issueId}/`,
    );
  }

  async event(
    issueId: string,
    selector: EventSelector = 'latest',
  ): Promise<SentryEvent> {
    return this.get<SentryEvent>(
      `/organizations/${this.config.sentryOrg}/issues/${issueId}/events/${selector}/`,
    );
  }

  async regressionEventId(issueId: string): Promise<string | null> {
    const issue = await this.issue(issueId);
    const entry = (issue.activity ?? []).find(
      (a) => a.type === 'set_regression',
    );
    return entry?.data?.event_id ?? null;
  }

  async trace(traceId: string, errorEventId?: string): Promise<unknown> {
    const params = new URLSearchParams({ statsPeriod: '7d' });
    if (errorEventId) params.set('errorId', errorEventId);
    return this.get(
      `/organizations/${this.config.sentryOrg}/trace/${traceId}/?${params}`,
    );
  }

  async logs(traceId: string): Promise<unknown> {
    const params = new URLSearchParams({
      dataset: 'logs',
      query: `trace:${traceId}`,
      per_page: '100',
    });
    for (const field of ['timestamp', 'severity', 'message', 'trace'])
      params.append('field', field);
    return this.get(
      `/organizations/${this.config.sentryOrg}/events/?${params}`,
    );
  }

  private async get<T>(path: string, attempt = 1): Promise<T> {
    const token = await this.secrets.sentryToken();
    const url = `${this.config.sentryBaseUrl}/api/0${path}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    if (response.status === 429 && attempt <= 3) {
      const waitMs =
        Number(response.headers.get('retry-after') ?? 1) * 1000 * attempt;
      this.log.warn(
        `Sentry answered 429. Waiting ${waitMs} milliseconds, then attempt ${attempt + 1}.`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return this.get<T>(path, attempt + 1);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Sentry ${response.status} on ${path}: ${body.slice(0, 300)}`,
      );
    }

    return (await response.json()) as T;
  }
}
