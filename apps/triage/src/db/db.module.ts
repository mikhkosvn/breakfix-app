import { Global, Module } from '@nestjs/common';
import { DbService } from './db.service';
import { RunsRepository } from './runs.repository';

@Global()
@Module({
  providers: [DbService, RunsRepository],
  exports: [DbService, RunsRepository],
})
export class DbModule {}
