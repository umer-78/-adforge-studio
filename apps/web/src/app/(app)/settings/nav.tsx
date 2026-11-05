'use client';

import { Coins, KeyRound, Megaphone, Palette, Share2, ShieldCheck, SlidersHorizontal, Terminal } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const SECTIONS = [
  { href: '/settings', label: 'General', icon: SlidersHorizontal },
  { href: '/settings/providers', label: 'AI providers', icon: KeyRound },
  { href: '/settings/accounts', label: 'Social accounts', icon: Share2 },
  { href: '/settings/ad-accounts', label: 'Ad accounts', icon: Megaphone },
  { href: '/settings/brand', label: 'Brand kits', icon: Palette },
  { href: '/settings/api-keys', label: 'API & MCP', icon: Terminal },
  { href: '/settings/usage', label: 'Usage & budget', icon: Coins },
  { href: '/settings/consents', label: 'Consents', icon: ShieldCheck },
] as const;

export function SettingsNav() {
  const path = usePathname();
  return (
    <nav aria-label="Settings" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
      <ul className="flex gap-1 lg:sticky lg:top-20 lg:flex-col">
        {SECTIONS.map(({ href, label, icon: Icon }) => {
          const active = href === '/settings' ? path === href : path.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap text-muted-foreground transition hover:bg-accent hover:text-foreground',
                  active && 'bg-accent font-medium text-foreground',
                )}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
