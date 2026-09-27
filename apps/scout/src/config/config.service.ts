import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

export type RepoConfig = {
  repo: string;
  defaultBranch: string;
};

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),

  SENTRY_BASE_URL: z.string().url().default('https://sentry.io'),
  SENTRY_ORG: z.string().min(1),
  SENTRY_ENVIRONMENT: z.string().default('staging'),

  GITHUB_TOKEN: z.string().min(1).optional(),

  MODEL_PROVIDER_ID: z.string().default('gateway'),
  MODEL_PROVIDER_NPM: z.string().default('@ai-sdk/openai-compatible'),
  MODEL_BASE_URL: z.string().url(),
  MODEL_ID: z.string().min(1),
  MODEL_API_KEY: z.string().optional(),

  MAX_TOKENS: z.coerce.number().int().positive().default(500_000),
  MAX_TOOL_CALLS: z.coerce.number().int().positive().default(40),
  MAX_RUN_MS: z.coerce.number().int().positive().default(1_800_000),

  WORK_DIR: z.string().default('/work'),
  OPENCODE_PORT: z.coerce.number().int().default(4096),
});

@Injectable()
export class ConfigService {
  private readonly log = new Logger(ConfigService.name);
  private readonly env: z.infer<typeof EnvSchema>;

  private readonly repos: Record<string, RepoConfig> = {};

  constructor() {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      const lines = parsed.error.issues.map(
        (i) => `  ${i.path.join('.')}: ${i.message}`,
      );
      throw new Error(`Configuration is not valid:\n${lines.join('\n')}`);
    }
    this.env = parsed.data;
    this.log.log(
      `Configuration loaded. ${Object.keys(this.repos).length} repositories mapped.`,
    );
  }

  get port(): number {
    return this.env.PORT;
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
  get githubToken(): string | undefined {
    return this.env.GITHUB_TOKEN;
  }
  get workDir(): string {
    return this.env.WORK_DIR;
  }
  get openCodePort(): number {
    return this.env.OPENCODE_PORT;
  }
  get maxTokens(): number {
    return this.env.MAX_TOKENS;
  }
  get maxToolCalls(): number {
    return this.env.MAX_TOOL_CALLS;
  }
  get maxRunMs(): number {
    return this.env.MAX_RUN_MS;
  }

  get model() {
    return {
      providerId: this.env.MODEL_PROVIDER_ID,
      npm: this.env.MODEL_PROVIDER_NPM,
      baseUrl: this.env.MODEL_BASE_URL,
      modelId: this.env.MODEL_ID,
      apiKey: this.env.MODEL_API_KEY,
    };
  }

  repoForProject(projectSlug: string): RepoConfig | undefined {
    return this.repos[projectSlug];
  }
}
