'use client';

import { AudioLines, Box, CircleAlert, FileVideo, Image as ImageIcon, Sparkles, Star } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { formatDuration } from '@adforge/core';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import type { AssetView } from '@/lib/types';
import { cn } from '@/lib/utils';

export function AssetTypeIcon({ type, className }: { type: string; className?: string }) {
  const Icon = type === 'video' ? FileVideo : type === 'image' ? ImageIcon : type === 'audio' ? AudioLines : Box;
  return <Icon className={cn('size-4', className)} />;
}

/** Visual preview of an asset: thumbnail, hover-to-play preview for videos, waveform tile for audio. */
export function AssetThumb({ asset, className, hoverPlay = true, fit = 'cover' }: { asset: AssetView; className?: string; hoverPlay?: boolean; fit?: 'cover' | 'contain' }) {
  const [hover, setHover] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canPreview = hoverPlay && asset.type === 'video' && !!(asset.previewUrl ?? asset.proxyUrl);
  return (
    <div
      className={cn('relative overflow-hidden bg-surface-2', className)}
      onMouseEnter={() => {
        setHover(true);
        void videoRef.current?.play().catch(() => undefined);
      }}
      onMouseLeave={() => {
        setHover(false);
        videoRef.current?.pause();
      }}
    >
      {asset.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={asset.thumbnailUrl} alt="" loading="lazy" draggable={false} className={cn('size-full transition-transform duration-500 ease-out-expo', fit === 'cover' ? 'object-cover' : 'object-contain', hover && !canPreview && 'scale-[1.03]')} />
      ) : asset.type === 'audio' ? (
        <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary/20 via-surface-2 to-brand-to/20">
          <div className="flex h-10 items-end gap-[3px]">
            {Array.from({ length: 18 }, (_, i) => (
              <span key={i} className="w-[3px] rounded-full bg-primary/70" style={{ height: `${20 + Math.abs(Math.sin(i * 1.7 + asset.name.length)) * 80}%` }} />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground">
          <AssetTypeIcon type={asset.type} className="size-7" />
        </div>
      )}
      {canPreview && (
        <video ref={videoRef} src={asset.previewUrl ?? asset.proxyUrl ?? undefined} muted loop playsInline preload="none" className={cn('absolute inset-0 size-full object-cover transition-opacity duration-300', hover ? 'opacity-100' : 'opacity-0')} />
      )}
      {asset.status !== 'ready' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-xs text-white backdrop-blur-[2px]">
          {asset.status === 'failed' ? <CircleAlert className="size-5 text-destructive" /> : <Spinner className="size-5" />}
          <span>{asset.status === 'failed' ? 'Processing failed' : asset.status === 'uploading' ? 'Uploading…' : 'Processing…'}</span>
        </div>
      )}
    </div>
  );
}

export function AssetCard({ asset, selected, onSelect, onOpen, actions, aspect = 'aspect-video', footer }: {
  asset: AssetView;
  selected?: boolean;
  onSelect?: (v: boolean) => void;
  onOpen?: () => void;
  actions?: ReactNode;
  aspect?: string;
  footer?: ReactNode;
}) {
  return (
    <div className={cn('group relative overflow-hidden rounded-xl border bg-card transition-all duration-300 ease-out-expo hover:-translate-y-0.5 hover:border-input hover:shadow-[0_16px_40px_-20px_var(--glow)]', selected && 'border-primary ring-2 ring-primary/30')}>
      <button type="button" className="block w-full text-left" onClick={onOpen} aria-label={`Open ${asset.name}`}>
        <AssetThumb asset={asset} className={aspect} />
      </button>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2">
        <div className="flex gap-1">
          {asset.isAiGenerated && (
            <span className="flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
              <Sparkles className="size-3" /> AI
            </span>
          )}
          {asset.score && <span className="rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur tabular-nums">{Math.round(asset.score.overall)}</span>}
        </div>
        {asset.durationS != null && <span className="rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums backdrop-blur">{formatDuration(asset.durationS)}</span>}
      </div>
      {onSelect && (
        <div className={cn('absolute top-2 left-2 transition-opacity', selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
          <Checkbox checked={selected} onCheckedChange={(v) => onSelect(!!v)} className="size-5 border-white/70 bg-black/40 backdrop-blur" aria-label="Select" />
        </div>
      )}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <AssetTypeIcon type={asset.type} className="shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium" title={asset.name}>
            {asset.name}
          </div>
          {footer}
        </div>
        {asset.isFavorite && <Star className="size-3.5 shrink-0 fill-warning text-warning" />}
        {actions}
      </div>
    </div>
  );
}
