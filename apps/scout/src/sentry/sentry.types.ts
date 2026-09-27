export type SentryIssue = {
  id: string;
  shortId: string;
  title: string;
  culprit: string | null;
  permalink: string;
  level: string;
  status: string;
  substatus: string | null;
  issueCategory: string;
  count: string;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  project: { id: string; name: string; slug: string; platform: string | null };
  activity?: SentryActivity[];
};

export type SentryActivity = {
  id: string;
  type: string;
  dateCreated: string;
  data?: { event_id?: string; version?: string } & Record<string, unknown>;
};

export type SentryFrame = {
  filename: string | null;
  absPath: string | null;
  module: string | null;
  package: string | null;
  function: string | null;
  lineNo: number | null;
  colNo: number | null;
  inApp: boolean;
  context?: Array<[number, string]>;
  vars?: Record<string, unknown> | null;
};

export type SentryEntry =
  | { type: 'exception'; data: { values: SentryExceptionValue[] } }
  | { type: 'breadcrumbs'; data: { values: unknown[] } }
  | { type: 'request'; data: Record<string, unknown> }
  | { type: string; data: unknown };

export type SentryExceptionValue = {
  type: string | null;
  value: string | null;
  module: string | null;
  stacktrace: { frames: SentryFrame[] } | null;
};

export type SentryEvent = {
  id: string;
  eventID: string;
  groupID: string;
  title: string;
  message: string;
  platform: string | null;
  dateCreated: string;
  entries: SentryEntry[];
  contexts: Record<string, Record<string, unknown> | undefined> & {
    trace?: { trace_id?: string; span_id?: string; op?: string };
  };
  tags: Array<{ key: string; value: string }>;
  release: SentryRelease | null;
  sdk?: { name: string; version: string } | null;
};

export type SentryRelease = {
  version: string;
  ref: string | null;
  lastCommit: { id: string; message: string | null } | null;
  versionInfo?: { buildHash?: string | null } | null;
  dateCreated: string;
};

export function contextLineOf(frame: SentryFrame): string | null {
  if (!frame.context || frame.lineNo === null) return null;
  const hit = frame.context.find(([lineNumber]) => lineNumber === frame.lineNo);
  return hit ? hit[1] : null;
}

export function stacktraceOf(event: SentryEvent): SentryFrame[] {
  const entry = event.entries.find((e) => e.type === 'exception') as
    Extract<SentryEntry, { type: 'exception' }> | undefined;
  const values = entry?.data.values ?? [];
  const frames = values[values.length - 1]?.stacktrace?.frames ?? [];
  return [...frames].reverse();
}

export function entryFrameOf(event: SentryEvent): SentryFrame | null {
  return stacktraceOf(event).find((f) => f.inApp) ?? null;
}

export function traceIdOf(event: SentryEvent): string | null {
  return event.contexts?.trace?.trace_id ?? null;
}

export function revisionOf(event: SentryEvent): string | null {
  const release = event.release;
  if (!release) return null;
  const isSha = (s: string | null | undefined): s is string =>
    !!s && /^[0-9a-f]{40}$/i.test(s);

  if (isSha(release.lastCommit?.id)) return release.lastCommit.id;
  if (isSha(release.ref)) return release.ref;
  if (isSha(release.version)) return release.version;
  if (isSha(release.versionInfo?.buildHash))
    return release.versionInfo.buildHash;
  return null;
}
