import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ScoutService } from './scout.service';
import { ScoutJob } from './contracts/job';

@Controller('scout')
export class ScoutController {
  constructor(private readonly scout: ScoutService) {}

  @Post('run')
  @HttpCode(202)
  start(@Body() body: unknown): { runId: string; accepted: true } {
    const job = ScoutJob.parse(body);

    void this.scout.run(job).catch(() => undefined);

    return { runId: job.runId, accepted: true };
  }
}
