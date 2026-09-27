import { z } from 'zod';

export const ScoutReport = z
  .object({
    summary: z.string().min(1).max(600),

    entry_point: z
      .object({
        path: z.string().min(1),
        line: z.number().int().positive(),
        code: z.string(),
      })
      .nullable(),

    evidence: z
      .array(
        z.object({
          source: z.string().min(1),
          detail: z.string().min(1),
        }),
      )
      .min(1),

    leads: z.array(
      z.object({
        hypothesis: z.string().min(1),
        supports: z.array(z.number().int().nonnegative()),
        contradicts: z.array(z.number().int().nonnegative()),
      }),
    ),

    missing: z.array(
      z.object({
        what: z.string().min(1),
        reason: z.enum(['does_not_exist', 'call_failed', 'not_attempted']),
      }),
    ),

    anomalies: z.array(z.string()),

    stopped_because: z.enum(['complete', 'no_new_information', 'budget']),

    tool_calls: z.number().int().nonnegative(),
  })
  .strict();

export type ScoutReport = z.infer<typeof ScoutReport>;

export function scoutReportJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(ScoutReport, { io: 'output' });
}
