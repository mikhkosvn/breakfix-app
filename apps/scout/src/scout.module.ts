import { Module } from '@nestjs/common';
import { ScoutController } from './scout.controller';
import { ScoutService } from './scout.service';
import { ConfigModule } from './config/config.module';
import { SecretsModule } from './secrets/secrets.module';
import { SentryModule } from './sentry/sentry.module';
import { GitModule } from './git/git.module';
import { OpencodeModule } from './opencode/opencode.module';

@Module({
  imports: [
    ConfigModule,
    SecretsModule,
    SentryModule,
    GitModule,
    OpencodeModule,
  ],
  controllers: [ScoutController],
  providers: [ScoutService],
})
export class ScoutModule {}
