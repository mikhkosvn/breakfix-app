import { Module } from '@nestjs/common';
import { ScoutController } from './scout.controller';
import { ScoutService } from './scout.service';

@Module({
  imports: [],
  controllers: [ScoutController],
  providers: [ScoutService],
})
export class ScoutModule {}
