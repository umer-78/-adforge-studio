import type { SocialPlatform } from '../../constants';
import type { Database } from '../../db/database.types';
import { AppError } from '../../utils';
import { requireProviderKey } from '../ai/keys';
import { decryptSecret, encryptSecret, pkcePair, randomToken } from '../crypto';
import type { AnyClient } from '../supabase';
import { PlatformError } from './http';
import { linkedinConnector, linkedinPublisher } from './linkedin';
import { facebookPublisher, instagramPublisher, metaConnector } from './meta';
import { pinterestConnector, pinterestPublisher } from './pinterest';
import { tiktokConnector, tiktokPublisher } from './tiktok';
import type { ConnectedAccount, Connector, ConnectorId, Publisher, TokenSet } from './types';
import { xConnector, xPublisher } from './x';
import { youtubeConnector, youtubePublisher } from './youtube';

export * from './types';
export { PlatformError, errorMessage } from './http';
export { ayrshareAccounts, ayrshareMetrics, ayrsharePublish } from './ayrshare';
export { tiktokCreatorInfo, type TikTokCreatorInfo } from './tiktok';
export { pinterestBoards, type PinterestBoard } from './pinterest';
export { linkedinCommentary } from './linkedin';
export { graph, metaAuthorizeUrl, metaExchange, metaGet, metaPost, metaAuthError, metaUserId } from './meta';

export const CONNECTORS: Record<ConnectorId, Connector> = {
  youtube: youtubeConnector,
  tiktok: tiktokConnector,
  meta: metaConnector,
  linkedin: linkedinConnector,
  x: xConnector,
  pinterest: pinterestConnector,
};

export const PUBLISHERS: Record<SocialPlatform, Publisher> = {
  youtube: youtubePublisher,
  tiktok: tiktokPublisher,
  instagram: instagramPublisher,
  facebook: facebookPublisher,
  linkedin: linkedinPublisher,
  x: xPublisher,
  pinterest: pinterestPublisher,
};

export function connectorForPlatform(platform: SocialPlatform): Connector {
  return Object.values(CONNECTORS).find((c) => c.platforms.includes(platform))!;
}

export function isConnectorId(id: string): id is ConnectorId {
  return id in CONNECTORS;
}

export function connectorStatus() {
  return Object.values(CONNECTORS).map((c) => ({ id: c.id, label: c.label, platforms: c.platforms, configured: c.configured() }));
}

/* ------------------------------- OAuth state ------------------------------- */

type OAuthStateRow = Database['public']['Tables']['oauth_states']['Row'];

/** Stores a one-time state (and PKCE verifier) for an OAuth round trip. Valid for 15 minutes. */
export async function createOAuthState(
  sb: AnyClient,
  opts: { workspaceId: string; userId: string; platform: string; redirectTo?: string | null; pkce?: boolean },
): Promise<{ state: string; codeChallenge?: string }> {
  const state = randomToken(32);
  const pair = opts.pkce ? pkcePair() : null;
  const { error } = await sb.from('oauth_states').insert({
    state,
    workspace_id: opts.workspaceId,
    user_id: opts.userId,
    platform: opts.platform,
    code_verifier: pair?.verifier ?? null,
    redirect_to: opts.redirectTo ?? null,
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  });
  if (error) throw new Error(`Could not start sign-in: ${error.message}`);
  return { state, ...(pair ? { codeChallenge: pair.challenge } : {}) };
}

/** Reads and deletes the state. Throws when it is unknown, expired or for another platform. */
export async function consumeOAuthState(sb: AnyClient, state: string, platform: string): Promise<OAuthStateRow> {
  const { data } = await sb.from('oauth_states').delete().eq('state', state).select('*').maybeSingle();
  if (!data || data.platform !== platform) throw new AppError('oauth_state', 'This sign-in link is invalid. Start the connection again.', 400);
  if (new Date(data.expires_at).getTime() < Date.now()) throw new AppError('oauth_state', 'The sign-in took too long. Start the connection again.', 400);
  return data;
}

/* ------------------------------ Account tokens ------------------------------ */

type SocialAccountRow = Database['public']['Tables']['social_accounts']['Row'];

/** Upserts connected accounts and their encrypted tokens. */
export async function saveSocialAccounts(sb: AnyClient, workspaceId: string, userId: string | null, accounts: ConnectedAccount[]): Promise<SocialAccountRow[]> {
  const saved: SocialAccountRow[] = [];
  for (const a of accounts) {
    const { data, error } = await sb
      .from('social_accounts')
      .upsert(
        {
          workspace_id: workspaceId,
          platform: a.platform,
          provider: 'native',
          external_id: a.externalId,
          handle: a.handle,
          display_name: a.displayName,
          avatar_url: a.avatarUrl,
          meta: a.meta as never,
          scopes: a.token.scopes ?? [],
          status: 'active',
          status_detail: null,
          token_expires_at: a.token.expiresAt?.toISOString() ?? null,
          connected_by: userId,
        },
        { onConflict: 'workspace_id,platform,external_id' },
      )
      .select('*')
      .single();
    if (error) throw new Error(`Could not save ${a.platform} account: ${error.message}`);
    await storeSocialToken(sb, data.id, a.token);
    saved.push(data);
  }
  return saved;
}

async function storeSocialToken(sb: AnyClient, accountId: string, token: TokenSet) {
  const { error } = await sb.from('social_account_tokens').upsert({
    social_account_id: accountId,
    access_token_enc: encryptSecret(token.accessToken),
    refresh_token_enc: token.refreshToken ? encryptSecret(token.refreshToken) : null,
    key_version: 1,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Could not store token: ${error.message}`);
}

export async function markSocialAccount(sb: AnyClient, accountId: string, status: 'active' | 'expired' | 'revoked' | 'error', detail: string | null) {
  await sb.from('social_accounts').update({ status, status_detail: detail }).eq('id', accountId);
}

const REFRESH_MARGIN_MS = 5 * 60_000;
const inflight = new Map<string, Promise<string>>();

/**
 * A usable access token for the account, refreshed when close to expiry. For accounts linked
 * through Ayrshare this is the workspace's Ayrshare API key.
 */
export function socialAccessToken(sb: AnyClient, account: SocialAccountRow): Promise<string> {
  if (account.provider === 'ayrshare') return requireProviderKey(account.workspace_id, 'ayrshare');
  const running = inflight.get(account.id);
  if (running) return running;
  const p = resolveToken(sb, account).finally(() => inflight.delete(account.id));
  inflight.set(account.id, p);
  return p;
}

async function resolveToken(sb: AnyClient, account: SocialAccountRow): Promise<string> {
  const platform = account.platform as SocialPlatform;
  const reconnect = (msg: string) => new PlatformError(platform, 401, msg, { authExpired: true });
  const { data: row } = await sb.from('social_account_tokens').select('*').eq('social_account_id', account.id).maybeSingle();
  if (!row) {
    await markSocialAccount(sb, account.id, 'revoked', 'Reconnect this account.');
    throw reconnect('This account needs to be reconnected.');
  }
  const token: TokenSet = {
    accessToken: decryptSecret(row.access_token_enc),
    refreshToken: row.refresh_token_enc ? decryptSecret(row.refresh_token_enc) : null,
    expiresAt: account.token_expires_at ? new Date(account.token_expires_at) : null,
    scopes: account.scopes,
  };
  if (!token.expiresAt || token.expiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS) return token.accessToken;
  const connector = connectorForPlatform(platform);
  if (!connector.refresh || !token.refreshToken) {
    if (token.expiresAt.getTime() > Date.now()) return token.accessToken;
    await markSocialAccount(sb, account.id, 'expired', 'The connection expired. Reconnect the account.');
    throw reconnect(`${connector.label}: the connection expired. Reconnect the account in Settings.`);
  }
  try {
    const next = await connector.refresh(token);
    await storeSocialToken(sb, account.id, next);
    await sb.from('social_accounts').update({ token_expires_at: next.expiresAt?.toISOString() ?? null, status: 'active', status_detail: null }).eq('id', account.id);
    return next.accessToken;
  } catch (err) {
    if (err instanceof PlatformError && err.authExpired) await markSocialAccount(sb, account.id, 'expired', err.message);
    throw err;
  }
}
