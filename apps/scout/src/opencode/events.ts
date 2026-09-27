import { z } from 'zod';

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
  type: string;
  known: KnownEvent | null;
};

export function parseEvent(raw: unknown): ParsedEvent | null {
  const any = AnyEvent.safeParse(raw);
  if (!any.success) return null;

  const known = KnownEvent.safeParse(raw);
  return { type: any.data.type, known: known.success ? known.data : null };
}

export function phaseOf(type: string): 'agent:tool' | 'agent:model' {
  return type.includes('tool') ? 'agent:tool' : 'agent:model';
}
