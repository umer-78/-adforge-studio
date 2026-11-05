import { Fragment, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/** Splits a line into words that rise in one after another; `start` continues the count across lines. */
export function Words({ text, start = 0, className, innerClassName }: { text: string; start?: number; className?: string; innerClassName?: string }) {
  return text.split(' ').map((word, i) => (
    <Fragment key={`${word}-${i}`}>
      {i > 0 && ' '}
      <span className={cn('word', className)}>
        <span className={innerClassName} style={{ '--i': start + i } as CSSProperties}>
          {word}
        </span>
      </span>
    </Fragment>
  ));
}
