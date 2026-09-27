import { Injectable, Logger } from '@nestjs/common';
import { spawn, type ChildProcess } from 'node:child_process';
import { ConfigService } from '../config/config.service';
import { SecretsService } from '../secrets/secrets.service';
import type { Phase } from '../contracts/job';
import { parseEvent, phaseOf } from './events';

export type Usage = {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
};

export type AgentTurn = {
  text: string;
  usage: Usage;
  toolCalls: number;
  stoppedBecause: 'finished' | 'budget' | 'timeout';
};

export type TurnOptions = {
  systemPrompt: string;
  taskPrompt: string;
  workDir: string;
  onPulse: (phase: Phase) => void;
};

const LISTENING = 'opencode server listening';

@Injectable()
export class OpenCodeService {
  private readonly log = new Logger(OpenCodeService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly secrets: SecretsService,
  ) {}

  async runTurn(options: TurnOptions): Promise<AgentTurn> {
    const { process: child, baseUrl } = await this.spawn(options.workDir);
    try {
      const sessionId = await this.createSession(baseUrl, options.workDir);
      return await this.drive(baseUrl, sessionId, options);
    } finally {
      child.kill('SIGTERM');
    }
  }

  private async spawn(
    workDir: string,
  ): Promise<{ process: ChildProcess; baseUrl: string }> {
    const apiKey = await this.secrets.modelApiKey();

    const child = spawn(
      'opencode',
      [
        'serve',
        '--hostname',
        '127.0.0.1',
        '--port',
        String(this.config.openCodePort),
      ],
      {
        cwd: workDir,
        env: {
          PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
          HOME: process.env.HOME ?? '/home/agent',

          OPENCODE_DISABLE_PROJECT_CONFIG: 'true',
          OPENCODE_DISABLE_EXTERNAL_SKILLS: 'true',
          OPENCODE_DISABLE_AUTOUPDATE: 'true',
          OPENCODE_DISABLE_MODELS_FETCH: 'true',

          OPENCODE_CONFIG_CONTENT: JSON.stringify(this.buildConfig(apiKey)),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    const baseUrl = await this.waitForListening(child);
    this.log.log(`OpenCode is listening on ${baseUrl}`);
    return { process: child, baseUrl };
  }

  private waitForListening(
    child: ChildProcess,
    timeoutMs = 60_000,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let buffer = '';
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              `OpenCode did not start within ${timeoutMs} milliseconds.`,
            ),
          ),
        timeoutMs,
      );

      const read = (chunk: Buffer) => {
        buffer += chunk.toString();
        for (const line of buffer.split('\n')) {
          if (!line.startsWith(LISTENING)) continue;
          const match = /on\s+(https?:\/\/[^\s]+)/.exec(line);
          const url = match?.[1];
          if (!url) continue;
          clearTimeout(timer);
          resolve(url);
          return;
        }
      };

      child.stdout?.on('data', read);
      child.stderr?.on('data', read);
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(
          new Error(`OpenCode exited with code ${code} before it listened.`),
        );
      });
    });
  }

  private buildConfig(apiKey: string | undefined): Record<string, unknown> {
    const model = this.config.model;
    return {
      permission: {
        '*': 'deny',
        read: { '*': 'allow', '*.env': 'deny', '*.env.*': 'deny' },
        glob: 'allow',
        grep: 'allow',
        bash: 'deny',
        edit: 'deny',
        write: 'deny',
        webfetch: 'deny',
        task: 'deny',
        skill: 'deny',
        question: 'deny',
        doom_loop: 'deny',
      },
      share: 'disabled',
      autoupdate: false,
      provider: {
        [model.providerId]: {
          npm: model.npm,
          name: model.providerId,
          options: { baseURL: model.baseUrl, ...(apiKey ? { apiKey } : {}) },
          models: { [model.modelId]: { name: model.modelId, tool_call: true } },
        },
      },
    };
  }

  private async createSession(
    baseUrl: string,
    workDir: string,
  ): Promise<string> {
    const response = await fetch(`${baseUrl}/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-opencode-directory': workDir,
      },
      body: JSON.stringify({ title: 'scout' }),
    });
    if (!response.ok)
      throw new Error(`Could not create a session: HTTP ${response.status}`);
    const session = (await response.json()) as { id: string };
    return session.id;
  }

  private async drive(
    baseUrl: string,
    sessionId: string,
    options: TurnOptions,
  ): Promise<AgentTurn> {
    const usage: Usage = {
      input: 0,
      output: 0,
      reasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
    };
    let text = '';
    let toolCalls = 0;
    let stoppedBecause: AgentTurn['stoppedBecause'] = 'finished';

    const controller = new AbortController();
    const deadline = setTimeout(() => {
      stoppedBecause = 'timeout';
      void this.interrupt(baseUrl, sessionId);
      controller.abort();
    }, this.config.maxRunMs);

    const stream = await fetch(`${baseUrl}/api/session/${sessionId}/event`, {
      headers: {
        Accept: 'text/event-stream',
        'x-opencode-directory': options.workDir,
      },
      signal: controller.signal,
    });
    if (!stream.ok || !stream.body)
      throw new Error(`Could not open the event stream: HTTP ${stream.status}`);

    await this.prompt(baseUrl, sessionId, options);

    let idleSince: number | null = null;
    try {
      for await (const frame of this.readEvents(stream.body)) {
        const event = parseEvent(frame);
        if (!event) continue;

        options.onPulse(phaseOf(event.type));

        switch (event.known?.type) {
          case 'session.next.tool.called':
            toolCalls += 1;
            if (toolCalls > this.config.maxToolCalls) {
              stoppedBecause = 'budget';
              await this.interrupt(baseUrl, sessionId);
            }
            break;

          case 'session.next.text.delta':
            text += event.known.data.delta;
            break;

          case 'session.next.step.ended': {
            const tokens = event.known.data.tokens;
            usage.input += tokens.input ?? 0;
            usage.output += tokens.output ?? 0;
            usage.reasoning += tokens.reasoning ?? 0;
            usage.cacheRead += tokens.cache?.read ?? 0;
            usage.cacheWrite += tokens.cache?.write ?? 0;

            if (usage.input + usage.output > this.config.maxTokens) {
              stoppedBecause = 'budget';
              await this.interrupt(baseUrl, sessionId);
            }
            break;
          }
        }

        if (event.type === 'session.idle') {
          idleSince = Date.now();
        } else if (event.known?.type === 'session.status') {
          idleSince =
            event.known.data.status?.type === 'idle' ? Date.now() : null;
        } else if (!event.type.startsWith('server.')) {
          idleSince = null;
        }

        if (idleSince !== null && Date.now() - idleSince > 2_000) break;
      }
    } catch (error) {
      if (stoppedBecause === 'finished') throw error;
    } finally {
      clearTimeout(deadline);
      controller.abort();
    }

    return { text, usage, toolCalls, stoppedBecause };
  }

  private async prompt(
    baseUrl: string,
    sessionId: string,
    options: TurnOptions,
  ): Promise<void> {
    const model = this.config.model;
    const response = await fetch(`${baseUrl}/api/session/${sessionId}/prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-opencode-directory': options.workDir,
      },
      body: JSON.stringify({
        prompt: {
          text: `${options.systemPrompt}\n\n---\n\n${options.taskPrompt}`,
        },
        model: { providerID: model.providerId, modelID: model.modelId },
      }),
    });
    if (!response.ok)
      throw new Error(`The prompt call failed: HTTP ${response.status}`);
  }

  private async interrupt(baseUrl: string, sessionId: string): Promise<void> {
    await fetch(`${baseUrl}/api/session/${sessionId}/interrupt`, {
      method: 'POST',
    }).catch(() => undefined);
  }

  private async *readEvents(
    body: ReadableStream<Uint8Array>,
  ): AsyncGenerator<Record<string, unknown>> {
    const decoder = new TextDecoder();
    let buffer = '';

    for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      let split: number;
      while ((split = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data:')) continue;
          try {
            yield JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
          } catch {
            this.log.warn(
              `Could not parse an event frame: ${line.slice(0, 120)}`,
            );
          }
        }
      }
    }
  }
}
