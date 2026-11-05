'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, Plus, TriangleAlert } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { SettingsSection } from '@/components/settings/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Confirm } from '@/components/ui/confirm';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { EmptyState, Field, Notice, Skeleton } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { api, errorMessage } from '@/lib/api-client';
import { useMe } from '@/lib/hooks/use-me';
import type { ApiKeyView, Page } from '@/lib/types';
import { cn, copyText, timeAgo } from '@/lib/utils';

const SCOPES = [
  { id: 'read', label: 'Read', text: 'See the library, generations, scripts, posts, campaigns and results.' },
  { id: 'write', label: 'Write', text: 'Upload, edit, organize and delete.' },
  { id: 'generate', label: 'Generate', text: 'Start paid AI work: video, images, voice, music, scripts and agent runs. Budget limits still apply.' },
  { id: 'publish', label: 'Publish', text: 'Post and schedule to connected social accounts.' },
  { id: 'ads', label: 'Ads', text: 'Create and change ad campaigns. New ads are always created paused.' },
] as const;
type ScopeId = (typeof SCOPES)[number]['id'];

const EXPIRY = [
  { value: 'never', label: 'Never' },
  { value: '30', label: 'In 30 days' },
  { value: '90', label: 'In 90 days' },
  { value: '365', label: 'In a year' },
];

const STATUS_VARIANT = { active: 'success', expired: 'warning', revoked: 'outline' } as const;

const noopSubscribe = () => () => {};
function useOrigin() {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => process.env.NEXT_PUBLIC_APP_URL ?? '',
  );
}

export function ApiKeysView() {
  const me = useMe();
  const keys = useQuery({ queryKey: ['api-keys'], queryFn: () => api.get<Page<ApiKeyView>>('/api-keys').then((r) => r.items) });
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const canCreate = me.data?.workspace.role !== 'viewer';
  const items = keys.data ?? [];
  const active = items.filter((k) => k.status === 'active');
  const past = items.filter((k) => k.status !== 'active');

  return (
    <div className="space-y-6">
      <SettingsSection
        title="API keys"
        description="For scripts, automations and AI assistants. A key acts as you, with your role, limited to the scopes you pick. It is shown once; only a hash is stored."
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus /> New key
            </Button>
          ) : undefined
        }
      >
        {keys.isLoading ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : keys.isError ? (
          <Notice tone="error">Could not load keys. {errorMessage(keys.error)}</Notice>
        ) : active.length || past.length ? (
          <ul className="divide-y rounded-xl border">
            {[...active, ...past].map((k) => (
              <KeyRow key={k.id} k={k} />
            ))}
          </ul>
        ) : (
          <EmptyState icon={<KeyRound />} title="No API keys yet" description="Create one to call the API or connect an AI assistant over MCP." />
        )}
      </SettingsSection>
      <McpSection />
      <RestSection />
      <CreateKeyDialog open={creating} onOpenChange={setCreating} onCreated={setCreated} />
      <ShowKeyDialog keyValue={created} onClose={() => setCreated(null)} />
    </div>
  );
}

function KeyRow({ k }: { k: ApiKeyView }) {
  const qc = useQueryClient();
  return (
    <li className={cn('flex flex-wrap items-center gap-3 p-3', k.status !== 'active' && 'opacity-70')}>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{k.name}</span>
          <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{k.prefix}…</code>
          {!k.mine && <Badge variant="outline">Someone else&apos;s</Badge>}
        </div>
        <div className="flex flex-wrap gap-1">
          {k.scopes.map((s) => (
            <Badge key={s} variant="secondary">
              {s}
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Created {timeAgo(k.createdAt)} · {k.lastUsedAt ? `last used ${timeAgo(k.lastUsedAt)}` : 'never used'}
          {k.status === 'active' && k.expiresAt && ` · expires ${timeAgo(k.expiresAt)}`}
          {k.status === 'revoked' && k.revokedAt && ` · revoked ${timeAgo(k.revokedAt)}`}
        </p>
      </div>
      <Badge variant={STATUS_VARIANT[k.status]}>{k.status === 'active' ? 'Active' : k.status === 'expired' ? 'Expired' : 'Revoked'}</Badge>
      {k.status === 'active' && (
        <Confirm
          title={`Revoke “${k.name}”?`}
          description="Anything using this key stops working on its next request. This cannot be undone."
          confirmLabel="Revoke key"
          destructive
          onConfirm={async () => {
            try {
              await api.delete(`/api-keys/${k.id}`);
              void qc.invalidateQueries({ queryKey: ['api-keys'] });
              toast.success('Key revoked');
            } catch (e) {
              toast.error(errorMessage(e));
            }
          }}
        >
          <Button size="xs" variant="ghost" className="text-muted-foreground hover:text-destructive">
            Revoke
          </Button>
        </Confirm>
      )}
    </li>
  );
}

function CreateKeyDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (key: string) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ScopeId[]>(['read', 'write']);
  const [expiry, setExpiry] = useState('90');
  const reset = () => {
    setName('');
    setScopes(['read', 'write']);
    setExpiry('90');
  };
  const create = useMutation({
    mutationFn: () => api.post<{ key: string; apiKey: ApiKeyView }>('/api-keys', { name: name.trim(), scopes, ...(expiry !== 'never' ? { expiresInDays: Number(expiry) } : {}) }),
    onSuccess: ({ key }) => {
      void qc.invalidateQueries({ queryKey: ['api-keys'] });
      onOpenChange(false);
      reset();
      onCreated(key);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const toggle = (id: ScopeId, on: boolean) => setScopes((s) => (on ? [...new Set([...s, id])] : s.filter((x) => x !== id)));
  return (
    <Dialog open={open} onOpenChange={(v) => (onOpenChange(v), v || reset())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New API key</DialogTitle>
          <DialogDescription>Give it only the scopes it needs. You can revoke it any time.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && scopes.length) create.mutate();
          }}
        >
          <Field label="Name" hint="Where it is used, e.g. “Claude Code” or “Zapier”.">
            <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-[13px] font-medium">Scopes</legend>
            {SCOPES.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-2.5 transition hover:bg-accent/50">
                <Checkbox checked={scopes.includes(s.id)} onCheckedChange={(v) => toggle(s.id, v === true)} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{s.label}</span>
                  <span className="block text-xs text-muted-foreground">{s.text}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <Field label="Expires">
            <Select value={expiry} onValueChange={setExpiry} options={EXPIRY} className="sm:max-w-48" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || !scopes.length} loading={create.isPending}>
              Create key
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ShowKeyDialog({ keyValue, onClose }: { keyValue: string | null; onClose: () => void }) {
  return (
    <Dialog open={!!keyValue} onOpenChange={(v) => !v && onClose()}>
      <DialogContent hideClose>
        <DialogHeader>
          <DialogTitle>Copy your new key</DialogTitle>
          <DialogDescription>This is the only time it is shown. Store it somewhere safe, like a password manager or your tool&apos;s secret settings.</DialogDescription>
        </DialogHeader>
        {keyValue && <CodeBlock code={keyValue} label="API key" />}
        <Notice tone="warning">
          <span className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" /> Anyone with this key can act as you within its scopes. Never paste it into a public place.
          </span>
        </Notice>
        <DialogFooter>
          <Button onClick={onClose}>I saved it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative">
      <pre className="overflow-x-auto rounded-lg border bg-surface-2 p-3 pr-12 font-mono text-xs leading-relaxed whitespace-pre">{code}</pre>
      <Button
        size="icon-xs"
        variant="ghost"
        className="absolute top-2 right-2"
        aria-label={`Copy ${label}`}
        onClick={async () => {
          if (await copyText(code)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } else toast.error('Could not copy. Select the text and copy it instead.');
        }}
      >
        {copied ? <Check className="text-success" /> : <Copy />}
      </Button>
    </div>
  );
}

function McpSection() {
  const origin = useOrigin();
  const url = `${origin}/api/mcp`;
  const cli = `claude mcp add --transport http adforge ${url} \\\n  --header "Authorization: Bearer afk_YOUR_KEY"`;
  const json = JSON.stringify({ mcpServers: { adforge: { type: 'http', url, headers: { Authorization: 'Bearer afk_YOUR_KEY' } } } }, null, 2);
  return (
    <SettingsSection
      title="Connect an AI assistant (MCP)"
      description="Let Claude or another MCP client search your library, write scripts, price and start generations, run the agent and schedule posts. Paid steps show the price first, and budgets apply."
    >
      <ol className="list-decimal space-y-4 pl-5 text-sm marker:text-muted-foreground">
        <li className="space-y-2">
          <p>Create a key above with the scopes the assistant needs (Read and Generate cover most uses).</p>
        </li>
        <li className="space-y-2">
          <p>In Claude Code, run:</p>
          <CodeBlock code={cli} label="command" />
        </li>
        <li className="space-y-2">
          <p>
            Or add this to the MCP settings of another client (it uses the streamable HTTP transport at <code className="font-mono text-xs">{url}</code>):
          </p>
          <CodeBlock code={json} label="config" />
        </li>
      </ol>
    </SettingsSection>
  );
}

function RestSection() {
  const origin = useOrigin();
  const curl = `curl ${origin}/api/v1/assets?limit=5 \\\n  -H "Authorization: Bearer afk_YOUR_KEY"`;
  return (
    <SettingsSection title="REST API" description="Every action in the app is also an HTTP endpoint. Send the key as a bearer token; responses are JSON.">
      <CodeBlock code={curl} label="example" />
      <p className="text-xs text-muted-foreground">
        A key works only in the workspace it was created in. Keys are limited to 240 requests a minute, on top of each endpoint&apos;s own limits.
      </p>
    </SettingsSection>
  );
}
