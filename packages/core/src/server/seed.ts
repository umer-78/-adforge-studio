import { createHash } from 'node:crypto';
import { BUILTIN_SFX, builtinSfxPath } from '../sfx';
import { MOTION_TEMPLATES } from '../motion-templates';
import { ASPECT_RATIOS } from '../constants';
import { CAPTION_STYLES } from '../timeline/catalog';
import { TIMELINE_TEMPLATES } from '../timeline/templates';
import type { Json } from '../db/database.types';
import type { AnyClient } from './supabase';

const NAMESPACE = Buffer.from('6f1c7c1e6b1e4f7a9a51ad40f0a9e001', 'hex');

/** Deterministic UUID (v5) so built-in rows keep the same id across seeds. */
export function builtinUuid(name: string): string {
  const hash = createHash('sha1').update(NAMESPACE).update(name).digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface BuiltinTemplateRow {
  id: string;
  workspace_id: null;
  kind: 'timeline' | 'motion' | 'caption_style';
  name: string;
  description: string | null;
  aspect: null;
  category: string | null;
  data: Json;
  thumbnail_url: string | null;
  is_builtin: true;
}

export interface BuiltinSfxRow {
  id: string;
  workspace_id: null;
  name: string;
  category: string;
  tags: string[];
  builtin_path: string;
  duration_s: number;
}

export function builtinTemplateRows(): BuiltinTemplateRow[] {
  return [
    ...TIMELINE_TEMPLATES.map((t) => ({
      id: builtinUuid(`timeline:${t.id}`),
      workspace_id: null,
      kind: 'timeline' as const,
      name: t.name,
      description: t.description,
      aspect: null,
      category: t.category,
      data: { builtinId: t.id, durationS: t.durationS, aspects: [...ASPECT_RATIOS] },
      thumbnail_url: `/templates/${t.id}.jpg`,
      is_builtin: true as const,
    })),
    ...MOTION_TEMPLATES.map((m) => ({
      id: builtinUuid(`motion:${m.id}`),
      workspace_id: null,
      kind: 'motion' as const,
      name: m.name,
      description: m.description,
      aspect: null,
      category: m.category,
      data: { builtinId: m.id, durationInFrames: m.durationInFrames, fullFrame: !!m.fullFrame },
      thumbnail_url: `/motion/${m.id}.jpg`,
      is_builtin: true as const,
    })),
    ...CAPTION_STYLES.map((c) => ({
      id: builtinUuid(`caption_style:${c.id}`),
      workspace_id: null,
      kind: 'caption_style' as const,
      name: c.label,
      description: null,
      aspect: null,
      category: 'captions',
      data: { builtinId: c.id },
      thumbnail_url: null,
      is_builtin: true as const,
    })),
  ];
}

export function builtinSfxRows(): BuiltinSfxRow[] {
  return BUILTIN_SFX.map((s) => ({
    id: builtinUuid(`sfx:${s.id}`),
    workspace_id: null,
    name: s.name,
    category: s.category,
    tags: s.tags,
    builtin_path: builtinSfxPath(s.id),
    duration_s: s.durationS,
  }));
}

/** Upserts built-in templates and sound effects. Needs the service-role client. */
export async function seedBuiltins(sb: AnyClient): Promise<{ templates: number; sfx: number }> {
  const templates = builtinTemplateRows();
  const sfx = builtinSfxRows();
  const t = await sb.from('templates').upsert(templates, { onConflict: 'id' });
  if (t.error) throw new Error(`Seeding templates failed: ${t.error.message}`);
  const s = await sb.from('sfx').upsert(sfx, { onConflict: 'id' });
  if (s.error) throw new Error(`Seeding sound effects failed: ${s.error.message}`);
  return { templates: templates.length, sfx: sfx.length };
}

const lit = (v: unknown): string => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return `array[${v.map((x) => lit(x)).join(', ')}]::text[]`;
  if (typeof v === 'object') return `${lit(JSON.stringify(v))}::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};

/** The same seed as SQL, for `supabase/seed.sql` and fresh databases. */
export function builtinSeedSql(): string {
  const t = builtinTemplateRows()
    .map((r) => `  (${[r.id, null, r.kind, r.name, r.description, null, r.category, r.data, r.thumbnail_url, true].map(lit).join(', ')})`)
    .join(',\n');
  const s = builtinSfxRows()
    .map((r) => `  (${[r.id, null, r.name, r.category, r.tags, r.builtin_path, r.duration_s].map(lit).join(', ')})`)
    .join(',\n');
  return `-- Built-in templates and sound effects. Generated from packages/core; do not edit by hand.
insert into public.templates (id, workspace_id, kind, name, description, aspect, category, data, thumbnail_url, is_builtin) values
${t}
on conflict (id) do update set name = excluded.name, description = excluded.description, category = excluded.category,
  data = excluded.data, thumbnail_url = excluded.thumbnail_url, updated_at = now();

insert into public.sfx (id, workspace_id, name, category, tags, builtin_path, duration_s) values
${s}
on conflict (id) do update set name = excluded.name, category = excluded.category, tags = excluded.tags,
  builtin_path = excluded.builtin_path, duration_s = excluded.duration_s;
`;
}
