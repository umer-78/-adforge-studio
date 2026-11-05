import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A row that drifts sideways forever and pauses under the pointer. The copy is for the loop only. */
export function Marquee({ items, reverse, seconds = 70, className }: { items: ReactNode[]; reverse?: boolean; seconds?: number; className?: string }) {
  return (
    <div className={cn('marquee overflow-hidden', className)}>
      <div className="marquee-track" data-reverse={reverse || undefined} style={{ '--marquee-duration': `${seconds}s` } as CSSProperties}>
        {[0, 1].map((copy) => (
          <ul key={copy} aria-hidden={copy === 1 || undefined} className="flex shrink-0 items-center gap-3 pr-3">
            {items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
