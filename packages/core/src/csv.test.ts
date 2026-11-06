import { describe, expect, it } from 'vitest';
import { csvRecords, parseCsv, parseLocalDateTime, toCsv } from './csv';

describe('csv', () => {
  it('reads quotes, line breaks and semicolons', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi""\nthere"\n\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"\nthere']]);
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('maps rows to headers', () => {
    const { headers, records } = csvRecords('File, Caption ,Tiktok Privacy\nclip.mp4,Hello,everyone');
    expect(headers).toEqual(['file', 'caption', 'tiktok_privacy']);
    expect(records[0]).toEqual({ file: 'clip.mp4', caption: 'Hello', tiktok_privacy: 'everyone' });
  });
  it('round-trips through the writer', () => {
    const rows = [['file', 'caption'], ['a', 'Hi, "you"\nnext']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
  it('reads year-first local times and ISO times only', () => {
    expect(parseLocalDateTime('2026-11-20', '18:30')?.getHours()).toBe(18);
    expect(parseLocalDateTime('2026-11-20 6:30 pm')?.getHours()).toBe(18);
    expect(parseLocalDateTime('2026-11-20T18:30:00Z')?.toISOString()).toBe('2026-11-20T18:30:00.000Z');
    expect(parseLocalDateTime('20/11/2026 18:30')).toBeNull();
    expect(parseLocalDateTime('2026-02-30 10:00')).toBeNull();
  });
});
