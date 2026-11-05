import 'server-only';
import { productFacts } from '@adforge/core';
import type { ServiceClient } from '@adforge/core/server';

export async function productFactsText(sb: ServiceClient, workspaceId: string, productId: string): Promise<string> {
  const { data } = await sb.from('products').select('*').eq('id', productId).eq('workspace_id', workspaceId).maybeSingle();
  return data ? productFacts(data) : '';
}
