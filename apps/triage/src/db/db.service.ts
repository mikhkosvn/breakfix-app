import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  Pool,
  type PoolConfig,
  type QueryResult,
  type QueryResultRow,
} from 'pg';
import { ConfigService } from '../config/config.service';

type QueryOutcome = QueryResult<QueryResultRow>;

const CONNECTION_PROBE_SQL = 'select 1';

const DATABASE_UNREACHABLE =
  'Triage cannot reach the database. Make sure DATABASE_URL is correct.';

const POOL_NOT_READY =
  'The database pool is not ready. Wait for the module to start.';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function rowsOfLastStatement(
  outcome: QueryOutcome | QueryOutcome[],
): QueryResultRow[] {
  if (!Array.isArray(outcome)) return outcome.rows;
  const last = outcome.at(-1);
  return last ? last.rows : [];
}

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool | undefined;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const pool = new Pool(this.poolConfig());
    pool.on('error', () => undefined);
    this.pool = pool;

    try {
      await pool.query(CONNECTION_PROBE_SQL);
    } catch (error) {
      this.pool = undefined;
      await pool.end().catch(() => undefined);
      throw new Error(`${DATABASE_UNREACHABLE} Cause: ${messageOf(error)}`, {
        cause: error,
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    const pool = this.pool;
    this.pool = undefined;
    if (!pool) return;
    await pool.end();
  }

  async query<T>(text: string, values?: unknown[]): Promise<T[]> {
    const outcome = (await this.requirePool().query<QueryResultRow>(
      text,
      values,
    )) as QueryOutcome | QueryOutcome[];
    return rowsOfLastStatement(outcome) as T[];
  }

  private poolConfig(): PoolConfig {
    const settings: PoolConfig = {
      connectionString: this.config.databaseUrl,
      max: this.config.databasePoolMax,
    };
    if (this.config.databaseSsl) {
      settings.ssl = { rejectUnauthorized: false };
    }
    return settings;
  }

  private requirePool(): Pool {
    const pool = this.pool;
    if (!pool) throw new Error(POOL_NOT_READY);
    return pool;
  }
}
