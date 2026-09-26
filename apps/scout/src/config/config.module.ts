import { Global, Module } from '@nestjs/common';
import { ConfigService } from './config.service';

/** Global: every module reads configuration, so importing it everywhere adds only noise. */
@Global()
@Module({
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
