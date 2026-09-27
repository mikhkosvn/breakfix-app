import { Injectable } from '@nestjs/common';

@Injectable()
export class SecretsService {
  private readonly cache = new Map<string, string>();

  async sentryToken(): Promise<string> {
    return this.read('SENTRY_TOKEN', 'breakfix/sentry');
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
      `Secret ${secretId} is missing. Set ${envName} in your .env file. As a second option, set NODE_ENV to production and store the secret in Amazon Web Services (AWS) Secrets Manager.`,
    );
  }

  private fromSecretsManager(secretId: string): Promise<string> {
    throw new Error(
      `Amazon Web Services (AWS) Secrets Manager is not implemented. Secret: ${secretId}`,
    );
  }
}
