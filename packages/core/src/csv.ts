/**
 * Small RFC 4180 CSV reader and writer: quoted fields, doubled quotes, line breaks inside quotes,
 * a byte-order mark, and comma, semicolon or tab separators (spreadsheets in some locales use ";").
 */

export function detectDelimiter(text: string): string {
  const first = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '';
  const counts = [',', ';', '\t'].map((d) => [d, first.split(d).length - 1] as const);
  return counts.sort((a, b) => b[1] - a[1])[0]![1] > 0 ? counts[0]![0] : ',';
}

export function parseCsv(input: string, delimiter = detectDelimiter(input)): string[][] {
  const text = input.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

/** Rows as objects keyed by header, with headers lower-cased and spaces turned into underscores. */
export function csvRecords(input: string): { headers: string[]; records: Record<string, string>[] } {
  const [head, ...rest] = parseCsv(input);
  const headers = (head ?? []).map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  return { headers, records: rest.map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()]))) };
}

const cell = (v: string) => (/[",\r\n;\t]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

/**
 * "2026-11-20 18:30", "2026-11-20T18:30", "20/11/2026 18:30" style day-first dates are not
 * guessed: only year-first forms and full ISO times are read. Local forms use the viewer's clock.
 */
export function parseLocalDateTime(date: string, time = ''): Date | null {
  const s = `${date.trim()}${time.trim() ? ` ${time.trim()}` : ''}`.trim();
  if (!s) return null;
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(s) && /^\d{4}-\d\d-\d\dT/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?)?$/i.exec(s);
  if (!m) return null;
  let hour = Number(m[4] ?? 9);
  const ampm = m[7]?.toLowerCase().replace(/\./g, '');
  if (ampm) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (ampm === 'pm' ? 12 : 0);
  }
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hour, Number(m[5] ?? 0), Number(m[6] ?? 0));
  return d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) && hour < 24 ? d : null;
}
