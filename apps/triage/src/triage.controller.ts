import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ConfigService } from './config/config.service';
import { DbService } from './db/db.service';
import { TriageService } from './triage.service';
import type { TickResult } from './contracts/run';

const DATABASE_PROBE_SQL = 'select 1 as reachable';

export type TriageHealth = {
  ok: boolean;
  database: boolean;
  sentry: {
    organization: string;
    environment: string;
  };
};

@Controller('triage')
export class TriageController {
  constructor(
    private readonly triage: TriageService,
    private readonly config: ConfigService,
    private readonly db: DbService,
  ) {}

  @Post('tick')
  @HttpCode(HttpStatus.OK)
  async tick(): Promise<TickResult> {
    return this.triage.tick();
  }

  @Get('health')
  async health(): Promise<TriageHealth> {
    const database = await this.databaseAnswers();

    const health: TriageHealth = {
      ok: database,
      database,
      sentry: {
        organization: this.config.sentryOrg,
        environment: this.config.sentryEnvironment,
      },
    };

    if (!health.ok) {
      throw new HttpException(health, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return health;
  }

  private async databaseAnswers(): Promise<boolean> {
    try {
      const rows = await this.db.query<{ reachable: number }>(
        DATABASE_PROBE_SQL,
      );
      return rows.length > 0;
    } catch {
      return false;
    }
  }
}
