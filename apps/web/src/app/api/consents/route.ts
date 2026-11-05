import { CONSENT_KINDS, consentCreateSchema, consentStatement } from '@adforge/core';
import * as z from 'zod';
import { check, clientIp, logActivity, owned, route } from '@/lib/server/api';

export const GET = route({ query: z.object({ kind: z.enum(CONSENT_KINDS).optional(), active: z.enum(['1', '0']).optional() }) }, async ({ sb, caller, query }) => {
  let req = sb.from('consents').select('id, kind, subject_name, is_self, statement, evidence_asset_id, accepted_at, revoked_at').eq('workspace_id', caller.workspaceId).order('accepted_at', { ascending: false });
  if (query.kind) req = req.eq('kind', query.kind);
  if (query.active !== '0') req = req.is('revoked_at', null);
  const rows = check(await req, 'Could not load consents');
  return {
    items: rows.map((r) => ({ id: r.id, kind: r.kind, subjectName: r.subject_name, isSelf: r.is_self, statement: r.statement, evidenceAssetId: r.evidence_asset_id, acceptedAt: r.accepted_at, revokedAt: r.revoked_at })),
  };
});

/** Records who agreed to what, when and from where. */
export const POST = route({ body: consentCreateSchema, limit: ['consents', 30, 3600] }, async ({ sb, caller, body, req }) => {
  if (body.evidenceAssetId) await owned(sb, 'assets', body.evidenceAssetId, caller, 'Evidence file');
  const row = check(
    await sb
      .from('consents')
      .insert({
        workspace_id: caller.workspaceId,
        kind: body.kind,
        subject_name: body.subjectName,
        is_self: body.isSelf,
        statement: consentStatement(body.kind, body.subjectName, body.isSelf),
        evidence_asset_id: body.evidenceAssetId ?? null,
        accepted_by: caller.userId,
        ip_address: ipOrNull(clientIp(req)),
        user_agent: req.headers.get('user-agent')?.slice(0, 400) ?? null,
      })
      .select('id, kind, subject_name, is_self, statement, accepted_at')
      .single(),
    'Could not save the consent',
  );
  await logActivity(sb, caller, 'consent.accepted', 'consent', row.id, { kind: row.kind, subject: row.subject_name });
  return { id: row.id, kind: row.kind, subjectName: row.subject_name, isSelf: row.is_self, statement: row.statement, acceptedAt: row.accepted_at, revokedAt: null, evidenceAssetId: body.evidenceAssetId ?? null };
});

const ipOrNull = (ip: string) => (/^[0-9a-f:.]{3,45}$/i.test(ip) ? ip : null);
