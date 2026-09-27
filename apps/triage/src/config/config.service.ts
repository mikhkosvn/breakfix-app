import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const FALSE_TEXTS = new Set(['false', '0', 'no']);

const DEFAULT_REPROCESS_SUBSTATUSES = 'regressed,escalating';

const booleanFromText = (fallback: 'true' | 'false') =>
  z
    .string()
    .default(fallback)
    .transform((value) => !FALSE_TEXTS.has(value.trim().toLowerCase()));

const commaSeparatedList = (fallback: string) =>
  z
    .string()
    .default(fallback)
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    );

const EnvSchema = z.object({
  TRIAGE_PORT: z.coerce.number().int().positive().default(3100),
  TRIAGE_POLL_CRON: z.string().min(1).default('*/5 * * * *'),
  TRIAGE_WATERMARK_MARGIN_MINUTES: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(15),
  TRIAGE_COLD_START_DAYS: z.coerce.number().int().positive().default(7),
  TRIAGE_MAX_ISSUES_PER_TICK: z.coerce.number().int().positive().default(50),
  TRIAGE_REPROCESS_SUBSTATUSES: commaSeparatedList(
    DEFAULT_REPROCESS_SUBSTATUSES,
  ),
  TRIAGE_SUBMIT_ENABLED: booleanFromText('true'),

  SENTRY_BASE_URL: z.string().url().default('https://sentry.io'),
  SENTRY_ORG: z.string().min(1),
  SENTRY_ENVIRONMENT: z.string().default('staging'),

  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: booleanFromText('false'),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(5),

  AWS_REGION: z.string().min(1),
  BATCH_JOB_QUEUE: z.string().min(1),
  BATCH_JOB_DEFINITION: z.string().min(1),
});

@Injectable()
export class ConfigService {
  private readonly env: z.infer<typeof EnvSchema>;

  constructor() {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      const lines = parsed.error.issues.map(
        (i) => `  ${i.path.join('.')}: ${i.message}`,
      );
      throw new Error(`Configuration is not valid:\n${lines.join('\n')}`);
    }
    this.env = parsed.data;
  }

  get port(): number {
    return this.env.TRIAGE_PORT;
  }
  get pollCron(): string {
    return this.env.TRIAGE_POLL_CRON;
  }
  get watermarkMarginMinutes(): number {
    return this.env.TRIAGE_WATERMARK_MARGIN_MINUTES;
  }
  get coldStartDays(): number {
    return this.env.TRIAGE_COLD_START_DAYS;
  }
  get maxIssuesPerTick(): number {
    return this.env.TRIAGE_MAX_ISSUES_PER_TICK;
  }
  get reprocessSubstatuses(): string[] {
    return this.env.TRIAGE_REPROCESS_SUBSTATUSES;
  }
  get submitEnabled(): boolean {
    return this.env.TRIAGE_SUBMIT_ENABLED;
  }

  get sentryBaseUrl(): string {
    return this.env.SENTRY_BASE_URL;
  }
  get sentryOrg(): string {
    return this.env.SENTRY_ORG;
  }
  get sentryEnvironment(): string {
    return this.env.SENTRY_ENVIRONMENT;
  }

  get databaseUrl(): string {
    return this.env.DATABASE_URL;
  }
  get databaseSsl(): boolean {
    return this.env.DATABASE_SSL;
  }
  get databasePoolMax(): number {
    return this.env.DATABASE_POOL_MAX;
  }

  get awsRegion(): string {
    return this.env.AWS_REGION;
  }
  get batchJobQueue(): string {
    return this.env.BATCH_JOB_QUEUE;
  }
  get batchJobDefinition(): string {
    return this.env.BATCH_JOB_DEFINITION;
  }
}
