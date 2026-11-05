import 'server-only';
import { AppError, ROLES, type Role, type Row, type TableName } from '@adforge/core';
import { ownerEmails, ProviderNotConfiguredError, serviceClient, sha256Hex, type ServiceClient } from '@adforge/core/server';
import { unstable_rethrow } from 'next/navigation';
import { connection, NextResponse, type NextRequest } from 'next/server';
import * as z from 'zod';
import { sessionClient } from './supabase';

export const SCOPES = ['read', 'write', 'generate', 'publish', 'ads'] as const;
export type Scope = (typeof SCOPES)[number];

export interface Caller {
  userId: string;
  email: string | null;
  workspaceId: string;
  role: Role;
  via: 'session' | 'api_key';
  scopes: readonly Scope[];
  apiKeyId: string | null;
}

export interface HandlerArgs<B, Q> {
  req: NextRequest;
  caller: Caller;
  body: B;
  query: Q;
  params: Record<string, string>;
  sb: ServiceClient;
}

export interface RouteOptions<B, Q> {
  /** Minimum role. Defaults to viewer for GET and editor for everything else. */
  role?: Role;
  /** Scope an API key needs. Defaults to read for GET and write for everything else. */
  scope?: Scope;
  body?: z.ZodType<B>;
  query?: z.ZodType<Q>;
  /** [bucket, requests, window seconds], counted per workspace. */
  limit?: [string, number, number];
}

type RouteContext = { params: Promise<Record<string, string | string[]>> };

/* --------------------------------- Errors --------------------------------- */

export const notFound = (what = 'This item') => new AppError('not_found', `${what} was not found.`, 404);
export const badRequest = (message: string, details?: unknown) => new AppError('invalid_request', message, 400, details);
export const forbidden = (message = 'You do not have access to this.') => new AppError('forbidden', message, 403);
export const conflict = (message: string, details?: unknown) => new AppError('conflict', message, 409, details);

function errorResponse(err: unknown): NextResponse {
  if (err instanceof z.ZodError) {
    const first = err.issues[0];
    const where = first?.path.length ? `${first.path.join('.')}: ` : '';
    return json({ error: { code: 'invalid_request', message: `${where}${first?.message ?? 'Invalid request'}`, details: err.issues } }, 400);
  }
  if (err instanceof AppError) return json({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
  if (err instanceof ProviderNotConfiguredError) return json({ error: { code: err.code, message: err.message, details: { provider: err.provider } } }, 400);
  if (err instanceof SyntaxError) return json({ error: { code: 'invalid_json', message: 'The request body is not valid JSON.' } }, 400);
  console.error('[api] unhandled error', err);
  return json({ error: { code: 'internal', message: 'Something went wrong on our side. Try again in a moment.' } }, 500);
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(data, { status, headers: { 'cache-control': 'no-store', ...headers } });
}

/* ---------------------------------- Auth ---------------------------------- */

const emailCache = new Map<string, { email: string | null; at: number }>();

async function userEmail(sb: ServiceClient, userId: string): Promise<string | null> {
  const hit = emailCache.get(userId);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.email;
  const { data } = await sb.auth.admin.getUserById(userId);
  const email = data.user?.email ?? null;
  emailCache.set(userId, { email, at: Date.now() });
  return email;
}

function assertAllowed(email: string | null) {
  const list = ownerEmails();
  if (list.length && (!email || !list.includes(email.toLowerCase()))) {
    throw new AppError('not_allowed', 'This account is not allowed to use this studio.', 403);
  }
}

async function membership(sb: ServiceClient, userId: string, requested: string | null): Promise<{ workspaceId: string; role: Role }> {
  if (requested) {
    if (!z.string().uuid().safeParse(requested).success) throw badRequest('x-workspace-id must be a workspace id.');
    const { data } = await sb.from('workspace_members').select('role').eq('workspace_id', requested).eq('user_id', userId).maybeSingle();
    if (!data) throw forbidden('You are not a member of that workspace.');
    return { workspaceId: requested, role: data.role as Role };
  }
  const { data: profile } = await sb.from('profiles').select('default_workspace_id').eq('id', userId).maybeSingle();
  if (profile?.default_workspace_id) {
    const { data } = await sb.from('workspace_members').select('role').eq('workspace_id', profile.default_workspace_id).eq('user_id', userId).maybeSingle();
    if (data) return { workspaceId: profile.default_workspace_id, role: data.role as Role };
  }
  const { data: first } = await sb.from('workspace_members').select('workspace_id, role').eq('user_id', userId).order('created_at').limit(1).maybeSingle();
  if (!first) throw forbidden('Your account has no workspace yet. Sign out and in again.');
  return { workspaceId: first.workspace_id, role: first.role as Role };
}

async function apiKeyCaller(sb: ServiceClient, token: string, requested: string | null): Promise<Caller> {
  const { data: key } = await sb.from('api_keys').select('id, workspace_id, user_id, scopes, expires_at, revoked_at, last_used_at').eq('key_hash', sha256Hex(token)).maybeSingle();
  if (!key || key.revoked_at) throw new AppError('unauthorized', 'This API key is not valid or was revoked.', 401);
  if (key.expires_at && new Date(key.expires_at).getTime() < Date.now()) throw new AppError('unauthorized', 'This API key has expired.', 401);
  if (requested && requested !== key.workspace_id) throw forbidden('This API key belongs to another workspace.');
  const { data: member } = await sb.from('workspace_members').select('role').eq('workspace_id', key.workspace_id).eq('user_id', key.user_id).maybeSingle();
  if (!member) throw new AppError('unauthorized', 'The owner of this API key left the workspace.', 401);
  const email = await userEmail(sb, key.user_id);
  assertAllowed(email);
  if (!key.last_used_at || Date.now() - new Date(key.last_used_at).getTime() > 5 * 60_000) {
    void sb.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id).then(() => undefined);
  }
  const scopes = (key.scopes ?? []).filter((s): s is Scope => (SCOPES as readonly string[]).includes(s));
  return { userId: key.user_id, email, workspaceId: key.workspace_id, role: member.role as Role, via: 'api_key', scopes, apiKeyId: key.id };
}

/** Who is calling: a signed-in browser session or an API key (`Authorization: Bearer afk_…`). */
export async function resolveCaller(req: NextRequest, sb = serviceClient()): Promise<Caller> {
  const requested = req.headers.get('x-workspace-id');
  const authz = req.headers.get('authorization');
  if (authz?.toLowerCase().startsWith('bearer ')) {
    const token = authz.slice(7).trim();
    if (!token.startsWith('afk_')) throw new AppError('unauthorized', 'Use an AdForge API key (afk_…) as the bearer token.', 401);
    return apiKeyCaller(sb, token, requested);
  }
  const session = await sessionClient();
  const { data } = await session.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) throw new AppError('unauthorized', 'Sign in to continue.', 401);
  const email = (claims.email as string | undefined) ?? null;
  assertAllowed(email);
  const { workspaceId, role } = await membership(sb, claims.sub, requested);
  return { userId: claims.sub, email, workspaceId, role, via: 'session', scopes: SCOPES, apiKeyId: null };
}

export function hasRole(caller: Caller, min: Role): boolean {
  // ROLES is ordered from most to least privileged.
  return ROLES.indexOf(caller.role) <= ROLES.indexOf(min);
}

export function requireRole(caller: Caller, min: Role) {
  if (!hasRole(caller, min)) throw forbidden(`This needs the ${min} role or higher.`);
}

export function requireScope(caller: Caller, scope: Scope) {
  if (!caller.scopes.includes(scope)) throw forbidden(`This API key is missing the "${scope}" scope.`);
}

/** Browsers send Origin on every state-changing request; a foreign one means a cross-site form or script. */
export function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (origin) {
    if (new URL(origin).host !== req.headers.get('host')) throw forbidden('Cross-site request blocked.');
    return;
  }
  const site = req.headers.get('sec-fetch-site');
  if (site && !['same-origin', 'none'].includes(site)) throw forbidden('Cross-site request blocked.');
}

/* ------------------------------ Rate limiting ------------------------------ */

export async function rateLimit(sb: ServiceClient, bucket: string, limit: number, windowS: number) {
  const { data, error } = await sb.rpc('hit_rate_limit', { p_bucket: bucket, p_limit: limit, p_window_seconds: windowS });
  if (error) {
    console.warn('[api] rate limit check failed', error.message);
    return;
  }
  if (data === false) throw new AppError('rate_limited', `Too many requests. Try again in ${windowS >= 60 ? `${Math.ceil(windowS / 60)} minute(s)` : `${windowS} seconds`}.`, 429);
}

export function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

/* --------------------------------- Parsing --------------------------------- */

function searchParamsObject(sp: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(sp.keys())) {
    const all = sp.getAll(key);
    out[key] = all.length > 1 ? all : all[0]!;
  }
  return out;
}

async function readJson(req: NextRequest): Promise<unknown> {
  const text = await req.text();
  if (!text.trim()) return {};
  return JSON.parse(text);
}

async function flatParams(ctx: RouteContext | undefined): Promise<Record<string, string>> {
  const raw = (await ctx?.params) ?? {};
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v.join('/') : v]));
}

function toResponse(result: unknown): Response {
  if (result instanceof Response) return result;
  if (result === undefined) return new NextResponse(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  return json(result);
}

/* --------------------------------- Routes --------------------------------- */

/** Authenticated route: resolves the caller, checks role/scope/origin, validates input and maps errors. */
export function route<B = undefined, Q = Record<string, string | string[]>>(opts: RouteOptions<B, Q>, handler: (args: HandlerArgs<B, Q>) => unknown) {
  return async (req: NextRequest, ctx: RouteContext): Promise<Response> => {
    // Every API response depends on the request; this keeps GET handlers out of build-time prerendering.
    await connection();
    try {
      const sb = serviceClient();
      const caller = await resolveCaller(req, sb);
      const read = req.method === 'GET' || req.method === 'HEAD';
      if (caller.via === 'session' && !read) assertSameOrigin(req);
      requireRole(caller, opts.role ?? (read ? 'viewer' : 'editor'));
      requireScope(caller, opts.scope ?? (read ? 'read' : 'write'));
      if (caller.via === 'api_key') await rateLimit(sb, `key:${caller.apiKeyId}`, 240, 60);
      if (opts.limit) await rateLimit(sb, `${opts.limit[0]}:${caller.workspaceId}`, opts.limit[1], opts.limit[2]);
      const query = (opts.query ? opts.query.parse(searchParamsObject(req.nextUrl.searchParams)) : searchParamsObject(req.nextUrl.searchParams)) as Q;
      const body = (opts.body ? opts.body.parse(await readJson(req)) : undefined) as B;
      const params = await flatParams(ctx);
      return toResponse(await handler({ req, caller, body, query, params, sb }));
    } catch (err) {
      unstable_rethrow(err);
      return errorResponse(err);
    }
  };
}

export interface PublicArgs<B, Q> {
  req: NextRequest;
  body: B;
  query: Q;
  params: Record<string, string>;
  sb: ServiceClient;
}

/** Unauthenticated route (webhooks, share pages, health). Rate limits count per client IP. */
export function publicRoute<B = undefined, Q = Record<string, string | string[]>>(
  opts: { body?: z.ZodType<B>; query?: z.ZodType<Q>; limit?: [string, number, number] },
  handler: (args: PublicArgs<B, Q>) => unknown,
) {
  return async (req: NextRequest, ctx: RouteContext): Promise<Response> => {
    await connection();
    try {
      const sb = serviceClient();
      if (opts.limit) await rateLimit(sb, `${opts.limit[0]}:${clientIp(req)}`, opts.limit[1], opts.limit[2]);
      const query = (opts.query ? opts.query.parse(searchParamsObject(req.nextUrl.searchParams)) : searchParamsObject(req.nextUrl.searchParams)) as Q;
      const body = (opts.body ? opts.body.parse(await readJson(req)) : undefined) as B;
      return toResponse(await handler({ req, body, query, params: await flatParams(ctx), sb }));
    } catch (err) {
      unstable_rethrow(err);
      return errorResponse(err);
    }
  };
}

/* --------------------------------- Helpers --------------------------------- */

/** Loads one row of the caller's workspace or throws 404. */
export async function owned<T extends TableName>(sb: ServiceClient, table: T, id: string, caller: Pick<Caller, 'workspaceId'>, what?: string): Promise<Row<T>> {
  if (!z.string().uuid().safeParse(id).success) throw notFound(what);
  const { data, error } = await (sb.from(table) as unknown as ReturnType<ServiceClient['from']>)
    .select('*')
    .eq('id' as never, id as never)
    .eq('workspace_id' as never, caller.workspaceId as never)
    .maybeSingle();
  if (error) throw new Error(`Could not load ${table}: ${error.message}`);
  if (!data) throw notFound(what);
  return data as unknown as Row<T>;
}

/** Fails loudly on PostgREST errors so routes never report success for a failed write. */
export function check<R extends { data: unknown; error: { message: string; code?: string } | null }>(result: R, what: string): NonNullable<R['data']> {
  if (result.error) {
    if (result.error.code === '23505') throw conflict(`${what}: this already exists.`);
    if (result.error.code === '23503') throw badRequest(`${what}: a referenced item does not exist.`);
    throw new Error(`${what}: ${result.error.message}`);
  }
  return result.data as NonNullable<R['data']>;
}

export async function logActivity(sb: ServiceClient, caller: Caller, verb: string, objectType: string, objectId: string | null, data: Record<string, unknown> = {}) {
  await sb.from('activity').insert({ workspace_id: caller.workspaceId, actor_id: caller.userId, verb, object_type: objectType, object_id: objectId, data: data as never });
}

export const uuidParam = z.string().uuid();

/** An ilike pattern that matches the text literally. */
export const likePattern = (text: string) => `%${text.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

/** A PostgREST `or` filter matching the text literally in any of the columns. */
export const orIlike = (columns: string[], text: string) => {
  const value = likePattern(text).replace(/["\\]/g, (c) => `\\${c}`);
  return columns.map((c) => `${c}.ilike."${value}"`).join(',');
};
