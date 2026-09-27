import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from './config/config.module';
import { SecretsModule } from './secrets/secrets.module';
import { DbModule } from './db/db.module';
import { SentryModule } from './sentry/sentry.module';
import { BatchModule } from './batch/batch.module';
import { TriageController } from './triage.controller';
import { TriageService } from './triage.service';

@Module({
  imports: [
    ConfigModule,
    SecretsModule,
    DbModule,
    SentryModule,
    BatchModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [TriageController],
  providers: [TriageService],
})
export class TriageModule {}
