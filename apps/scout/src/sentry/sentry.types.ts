/**
 * Shapes returned by the Sentry API.
 *
 * Every field name here was read from the Sentry source or the published schema on
 * 2026-09-26. Three traps are marked in place. Do not "tidy" them.
 */

export type SentryIssue = {
  id: string;
  shortId: string;
  title: string;
  culprit: string | null;
  permalink: string;
  level: string;
  status: string;
  /** `new`, `regressed`, `escalating`, or `ongoing`. */
  substatus: string | null;
  issueCategory: string;
  /** Trap: this is a JSON string, not a number. `userCount` is a number. */
  count: string;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  project: { id: string; name: string; slug: string; platform: string | null };
  /** Trap: capped at 100 entries. A noisy issue can push older entries off the end. */
  activity?: SentryActivity[];
};

export type SentryActivity = {
  id: string;
  /** `set_regression`, `set_resolved`, `note`, and others. */
  type: string;
  dateCreated: string;
  /** Trap: the keys inside `data` use snake case, while every sibling uses camel case. */
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
  /** True when the frame belongs to our own code rather than a dependency. */
  inApp: boolean;
  /**
   * Source lines around the frame, as `[lineNumber, sourceText]` pairs.
   *
   * This is how the agent checks that a line number still points at the same code. See
   * `contextLineOf` below.
   */
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
  /** Trap: the array order follows a display score. Never read `entries[0]`. */
  entries: SentryEntry[];
  /** Trap: `trace.trace_id` uses snake case, and the whole `trace` context can be absent. */
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
  /** Present only when the deploy pipeline associated commits with the release. */
  lastCommit: { id: string; message: string | null } | null;
  versionInfo?: { buildHash?: string | null } | null;
  dateCreated: string;
};

/** The source line Sentry recorded at crash time, or null when the frame carries none. */
export function contextLineOf(frame: SentryFrame): string | null {
  if (!frame.context || frame.lineNo === null) return null;
  const hit = frame.context.find(([lineNumber]) => lineNumber === frame.lineNo);
  return hit ? hit[1] : null;
}

/** The stack trace of an event. Uses a search, because the entries array has no fixed order. */
export function stacktraceOf(event: SentryEvent): SentryFrame[] {
  const entry = event.entries.find((e) => e.type === 'exception') as
    Extract<SentryEntry, { type: 'exception' }> | undefined;
  const values = entry?.data.values ?? [];
  // The last value is the innermost exception, which is where the error happened.
  const frames = values[values.length - 1]?.stacktrace?.frames ?? [];
  // Sentry sends frames oldest first. The crash site is last.
  return [...frames].reverse();
}

/** The first frame that belongs to our own code. */
export function entryFrameOf(event: SentryEvent): SentryFrame | null {
  return stacktraceOf(event).find((f) => f.inApp) ?? null;
}

/** The trace identifier of an event, or null when the event carries no trace. */
export function traceIdOf(event: SentryEvent): string | null {
  return event.contexts?.trace?.trace_id ?? null;
}

/**
 * The commit that was running when the event happened.
 *
 * Reads four fields in order of trust. Returns null when Sentry knows no commit, which
 * happens when the deploy pipeline does not set a release. The caller then falls back to
 * the default branch and marks every line number as unverified.
 */
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
