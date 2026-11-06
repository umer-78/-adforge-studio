'use client';

import { useEffect } from 'react';

/** Counts the visit once per browser session, after the page has rendered for a person. */
export function BioBeacon({ pageId }: { pageId: string }) {
  useEffect(() => {
    const key = `bio-view:${pageId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // Storage blocked: count the visit anyway.
    }
    const body = JSON.stringify({ pageId });
    const sent = typeof navigator.sendBeacon === 'function' && navigator.sendBeacon('/api/bio/view', new Blob([body], { type: 'application/json' }));
    if (!sent) void fetch('/api/bio/view', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => undefined);
  }, [pageId]);
  return null;
}
