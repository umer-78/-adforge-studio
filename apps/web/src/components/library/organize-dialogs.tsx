'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { api, errorMessage } from '@/lib/api-client';
import { useFolders, useProjects, useTags } from './use-library';

export function useBulk(onDone?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { ids: string[]; action: string; projectId?: string | null; folderId?: string | null; tags?: string[] }) => api.post<{ updated: number }>('/assets/bulk', body),
    onSuccess: () => {
      for (const k of ['assets', 'asset', 'stats', 'tags']) void qc.invalidateQueries({ queryKey: [k] });
      onDone?.();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function MoveDialog({ ids, open, onOpenChange, onDone }: { ids: string[]; open: boolean; onOpenChange: (v: boolean) => void; onDone?: () => void }) {
  const projects = useProjects();
  const folders = useFolders();
  const [projectId, setProjectId] = useState('none');
  const [folderId, setFolderId] = useState('none');
  const bulk = useBulk(() => {
    toast.success(`Moved ${ids.length} file${ids.length === 1 ? '' : 's'}`);
    onOpenChange(false);
    onDone?.();
  });
  const folderOptions = (folders.data ?? []).filter((f) => projectId === 'none' || !f.project_id || f.project_id === projectId);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move {ids.length} file{ids.length === 1 ? '' : 's'}</DialogTitle>
          <DialogDescription>Pick a project, a folder, or both.</DialogDescription>
        </DialogHeader>
        <Field label="Project">
          <Select value={projectId} onValueChange={setProjectId} options={[{ value: 'none', label: 'No project' }, ...(projects.data ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
        </Field>
        <Field label="Folder">
          <Select value={folderId} onValueChange={setFolderId} options={[{ value: 'none', label: 'No folder' }, ...folderOptions.map((f) => ({ value: f.id, label: f.name }))]} />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="brand" loading={bulk.isPending} onClick={() => bulk.mutate({ ids, action: 'move', projectId: projectId === 'none' ? null : projectId, folderId: folderId === 'none' ? null : folderId })}>
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TagDialog({ ids, open, onOpenChange, onDone }: { ids: string[]; open: boolean; onOpenChange: (v: boolean) => void; onDone?: () => void }) {
  const tags = useTags();
  const [draft, setDraft] = useState('');
  const [list, setList] = useState<string[]>([]);
  const add = (t: string) => {
    const v = t.trim().toLowerCase().slice(0, 60);
    if (v && !list.includes(v)) setList([...list, v]);
    setDraft('');
  };
  const done = () => {
    onOpenChange(false);
    setList([]);
    onDone?.();
  };
  const bulk = useBulk(done);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tags for {ids.length} file{ids.length === 1 ? '' : 's'}</DialogTitle>
          <DialogDescription>Type a tag and press Enter.</DialogDescription>
        </DialogHeader>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add(draft);
            }
          }}
          placeholder="summer-sale"
          autoFocus
        />
        <div className="flex flex-wrap gap-1.5">
          {list.map((t) => (
            <span key={t} className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
              {t}
              <button type="button" aria-label={`Remove ${t}`} onClick={() => setList(list.filter((x) => x !== t))}>
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
        {!!tags.data?.length && (
          <div className="flex flex-wrap gap-1">
            {tags.data.slice(0, 24).map((t) => (
              <button key={t.tag} type="button" onClick={() => add(t.tag)} className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">
                {t.tag}
              </button>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={!list.length} loading={bulk.isPending && bulk.variables?.action === 'untag'} onClick={() => bulk.mutate({ ids, action: 'untag', tags: list })}>
            Remove tags
          </Button>
          <Button variant="brand" disabled={!list.length} loading={bulk.isPending && bulk.variables?.action === 'tag'} onClick={() => bulk.mutate({ ids, action: 'tag', tags: list })}>
            Add tags
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NameDialog({ open, onOpenChange, title, label, initial = '', onSave, pending }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; label: string; initial?: string; onSave: (name: string) => void; pending?: boolean }) {
  const [name, setName] = useState(initial);
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v) setName(initial);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onSave(name.trim());
          }}
          className="space-y-4"
        >
          <Field label={label}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={120} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="brand" loading={pending} disabled={!name.trim()}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
