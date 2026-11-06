'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CircleX, Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { csvRecords, parseLocalDateTime, toCsv } from '@adforge/core';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Notice } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api-client';
import { useMe } from '@/lib/hooks/use-me';
import type { AssetView, Page, PostView, SocialAccountView } from '@/lib/types';
import { cn, qs } from '@/lib/utils';
import { useSocialAccounts } from './use-distribution';

const MAX_ROWS = 200;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const PRIVACY: Record<string, string> = { everyone: 'PUBLIC_TO_EVERYONE', public: 'PUBLIC_TO_EVERYONE', friends: 'MUTUAL_FOLLOW_FRIENDS', followers: 'FOLLOWER_OF_CREATOR', 'only me': 'SELF_ONLY', private: 'SELF_ONLY' };

/** The file column names one Library file, or several separated by | for a carousel. */
const splitFiles = (v: string | undefined) => (v ?? '').split('|').map((x) => x.trim()).filter(Boolean);

interface Row {
  line: number;
  asset: AssetView | null;
  /** More files after `asset`: the post is a carousel. */
  extra: AssetView[];
  title: string | null;
  caption: string;
  firstComment: string | null;
  hashtags: string[];
  accounts: SocialAccountView[];
  at: Date | null;
  aiLabel: boolean;
  options: Record<string, Record<string, unknown>>;
  problems: string[];
  state: 'ready' | 'sending' | 'done' | 'failed';
  error?: string;
}

const TEMPLATE = toCsv([
  ['file', 'caption', 'title', 'hashtags', 'accounts', 'date', 'time', 'tiktok_privacy', 'pinterest_board', 'ai_label', 'first_comment'],
  ['Spring sale 9x16', 'Spring sale starts now. 20% off everything.', 'Spring sale', 'sale spring', 'instagram, tiktok', '2026-12-01', '18:30', 'everyone', '', 'no', 'Shop the sale: example.com/spring'],
  ['3f0c2a8e-1111-4222-8333-944455556666', 'Behind the scenes of our new bottle', '', 'bts', '@everydaybottle', '2026-12-02', '12:00', '', '', '', ''],
]);

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Schedules many posts from a spreadsheet: one row per post, checked before anything is sent. */
export function CsvImportButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <FileSpreadsheet /> Schedule from CSV
      </Button>
      {open && <CsvImportDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function CsvImportDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const me = useMe();
  const social = useSocialAccounts();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [rights, setRights] = useState(false);
  const [sending, setSending] = useState(false);
  const accounts = (social.data?.accounts ?? []).filter((a) => a.status === 'active');

  const findAccounts = (text: string): { found: SocialAccountView[]; unknown: string[] } => {
    const found = new Map<string, SocialAccountView>();
    const unknown: string[] = [];
    for (const raw of text.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)) {
      const t = raw.toLowerCase().replace(/^@/, '');
      const hits = t === 'all' ? accounts : accounts.filter((a) => a.platform === t || a.handle?.toLowerCase().replace(/^@/, '') === t || a.displayName?.toLowerCase() === t || a.id === raw);
      if (!hits.length) unknown.push(raw);
      for (const h of hits) found.set(h.id, h);
    }
    return { found: [...found.values()], unknown };
  };

  const read = async (file: File) => {
    setFileError(null);
    setRows(null);
    if (file.size > 2_000_000) return setFileError('The file is larger than 2 MB. Split it into smaller files.');
    setReading(true);
    try {
      const { headers, records } = csvRecords(await file.text());
      if (!headers.includes('file')) throw new Error('The first row needs column names, including “file”. Download the template to start.');
      if (!records.length) throw new Error('The file has no rows under the header.');
      if (records.length > MAX_ROWS) throw new Error(`Up to ${MAX_ROWS} posts per file. This one has ${records.length}.`);
      // Find each file once, by id or by its exact name in the Library.
      const refs = [...new Set(records.flatMap((r) => splitFiles(r.file)))];
      const ids = refs.map((r) => UUID.exec(r)?.[0]).filter((v): v is string => !!v);
      const byKey = new Map<string, AssetView>();
      for (let i = 0; i < ids.length; i += 50) {
        const page = await api.get<Page<AssetView>>(`/assets${qs({ ids: ids.slice(i, i + 50).join(','), limit: 50 })}`);
        for (const a of page.items) byKey.set(a.id, a);
      }
      for (const name of refs.filter((r) => !UUID.test(r))) {
        const page = await api.get<Page<AssetView>>(`/assets${qs({ q: name, limit: 20 })}`);
        const hit = page.items.find((a) => a.name.toLowerCase() === name.toLowerCase()) ?? page.items.find((a) => a.name.toLowerCase() === name.toLowerCase().replace(/\.\w{2,4}$/, ''));
        if (hit) byKey.set(name.toLowerCase(), hit);
      }
      const aiDefault = me.data?.workspace.aiLabelDefault ?? true;
      const now = Date.now();
      setRows(
        records.map((r, i) => {
          const problems: string[] = [];
          const files = splitFiles(r.file);
          const matches = files.map((ref) => byKey.get(UUID.exec(ref)?.[0] ?? '') ?? byKey.get(ref.toLowerCase()) ?? null);
          if (!files.length) problems.push('No file named.');
          if (files.length > 10) problems.push('A carousel takes at most 10 files.');
          files.forEach((ref, k) => {
            const a = matches[k];
            if (!a) problems.push(`No Library file called “${ref}”.`);
            else if (a.status !== 'ready') problems.push(`“${a.name}” is still processing.`);
            else if (a.type !== 'video' && a.type !== 'image') problems.push(`“${a.name}” is not a video or photo.`);
          });
          const picked = matches.filter((a): a is AssetView => !!a);
          if (new Set(picked.map((a) => a.id)).size !== picked.length) problems.push('The same file is listed twice.');
          const asset = matches[0] ?? null;
          const { found, unknown } = findAccounts(r.accounts ?? '');
          if (!r.accounts) problems.push('No accounts. Use network names (instagram), @handles or “all”.');
          if (unknown.length) problems.push(`Unknown account: ${unknown.join(', ')}.`);
          const at = parseLocalDateTime(r.date || r.scheduled_at || r.when || '', r.time ?? '');
          if (!at) problems.push('Add a date as 2026-12-01 and a time as 18:30, or a full ISO time.');
          else if (at.getTime() < now + 2 * 60_000) problems.push('The time has passed or is less than two minutes away.');
          const caption = r.caption ?? '';
          if (caption.length > 5000) problems.push('The caption is longer than 5,000 characters.');
          const options: Row['options'] = {};
          for (const a of found) {
            if (a.platform === 'tiktok' && a.provider === 'native') {
              const p = PRIVACY[(r.tiktok_privacy ?? '').toLowerCase()];
              if (!p) problems.push('TikTok needs tiktok_privacy: everyone, friends, followers or only me.');
              else options[a.id] = { privacyLevel: p };
            }
            if (a.platform === 'pinterest' && a.provider === 'native') {
              if (!r.pinterest_board) problems.push('Pinterest needs pinterest_board (the board id).');
              else options[a.id] = { boardId: r.pinterest_board };
            }
          }
          const ai = (r.ai_label ?? '').toLowerCase();
          return {
            line: i + 2,
            asset,
            extra: picked.slice(1),
            title: r.title || null,
            caption,
            firstComment: (r.first_comment ?? '').trim().slice(0, 2200) || null,
            hashtags: (r.hashtags ?? '').split(/[\s,]+/).map((h) => h.replace(/^#/, '')).filter(Boolean).slice(0, 30),
            accounts: found,
            at,
            aiLabel: ai ? ['yes', 'y', 'true', '1'].includes(ai) : (asset?.isAiGenerated ?? false) || aiDefault,
            options,
            problems: [...new Set(problems)],
            state: 'ready',
          };
        }),
      );
    } catch (e) {
      setFileError(errorMessage(e));
    } finally {
      setReading(false);
    }
  };

  const valid = rows?.filter((r) => !r.problems.length && r.state !== 'done') ?? [];
  const send = async () => {
    setSending(true);
    let ok = 0;
    for (const r of valid) {
      setRows((all) => all!.map((x) => (x.line === r.line ? { ...x, state: 'sending' } : x)));
      try {
        await api.post<PostView>('/posts', {
          assetId: r.asset!.id,
          carouselAssetIds: r.extra.length ? [r.asset!.id, ...r.extra.map((e) => e.id)] : null,
          title: r.title,
          caption: r.caption,
          firstComment: r.firstComment,
          hashtags: r.hashtags,
          targets: r.accounts.map((a) => ({ socialAccountId: a.id, captionOverride: null, options: r.options[a.id] ?? {} })),
          scheduledAt: r.at!.toISOString(),
          aiLabel: r.aiLabel,
          rightsAcknowledged: true,
          abGroup: null,
          abVariant: null,
        });
        ok++;
        setRows((all) => all!.map((x) => (x.line === r.line ? { ...x, state: 'done' } : x)));
      } catch (e) {
        setRows((all) => all!.map((x) => (x.line === r.line ? { ...x, state: 'failed', error: errorMessage(e) } : x)));
      }
    }
    setSending(false);
    void qc.invalidateQueries({ queryKey: ['posts'] });
    if (ok) toast.success(`Scheduled ${ok} post${ok === 1 ? '' : 's'}`);
  };

  const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <Dialog open onOpenChange={(o) => !o && !sending && onClose()}>
      <DialogContent wide className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Schedule from a CSV</DialogTitle>
          <DialogDescription>One row per post: the Library file, caption, accounts and time. Every row is checked before anything is scheduled, and times use your clock.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => fileRef.current?.click()} loading={reading} disabled={sending}>
            <Upload /> Choose CSV
          </Button>
          <Button variant="ghost" onClick={() => download('adforge-schedule-template.csv', TEMPLATE)}>
            <Download /> Template
          </Button>
          <input
            ref={fileRef}
            type="file"
            hidden
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void read(f);
            }}
          />
          <span className="text-xs text-muted-foreground">Columns: file, caption, title, hashtags, accounts, date, time, tiktok_privacy, pinterest_board, ai_label, first_comment. For a carousel, list several files in file, separated by |.</span>
        </div>
        {fileError && <Notice tone="error" title="This file could not be read">{fileError}</Notice>}
        {!accounts.length && !social.isLoading && <Notice tone="warning" title="No connected accounts">Connect an account in Settings before scheduling.</Notice>}
        {rows && (
          <div className="max-h-[50vh] overflow-auto rounded-xl border scrollbar-thin">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-surface-2 text-muted-foreground">
                <tr>
                  <th className="p-2 font-medium">Row</th>
                  <th className="p-2 font-medium">File</th>
                  <th className="p-2 font-medium">When</th>
                  <th className="p-2 font-medium">Accounts</th>
                  <th className="p-2 font-medium">Caption</th>
                  <th className="p-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} className="border-t align-top">
                    <td className="p-2 tabular-nums text-muted-foreground">{r.line}</td>
                    <td className="max-w-40 truncate p-2">{r.asset?.name ?? '—'}{r.extra.length ? ` +${r.extra.length}` : ''}</td>
                    <td className="p-2 whitespace-nowrap">{r.at ? fmt.format(r.at) : '—'}</td>
                    <td className="p-2">{r.accounts.map((a) => a.handle ?? a.platform).join(', ') || '—'}</td>
                    <td className="max-w-56 truncate p-2" title={r.caption}>
                      {r.caption || <span className="text-muted-foreground">No caption</span>}
                    </td>
                    <td className="p-2">
                      {r.state === 'sending' ? (
                        <Loader2 className="size-4 animate-spin text-primary" aria-label="Scheduling" />
                      ) : r.state === 'done' ? (
                        <span className="inline-flex items-center gap-1 text-success">
                          <CircleCheck className="size-4" /> Scheduled
                        </span>
                      ) : r.problems.length || r.state === 'failed' ? (
                        <span className="inline-flex items-start gap-1 text-destructive">
                          <CircleX className="mt-px size-4 shrink-0" /> {r.error ?? r.problems.join(' ')}
                        </span>
                      ) : (
                        <span className={cn('text-muted-foreground')}>Ready</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows && (
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={rights} onCheckedChange={(v) => setRights(v === true)} className="mt-0.5" />I own or have licensed everything in these posts (footage, music, voices, faces) for this use.
          </label>
        )}
        <DialogFooter>
          <div className="mr-auto self-center text-xs text-muted-foreground">{rows ? `${valid.length} of ${rows.length} rows ready` : ''}</div>
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            {rows?.some((r) => r.state === 'done') ? 'Done' : 'Cancel'}
          </Button>
          <Button variant="brand" disabled={!valid.length || !rights || sending} loading={sending} onClick={() => void send()}>
            Schedule {valid.length || ''} post{valid.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
