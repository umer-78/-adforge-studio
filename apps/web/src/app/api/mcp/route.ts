import { AppError } from '@adforge/core';
import { serviceClient } from '@adforge/core/server';
import { connection, NextResponse, type NextRequest } from 'next/server';
import * as z from 'zod';
import { rateLimit, resolveCaller } from '@/lib/server/api';
import { routeCaller, ToolError, TOOLS_BY_NAME, toolDescriptors } from '@/lib/server/mcp-tools';

/**
 * Model Context Protocol server over streamable HTTP (stateless: one JSON response per request,
 * no server-initiated stream). Authenticated with an AdForge API key as the bearer token.
 */

const SUPPORTED_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
const LATEST = SUPPORTED_VERSIONS[0]!;

const INSTRUCTIONS = [
  'AdForge Studio makes, edits and publishes ad videos and photos.',
  'Paid work is priced first: call estimate_generation before generate and pass the total as confirmCostUsd; call estimate_agent_step before approving an agent step. Monthly and per-run budgets set in the app are enforced.',
  'Generations, scripts, product imports and agent steps run in the background: poll the matching get_ tool.',
  'Ads are always created paused. Only post (create_post) when the user has confirmed they own the rights to the content.',
].join(' ');

type Id = string | number | null;
interface RpcMessage {
  jsonrpc?: unknown;
  id?: Id;
  method?: unknown;
  params?: unknown;
}

const reply = (data: unknown, status = 200, headers: Record<string, string> = {}) => NextResponse.json(data, { status, headers: { 'cache-control': 'no-store', ...headers } });
const rpcError = (id: Id, code: number, message: string, data?: unknown) => ({ jsonrpc: '2.0' as const, id, error: { code, message, ...(data !== undefined ? { data } : {}) } });
const rpcResult = (id: Id, result: unknown) => ({ jsonrpc: '2.0' as const, id, result });

function toolResult(data: unknown) {
  const structured = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : { result: data };
  return { content: [{ type: 'text', text: JSON.stringify(data ?? null, null, 2) }], structuredContent: structured, isError: false };
}

const toolFailure = (message: string) => ({ content: [{ type: 'text', text: message }], isError: true });

async function handle(msg: RpcMessage, call: ReturnType<typeof routeCaller>): Promise<object | null> {
  const isRequest = msg.id !== undefined && msg.id !== null;
  if (msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return isRequest || msg.id === null ? rpcError(msg.id ?? null, -32600, 'Invalid request') : null;
  // Notifications (no id) and responses get no reply.
  if (!isRequest) return null;
  const id = msg.id as Id;
  const params = (msg.params && typeof msg.params === 'object' ? msg.params : {}) as Record<string, unknown>;

  switch (msg.method) {
    case 'initialize': {
      const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : LATEST;
      return rpcResult(id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : LATEST,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'adforge-studio', title: 'AdForge Studio', version: '1.0.0' },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return rpcResult(id, {});
    case 'tools/list':
      return rpcResult(id, { tools: toolDescriptors() });
    case 'tools/call': {
      const name = typeof params.name === 'string' ? params.name : '';
      const tool = TOOLS_BY_NAME.get(name);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${name || '(none)'}`);
      const parsed = tool.input.safeParse(params.arguments ?? {});
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        return rpcResult(id, toolFailure(`Invalid arguments${first?.path.length ? ` at ${first.path.join('.')}` : ''}: ${first?.message ?? 'check the input schema'}`));
      }
      try {
        return rpcResult(id, toolResult(await tool.run(parsed.data as never, call)));
      } catch (err) {
        if (err instanceof ToolError) return rpcResult(id, toolFailure(err.message));
        if (err instanceof z.ZodError) return rpcResult(id, toolFailure(err.issues[0]?.message ?? 'Invalid arguments'));
        console.error('[mcp] tool failed', name, err);
        return rpcResult(id, toolFailure('Something went wrong on our side. Try again in a moment.'));
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${msg.method}`);
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  await connection();
  const version = req.headers.get('mcp-protocol-version');
  if (version && !SUPPORTED_VERSIONS.includes(version)) return reply(rpcError(null, -32600, `Unsupported MCP protocol version ${version}. Supported: ${SUPPORTED_VERSIONS.join(', ')}.`), 400);

  const sb = serviceClient();
  try {
    if (!req.headers.get('authorization')) throw new AppError('unauthorized', 'Send an AdForge API key as the bearer token. Create one in Settings → API & MCP.', 401);
    const caller = await resolveCaller(req, sb);
    if (caller.via !== 'api_key') throw new AppError('unauthorized', 'Use an AdForge API key as the bearer token.', 401);
    await rateLimit(sb, `mcp:${caller.apiKeyId}`, 240, 60);
  } catch (err) {
    const status = err instanceof AppError ? err.status : 500;
    const message = err instanceof AppError ? err.message : 'Could not check the API key.';
    return reply(rpcError(null, status === 429 ? -32000 : -32001, message), status, status === 401 ? { 'www-authenticate': 'Bearer realm="AdForge Studio"' } : {});
  }

  let body: unknown;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return reply(rpcError(null, -32700, 'Parse error: the body is not valid JSON.'), 400);
  }
  const call = routeCaller(req);
  if (Array.isArray(body)) {
    if (!body.length) return reply(rpcError(null, -32600, 'Invalid request: empty batch.'), 400);
    const out = (await Promise.all(body.map((m) => handle((m ?? {}) as RpcMessage, call)))).filter((r): r is object => r !== null);
    return out.length ? reply(out) : new NextResponse(null, { status: 202 });
  }
  const out = await handle((body ?? {}) as RpcMessage, call);
  return out ? reply(out) : new NextResponse(null, { status: 202 });
}

/** No server-initiated stream is offered. */
export function GET(): Response {
  return new NextResponse(null, { status: 405, headers: { allow: 'POST' } });
}

/** Stateless: there is no session to end. */
export function DELETE(): Response {
  return new NextResponse(null, { status: 405, headers: { allow: 'POST' } });
}
