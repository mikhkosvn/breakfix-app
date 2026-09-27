import { z } from 'zod';

/**
 * The OpenCode events scout reads.
 *
 * Every shape here was captured from a running server on 2026-09-26, not copied from the
 * documentation. Three facts drive the design.
 *
 * 1. The v2 stream envelope is `{id, type, durable, data}`. The v1 stream uses
 *    `{id, type, properties}`. Never share a parser between them.
 * 2. The `tokens` object on the v2 stream has no `total` key. The v1 one does.
 * 3. The server sends `server.heartbeat` every 10 seconds, and that event is declared
 *    nowhere in the OpenCode schema. Treat the published event list as incomplete.
 *
 * We parse rather than cast. OpenCode checks nothing it sends us, so a cast would only
 * move an unknown shape past the compiler without making it true.
 */

const Tokens = z
  .object({
    input: z.number().default(0),
    output: z.number().default(0),
    reasoning: z.number().default(0),
    cache: z
      .object({ read: z.number().default(0), write: z.number().default(0) })
      .partial()
      .default({}),
  })
  .partial();

const ToolCalled = z.object({
  type: z.literal('session.next.tool.called'),
  data: z.object({
    callID: z.string().optional(),
    tool: z.string().optional(),
  }),
});

const TextDelta = z.object({
  type: z.literal('session.next.text.delta'),
  data: z.object({ delta: z.string().default('') }),
});

const StepEnded = z.object({
  type: z.literal('session.next.step.ended'),
  data: z.object({
    finish: z.string().optional(),
    tokens: Tokens.default({}),
  }),
});

const SessionIdle = z.object({
  type: z.literal('session.idle'),
  data: z.object({}).loose().default({}),
});

const SessionStatus = z.object({
  type: z.literal('session.status'),
  data: z
    .object({ status: z.object({ type: z.string() }).partial().default({}) })
    .partial()
    .default({}),
});

const SessionError = z.object({
  type: z.literal('session.error'),
  data: z.object({}).loose().default({}),
});

/** Any frame. Only the type string is guaranteed. */
const AnyEvent = z.object({ type: z.string() });

const KnownEvent = z.discriminatedUnion('type', [
  ToolCalled,
  TextDelta,
  StepEnded,
  SessionIdle,
  SessionStatus,
  SessionError,
]);

export type KnownEvent = z.infer<typeof KnownEvent>;

export type ParsedEvent = {
  /**
   * The event type, always present.
   *
   * This alone drives the heartbeat. An event we do not model still proves that the agent
   * moved forward, which is the only thing the heartbeat needs to know.
   */
  type: string;
  /** The typed payload, for the events we model. Null for every other event. */
  known: KnownEvent | null;
};

/**
 * Turn one raw frame into a parsed event.
 *
 * The two fields stay separate on purpose. A single union of "known" and "any" cannot
 * narrow, because a plain string overlaps every literal type in the union.
 *
 * Returns null when the frame carries no `type` at all, which should never happen.
 */
export function parseEvent(raw: unknown): ParsedEvent | null {
  const any = AnyEvent.safeParse(raw);
  if (!any.success) return null;

  const known = KnownEvent.safeParse(raw);
  return { type: any.data.type, known: known.success ? known.data : null };
}

/** Which phase an event belongs to. The phase sets how long silence may last. */
export function phaseOf(type: string): 'agent:tool' | 'agent:model' {
  return type.includes('tool') ? 'agent:tool' : 'agent:model';
}
