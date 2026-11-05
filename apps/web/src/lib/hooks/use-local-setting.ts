'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

/** Writes in this tab do not fire `storage`, so the hook tells its own subscribers. */
const listeners = new Set<() => void>();
/** Used when storage is blocked (some private windows): the value lasts for this visit. */
const memory = new Map<string, string>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

/**
 * A small per-browser preference kept in localStorage. The server render and hydration use
 * `initial`; the stored value takes over right after, without a mismatch.
 */
export function useLocalSetting<T>(key: string, initial: T): [T, (v: T) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const value = useMemo(() => {
    if (raw == null) return initial;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  }, [raw, initial]);
  const set = useCallback(
    (v: T) => {
      const next = v === null || v === undefined ? null : JSON.stringify(v);
      try {
        if (next == null) localStorage.removeItem(key);
        else localStorage.setItem(key, next);
        memory.delete(key);
      } catch {
        // Storage can be full or blocked; keep it in memory for this visit.
        if (next == null) memory.delete(key);
        else memory.set(key, next);
      }
      listeners.forEach((l) => l());
    },
    [key],
  );
  return [value, set];
}
