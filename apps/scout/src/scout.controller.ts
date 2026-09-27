import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { ScoutService } from './scout.service';
import { ScoutJob } from './contracts/job';

@Controller('scout')
export class ScoutController {
  private readonly log = new Logger(ScoutController.name);

  constructor(private readonly scout: ScoutService) {}

  @Post('run')
  @HttpCode(202)
  start(@Body() body: unknown): { runId: string; accepted: true } {
    const job = ScoutJob.parse(body);

    void this.scout.run(job).catch((error: unknown) => {
      this.log.error(
        `Run ${job.runId} threw outside its own error handling: ${String(error)}`,
      );
    });

    return { runId: job.runId, accepted: true };
  }
}
