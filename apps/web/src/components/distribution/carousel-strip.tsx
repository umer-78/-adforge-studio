'use client';

import { ChevronLeft, ChevronRight, GalleryHorizontal, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { AssetThumb } from '@/components/app/asset-card';
import { AssetPicker } from '@/components/app/asset-picker';
import { Button } from '@/components/ui/button';
import type { AssetView } from '@/lib/types';

const MAX_FILES = 10;

/** The rest of a carousel after the main file: add up to nine more, put them in order, remove them. */
export function CarouselStrip({ first, files, onChange }: { first: AssetView; files: AssetView[]; onChange: (files: AssetView[]) => void }) {
  const [open, setOpen] = useState(false);
  const all = [first, ...files];
  const room = MAX_FILES - all.length;
  const move = (i: number, by: -1 | 1) => {
    const next = [...files];
    const [item] = next.splice(i, 1);
    next.splice(i + by, 0, item!);
    onChange(next);
  };

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[13px] font-medium">
          <GalleryHorizontal className="size-4" /> Carousel{files.length ? ` · ${all.length} files` : ''}
        </span>
        {files.length > 0 && (
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => onChange([])}>
            Post a single file instead
          </button>
        )}
      </div>
      {files.length === 0 ? (
        <p className="text-xs text-muted-foreground">Add more photos or videos to post them together as one swipeable post on Instagram, Facebook, LinkedIn, X or Pinterest.</p>
      ) : (
        <ol className="flex gap-2 overflow-x-auto pb-1" aria-label="Carousel order">
          {all.map((a, i) => (
            <li key={a.id} className="w-20 shrink-0 space-y-1">
              <div className="relative">
                <AssetThumb asset={a} className="aspect-square w-20 rounded-lg" hoverPlay={false} />
                <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] font-medium tabular-nums text-white">{i + 1}</span>
              </div>
              {i === 0 ? (
                <div className="text-center text-[10px] text-muted-foreground">Main file</div>
              ) : (
                <div className="flex items-center justify-between">
                  <Button size="icon-xs" variant="ghost" aria-label={`Move file ${i + 1} earlier`} disabled={i === 1} onClick={() => move(i - 1, -1)}>
                    <ChevronLeft className="size-3.5" />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label={`Remove file ${i + 1}`} onClick={() => onChange(files.filter((f) => f.id !== a.id))}>
                    <X className="size-3.5" />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label={`Move file ${i + 1} later`} disabled={i === all.length - 1} onClick={() => move(i - 1, 1)}>
                    <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {room > 0 && (
        <Button size="xs" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" /> {files.length ? 'Add more' : 'Make it a carousel'}
        </Button>
      )}
      <AssetPicker
        open={open}
        onOpenChange={setOpen}
        types={['image', 'video']}
        multiple
        max={room}
        title="Add to the carousel"
        description="Photos work on every network that takes carousels; Instagram also takes videos up to 60 seconds."
        onPick={(picked) => onChange([...files, ...picked.filter((p) => p.id !== first.id && !files.some((f) => f.id === p.id))].slice(0, MAX_FILES - 1))}
      />
    </div>
  );
}
