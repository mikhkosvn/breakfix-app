import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { ScoutService } from './scout.service';
import { ScoutJob } from './contracts/job';

@Controller('scout')
export class ScoutController {
  private readonly log = new Logger(ScoutController.name);

  constructor(private readonly scout: ScoutService) {}

  /**
   * Start one investigation.
   *
   * Answers at once and works in the background. A run takes minutes, and no caller should
   * hold a request open that long.
   *
   * This endpoint is how we drive scout by hand while we build it. Triage will send jobs
   * through a queue later. The work is the same either way, because the queue consumer
   * will call `ScoutService.run` too.
   */
  @Post('run')
  @HttpCode(202)
  start(@Body() body: unknown): { runId: string; accepted: true } {
    const job = ScoutJob.parse(body);

    void this.scout.run(job).catch((error: unknown) => {
      // `run` catches its own failures and returns them. Reaching here means the failure
      // path itself broke.
      this.log.error(
        `Run ${job.runId} threw outside its own error handling: ${String(error)}`,
      );
    });

    return { runId: job.runId, accepted: true };
  }
}
