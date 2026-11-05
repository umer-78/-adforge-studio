import 'server-only';
import { isRecord, WATERMARK_POSITIONS, type BrandKitRow } from '@adforge/core';
import type { ServiceClient } from '@adforge/core/server';
import { assetViewMap } from './assets';
import type { BrandKitView } from '@/lib/types';

const HEX = /^#[0-9a-f]{6}$/i;

export function brandPalette(colors: unknown): { name: string; hex: string }[] {
  if (!Array.isArray(colors)) return [];
  return colors
    .map((c, i) => (typeof c === 'string' ? { name: `Colour ${i + 1}`, hex: c } : isRecord(c) ? { name: typeof c.name === 'string' ? c.name : `Colour ${i + 1}`, hex: typeof c.hex === 'string' ? c.hex : '' } : null))
    .filter((c): c is { name: string; hex: string } => !!c && HEX.test(c.hex));
}

export async function toBrandKitViews(sb: ServiceClient, workspaceId: string, rows: BrandKitRow[]): Promise<BrandKitView[]> {
  const assets = await assetViewMap(sb, workspaceId, rows.flatMap((r) => [r.logo_asset_id, r.intro_asset_id, r.outro_asset_id, r.watermark_asset_id]));
  const pick = (id: string | null) => (id ? (assets[id] ?? null) : null);
  return rows.map((r) => {
    const palette = brandPalette(r.colors);
    const fonts = isRecord(r.fonts) ? r.fonts : {};
    const wm = isRecord(r.watermark) ? r.watermark : {};
    const caption = isRecord(r.caption_style) ? r.caption_style : {};
    return {
      id: r.id,
      name: r.name,
      isDefault: r.is_default,
      colors: palette.map((c) => c.hex),
      palette,
      fonts: { display: typeof fonts.display === 'string' ? fonts.display : undefined, body: typeof fonts.body === 'string' ? fonts.body : undefined },
      tone: r.tone,
      logoAssetId: r.logo_asset_id,
      logo: pick(r.logo_asset_id),
      introAssetId: r.intro_asset_id,
      intro: pick(r.intro_asset_id),
      outroAssetId: r.outro_asset_id,
      outro: pick(r.outro_asset_id),
      watermarkAssetId: r.watermark_asset_id,
      watermarkAsset: pick(r.watermark_asset_id),
      watermark: {
        position: (WATERMARK_POSITIONS as readonly string[]).includes(String(wm.position)) ? (wm.position as BrandKitView['watermark']['position']) : 'bottom-right',
        opacity: typeof wm.opacity === 'number' ? wm.opacity : 0.8,
        scale: typeof wm.scale === 'number' ? wm.scale : 0.12,
      },
      captionStyleId: typeof caption.styleId === 'string' ? caption.styleId : null,
      updatedAt: r.updated_at,
    };
  });
}
