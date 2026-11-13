'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Clapperboard, Ellipsis, Folder, FolderPlus, HardDrive, Library, Mic, Plus, Sparkles, Star, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatBytes } from '@adforge/core';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { api, errorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { NameDialog } from './organize-dialogs';
import { useFolders, useProjects, useStats, type FolderRow, type ProjectRow } from './use-library';

export interface LibraryFilter {
  projectId?: string;
  folderId?: string;
  favorite?: boolean;
  source?: string;
}

const SMART: { key: string; label: string; icon: typeof Star; filter: LibraryFilter }[] = [
  { key: 'all', label: 'All files', icon: Library, filter: {} },
  { key: 'favorite', label: 'Favorites', icon: Star, filter: { favorite: true } },
  { key: 'generated', label: 'AI generated', icon: Sparkles, filter: { source: 'generated' } },
  { key: 'render', label: 'Exports', icon: Clapperboard, filter: { source: 'render' } },
  { key: 'recording', label: 'Recordings', icon: Mic, filter: { source: 'recording' } },
];

export function LibrarySidebar({ value, onChange }: { value: LibraryFilter; onChange: (f: LibraryFilter) => void }) {
  const qc = useQueryClient();
  const projects = useProjects();
  const folders = useFolders();
  const stats = useStats();
  const [dialog, setDialog] = useState<{ kind: 'project' | 'folder' | 'rename-project' | 'rename-folder'; id?: string; name?: string } | null>(null);
  const save = useMutation({
    mutationFn: async (name: string) => {
      if (!dialog) return;
      if (dialog.kind === 'project') return api.post<ProjectRow>('/projects', { name });
      if (dialog.kind === 'folder') return api.post<FolderRow>('/folders', { name, projectId: value.projectId ?? null });
      if (dialog.kind === 'rename-project') return api.patch<ProjectRow>(`/projects/${dialog.id}`, { name });
      return api.patch<FolderRow>(`/folders/${dialog.id}`, { name });
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: [dialog?.kind.includes('project') ? 'projects' : 'folders'] });
      if (dialog?.kind === 'project' && row) onChange({ projectId: row.id });
      setDialog(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (v: { kind: 'project' | 'folder'; id: string }) => (v.kind === 'project' ? api.patch(`/projects/${v.id}`, { archived: true }) : api.delete(`/folders/${v.id}`)),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: [v.kind === 'project' ? 'projects' : 'folders'] });
      void qc.invalidateQueries({ queryKey: ['assets'] });
      onChange({});
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const activeSmart = !value.projectId && !value.folderId ? (value.favorite ? 'favorite' : (value.source ?? 'all')) : null;
  const visibleFolders = (folders.data ?? []).filter((f) => (value.projectId ? f.project_id === value.projectId : !f.project_id));
  const item = (active: boolean) => cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition hover:bg-accent', active ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground');

  return (
    <nav className="space-y-5 text-sm">
      <div className="space-y-0.5">
        {SMART.map((s) => (
          <button key={s.key} type="button" className={item(activeSmart === s.key)} onClick={() => onChange(s.filter)}>
            <s.icon className="size-4" /> {s.label}
          </button>
        ))}
      </div>
      <Section title="Projects" onAdd={() => setDialog({ kind: 'project' })}>
        {(projects.data ?? []).map((p) => (
          <Row key={p.id} active={value.projectId === p.id && !value.folderId} onClick={() => onChange({ projectId: p.id })} color={p.color ?? undefined} label={p.name} onRename={() => setDialog({ kind: 'rename-project', id: p.id, name: p.name })} onRemove={() => remove.mutate({ kind: 'project', id: p.id })} removeLabel="Archive" />
        ))}
        {!projects.data?.length && <p className="px-2.5 text-xs text-muted-foreground">Group a campaign&apos;s files together.</p>}
      </Section>
      <Section title={value.projectId ? 'Folders in project' : 'Folders'} onAdd={() => setDialog({ kind: 'folder' })}>
        {visibleFolders.map((f) => (
          <Row key={f.id} active={value.folderId === f.id} onClick={() => onChange({ projectId: value.projectId, folderId: f.id })} icon={<Folder className="size-4" />} label={f.name} onRename={() => setDialog({ kind: 'rename-folder', id: f.id, name: f.name })} onRemove={() => remove.mutate({ kind: 'folder', id: f.id })} removeLabel="Delete (keeps files)" />
        ))}
      </Section>
      <Link href="/library/trash" className={item(false)}>
        <Trash2 className="size-4" /> Trash {!!stats.data?.trash_count && <span className="ml-auto text-xs tabular-nums">{stats.data.trash_count}</span>}
      </Link>
      {stats.data && (
        <div className="rounded-xl border bg-surface-2 p-3 text-xs">
          <div className="flex items-center gap-2 font-medium">
            <HardDrive className="size-3.5" /> {formatBytes(stats.data.storage_bytes)} stored
          </div>
          <div className="mt-1 text-muted-foreground">
            {stats.data.video_count} videos · {stats.data.image_count} images · {stats.data.audio_count} audio
          </div>
        </div>
      )}
      <NameDialog
        open={!!dialog}
        onOpenChange={(v) => !v && setDialog(null)}
        title={dialog?.kind === 'project' ? 'New project' : dialog?.kind === 'folder' ? 'New folder' : 'Rename'}
        label="Name"
        initial={dialog?.name ?? ''}
        pending={save.isPending}
        onSave={(n) => save.mutate(n)}
      />
    </nav>
  );
}

function Section({ title, onAdd, children }: { title: string; onAdd: () => void; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between px-2.5 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
        <Button size="icon-xs" variant="ghost" aria-label={`Add to ${title}`} onClick={onAdd}>
          {title.startsWith('Folders') ? <FolderPlus className="size-3.5" /> : <Plus className="size-3.5" />}
        </Button>
      </div>
      {children}
    </div>
  );
}

function Row({ active, onClick, label, color, icon, onRename, onRemove, removeLabel }: { active: boolean; onClick: () => void; label: string; color?: string; icon?: React.ReactNode; onRename: () => void; onRemove: () => void; removeLabel: string }) {
  return (
    <div className={cn('group flex items-center rounded-lg transition hover:bg-accent', active && 'bg-accent')}>
      <button type="button" onClick={onClick} className={cn('flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left text-[13px]', active ? 'font-medium text-foreground' : 'text-muted-foreground')}>
        {icon ?? <span className="size-2.5 shrink-0 rounded-full" style={{ background: color ?? 'var(--primary)' }} />}
        <span className="truncate">{label}</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-xs" variant="ghost" className="mr-1 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100" aria-label="Options">
            <Ellipsis className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onRename}>Rename</DropdownMenuItem>
          <DropdownMenuItem destructive onSelect={onRemove}>
            {removeLabel}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
