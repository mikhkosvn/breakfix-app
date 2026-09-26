import { Global, Module } from '@nestjs/common';
import { SecretsService } from './secrets.service';

/** Global, for the same reason as ConfigModule. */
@Global()
@Module({
  providers: [SecretsService],
  exports: [SecretsService],
})
export class SecretsModule {}
