export type ExtractResult =
  | { ok: true; value: unknown }
  | {
      ok: false;
      reason: 'empty' | 'not_found' | 'truncated' | 'invalid_json';
      detail: string;
    };

/**
 * Pull one JSON object out of an agent's final message.
 *
 * We need this because the v2 OpenCode route has no schema-constrained output, so the
 * agent writes the object as plain text. See gap 2 in GAPS.md.
 *
 * The prompt tells the agent to answer with the object and nothing else. Models do not
 * always obey, so this handles three real cases:
 *
 * 1. The object stands alone. The common case.
 * 2. A code fence wraps it, or prose sits around it.
 * 3. The answer stopped in the middle, because the agent reached a limit.
 *
 * Case 3 gets its own reason, because a truncated answer and a chatty answer need
 * different repair prompts. A truncated answer means "answer again, shorter". A chatty
 * answer means "answer again, with no prose".
 */
export function extractJson(text: string): ExtractResult {
  const trimmed = text.trim();
  if (trimmed.length === 0)
    return { ok: false, reason: 'empty', detail: 'The agent wrote nothing.' };

  const start = trimmed.indexOf('{');
  if (start === -1) {
    return {
      ok: false,
      reason: 'not_found',
      detail: `No '{' in ${trimmed.length} characters.`,
    };
  }

  const end = matchingBrace(trimmed, start);
  if (end === -1) {
    return {
      ok: false,
      reason: 'truncated',
      detail: `An object opens at character ${start} and never closes.`,
    };
  }

  const candidate = trimmed.slice(start, end + 1);
  try {
    return { ok: true, value: JSON.parse(candidate) };
  } catch (error) {
    return { ok: false, reason: 'invalid_json', detail: String(error) };
  }
}

/** Index of the brace that closes the one at `start`, or -1 when it never closes. */
function matchingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}
