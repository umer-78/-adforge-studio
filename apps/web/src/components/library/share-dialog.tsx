'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Link2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api-client';
import { copyText, timeAgo } from '@/lib/utils';

interface ShareView {
  id: string;
  url: string;
  expiresAt: string | null;
  allowDownload: boolean;
  hasPassword: boolean;
  viewCount: number;
  createdAt: string;
}

/** Create and manage public links to one file or a whole project. */
export function ShareDialog({ open, onOpenChange, assetId, projectId, name }: { open: boolean; onOpenChange: (v: boolean) => void; assetId?: string; projectId?: string; name: string }) {
  const qc = useQueryClient();
  const key = ['shares', assetId ?? projectId];
  const [expires, setExpires] = useState('7');
  const [password, setPassword] = useState('');
  const [allowDownload, setAllowDownload] = useState(false);
  const list = useQuery({ queryKey: key, queryFn: () => api.get<{ items: ShareView[] }>(`/shares?${assetId ? `assetId=${assetId}` : `projectId=${projectId}`}`).then((r) => r.items), enabled: open });
  const create = useMutation({
    mutationFn: () => api.post<ShareView>('/shares', { ...(assetId ? { assetId } : { projectId }), expiresInDays: expires === 'never' ? null : Number(expires), password: password || null, allowDownload }),
    onSuccess: async (s) => {
      setPassword('');
      void qc.invalidateQueries({ queryKey: key });
      await copyText(s.url);
      toast.success('Link created and copied');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/shares/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share “{name}”</DialogTitle>
          <DialogDescription>Anyone with the link can view it, no account needed.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Expires">
            <Select value={expires} onValueChange={setExpires} options={[{ value: '1', label: 'In 1 day' }, { value: '7', label: 'In 7 days' }, { value: '30', label: 'In 30 days' }, { value: 'never', label: 'Never' }]} />
          </Field>
          <Field label="Password (optional)">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 4 characters" autoComplete="new-password" />
          </Field>
        </div>
        <label className="flex items-center justify-between text-sm">
          Allow downloading the original
          <Switch checked={allowDownload} onCheckedChange={setAllowDownload} />
        </label>
        <Button variant="brand" loading={create.isPending} disabled={!!password && password.length < 4} onClick={() => create.mutate()}>
          <Link2 className="size-4" /> Create link
        </Button>
        {!!list.data?.length && (
          <div className="space-y-2 border-t pt-3">
            <div className="text-xs font-medium text-muted-foreground">Active links</div>
            {list.data.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-lg border p-2 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono">{s.url}</div>
                  <div className="text-muted-foreground">
                    {s.viewCount} views · {s.expiresAt ? `expires ${timeAgo(s.expiresAt)}` : 'no expiry'}
                    {s.hasPassword && ' · password'}
                    {s.allowDownload && ' · download'}
                  </div>
                </div>
                <Button size="icon-xs" variant="ghost" aria-label="Copy" onClick={() => void copyText(s.url).then(() => toast.success('Copied'))}>
                  <Copy className="size-3.5" />
                </Button>
                <Button size="icon-xs" variant="ghost" aria-label="Revoke" onClick={() => revoke.mutate(s.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
