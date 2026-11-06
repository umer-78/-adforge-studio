'use client';

import { useSearchParams } from 'next/navigation';
import { STOCK_KINDS, type StockKind } from '@adforge/core';
import { StockBrowser } from './stock-browser';

export function FreeMediaView() {
  const kind = useSearchParams().get('kind');
  const initialKind = STOCK_KINDS.find((k) => k === kind) as StockKind | undefined;
  return <StockBrowser key={initialKind ?? 'photo'} initialKind={initialKind} />;
}
