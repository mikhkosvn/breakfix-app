import { extractJson } from './extract-json';
import { ScoutReport } from './scout-report';

describe('extractJson', () => {
  it('reads an object that stands alone', () => {
    const result = extractJson('{"a":1}');
    expect(result).toEqual({ ok: true, value: { a: 1 } });
  });

  it('reads an object wrapped in a code fence', () => {
    const result = extractJson('```json\n{"a":1}\n```');
    expect(result).toEqual({ ok: true, value: { a: 1 } });
  });

  it('reads an object with prose around it', () => {
    const result = extractJson(
      'Here is my answer.\n{"a":1}\nI hope that helps.',
    );
    expect(result).toEqual({ ok: true, value: { a: 1 } });
  });

  it('tells a truncated answer from a chatty one', () => {
    const truncated = extractJson('{"a":1,"b":{"c":');
    expect(truncated).toMatchObject({ ok: false, reason: 'truncated' });

    const chatty = extractJson('I could not find anything useful.');
    expect(chatty).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('reports an empty answer', () => {
    expect(extractJson('   ')).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('does not stop at a brace inside a string', () => {
    const result = extractJson('{"note":"a } inside a string","a":1}');
    expect(result).toEqual({
      ok: true,
      value: { note: 'a } inside a string', a: 1 },
    });
  });

  it('does not stop at an escaped quote', () => {
    const result = extractJson('{"note":"she said \\"} \\" once","a":1}');
    expect(result).toMatchObject({ ok: true });
  });
});

describe('ScoutReport', () => {
  const valid = {
    summary: 'The call returns undefined and line 88 reads a property of it.',
    entry_point: {
      path: 'src/billing/invoice.ts',
      line: 88,
      code: 'customer.id',
    },
    evidence: [
      { source: '/work/ctx/event.json', detail: 'TypeError at line 88' },
    ],
    leads: [],
    missing: [],
    anomalies: [],
    stopped_because: 'complete',
    tool_calls: 4,
  };

  it('accepts a report with every field', () => {
    expect(ScoutReport.safeParse(valid).success).toBe(true);
  });

  it('accepts a null entry point, because not finding one is a real answer', () => {
    const result = ScoutReport.safeParse({ ...valid, entry_point: null });
    expect(result.success).toBe(true);
  });

  it('rejects the answer OpenCode accepted in our own test', () => {
    const result = ScoutReport.safeParse({ verdict: 123, bogus: 'extra' });
    expect(result.success).toBe(false);
  });

  it('rejects an extra key', () => {
    const result = ScoutReport.safeParse({ ...valid, surprise: true });
    expect(result.success).toBe(false);
  });

  it('rejects a report with no evidence', () => {
    const result = ScoutReport.safeParse({ ...valid, evidence: [] });
    expect(result.success).toBe(false);
  });

  it('rejects a line number that is not positive', () => {
    const result = ScoutReport.safeParse({
      ...valid,
      entry_point: { ...valid.entry_point, line: 0 },
    });
    expect(result.success).toBe(false);
  });
});
