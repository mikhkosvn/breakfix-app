import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ScoutModule } from './scout.module';
import { ConfigService } from './config/config.service';

async function bootstrap() {
  const app = await NestFactory.create(ScoutModule);
  const config = app.get(ConfigService);

  app.enableShutdownHooks();
  await app.listen(config.port);

  new Logger('bootstrap').log(`Scout is listening on port ${config.port}.`);
}

void bootstrap();
