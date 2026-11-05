import { isRecord, licenseIssueMessage, type AssetRow, type LicenseIssue } from '@adforge/core';
import type { ServiceClient } from '@adforge/core/server';
import { PermanentError } from './errors';

/** Blocks media whose music or license is not cleared for commercial use (publishing and ads). */
export async function assertLicensed(sb: ServiceClient, asset: AssetRow) {
  const meta = isRecord(asset.meta) ? asset.meta : {};
  const issues = Array.isArray(meta.licenseIssues) ? (meta.licenseIssues as unknown as LicenseIssue[]) : [];
  if (issues.length) throw new PermanentError(licenseIssueMessage(issues), 'license_blocked');
  if (!asset.license_id) return;
  const { data: license } = await sb.from('licenses').select('commercial_use, expires_at').eq('id', asset.license_id).maybeSingle();
  if (license && !license.commercial_use) throw new PermanentError(`“${asset.name}” is licensed for non-commercial use only.`, 'license_blocked');
  if (license?.expires_at && new Date(license.expires_at).getTime() < Date.now()) throw new PermanentError(`The license for “${asset.name}” has expired.`, 'license_blocked');
}
