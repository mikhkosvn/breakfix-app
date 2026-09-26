import { Controller, Get } from '@nestjs/common';
import { ScoutService } from './scout.service';

@Controller()
export class ScoutController {
  constructor(private readonly scoutService: ScoutService) {}

  @Get()
  getHello(): string {
    return this.scoutService.getHello();
  }
}
