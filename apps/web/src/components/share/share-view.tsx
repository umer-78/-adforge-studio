'use client';

import { Box, Download, Link2Off, Lock, Music2, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { formatDuration } from '@adforge/core';
import { Logo } from '@/components/app/logo';
import { VideoPlayer } from '@/components/app/media-player';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, Notice, Skeleton } from '@/components/ui/misc';
import { cn, downloadUrl } from '@/lib/utils';

interface SharedFile {
  id: string;
  name: string;
  type: string;
  durationS: number | null;
  width: number | null;
  height: number | null;
  isAiGenerated: boolean;
  src: string | null;
  poster: string | null;
  downloadUrl: string | null;
}

interface Shared {
  title: string;
  from: string | null;
  expiresAt: string | null;
  allowDownload: boolean;
  files: SharedFile[];
}

type State =
  | { kind: 'loading' }
  | { kind: 'locked'; error: string | null }
  | { kind: 'gone' }
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; share: Shared; loadedAt: number };

/** Download links are signed for 15 minutes; renew them a little before that. */
const DOWNLOAD_FRESH_MS = 12 * 60_000;

class ShareError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | undefined,
  ) {
    super(message);
  }
}

/** Reads the link. `refresh` renews the signed media URLs without counting another view. */
async function readShare(token: string, password: string | null, refresh = false): Promise<Shared> {
  const path = `/api/s/${encodeURIComponent(token)}`;
  const res =
    password == null
      ? await fetch(refresh ? `${path}?refresh=1` : path, { cache: 'no-store' })
      : await fetch(path, { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password, ...(refresh ? { refresh: true } : {}) }) });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data && typeof data === 'object' && 'error' in data ? (data as { error: { code?: string; message?: string } }).error : null;
    throw new ShareError(err?.message ?? 'Something went wrong.', res.status, err?.code);
  }
  if (!data || typeof data !== 'object' || !Array.isArray((data as Partial<Shared>).files)) throw new ShareError('The link could not be read. Try again in a moment.', 502, undefined);
  return data as Shared;
}

/** The public page behind a share link: no account needed. */
export function ShareView({ token }: { token: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const password = useRef<string | null>(null);
  const renewing = useRef<Promise<Shared | null> | null>(null);

  const fail = useCallback((err: unknown, fromUnlock: boolean): State => {
    if (err instanceof ShareError) {
      if (err.status === 404) return { kind: 'gone' };
      if (err.code === 'password_required') return { kind: 'locked', error: null };
      if (err.code === 'wrong_password' || (fromUnlock && err.status === 429)) return { kind: 'locked', error: err.message };
      return { kind: 'failed', message: err.message };
    }
    return { kind: 'failed', message: 'The link could not be opened. Check your connection and try again.' };
  }, []);

  useEffect(() => {
    let live = true;
    readShare(token, null)
      .then((share) => live && setState({ kind: 'ready', share, loadedAt: Date.now() }))
      .catch((err: unknown) => live && setState(fail(err, false)));
    return () => {
      live = false;
    };
  }, [token, fail]);

  /** One renewal at a time, shared by every file that needs fresh URLs. */
  const renew = useCallback(async (): Promise<Shared | null> => {
    renewing.current ??= readShare(token, password.current, true)
      .then((share) => {
        setState({ kind: 'ready', share, loadedAt: Date.now() });
        return share;
      })
      .catch((err: unknown) => {
        if (err instanceof ShareError && err.status === 404) setState({ kind: 'gone' });
        return null;
      })
      .finally(() => {
        renewing.current = null;
      });
    return renewing.current;
  }, [token]);

  async function unlock(value: string) {
    try {
      const share = await readShare(token, value);
      password.current = value;
      setState({ kind: 'ready', share, loadedAt: Date.now() });
    } catch (err) {
      setState(fail(err, true));
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-8">
        <Link href="/" aria-label="AdForge Studio home">
          <Logo />
        </Link>
        {state.kind === 'ready' && state.share.expiresAt && <p className="text-xs text-muted-foreground">Available until {new Date(state.share.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-16 sm:px-8">
        {state.kind === 'loading' && <LoadingView />}
        {state.kind === 'locked' && <PasswordGate error={state.error} onSubmit={unlock} />}
        {state.kind === 'gone' && <Gone />}
        {state.kind === 'failed' && (
          <div className="mx-auto max-w-md py-16">
            <Notice tone="error" title="This link could not be opened">
              {state.message}
            </Notice>
          </div>
        )}
        {state.kind === 'ready' && <Files share={state.share} loadedAt={state.loadedAt} renew={renew} />}
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:px-8">
          <span>
            Shared with{' '}
            <Link href="/" className="text-foreground hover:underline">
              AdForge Studio
            </Link>
          </span>
          <nav aria-label="Legal" className="flex gap-4">
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function LoadingView() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-10 w-72 max-w-full" />
      </div>
      <Skeleton className="aspect-video w-full rounded-2xl" />
    </div>
  );
}

function PasswordGate({ error, onSubmit }: { error: string | null; onSubmit: (password: string) => Promise<void> }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!value) return;
    setBusy(true);
    await onSubmit(value);
    setBusy(false);
  }
  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-5 py-16">
      <div className="space-y-3 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Lock className="size-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">This link has a password</h1>
        <p className="text-sm text-muted-foreground">Ask the person who sent it for the password.</p>
      </div>
      <Field label="Password" htmlFor="share-password" error={error}>
        <Input id="share-password" type="password" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" autoFocus aria-invalid={!!error || undefined} maxLength={128} />
      </Field>
      <Button type="submit" className="w-full" loading={busy} disabled={!value}>
        Open
      </Button>
    </form>
  );
}

function Gone() {
  return (
    <div className="mx-auto max-w-md space-y-3 py-16 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Link2Off className="size-6" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight">This link no longer works</h1>
      <p className="text-sm text-muted-foreground">It has expired or the person who shared it turned it off. Ask them for a new link.</p>
    </div>
  );
}

function Files({ share, loadedAt, renew }: { share: Shared; loadedAt: number; renew: () => Promise<Shared | null> }) {
  const n = share.files.length;
  const single = n === 1;
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-primary uppercase">{share.from ? `Shared by ${share.from}` : 'Shared with you'}</p>
        <h1 className="font-display text-4xl leading-tight tracking-tight break-words sm:text-5xl">{share.title}</h1>
        {!single && (
          <p className="text-sm text-muted-foreground">
            {n === 0 ? 'Nothing here yet.' : `${n} file${n > 1 ? 's' : ''}`}
            {share.allowDownload && n > 0 ? ' · Downloads allowed' : ''}
          </p>
        )}
      </div>
      {n === 0 ? (
        <Notice tone="info">There are no finished files in this link yet. Check back later.</Notice>
      ) : single ? (
        <FileCard file={share.files[0]!} loadedAt={loadedAt} renew={renew} large />
      ) : (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
          {share.files.map((f) => (
            <FileCard key={f.id} file={f} loadedAt={loadedAt} renew={renew} />
          ))}
        </div>
      )}
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = { video: 'Video', image: 'Image', audio: 'Audio', model3d: '3D model' };

/** Width over height, kept between 9:16 and 16:9 so one odd file can't break the layout. */
function ratioOf(file: SharedFile): number {
  if (!file.width || !file.height) return file.type === 'audio' ? 0 : 16 / 9;
  return Math.min(16 / 9, Math.max(9 / 16, file.width / file.height));
}

function FileCard({ file, loadedAt, renew, large }: { file: SharedFile; loadedAt: number; renew: () => Promise<Shared | null>; large?: boolean }) {
  const [downloading, setDownloading] = useState(false);
  const lastRenewal = useRef(0);
  const ratio = ratioOf(file);
  const details = [TYPE_LABEL[file.type] ?? 'File', file.durationS ? formatDuration(file.durationS) : null, file.width && file.height ? `${file.width}×${file.height}` : null].filter(Boolean).join(' · ');

  // Preview URLs last an hour. When one has run out, renew the link; at most every few minutes,
  // so a file that is broken for another reason can't cause a loop.
  const onMediaError = () => {
    if (Date.now() - lastRenewal.current < 5 * 60_000) return;
    lastRenewal.current = Date.now();
    void renew();
  };

  async function download() {
    let url = file.downloadUrl;
    if (Date.now() - loadedAt > DOWNLOAD_FRESH_MS) {
      setDownloading(true);
      const fresh = await renew();
      setDownloading(false);
      url = fresh?.files.find((f) => f.id === file.id)?.downloadUrl ?? null;
    }
    if (url) downloadUrl(url);
  }

  // A single file fits the screen: as wide as its picture at 72% of the viewport height.
  const maxWidth = large ? (ratio ? `max(20rem, calc(64vh * ${ratio}))` : '36rem') : undefined;
  const audio = file.type === 'audio';
  return (
    <figure className="mx-auto w-full overflow-hidden rounded-2xl border bg-card" style={maxWidth ? { maxWidth } : undefined}>
      <div className={cn('relative w-full', !audio && 'bg-black')} style={ratio ? { aspectRatio: ratio } : undefined}>
        <Media file={file} onError={onMediaError} large={large} />
        {file.isAiGenerated && !audio && <AiBadge className="pointer-events-none absolute top-2.5 left-2.5 bg-black/70 text-white backdrop-blur" />}
      </div>
      <figcaption className="flex items-center gap-3 border-t px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium" title={file.name}>
            {file.name}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {details}
            {file.isAiGenerated && audio && <AiBadge className="bg-primary/10 text-primary" />}
          </div>
        </div>
        {file.downloadUrl && (
          <Button size="sm" variant="secondary" loading={downloading} onClick={() => void download()} aria-label={`Download ${file.name}`}>
            <Download />
            Download
          </Button>
        )}
      </figcaption>
    </figure>
  );
}

function AiBadge({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', className)}>
      <Sparkles className="size-3" aria-hidden />
      Made with AI
    </span>
  );
}

function Media({ file, onError, large }: { file: SharedFile; onError: () => void; large?: boolean }) {
  if (!file.src && file.type !== 'model3d') {
    return <div className={cn('flex items-center justify-center text-sm', file.type === 'audio' ? 'px-4 py-6 text-muted-foreground' : 'absolute inset-0 text-white/60')}>Preview unavailable</div>;
  }
  if (file.type === 'video') return <SharedVideo file={file} onError={onError} />;
  if (file.type === 'image') {
    // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, sized by the card
    return <img src={file.src!} alt={file.name} className="absolute inset-0 size-full object-contain" loading={large ? 'eager' : 'lazy'} onError={onError} />;
  }
  if (file.type === 'audio') {
    return (
      <div className="flex items-center gap-4 px-4 pt-5 pb-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Music2 className="size-6" />
        </div>
        <audio controls preload="metadata" src={file.src!} className="w-full min-w-0" onError={onError} />
      </div>
    );
  }
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70">
      {file.poster ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
        <img src={file.poster} alt="" className="absolute inset-0 size-full object-contain" onError={onError} />
      ) : (
        <>
          <Box className="size-10" />
          <span className="text-sm">3D model{file.downloadUrl ? ': download it to open' : ''}</span>
        </>
      )}
    </div>
  );
}

function SharedVideo({ file, onError }: { file: SharedFile; onError: () => void }) {
  const [el, setEl] = useState<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (!el) return;
    el.addEventListener('error', onError);
    return () => el.removeEventListener('error', onError);
  }, [el, onError]);
  return <VideoPlayer src={file.src} poster={file.poster} className="absolute inset-0" videoRef={setEl} />;
}
