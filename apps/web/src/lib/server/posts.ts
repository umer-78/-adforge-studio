import 'server-only';
import { parseWorkspaceSettings, PLATFORM_SPECS, validateForPlatform, type AssetRow, type SocialAccountRow, type SocialPlatform } from '@adforge/core';
import { enqueueJob, type ServiceClient } from '@adforge/core/server';
import { badRequest, hasRole, type Caller } from './api';
import type { PlatformCheckView } from '@/lib/types';

export interface TargetInput {
  socialAccountId: string;
  captionOverride?: string | null;
}

/** The chosen accounts, each active and picked once. */
export async function targetAccounts(sb: ServiceClient, caller: Caller, targets: TargetInput[]): Promise<Map<string, SocialAccountRow>> {
  const ids = targets.map((t) => t.socialAccountId);
  if (new Set(ids).size !== ids.length) throw badRequest('Each account can be picked once per post.');
  const { data, error } = await sb.from('social_accounts').select('*').eq('workspace_id', caller.workspaceId).in('id', ids);
  if (error) throw new Error(`Could not load accounts: ${error.message}`);
  const byId = new Map((data ?? []).map((a) => [a.id, a]));
  for (const id of ids) {
    const a = byId.get(id);
    if (!a) throw badRequest('One of the accounts was disconnected. Pick the accounts again.');
    if (a.status !== 'active') throw badRequest(`Reconnect ${a.display_name ?? a.handle ?? a.platform} in Settings → Accounts first.`);
  }
  return byId;
}

/** Each platform's rules for this media and copy: length, size, aspect, caption and title limits. */
export function platformChecks(asset: AssetRow, post: { title?: string | null; caption: string; hashtags: string[] }, targets: TargetInput[], accounts: Map<string, SocialAccountRow>): PlatformCheckView[] {
  return targets.map((t) => {
    const platform = accounts.get(t.socialAccountId)!.platform as SocialPlatform;
    const issues = validateForPlatform(
      platform,
      { durationS: asset.duration_s == null ? null : Number(asset.duration_s), sizeBytes: asset.size_bytes == null ? null : Number(asset.size_bytes), width: asset.width, height: asset.height, type: asset.type },
      { caption: t.captionOverride ?? post.caption, hashtags: post.hashtags, title: post.title },
    );
    return { platform, label: PLATFORM_SPECS[platform].label, issues };
  });
}

export const cleanHashtags = (tags: string[]) => [...new Set(tags.map((h) => h.trim().replace(/^#+/, '').replace(/\s+/g, '')).filter(Boolean))];

/** True when this caller's posts wait for an admin: the workspace asks for approval and they are an editor. */
export async function needsApproval(sb: ServiceClient, caller: Caller): Promise<boolean> {
  if (hasRole(caller, 'admin')) return false;
  const { data } = await sb.from('workspaces').select('settings').eq('id', caller.workspaceId).maybeSingle();
  return parseWorkspaceSettings(data?.settings).requirePostApproval;
}

/** Queues publishing for every account on the post that has not gone out yet. */
export async function enqueuePendingTargets(sb: ServiceClient, caller: Caller, postId: string, reason: string) {
  const { data: targets } = await sb.from('post_targets').select('id').eq('post_id', postId).eq('status', 'pending');
  for (const t of targets ?? []) {
    const job = await enqueueJob(sb, { type: 'publish.post', payload: { postTargetId: t.id }, workspaceId: caller.workspaceId, createdBy: caller.userId, priority: 10, idempotencyKey: `publish.post:${t.id}:${reason}:${Date.now()}` });
    await sb.from('post_targets').update({ job_id: job.id }).eq('id', t.id);
  }
}

