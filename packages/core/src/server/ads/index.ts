import type { AdPlatform } from '../../constants';
import type { Database } from '../../db/database.types';
import { AppError } from '../../utils';
import { decryptSecret, encryptSecret } from '../crypto';
import { env } from '../env';
import { PlatformError } from '../social/http';
import type { TokenSet } from '../social/types';
import type { AnyClient } from '../supabase';
import { searchAdLibrary, type LibraryAd } from './library';
import { metaAds } from './meta';
import { tiktokAds } from './tiktok';
import type { AdAccountInfo, AdAccountRef, AdsPlatform } from './types';

export * from './types';
export { searchAdLibrary, type LibraryAd };
export { TIKTOK_COUNTRY_IDS } from './tiktok';
export { toMinorUnits } from './meta';

export const ADS_PLATFORMS: Record<AdPlatform, AdsPlatform> = { meta: metaAds, tiktok: tiktokAds };

export function adsStatus() {
  return Object.values(ADS_PLATFORMS).map((p) => ({ id: p.id, label: p.label, configured: p.configured() }));
}

type AdAccountRow = Database['public']['Tables']['ad_accounts']['Row'];

export const adAccountRef = (row: AdAccountRow): AdAccountRef => ({
  externalId: row.external_id,
  currency: row.currency,
  name: row.name,
  meta: (row.meta ?? {}) as Record<string, unknown>,
});

/** Upserts ad accounts; one user token is shared by every account it can reach. */
export async function saveAdAccounts(sb: AnyClient, workspaceId: string, userId: string | null, platform: AdPlatform, token: TokenSet, accounts: AdAccountInfo[]): Promise<AdAccountRow[]> {
  const saved: AdAccountRow[] = [];
  for (const a of accounts) {
    const { data: existing } = await sb.from('ad_accounts').select('meta').eq('workspace_id', workspaceId).eq('platform', platform).eq('external_id', a.externalId).maybeSingle();
    // Keep choices made in Settings (page, pixel, identity) when reconnecting.
    const meta = { ...a.meta, ...((existing?.meta as Record<string, unknown> | null) ?? {}), ...(a.meta.identities ? { identities: a.meta.identities } : {}) };
    const { data, error } = await sb
      .from('ad_accounts')
      .upsert(
        {
          workspace_id: workspaceId,
          platform,
          external_id: a.externalId,
          name: a.name,
          currency: a.currency,
          timezone: a.timezone,
          status: a.status,
          status_detail: a.statusDetail,
          meta: meta as never,
          token_expires_at: token.expiresAt?.toISOString() ?? null,
          connected_by: userId,
        },
        { onConflict: 'workspace_id,platform,external_id' },
      )
      .select('*')
      .single();
    if (error) throw new Error(`Could not save ad account: ${error.message}`);
    const { error: tokenError } = await sb.from('ad_account_tokens').upsert({
      ad_account_id: data.id,
      access_token_enc: encryptSecret(token.accessToken),
      refresh_token_enc: token.refreshToken ? encryptSecret(token.refreshToken) : null,
      key_version: 1,
      updated_at: new Date().toISOString(),
    });
    if (tokenError) throw new Error(`Could not store ad token: ${tokenError.message}`);
    saved.push(data);
  }
  return saved;
}

export async function adAccessToken(sb: AnyClient, account: AdAccountRow): Promise<string> {
  const { data } = await sb.from('ad_account_tokens').select('access_token_enc').eq('ad_account_id', account.id).maybeSingle();
  const expired = account.token_expires_at && new Date(account.token_expires_at).getTime() < Date.now();
  if (!data || expired) {
    await sb.from('ad_accounts').update({ status: 'expired', status_detail: 'Reconnect this ad account.' }).eq('id', account.id);
    throw new PlatformError(account.platform, 401, 'The ad account connection expired. Reconnect it in Settings → Ad accounts.', { authExpired: true });
  }
  return decryptSecret(data.access_token_enc);
}

/* -------------------------------- Ad Library -------------------------------- */

/** Meta's Ad Library only exposes commercial ads delivered in the EU. */
const EU_COUNTRIES = new Set(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE']);

/** At most 10 countries, plus Ireland when none of them is in the EU. */
export function libraryCountries(countries: string[]): string[] {
  const list = [...new Set(countries.map((c) => c.toUpperCase()))].slice(0, 10);
  return list.some((c) => EU_COUNTRIES.has(c)) ? list : [...list.slice(0, 9), 'IE'];
}

/** Workspace Meta ad tokens first, then the server's Ad Library token. */
async function libraryTokens(sb: AnyClient, workspaceId: string): Promise<string[]> {
  const tokens: string[] = [];
  const { data: accounts } = await sb.from('ad_accounts').select('*').eq('workspace_id', workspaceId).eq('platform', 'meta').eq('status', 'active').order('updated_at', { ascending: false }).limit(3);
  for (const account of accounts ?? []) {
    const token = await adAccessToken(sb, account).catch(() => null);
    if (token && !tokens.includes(token)) tokens.push(token);
  }
  const serverToken = env().META_AD_LIBRARY_TOKEN;
  if (serverToken && !tokens.includes(serverToken)) tokens.push(serverToken);
  return tokens;
}

/** Searches the Ad Library with the workspace's Meta connection, falling back to the server token. */
export async function searchWorkspaceAdLibrary(sb: AnyClient, workspaceId: string, query: Omit<Parameters<typeof searchAdLibrary>[0], 'token'>): Promise<LibraryAd[]> {
  const tokens = await libraryTokens(sb, workspaceId);
  if (!tokens.length) throw new AppError('ad_library_not_configured', 'Connect a Meta ad account in Settings → Ad accounts to search the Ad Library.', 422);
  let lastError: unknown = null;
  for (const token of tokens) {
    try {
      return await searchAdLibrary({ ...query, countries: libraryCountries(query.countries), token });
    } catch (err) {
      // A token without Ad Library access (identity not confirmed with Meta) fails with a 4xx; try the next one.
      if (err instanceof PlatformError && !err.retryable) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  const reason = lastError instanceof AppError ? lastError.message : 'Meta refused the request.';
  throw new AppError('ad_library_denied', `The Ad Library search failed: ${reason} The Meta account must have confirmed its identity at facebook.com/ID.`, 422);
}
