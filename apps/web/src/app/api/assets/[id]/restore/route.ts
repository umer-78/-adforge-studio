import { check, owned, route } from '@/lib/server/api';
import { toAssetView } from '@/lib/server/assets';

export const POST = route({}, async ({ sb, caller, params }) => {
  const asset = await owned(sb, 'assets', params.id!, caller, 'This file');
  const row = check(await sb.from('assets').update({ deleted_at: null }).eq('id', asset.id).select('*').single(), 'Could not restore');
  return toAssetView(row);
});
