import { LICENSE_KINDS } from '@adforge/core';
import * as z from 'zod';
import { check, logActivity, owned, route } from '@/lib/server/api';

export const GET = route({}, async ({ sb, caller }) => ({
  items: check(await sb.from('licenses').select('*').eq('workspace_id', caller.workspaceId).order('created_at', { ascending: false }).limit(200), 'Could not load licenses'),
}));

const createSchema = z.object({
  kind: z.enum(LICENSE_KINDS),
  commercialUse: z.boolean(),
  source: z.string().max(300).nullish(),
  provider: z.string().max(120).nullish(),
  termsUrl: z.string().url().max(1000).nullish(),
  notes: z.string().max(2000).nullish(),
  expiresAt: z.string().datetime().nullish(),
  proofAssetId: z.string().uuid().nullish(),
  /** Attach the new license to these files right away. */
  assetIds: z.array(z.string().uuid()).max(200).default([]),
});

/** Records the rights for a track or clip so publishing can warn about unlicensed audio. */
export const POST = route({ body: createSchema }, async ({ sb, caller, body }) => {
  if (body.proofAssetId) await owned(sb, 'assets', body.proofAssetId, caller, 'Proof file');
  const row = check(
    await sb
      .from('licenses')
      .insert({
        workspace_id: caller.workspaceId,
        kind: body.kind,
        commercial_use: body.commercialUse,
        source: body.source ?? null,
        provider: body.provider ?? null,
        terms_url: body.termsUrl ?? null,
        notes: body.notes ?? null,
        expires_at: body.expiresAt ?? null,
        proof_asset_id: body.proofAssetId ?? null,
        created_by: caller.userId,
      })
      .select('*')
      .single(),
    'Could not save the license',
  );
  if (body.assetIds.length) check(await sb.from('assets').update({ license_id: row.id }).eq('workspace_id', caller.workspaceId).in('id', body.assetIds), 'Could not attach the license');
  await logActivity(sb, caller, 'license.created', 'license', row.id, { kind: row.kind, files: body.assetIds.length });
  return row;
});
