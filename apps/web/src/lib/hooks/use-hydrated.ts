'use client';

import { useSyncExternalStore } from 'react';

const noop = () => () => undefined;

/**
 * False while React hydrates server HTML, true after. Data that only exists in the browser (cached
 * queries, local settings) must not change what renders until then, or the markup will not match.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
