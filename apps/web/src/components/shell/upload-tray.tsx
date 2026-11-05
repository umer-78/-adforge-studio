'use client';

import { motion, AnimatePresence } from 'motion/react';
import { CircleAlert, CircleCheck, CloudUpload, X } from 'lucide-react';
import { formatBytes } from '@adforge/core';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/misc';
import { cancelUpload, useUploads } from '@/lib/upload';

/** Floating progress panel for direct-to-storage uploads. */
export function UploadTray() {
  const items = useUploads((s) => s.items);
  const clear = useUploads((s) => s.clearFinished);
  const busy = items.filter((i) => i.status === 'queued' || i.status === 'uploading' || i.status === 'finishing');
  return (
    <AnimatePresence>
      {items.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="fixed right-4 bottom-4 z-40 w-[22rem] overflow-hidden rounded-2xl border bg-popover shadow-2xl"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CloudUpload className="size-4 text-primary" />
              {busy.length ? `Uploading ${busy.length} file${busy.length === 1 ? '' : 's'}` : 'Uploads finished'}
            </div>
            {!busy.length && (
              <Button size="icon-xs" variant="ghost" onClick={clear} aria-label="Close">
                <X />
              </Button>
            )}
          </div>
          <div className="max-h-72 space-y-3 overflow-y-auto p-4 scrollbar-thin">
            {items.map((i) => (
              <div key={i.id} className="space-y-1.5">
                <div className="flex items-center gap-2 text-[13px]">
                  {i.status === 'done' ? <CircleCheck className="size-4 shrink-0 text-success" /> : i.status === 'error' ? <CircleAlert className="size-4 shrink-0 text-destructive" /> : null}
                  <span className="min-w-0 flex-1 truncate">{i.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{i.status === 'finishing' ? 'Verifying…' : i.status === 'done' ? 'Processing' : i.status === 'canceled' ? 'Canceled' : `${Math.round(i.progress * 100)}% · ${formatBytes(i.size)}`}</span>
                  {(i.status === 'uploading' || i.status === 'queued') && (
                    <button className="text-muted-foreground hover:text-foreground" onClick={() => cancelUpload(i.id)} aria-label={`Cancel ${i.name}`}>
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
                {i.status === 'error' ? <p className="text-xs text-destructive">{i.error}</p> : i.status !== 'done' && i.status !== 'canceled' && <Progress value={i.progress * 100} />}
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
