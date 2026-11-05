import { asJson, parseVariants, type VariantItem } from '@adforge/core';
import type { ServiceClient } from '@adforge/core/server';

/**
 * Records a finished variant render on its batch. Uses the row's updated_at as
 * a version so two renders finishing together don't overwrite each other.
 */
export async function syncVariantRender(sb: ServiceClient, renderId: string, patch: { status: 'done' | 'failed'; assetId?: string; error?: string }) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: batches } = await sb.from('variant_batches').select('id, variants, updated_at').contains('variants', [{ renderId }]);
    const batch = batches?.[0];
    if (!batch) return;
    const variants: VariantItem[] = parseVariants(batch.variants).map((v) =>
      v.renderId === renderId ? { ...v, status: patch.status, assetId: patch.assetId ?? v.assetId, error: patch.error ?? null } : v,
    );
    const finished = variants.every((v) => v.status === 'done' || v.status === 'failed');
    const status = !finished ? 'rendering' : variants.every((v) => v.status === 'failed') ? 'failed' : 'done';
    const { data } = await sb
      .from('variant_batches')
      .update({ variants: asJson(variants), status, ...(status === 'failed' ? { error: 'Every variant failed to render.' } : {}) })
      .eq('id', batch.id)
      .eq('updated_at', batch.updated_at)
      .select('id');
    if (data?.length) return;
    await new Promise((r) => setTimeout(r, 150 + Math.random() * 300));
  }
}
