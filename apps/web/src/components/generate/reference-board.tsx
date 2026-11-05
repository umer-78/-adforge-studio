'use client';

import { AudioLines, Film, ImagePlus, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { AssetType } from '@adforge/core';
import { AssetPicker } from '@/components/app/asset-picker';
import { AssetThumb } from '@/components/app/asset-card';
import { Tip } from '@/components/ui/tooltip';
import type { AssetView } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Reference files a prompt can point at: @image1…, @audio1…, @video1.
 * Click a tile to drop its token into the prompt.
 */
export function ReferenceBoard({
  maxImages,
  maxAudios = 0,
  allowVideo = false,
  images,
  audios = [],
  video = null,
  onImages,
  onAudios,
  onVideo,
  onInsert,
}: {
  maxImages: number;
  maxAudios?: number;
  allowVideo?: boolean;
  images: AssetView[];
  audios?: AssetView[];
  video?: AssetView | null;
  onImages: (a: AssetView[]) => void;
  onAudios?: (a: AssetView[]) => void;
  onVideo?: (a: AssetView | null) => void;
  onInsert?: (token: string) => void;
}) {
  const [picker, setPicker] = useState<AssetType | null>(null);
  if (maxImages <= 0 && maxAudios <= 0 && !allowVideo) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium">References</span>
        <span className="text-[11px] text-muted-foreground">Click a tile to add its token to the prompt</span>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {images.map((a, i) => (
          <Tile key={a.id} token={`@image${i + 1}`} onInsert={onInsert} onRemove={() => onImages(images.filter((x) => x.id !== a.id))}>
            <AssetThumb asset={a} className="size-full" hoverPlay={false} />
          </Tile>
        ))}
        {images.length < maxImages && <AddTile icon={<ImagePlus />} label={`Image ${images.length + 1}/${maxImages}`} onClick={() => setPicker('image')} />}
        {audios.map((a, i) => (
          <Tile key={a.id} token={`@audio${i + 1}`} onInsert={onInsert} onRemove={() => onAudios?.(audios.filter((x) => x.id !== a.id))}>
            <div className="flex size-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-primary/20 to-brand-to/10 p-1 text-center">
              <AudioLines className="size-5 text-primary" />
              <span className="line-clamp-2 text-[10px] leading-tight text-muted-foreground">{a.name}</span>
            </div>
          </Tile>
        ))}
        {maxAudios > 0 && audios.length < maxAudios && <AddTile icon={<AudioLines />} label={`Audio ${audios.length + 1}/${maxAudios}`} onClick={() => setPicker('audio')} />}
        {allowVideo &&
          (video ? (
            <Tile token="@video1" onInsert={onInsert} onRemove={() => onVideo?.(null)}>
              <AssetThumb asset={video} className="size-full" />
            </Tile>
          ) : (
            <AddTile icon={<Film />} label="Video" onClick={() => setPicker('video')} />
          ))}
      </div>
      <AssetPicker
        open={picker === 'image'}
        onOpenChange={(v) => !v && setPicker(null)}
        types={['image']}
        multiple
        max={maxImages}
        initial={images}
        title="Reference images"
        description="Products, people, places or styles the result should follow."
        onPick={(a) => onImages(a.slice(0, maxImages))}
      />
      <AssetPicker open={picker === 'audio'} onOpenChange={(v) => !v && setPicker(null)} types={['audio']} multiple max={maxAudios} initial={audios} title="Reference audio" description="A voice, beat or sound to follow." onPick={(a) => onAudios?.(a.slice(0, maxAudios))} />
      <AssetPicker open={picker === 'video'} onOpenChange={(v) => !v && setPicker(null)} types={['video']} title="Reference video" description="Motion or camera work to follow." onPick={(a) => onVideo?.(a[0] ?? null)} />
    </div>
  );
}

function Tile({ token, children, onInsert, onRemove }: { token: string; children: ReactNode; onInsert?: (t: string) => void; onRemove: () => void }) {
  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg border">
      <Tip content={`Insert ${token}`}>
        <button type="button" className="block size-full" onClick={() => onInsert?.(token)} aria-label={`Insert ${token}`}>
          {children}
        </button>
      </Tip>
      <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/65 px-1 font-mono text-[10px] text-white">{token}</span>
      <button type="button" onClick={onRemove} aria-label="Remove" className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/65 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100">
        <X className="size-3" />
      </button>
    </div>
  );
}

function AddTile({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground transition hover:border-primary/60 hover:bg-primary/5 hover:text-foreground [&_svg]:size-4')}>
      {icon}
      <span className="text-[10px]">{label}</span>
    </button>
  );
}
