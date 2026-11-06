'use client';

import { PACK_ASPECTS, PACK_SIZES, type PackAspect, type SizeMode } from '@adforge/core';
import { useMutation } from '@tanstack/react-query';
import { Check, Download, Frame } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { api, errorMessage } from '@/lib/api-client';
import type { DownloadLink, SizeSlot } from '@/lib/types';
import { cn } from '@/lib/utils';
import { saveAsZip } from '@/lib/zip-download';

const MODES = [
  { value: 'smart', label: 'Smart crop', hint: 'Follows the subject and fills the frame' },
  { value: 'fit', label: 'Fit with blurred fill', hint: 'Keeps the whole picture, text included' },
];

const PLACEMENT: Record<PackAspect, string> = { '9:16': 'Stories, Reels, TikTok', '1:1': 'Square feed', '4:5': 'Portrait feed', '16:9': 'YouTube, landscape', '2:3': 'Pinterest pins', '1.91:1': 'Link posts, LinkedIn' };

function Shape({ aspect, filled }: { aspect: PackAspect; filled: boolean }) {
  const s = PACK_SIZES[aspect];
  const k = 34 / Math.max(s.width, s.height);
  return <span className={cn('block rounded-[3px] border-2', filled ? 'border-primary bg-primary/10' : 'border-dashed border-muted-foreground/40')} style={{ width: Math.round(s.width * k), height: Math.round(s.height * k) }} />;
}

/** Makes a copy of a video or photo for every placement and downloads them together as a ZIP. */
export function SizesCard({ assetId, sizes, onStarted }: { assetId: string; sizes: Partial<Record<PackAspect, SizeSlot>>; onStarted: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<SizeMode>('smart');
  const [progress, setProgress] = useState<number | null>(null);
  const missing = PACK_ASPECTS.filter((a) => !sizes[a]);
  const copies = PACK_ASPECTS.filter((a) => sizes[a] && !sizes[a]!.original);
  const ready = PACK_ASPECTS.filter((a) => sizes[a]);

  const make = useMutation({
    mutationFn: (aspects: PackAspect[]) => api.post(`/assets/${assetId}/actions`, { action: 'sizes', aspects, mode }),
    onSuccess: (_d, aspects) => {
      toast.success(aspects.length > 1 ? `Making ${aspects.length} sizes. You can follow it in the jobs tray.` : `Making the ${aspects[0]} copy. You can follow it in the jobs tray.`);
      onStarted();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const zip = useMutation({
    mutationFn: async () => {
      setProgress(0);
      const res = await api.get<{ name: string; files: (DownloadLink & { aspect: PackAspect })[] }>(`/assets/${assetId}/sizes`);
      if (!res.files.length) throw new Error('Make the sizes first.');
      await saveAsZip(res.files, `${res.name} - all sizes`, setProgress);
      return res.files.length;
    },
    onSuccess: (n) => toast.success(`Saved ${n} ${n === 1 ? 'file' : 'files'} as a ZIP`),
    onSettled: () => setProgress(null),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-3 rounded-xl border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Frame className="size-4" /> All sizes
      </div>
      <p className="text-xs text-muted-foreground">A copy for every placement, saved to the library and downloadable together as one ZIP.</p>
      <div className="grid grid-cols-3 gap-1.5">
        {PACK_ASPECTS.map((ar) => {
          const slot = sizes[ar];
          const label = PACK_SIZES[ar].label;
          return (
            <button
              key={ar}
              type="button"
              title={`${label} · ${PLACEMENT[ar]}`}
              aria-label={slot ? (slot.original ? `${label}: this file` : `Open the ${label} copy`) : `Make the ${label} copy`}
              disabled={slot?.original || (!slot && make.isPending)}
              onClick={() => (slot ? router.push(`/library/${slot.id}`) : make.mutate([ar]))}
              className={cn('flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-xs transition-colors hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent', slot && 'border-primary/40 bg-primary/5')}
            >
              <span className="flex h-9 items-center">
                <Shape aspect={ar} filled={!!slot} />
              </span>
              <span className="font-medium tabular-nums">{ar}</span>
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                {slot ? (
                  slot.original ? (
                    'This file'
                  ) : (
                    <>
                      <Check className="size-3" /> {slot.mode === 'fit' ? 'Fit' : 'Ready'}
                    </>
                  )
                ) : (
                  'Make'
                )}
              </span>
            </button>
          );
        })}
      </div>
      <Select aria-label="How to fill each shape" value={mode} onValueChange={(v) => setMode(v as SizeMode)} options={MODES} size="sm" />
      <div className="flex flex-wrap gap-2">
        {missing.length > 0 ? (
          <Button size="sm" loading={make.isPending} onClick={() => make.mutate(missing)}>
            {missing.length === PACK_ASPECTS.length ? `Make all ${PACK_ASPECTS.length} sizes` : `Make the ${missing.length} missing`}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" loading={make.isPending} onClick={() => make.mutate(copies)} disabled={!copies.length}>
            Make again in this style
          </Button>
        )}
        <Button size="sm" variant="outline" loading={zip.isPending} disabled={!ready.length} onClick={() => zip.mutate()}>
          <Download className="size-4" /> Download ZIP
        </Button>
      </div>
      {progress !== null && <Progress value={progress * 100} />}
    </div>
  );
}
