import { Injectable, Logger } from '@nestjs/common';

/**
 * Holds secrets in process memory.
 *
 * Two rules, both deliberate.
 *
 * 1. A secret never goes into `process.env` after startup. The agent runs shell commands,
 *    and a command can read the environment of its own process.
 * 2. When scout spawns OpenCode, it passes an explicit environment allowlist. It never
 *    spreads `process.env`. See `OpenCodeService.spawn`.
 *
 * Local development reads a `.env` file. Production reads AWS Secrets Manager. One
 * interface, two sources.
 */
@Injectable()
export class SecretsService {
  private readonly log = new Logger(SecretsService.name);
  private readonly cache = new Map<string, string>();

  async sentryToken(): Promise<string> {
    return this.read('SENTRY_TOKEN', 'breakfix/sentry');
  }

  async githubToken(): Promise<string> {
    return this.read('GITHUB_TOKEN', 'breakfix/github');
  }

  async modelApiKey(): Promise<string | undefined> {
    try {
      return await this.read('MODEL_API_KEY', 'breakfix/model');
    } catch {
      return undefined; // A gateway on a private network may need no key.
    }
  }

  private async read(envName: string, secretId: string): Promise<string> {
    const cached = this.cache.get(secretId);
    if (cached) return cached;

    const fromEnv = process.env[envName];
    if (fromEnv) {
      this.cache.set(secretId, fromEnv);
      return fromEnv;
    }

    if (process.env.NODE_ENV === 'production') {
      const value = await this.fromSecretsManager(secretId);
      this.cache.set(secretId, value);
      return value;
    }

    throw new Error(
      `Secret ${secretId} is missing. Set ${envName} in your .env file, or run with NODE_ENV=production.`,
    );
  }

  /**
   * Reads one secret from AWS Secrets Manager.
   *
   * Not implemented yet. Scout runs against a `.env` file until it reaches Fargate. The
   * import stays dynamic so local development needs no AWS package.
   */
  private async fromSecretsManager(secretId: string): Promise<string> {
    this.log.error(
      `Secrets Manager is not wired yet. Cannot read ${secretId}.`,
    );
    throw new Error(`Secrets Manager is not implemented. Secret: ${secretId}`);
  }
}
