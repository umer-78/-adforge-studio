import 'server-only';
import { AGENT_STEPS, agentDecisionSchema, agentRunCreateSchema, capabilitySchema, enhancePromptRequestSchema, estimateSchema, generationCreateSchema, postCreateSchema, productImportSchema, scriptGenerateSchema } from '@adforge/core';
import { NextRequest } from 'next/server';
import * as z from 'zod';
import { GET as listAgentRuns, POST as createAgentRun } from '@/app/api/agent/runs/route';
import { GET as getAgentRun } from '@/app/api/agent/runs/[id]/route';
import { POST as agentDecision } from '@/app/api/agent/runs/[id]/decision/route';
import { POST as agentEstimate } from '@/app/api/agent/runs/[id]/estimate/route';
import { GET as getAnalytics } from '@/app/api/analytics/route';
import { GET as listAssets } from '@/app/api/assets/route';
import { GET as getAsset } from '@/app/api/assets/[id]/route';
import { GET as listCampaigns } from '@/app/api/campaigns/route';
import { POST as estimateGeneration } from '@/app/api/generate/estimate/route';
import { POST as createGeneration } from '@/app/api/generate/route';
import { GET as listGenerations } from '@/app/api/generations/route';
import { GET as getGeneration } from '@/app/api/generations/[id]/route';
import { GET as getMe } from '@/app/api/me/route';
import { GET as listModels } from '@/app/api/models/route';
import { GET as listPosts, POST as createPost } from '@/app/api/posts/route';
import { GET as listProducts, POST as importProduct } from '@/app/api/products/route';
import { POST as enhancePrompt } from '@/app/api/prompts/enhance/route';
import { POST as createScript } from '@/app/api/scripts/route';
import { GET as getScript } from '@/app/api/scripts/[id]/route';
import { GET as listSocialAccounts } from '@/app/api/social-accounts/route';
import { GET as getUsage } from '@/app/api/usage/route';

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string | string[]>> }) => Promise<Response>;

/** An API error, passed back to the assistant as a tool error it can read and act on. */
export class ToolError extends Error {}

export interface CallOptions {
  method: 'GET' | 'POST';
  path: string;
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
}

/**
 * Runs an API route in-process with the caller's own credentials, so every tool gets exactly the
 * checks the app and the REST API get: roles, key scopes, rate limits, prices and budgets.
 */
export function routeCaller(source: NextRequest) {
  return async (handler: Handler, o: CallOptions): Promise<unknown> => {
    const url = new URL(`/api${o.path}`, source.nextUrl.origin);
    for (const [k, v] of Object.entries(o.query ?? {})) {
      // The API reads booleans with coercion, where any present value is true.
      if (v === undefined || v === null || v === false || v === '') continue;
      url.searchParams.set(k, String(v));
    }
    const headers = new Headers({ 'content-type': 'application/json' });
    for (const h of ['authorization', 'x-workspace-id', 'user-agent', 'x-forwarded-for', 'x-real-ip']) {
      const v = source.headers.get(h);
      if (v) headers.set(h, v);
    }
    const req = new NextRequest(url, { method: o.method, headers, ...(o.method === 'POST' ? { body: JSON.stringify(o.body ?? {}) } : {}) });
    const res = await handler(req, { params: Promise.resolve(o.params ?? {}) });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const err = (data as { error?: { message?: string } } | null)?.error;
      throw new ToolError(err?.message ?? `The request failed (HTTP ${res.status}).`);
    }
    return data;
  };
}

type Call = ReturnType<typeof routeCaller>;

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

interface Tool {
  name: string;
  title: string;
  description: string;
  input: z.ZodType;
  annotations: ToolAnnotations;
  run: (args: never, call: Call) => Promise<unknown>;
}

function tool<S extends z.ZodType>(t: { name: string; title: string; description: string; input: S; annotations: ToolAnnotations; run: (args: z.output<S>, call: Call) => Promise<unknown> }): Tool {
  return t as unknown as Tool;
}

const READ: ToolAnnotations = { readOnlyHint: true, openWorldHint: false };
const PAID: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
const WRITE: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

const id = z.string().uuid();
const limit = (fallback: number) => z.number().int().min(1).max(100).default(fallback).describe('How many to return.');
const days = z.number().int().min(1).max(365).default(30).describe('How many days back.');

export const TOOLS: Tool[] = [
  tool({
    name: 'get_workspace',
    title: 'Workspace and budget',
    description: 'The workspace, your role, this month’s AI spend against the budget, and which AI providers and platforms are connected. A good first call.',
    input: z.object({}),
    annotations: READ,
    run: (_, call) => call(getMe, { method: 'GET', path: '/me' }),
  }),
  tool({
    name: 'list_models',
    title: 'List AI models',
    description: 'Models you can generate with, with their inputs, controls (durations, aspects, resolutions) and defaults. Filter by capability, e.g. t2v (text to video), i2v (image to video), t2i (text to image), tts (voice-over), music.',
    input: z.object({ capability: capabilitySchema.optional() }),
    annotations: READ,
    run: (a, call) => call(listModels, { method: 'GET', path: '/models', query: a }),
  }),
  tool({
    name: 'estimate_generation',
    title: 'Price a generation',
    description: 'The price and time of a generation before anything is spent, and how much budget is left. Pass the returned estimate.usd to generate as confirmCostUsd.',
    input: estimateSchema,
    annotations: READ,
    run: (a, call) => call(estimateGeneration, { method: 'POST', path: '/generate/estimate', body: a }),
  }),
  tool({
    name: 'generate',
    title: 'Start a paid generation',
    description:
      'Starts a paid AI generation (video, image, voice, music, upscale…). Call estimate_generation first and pass its total as confirmCostUsd: the request is refused if the price went up or the monthly budget would be exceeded. Runs in the background; follow it with get_generation. Results land in the library.',
    input: generationCreateSchema.omit({ sourceRef: true }),
    annotations: PAID,
    run: (a, call) => call(createGeneration, { method: 'POST', path: '/generate', body: a }),
  }),
  tool({
    name: 'get_generation',
    title: 'Check a generation',
    description: 'Status, progress, cost and output files of one generation.',
    input: z.object({ id }),
    annotations: READ,
    run: (a, call) => call(getGeneration, { method: 'GET', path: `/generations/${a.id}`, params: { id: a.id } }),
  }),
  tool({
    name: 'list_generations',
    title: 'Recent generations',
    description: 'Recent generations, newest first. status=active shows the ones still running.',
    input: z.object({ status: z.enum(['active', 'succeeded', 'failed']).optional(), capability: capabilitySchema.optional(), limit: limit(20) }),
    annotations: READ,
    run: (a, call) => call(listGenerations, { method: 'GET', path: '/generations', query: a }),
  }),
  tool({
    name: 'search_library',
    title: 'Search the library',
    description: 'Find videos, images and sounds by name, tags, transcript and description. Set semantic to true to search by meaning (“sunset beach shots”). Returns files with short-lived links.',
    input: z.object({
      q: z.string().max(200).optional().describe('Words to search for.'),
      type: z.enum(['video', 'image', 'audio', 'model3d']).optional(),
      tag: z.string().max(60).optional(),
      favorite: z.boolean().optional().describe('Only favorites.'),
      semantic: z.boolean().optional().describe('Search by meaning instead of words.'),
      limit: limit(20),
    }),
    annotations: READ,
    run: (a, call) => call(listAssets, { method: 'GET', path: '/assets', query: a }),
  }),
  tool({
    name: 'get_asset',
    title: 'Get a library file',
    description: 'One file from the library: details, transcript, license and short-lived links.',
    input: z.object({ id }),
    annotations: READ,
    run: (a, call) => call(getAsset, { method: 'GET', path: `/assets/${a.id}`, params: { id: a.id } }),
  }),
  tool({
    name: 'enhance_prompt',
    title: 'Improve a prompt',
    description: 'Turns a rough idea into a detailed video or image prompt (shot, subject, motion, light, sound). Costs a small amount of Claude usage.',
    input: enhancePromptRequestSchema.omit({ parentId: true }),
    annotations: PAID,
    run: (a, call) => call(enhancePrompt, { method: 'POST', path: '/prompts/enhance', body: a }),
  }),
  tool({
    name: 'write_script',
    title: 'Write an ad script',
    description: 'Writes an ad script or a dialogue from a brief: product (or productId), audience, goal, tone, platform and length. Runs in the background; check get_script until status is draft.',
    input: scriptGenerateSchema,
    annotations: PAID,
    run: (a, call) => call(createScript, { method: 'POST', path: '/scripts', body: { mode: 'generate', ...a } }),
  }),
  tool({
    name: 'get_script',
    title: 'Read a script',
    description: 'A script with its lines, beats, timings and status.',
    input: z.object({ id }),
    annotations: READ,
    run: (a, call) => call(getScript, { method: 'GET', path: `/scripts/${a.id}`, params: { id: a.id } }),
  }),
  tool({
    name: 'list_products',
    title: 'List products',
    description: 'Products imported from their pages, with what was found: title, price, claims, reviews and images.',
    input: z.object({ q: z.string().max(200).optional(), status: z.enum(['importing', 'ready', 'failed']).optional(), limit: limit(20) }),
    annotations: READ,
    run: (a, call) => call(listProducts, { method: 'GET', path: '/products', query: a }),
  }),
  tool({
    name: 'import_product',
    title: 'Import a product page',
    description: 'Reads a product page so scripts, URL-to-video and the agent can use it. Runs in the background; check list_products until it is ready.',
    input: productImportSchema,
    annotations: { ...WRITE, openWorldHint: true },
    run: (a, call) => call(importProduct, { method: 'POST', path: '/products', body: a }),
  }),
  tool({
    name: 'start_agent_run',
    title: 'Start the ad agent',
    description:
      'Starts an agent run for a product and a goal: research, script, video, paused ads, then results. It stops for approval before every step with the price shown first; approve with agent_decide. budgetUsd caps the whole run. autoApproveUnderUsd lets cheap steps run on their own (ad launch always waits).',
    input: agentRunCreateSchema,
    annotations: PAID,
    run: (a, call) => call(createAgentRun, { method: 'POST', path: '/agent/runs', body: a }),
  }),
  tool({
    name: 'list_agent_runs',
    title: 'List agent runs',
    description: 'Agent runs, newest first, with the step each one is at and what it has spent.',
    input: z.object({ status: z.enum(['awaiting_approval', 'running', 'completed', 'failed', 'canceled']).optional(), limit: limit(20) }),
    annotations: READ,
    run: (a, call) => call(listAgentRuns, { method: 'GET', path: '/agent/runs', query: a }),
  }),
  tool({
    name: 'get_agent_run',
    title: 'Check an agent run',
    description: 'One agent run: every step’s status, output, cost and the price of the step waiting for approval.',
    input: z.object({ id }),
    annotations: READ,
    run: (a, call) => call(getAgentRun, { method: 'GET', path: `/agent/runs/${a.id}`, params: { id: a.id } }),
  }),
  tool({
    name: 'estimate_agent_step',
    title: 'Price an agent step',
    description: 'The live price of approving the waiting step (mode approve) or redoing a finished one (mode redo), with the edits you plan to send, against the run budget and the monthly budget.',
    input: z.object({ runId: id, mode: z.enum(['approve', 'redo']).default('approve'), step: z.enum(AGENT_STEPS).optional(), edits: z.record(z.string(), z.unknown()).optional() }),
    annotations: READ,
    run: ({ runId, ...body }, call) => call(agentEstimate, { method: 'POST', path: `/agent/runs/${runId}/estimate`, params: { id: runId }, body }),
  }),
  tool({
    name: 'agent_decide',
    title: 'Approve or steer an agent step',
    description:
      'approve runs the step waiting for approval (price it with estimate_agent_step first). reject redoes a finished step, with note as feedback. reopen goes back to a finished step without running it. skip finishes the run here. cancel stops it. The launch step creates ads paused.',
    input: agentDecisionSchema.extend({ runId: id }),
    annotations: { ...PAID, destructiveHint: true },
    run: ({ runId, ...body }, call) => call(agentDecision, { method: 'POST', path: `/agent/runs/${runId}/decision`, params: { id: runId }, body }),
  }),
  tool({
    name: 'list_social_accounts',
    title: 'Connected social accounts',
    description: 'Social accounts that posts can go to, with their status.',
    input: z.object({}),
    annotations: READ,
    run: (_, call) => call(listSocialAccounts, { method: 'GET', path: '/social-accounts' }),
  }),
  tool({
    name: 'create_post',
    title: 'Publish or schedule a post',
    description:
      'Posts a library video or image to connected accounts, now or at scheduledAt (ISO time with offset). Captions are checked against each platform’s limits. Set rightsAcknowledged to true only when the user confirms they own the rights to the content.',
    input: postCreateSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    run: (a, call) => call(createPost, { method: 'POST', path: '/posts', body: a }),
  }),
  tool({
    name: 'list_posts',
    title: 'List posts',
    description: 'Posts with their per-account status and results, newest first.',
    input: z.object({ status: z.enum(['draft', 'scheduled', 'publishing', 'published', 'partially_published', 'failed', 'canceled']).optional(), limit: limit(20) }),
    annotations: READ,
    run: (a, call) => call(listPosts, { method: 'GET', path: '/posts', query: a }),
  }),
  tool({
    name: 'list_campaigns',
    title: 'List ad campaigns',
    description: 'Meta and TikTok campaigns made here, with each ad’s status and results.',
    input: z.object({ status: z.enum(['draft', 'launching', 'paused', 'active', 'completed', 'failed']).optional(), limit: limit(20) }),
    annotations: READ,
    run: (a, call) => call(listCampaigns, { method: 'GET', path: '/campaigns', query: a }),
  }),
  tool({
    name: 'get_analytics',
    title: 'Post and ad results',
    description: 'Views, engagement, clicks, ad spend and conversions per day, plus the best posts and ads.',
    input: z.object({ days }),
    annotations: READ,
    run: (a, call) => call(getAnalytics, { method: 'GET', path: '/analytics', query: a }),
  }),
  tool({
    name: 'get_usage',
    title: 'AI spend',
    description: 'AI spend per day, by kind of work, by provider and by model, with the latest charges.',
    input: z.object({ days }),
    annotations: READ,
    run: (a, call) => call(getUsage, { method: 'GET', path: '/usage', query: a }),
  }),
];

export const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** Tool descriptors for tools/list, with JSON Schemas made from the same validators the API uses. */
export function toolDescriptors() {
  return TOOLS.map((t) => {
    const schema = z.toJSONSchema(t.input, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
    delete schema.$schema;
    return { name: t.name, title: t.title, description: t.description, inputSchema: { type: 'object', ...schema }, annotations: { title: t.title, ...t.annotations } };
  });
}
