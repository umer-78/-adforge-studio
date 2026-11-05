import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7', className)} aria-hidden>
      <defs>
        <linearGradient id="af-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7C5CFF" />
          <stop offset="1" stopColor="#FF4D8D" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#af-g)" />
      <path d="M9.5 22.5 15 8.5h2l5.5 14h-3.2l-1.2-3.3h-4.3l-1.2 3.3H9.5Zm5.3-6h2.4L16 13.1l-1.2 3.4Z" fill="#fff" />
      <path d="M23.5 7.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" fill="#fff" opacity=".9" />
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 font-semibold tracking-tight', className)}>
      <LogoMark />
      {!compact && (
        <span className="text-[15px]">
          AdForge <span className="font-display text-[17px] font-normal italic text-muted-foreground">Studio</span>
        </span>
      )}
    </span>
  );
}
