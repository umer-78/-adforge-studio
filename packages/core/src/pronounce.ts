import * as z from 'zod';

/** A word the voice should say differently: brand names, initialisms, product codes. */
export const pronunciationSchema = z.object({
  word: z.string().trim().min(1).max(60),
  sayAs: z.string().trim().min(1).max(120),
  matchCase: z.boolean().default(false),
});
export type Pronunciation = z.infer<typeof pronunciationSchema>;
export const pronunciationsSchema = z.array(pronunciationSchema).max(300);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Rewrites a script with the workspace's pronunciations before it is spoken. Whole words only,
 * longest first so "AdForge Pro" wins over "AdForge", and never inside [audio tags].
 */
export function applyPronunciations(text: string, rules: readonly Pronunciation[]): string {
  const list = rules.filter((r) => r.word.trim() && r.sayAs.trim()).sort((a, b) => b.word.length - a.word.length);
  if (!list.length || !text) return text;
  // Word edges that also work for words starting or ending in symbols ("C++", "#1").
  const pattern = list.map((r) => `(?<![\\p{L}\\p{N}_])${escape(r.word.trim())}(?![\\p{L}\\p{N}_])`).join('|');
  const re = new RegExp(pattern, 'giu');
  return text
    .split(/(\[[^\]]*\])/)
    .map((part) =>
      part.startsWith('[') && part.endsWith(']')
        ? part
        : part.replace(re, (m) => {
            const rule = list.find((r) => (r.matchCase ? r.word.trim() === m : r.word.trim().toLowerCase() === m.toLowerCase()));
            return rule ? rule.sayAs.trim() : m;
          }),
    )
    .join('');
}
