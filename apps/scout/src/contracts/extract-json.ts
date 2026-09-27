export type ExtractResult =
  | { ok: true; value: unknown }
  | {
      ok: false;
      reason: 'empty' | 'not_found' | 'truncated' | 'invalid_json';
      detail: string;
    };

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
