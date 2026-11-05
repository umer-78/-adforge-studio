import { audibleAssetIds, findLicenseIssues, isRecord, roleFromAudioTrackKind, timelineOps, type AssetMeta } from '@adforge/core';
import { route } from '@/lib/server/api';
import { assetsByIds } from '@/lib/server/assets';
import { loadTimeline, parseTimelineData } from '@/lib/server/timelines';

/**
 * What an export of the saved edit would run into: empty template slots, deleted or
 * unprocessed files, and audio that is not cleared for ads. Checked before exporting.
 */
export const GET = route({}, async ({ sb, caller, params }) => {
  const row = await loadTimeline(sb, caller, params.id!);
  const tl = parseTimelineData(row.data);
  const ids = timelineOps.collectAssetIds(tl);
  const rows = new Map((await assetsByIds(sb, caller.workspaceId, ids)).map((a) => [a.id, a]));

  const missing = ids.filter((id) => !rows.get(id) || rows.get(id)!.deleted_at).length;
  const failed = [...rows.values()].filter((a) => !a.deleted_at && a.status === 'failed').map((a) => a.name);
  const processing = [...rows.values()].filter((a) => !a.deleted_at && a.status !== 'ready' && a.status !== 'failed').map((a) => a.name);

  const heard = audibleAssetIds(tl)
    .map((id) => rows.get(id))
    .filter((a) => !!a && !a.deleted_at);
  const audioIds = heard.filter((a) => a!.type === 'audio').map((a) => a!.id);
  const { data: tracks } = audioIds.length ? await sb.from('audio_tracks').select('asset_id, kind').in('asset_id', audioIds) : { data: [] };
  const trackKind = new Map((tracks ?? []).map((t) => [t.asset_id, t.kind]));
  const checked = heard.map((a) => {
    const meta = (isRecord(a!.meta) ? a!.meta : {}) as AssetMeta;
    return { id: a!.id, name: a!.name, type: a!.type, source: a!.source, licenseId: a!.license_id, hasAudio: meta.hasAudio, role: meta.role ?? roleFromAudioTrackKind(trackKind.get(a!.id)) };
  });
  const licenseIds = [...new Set(checked.map((a) => a.licenseId).filter((v): v is string => !!v))];
  const { data: licenses } = licenseIds.length ? await sb.from('licenses').select('id, commercial_use, expires_at').eq('workspace_id', caller.workspaceId).in('id', licenseIds) : { data: [] };

  return {
    version: row.version,
    durationS: timelineOps.timelineDuration(tl) / tl.fps,
    empty: !tl.tracks.some((t) => t.clips.length),
    emptySlots: timelineOps.emptyPlaceholders(tl).filter((p) => p.kind === 'media').map((p) => p.label),
    missingFiles: missing,
    failedFiles: failed,
    processingFiles: processing,
    licenseIssues: findLicenseIssues(checked, licenses ?? []),
  };
});
