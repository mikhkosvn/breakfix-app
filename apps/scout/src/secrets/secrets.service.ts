import { Injectable, Logger } from '@nestjs/common';

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
      return undefined;
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

  private fromSecretsManager(secretId: string): Promise<string> {
    this.log.error(
      `Secrets Manager is not wired yet. Cannot read ${secretId}.`,
    );
    throw new Error(`Secrets Manager is not implemented. Secret: ${secretId}`);
  }
}
