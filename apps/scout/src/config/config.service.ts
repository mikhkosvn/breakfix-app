import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

/** One target repository, keyed by its Sentry project slug. */
export type RepoConfig = {
  /** GitHub repository, as `owner/name`. */
  repo: string;
  defaultBranch: string;
};

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),

  // Sentry.
  // Warning: an organization token (the `sntrys_` kind) does NOT work. Its scope is fixed
  // to org:ci, and four endpoints scout needs reject it. See gap 6 in GAPS.md.
  SENTRY_BASE_URL: z.string().url().default('https://sentry.io'),
  SENTRY_ORG: z.string().min(1),
  SENTRY_ENVIRONMENT: z.string().default('staging'),

  // GitHub.
  GITHUB_TOKEN: z.string().min(1).optional(),

  // The model gateway. Any OpenAI-compatible or Anthropic-Messages endpoint.
  // Warning: do not name the provider `anthropic`. That identifier triggers hard-coded
  // beta headers that an open-weights gateway may reject.
  MODEL_PROVIDER_ID: z.string().default('gateway'),
  MODEL_PROVIDER_NPM: z.string().default('@ai-sdk/openai-compatible'),
  MODEL_BASE_URL: z.string().url(),
  MODEL_ID: z.string().min(1),
  MODEL_API_KEY: z.string().optional(),

  // Budgets. We count tokens, not money: OpenCode reports a cost of zero for a custom
  // provider. See gap 3 in GAPS.md.
  MAX_TOKENS: z.coerce.number().int().positive().default(500_000),
  MAX_TOOL_CALLS: z.coerce.number().int().positive().default(40),
  MAX_RUN_MS: z.coerce.number().int().positive().default(1_800_000),

  // Paths inside the container.
  WORK_DIR: z.string().default('/work'),
  OPENCODE_PORT: z.coerce.number().int().default(4096),
});

@Injectable()
export class ConfigService {
  private readonly log = new Logger(ConfigService.name);
  private readonly env: z.infer<typeof EnvSchema>;

  /**
   * Which repository each Sentry project maps to.
   *
   * This lives in code on purpose. Adding a repository is a pull request, and a code
   * review is the approval step. Move it to a table when redeploying to add one starts to
   * annoy you.
   */
  private readonly repos: Record<string, RepoConfig> = {
    // 'payments-api': { repo: 'acme/payments-api', defaultBranch: 'main' },
  };

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

  /** Find the repository for a Sentry project. Returns undefined when the project is not mapped. */
  repoForProject(projectSlug: string): RepoConfig | undefined {
    return this.repos[projectSlug];
  }
}
