'use client';

import { useState } from 'react';

// Two fresh empty arrays (`data ?? []`) are the same thing for our purposes.
const same = (a: unknown, b: unknown) => Object.is(a, b) || (Array.isArray(a) && Array.isArray(b) && a.length === 0 && b.length === 0);

/**
 * Runs `apply` while rendering: on the first render, and whenever a value in
 * `deps` changes. This is React's "adjust state when a prop changes" pattern,
 * so state that follows a prop or loaded data is corrected in the same render
 * instead of in an effect that paints the stale value first and renders again.
 * `apply` may only set state that belongs to the calling component.
 */
export function useOnChange(deps: readonly unknown[], apply: () => void): void {
  const [seen, setSeen] = useState<readonly unknown[] | null>(null);
  if (seen === null || seen.length !== deps.length || deps.some((d, i) => !same(d, seen[i]))) {
    setSeen(deps);
    apply();
  }
}
