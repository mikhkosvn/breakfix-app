import { z } from 'zod';

export const TriageIssue = z.object({
  id: z.string().min(1),
  shortId: z.string().min(1),
  title: z.string().default(''),
  culprit: z.string().nullable().default(null),
  permalink: z.string().default(''),
  level: z.string().default('error'),
  status: z.string().default('unresolved'),
  substatus: z.string().nullable().default(null),
  issueCategory: z.string().default('error'),
  count: z
    .union([z.string(), z.number()])
    .default('0')
    .transform((value) => String(value)),
  userCount: z.number().default(0),
  firstSeen: z.coerce.date(),
  lastSeen: z.coerce.date(),
  project: z.object({
    id: z.string().default(''),
    slug: z.string().min(1),
    name: z.string().default(''),
  }),
});

export type TriageIssue = z.infer<typeof TriageIssue>;

export const TriageIssuePage = z.array(TriageIssue);

export function nextCursorOf(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(/,\s*(?=<)/)) {
    if (!/rel="next"/.test(part)) continue;
    if (/results="false"/.test(part)) return null;
    const match = /cursor="([^"]*)"/.exec(part);
    return match?.[1] ?? null;
  }
  return null;
}
