'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatUsd, parseWorkspaceSettings, type WorkspacePatch } from '@adforge/core';
import { isAdmin, SettingsSection, SwitchRow } from '@/components/settings/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field, Notice, Progress, Skeleton } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { api, errorMessage } from '@/lib/api-client';
import { useMe } from '@/lib/hooks/use-me';
import { supabaseBrowser } from '@/lib/supabase/browser';
import type { Me } from '@/lib/types';

const RETENTION = [7, 14, 30, 60, 90, 180, 365];

export function GeneralSettings() {
  const me = useMe();
  if (me.isLoading) return <Skeleton className="h-[60vh] rounded-2xl" />;
  if (!me.data) return <Notice tone="error">Could not load your settings. {errorMessage(me.error)}</Notice>;
  return (
    <div className="space-y-6">
      <ProfileSection me={me.data} />
      <WorkspaceSection me={me.data} />
      <DeleteAccountSection />
    </div>
  );
}

function useSaveMe() {
  const qc = useQueryClient();
  return (data: Me) => {
    qc.setQueryData(['me'], data);
  };
}

function ProfileSection({ me }: { me: Me }) {
  const setMe = useSaveMe();
  const [name, setName] = useState<string | null>(null);
  const value = name ?? me.user.name ?? '';
  const save = useMutation({
    mutationFn: () => api.patch<Me>('/me', { fullName: value.trim() || null }),
    onSuccess: (data) => {
      setMe(data);
      setName(null);
      toast.success('Profile saved');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const dirty = name != null && name.trim() !== (me.user.name ?? '');
  return (
    <SettingsSection
      title="Profile"
      description="How you appear in activity and on shared review links."
      footer={
        <Button size="sm" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
          Save profile
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="profile-name">
          <Input id="profile-name" value={value} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
        </Field>
        <Field label="Email" hint="The address you sign in with.">
          <Input value={me.user.email ?? ''} readOnly disabled />
        </Field>
      </div>
    </SettingsSection>
  );
}

function WorkspaceSection({ me }: { me: Me }) {
  const setMe = useSaveMe();
  const admin = isAdmin(me);
  const ws = me.workspace;
  const settings = parseWorkspaceSettings(ws.settings);
  const [draft, setDraft] = useState<WorkspacePatch>({});
  const [budgetText, setBudgetText] = useState<string | null>(null);
  const set = (patch: WorkspacePatch) => setDraft((d) => ({ ...d, ...patch, settings: patch.settings ? { ...d.settings, ...patch.settings } : d.settings }));
  const value = {
    name: draft.name ?? ws.name,
    monthlyBudgetUsd: draft.monthlyBudgetUsd ?? ws.monthlyBudgetUsd,
    budgetHardStop: draft.budgetHardStop ?? ws.budgetHardStop,
    aiLabelDefault: draft.aiLabelDefault ?? ws.aiLabelDefault,
    autoAnalyze: draft.settings?.autoAnalyze ?? settings.autoAnalyze,
    autoTranscribe: draft.settings?.autoTranscribe ?? settings.autoTranscribe,
    trashRetentionDays: draft.settings?.trashRetentionDays ?? settings.trashRetentionDays,
  };
  const budgetError = budgetText != null && !(Number(budgetText) >= 0 && Number(budgetText) <= 100_000) ? 'Enter an amount from 0 to 100,000.' : null;
  const nameError = !value.name.trim() ? 'The workspace needs a name.' : null;
  const dirty = Object.keys(draft).length > 0;
  const save = useMutation({
    mutationFn: () => api.patch<Me>('/workspace', { ...draft, ...(draft.name ? { name: draft.name.trim() } : {}) }),
    onSuccess: (data) => {
      setMe(data);
      setDraft({});
      setBudgetText(null);
      toast.success('Workspace saved');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const { spentUsd, budgetUsd } = me.budget;
  const pct = budgetUsd > 0 ? Math.min(100, (spentUsd / budgetUsd) * 100) : 0;

  return (
    <SettingsSection
      title="Workspace"
      description="Applies to everyone in this workspace."
      footer={
        admin ? (
          <>
            {dirty && (
              <Button size="sm" variant="ghost" onClick={() => (setDraft({}), setBudgetText(null))}>
                Discard
              </Button>
            )}
            <Button size="sm" disabled={!dirty || !!budgetError || !!nameError} loading={save.isPending} onClick={() => save.mutate()}>
              Save workspace
            </Button>
          </>
        ) : undefined
      }
    >
      {!admin && <Notice tone="info">Only owners and admins can change workspace settings.</Notice>}
      <Field label="Workspace name" htmlFor="ws-name" error={nameError}>
        <Input id="ws-name" value={value.name} maxLength={80} disabled={!admin} onChange={(e) => set({ name: e.target.value })} />
      </Field>

      <div className="space-y-3 rounded-xl border bg-surface-2/40 p-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-end">
          <Field label="Monthly AI budget (USD)" htmlFor="ws-budget" error={budgetError} hint="Generation, voice, music and LLM costs count toward it.">
            <Input
              id="ws-budget"
              inputMode="decimal"
              value={budgetText ?? String(value.monthlyBudgetUsd)}
              disabled={!admin}
              onChange={(e) => {
                setBudgetText(e.target.value);
                const n = Number(e.target.value);
                if (e.target.value.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 100_000) set({ monthlyBudgetUsd: n });
              }}
            />
          </Field>
          <div className="space-y-1.5 pb-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Spent this month</span>
              <span className="tabular-nums text-foreground">
                {formatUsd(spentUsd)} of {formatUsd(budgetUsd)}
              </span>
            </div>
            <Progress value={pct} />
          </div>
        </div>
        <SwitchRow
          label="Stop at the budget"
          description="When on, paid work that would go over the budget is blocked. When off, you are warned and the work runs."
          checked={value.budgetHardStop}
          disabled={!admin}
          onCheckedChange={(v) => set({ budgetHardStop: v })}
        />
      </div>

      <SwitchRow
        label="Label AI-generated posts by default"
        description="Turns on the platform's AI-generated content label when publishing. You can still change it per post."
        checked={value.aiLabelDefault}
        disabled={!admin}
        onCheckedChange={(v) => set({ aiLabelDefault: v })}
      />
      <SwitchRow
        label="Analyze new uploads"
        description="Tags, describes and indexes new files so search works by meaning. Costs a fraction of a cent per file."
        checked={value.autoAnalyze}
        disabled={!admin}
        onCheckedChange={(v) => set({ settings: { autoAnalyze: v } })}
      />
      <SwitchRow
        label="Transcribe new videos and recordings"
        description="Makes captions and search by what is said. Needs an ElevenLabs or OpenAI key; billed per minute."
        checked={value.autoTranscribe}
        disabled={!admin}
        onCheckedChange={(v) => set({ settings: { autoTranscribe: v } })}
      />
      <Field label="Keep deleted items for" hint="After this, items in the trash are deleted for good.">
        <Select
          value={String(value.trashRetentionDays)}
          disabled={!admin}
          onValueChange={(v) => set({ settings: { trashRetentionDays: Number(v) } })}
          options={[...new Set([...RETENTION, value.trashRetentionDays])].sort((a, b) => a - b).map((d) => ({ value: String(d), label: `${d} days` }))}
          className="sm:max-w-56"
        />
      </Field>
    </SettingsSection>
  );
}

const CONFIRM_WORD = 'DELETE';

/** Permanent account deletion, behind a typed confirmation. */
function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const remove = useMutation({
    mutationFn: () => api.delete('/me', { confirm: CONFIRM_WORD }),
    onSuccess: async () => {
      // The account is gone; clear this browser's session cookies before leaving.
      try {
        await supabaseBrowser().auth.signOut({ scope: 'local' });
      } catch {
        // The session already stopped working with the account; the cookies expire on their own.
      }
      // A full page load, so no signed-in state cached in this tab survives the deletion.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/data-deletion?deleted=1');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <SettingsSection title="Delete account" description="Permanently delete your account and every workspace you own.">
      <p className="text-sm text-muted-foreground">
        Everything in those workspaces is deleted: files, edits, scripts, brand kits, connected accounts, posts, ads, share links and history. People you invited lose access too. This can’t be undone.{' '}
        <a href="/data-deletion" className="text-primary underline-offset-4 hover:underline">
          What gets deleted
        </a>
      </p>
      <div>
        <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
          Delete account
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (remove.isPending) return;
          setOpen(v);
          if (!v) setTyped('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>Your account, every workspace you own and everything in them are deleted for good. Download anything you want to keep first.</DialogDescription>
          </DialogHeader>
          <form
            id="delete-account"
            onSubmit={(e) => {
              e.preventDefault();
              if (typed === CONFIRM_WORD) remove.mutate();
            }}
          >
            <Field label={`Type ${CONFIRM_WORD} to confirm`} htmlFor="delete-confirm">
              <Input id="delete-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
            </Field>
          </form>
          <DialogFooter>
            <Button variant="ghost" disabled={remove.isPending} onClick={() => (setOpen(false), setTyped(''))}>
              Cancel
            </Button>
            <Button type="submit" form="delete-account" variant="destructive" disabled={typed !== CONFIRM_WORD} loading={remove.isPending}>
              Delete account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}
