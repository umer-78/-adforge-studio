'use client';

import { useEffect } from 'react';
import { api, ApiError, errorMessage } from '@/lib/api-client';
import { useEditor } from './store';

const DEBOUNCE_MS = 1200;
const RETRY_MS = [3000, 8000, 20_000, 60_000];

let queue: Promise<void> = Promise.resolve();
let failures = 0;

async function run(label?: string) {
  const s = useEditor.getState();
  if (!s.id || s.saveStatus === 'conflict') return;
  const revision = s.revision;
  if (revision <= s.savedRevision && !label) return;
  s.setSaveStatus('saving');
  try {
    const res = await api.patch<{ version: number }>(`/timelines/${s.id}`, {
      name: s.name.trim() || 'Untitled edit',
      data: s.timeline,
      baseVersion: s.version,
      ...(label ? { snapshotLabel: label } : {}),
    });
    useEditor.getState().markSaved(res.version, revision);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) useEditor.getState().setSaveStatus('conflict', err.message);
    else useEditor.getState().setSaveStatus('error', errorMessage(err));
    throw err;
  }
}

/** Saves now (after any save already running). A label also keeps a named version in History. */
export function saveNow(label?: string): Promise<void> {
  const next = queue.then(() => run(label));
  queue = next.catch(() => undefined);
  return next;
}

/** Debounced saving while editing, retries with backoff, and a warning before leaving with unsaved work. */
export function useAutosave() {
  const revision = useEditor((s) => s.revision);
  const savedRevision = useEditor((s) => s.savedRevision);
  const status = useEditor((s) => s.saveStatus);

  useEffect(() => {
    if (revision <= savedRevision || status === 'conflict' || status === 'saving') return;
    const delay = status === 'error' ? RETRY_MS[Math.min(failures, RETRY_MS.length - 1)] : DEBOUNCE_MS;
    const timer = setTimeout(() => {
      saveNow().then(
        () => {
          failures = 0;
        },
        () => {
          failures++;
        },
      );
    }, delay);
    return () => clearTimeout(timer);
  }, [revision, savedRevision, status]);

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      const s = useEditor.getState();
      if (s.revision > s.savedRevision || s.saveStatus === 'saving') e.preventDefault();
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') void saveNow().catch(() => undefined);
    };
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);
}
