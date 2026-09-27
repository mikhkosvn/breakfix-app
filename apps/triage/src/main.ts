import { NestFactory } from '@nestjs/core';
import { TriageModule } from './triage.module';
import { ConfigService } from './config/config.service';

async function bootstrap() {
  const app = await NestFactory.create(TriageModule);
  const config = app.get(ConfigService);

  app.enableShutdownHooks();
  await app.listen(config.port);
}

void bootstrap();
