import { NestFactory } from '@nestjs/core';
import { ScoutModule } from './scout.module';

async function bootstrap() {
  const app = await NestFactory.create(ScoutModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
