'use client';

import { useQuery } from '@tanstack/react-query';
import { Clapperboard, FileVideo, Image as ImageIcon, Moon, Music, Plus, Sparkles, Sun, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/misc';
import { api } from '@/lib/api-client';
import type { AssetView, Page } from '@/lib/types';
import { ALL_NAV } from './nav';

export function CommandPalette({ open, onOpenChange, onUpload }: { open: boolean; onOpenChange: (v: boolean) => void; onUpload: () => void }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 220);
    return () => clearTimeout(t);
  }, [q]);
  const search = useQuery({
    queryKey: ['assets', 'palette', debounced],
    queryFn: () => api.get<Page<AssetView>>(`/assets?q=${encodeURIComponent(debounced)}&limit=8`),
    enabled: open && debounced.length > 1,
  });
  const go = (href: string) => {
    onOpenChange(false);
    setQ('');
    router.push(href);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="max-w-xl overflow-hidden p-0">
        <DialogTitle className="sr-only">Search and jump</DialogTitle>
        <Command shouldFilter={!debounced || debounced.length < 2 ? true : false} loop>
          <CommandInput placeholder="Search files, jump to a studio, or run an action…" value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>{search.isFetching ? 'Searching…' : 'Nothing found.'}</CommandEmpty>
            {!!search.data?.items.length && (
              <CommandGroup heading="Files">
                {search.data.items.map((a) => (
                  <CommandItem key={a.id} value={`file ${a.name} ${a.id}`} onSelect={() => go(`/library/${a.id}`)}>
                    {a.type === 'video' ? <FileVideo /> : a.type === 'image' ? <ImageIcon /> : <Music />}
                    <span className="truncate">{a.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground capitalize">{a.type}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading="Actions">
              <CommandItem value="upload files" onSelect={() => { onOpenChange(false); onUpload(); }}>
                <Upload /> Upload files
              </CommandItem>
              <CommandItem value="new edit timeline video" onSelect={() => go('/editor?new=1')}>
                <Clapperboard /> New video edit
              </CommandItem>
              <CommandItem value="generate video ai" onSelect={() => go('/generate')}>
                <Sparkles /> Generate a video
              </CommandItem>
              <CommandItem value="url to video product ad" onSelect={() => go('/products')}>
                <Plus /> Make an ad from a product URL
              </CommandItem>
              <CommandItem value="toggle theme dark light" onSelect={() => { setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'); onOpenChange(false); }}>
                {resolvedTheme === 'dark' ? <Sun /> : <Moon />} Switch to {resolvedTheme === 'dark' ? 'light' : 'dark'} theme
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Go to">
              {ALL_NAV.map((n) => (
                <CommandItem key={n.href} value={`go ${n.label} ${n.description}`} onSelect={() => go(n.href)}>
                  <n.icon />
                  <span>{n.label}</span>
                  <span className="ml-auto truncate text-xs text-muted-foreground">{n.description}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          <div className="flex items-center gap-3 border-t px-4 py-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
            <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
            <span className="flex items-center gap-1"><Kbd>esc</Kbd> close</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
