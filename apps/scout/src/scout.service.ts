import { Injectable, Logger } from '@nestjs/common';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigService } from './config/config.service';
import { SecretsService } from './secrets/secrets.service';
import { SentryService } from './sentry/sentry.service';
import { GitService } from './git/git.service';
import { OpenCodeService } from './opencode/opencode.service';
import { ScoutReport } from './contracts/scout-report';
import { extractJson } from './contracts/extract-json';
import type { ScoutJob, ScoutResult, Phase } from './contracts/job';
import {
  contextLineOf,
  entryFrameOf,
  revisionOf,
  traceIdOf,
} from './sentry/sentry.types';

@Injectable()
export class ScoutService {
  private readonly log = new Logger(ScoutService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly secrets: SecretsService,
    private readonly sentry: SentryService,
    private readonly git: GitService,
    private readonly opencode: OpenCodeService,
  ) {}

  /**
   * Investigate one Sentry issue.
   *
   * Every step reports a phase. The phase is the heartbeat, and it is also the answer to
   * "where did this run stop" when something fails.
   */
  async run(job: ScoutJob): Promise<ScoutResult> {
    let phase: Phase = 'starting';
    const beat = (next: Phase) => {
      phase = next;
      this.pulse(job.runId, next);
    };

    const empty = {
      input: 0,
      output: 0,
      reasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
    };

    try {
      const workDir = join(this.config.workDir, job.runId);
      const ctxDir = join(workDir, 'ctx');
      const repoDir = join(workDir, 'repo');

      // Clear the workspace at the START of a run, never at the end. A crashed run leaves
      // files behind, and the next run must not read them.
      await rm(workDir, { recursive: true, force: true });
      await mkdir(ctxDir, { recursive: true });

      // 1. Read Sentry.
      beat('sentry');
      const issue = await this.sentry.issue(job.issueId);
      const repo = this.config.repoForProject(issue.project.slug);
      if (!repo) {
        throw new Error(
          `The Sentry project '${issue.project.slug}' maps to no repository. Add it to ConfigService.repos.`,
        );
      }

      const selector =
        job.kind === 'regression'
          ? ((await this.sentry.regressionEventId(job.issueId)) ?? 'latest')
          : 'latest';
      const event = await this.sentry.event(job.issueId, selector);
      const revision = revisionOf(event);
      const traceId = traceIdOf(event);

      // 2. Clone the code that was running when it crashed.
      beat('clone');
      const token = await this.secrets.githubToken();
      const url = `https://x-access-token:${token}@github.com/${repo.repo}.git`;
      const clone = await this.git.clone(repoDir, url, revision);

      // 3. Collect the evidence files.
      beat('collect');
      const missing: string[] = [];
      const write = async (name: string, value: unknown) =>
        writeFile(join(ctxDir, name), JSON.stringify(value, null, 2), 'utf8');

      await write('issue.json', issue);
      await write('event.json', event);

      if (traceId) {
        await this.sentry
          .trace(traceId, event.eventID)
          .then((t) => write('trace.json', t))
          .catch(() => missing.push('trace'));
        await this.sentry
          .logs(traceId)
          .then((l) => write('logs.json', l))
          .catch(() => missing.push('logs'));
      } else {
        missing.push('trace', 'logs');
      }

      const frame = entryFrameOf(event);
      const lineLastChanged =
        frame?.filename && frame.lineNo
          ? await this.git.lineLastChanged(
              repoDir,
              frame.filename,
              frame.lineNo,
            )
          : null;

      await write('manifest.json', {
        issueId: issue.id,
        shortId: issue.shortId,
        project: issue.project.slug,
        repo: repo.repo,
        revision: clone.revision,
        // False means the commit Sentry named was unknown. Every line number is then a
        // guess, and the agent must check each one against `entry_point.context_line`.
        revisionIsExact: clone.exact,
        requestedRevision: revision,
        traceId,
        firstSeen: issue.firstSeen,
        lastSeen: issue.lastSeen,
        entryFrame: frame
          ? {
              path: frame.filename,
              line: frame.lineNo,
              function: frame.function,
              context_line: contextLineOf(frame),
              lineLastChanged,
            }
          : null,
        files: ['issue.json', 'event.json', 'trace.json', 'logs.json'].filter(
          (f) => !missing.includes(f.replace('.json', '')),
        ),
        missing,
        collectedAt: new Date().toISOString(),
      });

      // 4. Run the agent.
      beat('agent:model');
      const systemPrompt = await this.prompt('scout.system.md');
      const taskPrompt = (await this.prompt('scout.task.md'))
        .replaceAll('{{shortId}}', issue.shortId)
        .replaceAll('{{revision}}', clone.revision)
        .replaceAll('{{maxToolCalls}}', String(this.config.maxToolCalls));

      const turn = await this.opencode.runTurn({
        systemPrompt,
        taskPrompt,
        workDir,
        onPulse: (p) => beat(p),
      });

      // 5. Validate. OpenCode checks nothing, so this step is the only check.
      beat('validate');
      if (!(await this.git.isClean(repoDir))) {
        throw new Error('The agent changed a file. Scout must read only.');
      }

      const extracted = extractJson(turn.text);
      if (!extracted.ok) {
        throw new Error(
          `The agent answer holds no usable object: ${extracted.reason} (${extracted.detail})`,
        );
      }

      const parsed = ScoutReport.safeParse(extracted.value);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ');
        throw new Error(
          `The agent answer does not match the schema: ${issues}`,
        );
      }

      beat('publish');
      this.log.log(
        `Run ${job.runId} finished. ${turn.toolCalls} tool calls, ` +
          `${turn.usage.input + turn.usage.output} tokens, stopped because ${turn.stoppedBecause}.`,
      );

      return {
        runId: job.runId,
        issueId: job.issueId,
        ok: true,
        phase: 'publish',
        report: parsed.data,
        usage: turn.usage,
        toolCalls: turn.toolCalls,
      };
    } catch (error) {
      const failure = error instanceof Error ? error.message : String(error);
      this.log.error(`Run ${job.runId} failed in phase ${phase}: ${failure}`);
      // A half report on a real bug beats silence. The caller still publishes, and it says
      // which phase stopped the run.
      return {
        runId: job.runId,
        issueId: job.issueId,
        ok: false,
        phase,
        failure,
        usage: empty,
        toolCalls: 0,
      };
    }
  }

  /** Update the heartbeat. Writes to a database once triage owns the incident table. */
  private pulse(runId: string, phase: Phase): void {
    this.log.debug(`${runId} -> ${phase}`);
  }

  /**
   * Read one prompt file.
   *
   * The directory sits one level up in `src` and beside the file in `dist`, so we try
   * both. Never build a prompt by joining strings: the prompt is a constant, and only
   * typed values fill its placeholders.
   */
  private async prompt(name: string): Promise<string> {
    const candidates = [
      join(__dirname, 'prompts', name), // dist/apps/scout/prompts
      join(__dirname, '..', 'prompts', name), // apps/scout/prompts
    ];
    for (const path of candidates) {
      try {
        return await readFile(path, 'utf8');
      } catch {
        continue;
      }
    }
    throw new Error(
      `Prompt ${name} is missing. Looked in: ${candidates.join(', ')}`,
    );
  }
}
