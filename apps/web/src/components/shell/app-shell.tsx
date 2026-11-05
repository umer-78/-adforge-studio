'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Menu, PanelLeftClose, PanelLeft, Search, Upload } from 'lucide-react';
import { LayoutGroup, motion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Logo, LogoMark } from '@/components/app/logo';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/misc';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Tip } from '@/components/ui/tooltip';
import { useLocalSetting } from '@/lib/hooks/use-local-setting';
import { useMe } from '@/lib/hooks/use-me';
import { useRealtimeSync } from '@/lib/hooks/use-realtime';
import { startUploads } from '@/lib/upload';
import { cn } from '@/lib/utils';
import { BudgetMeter } from './budget-meter';
import { CommandPalette } from './command-palette';
import { JobsTray } from './jobs-tray';
import { NAV, SETTINGS_ITEM, type NavItem } from './nav';
import { UploadTray } from './upload-tray';
import { UserMenu } from './user-menu';

const ACCEPT = 'video/*,image/*,audio/*,.glb,.gltf';

interface NavLinkProps {
  item: NavItem;
  collapsed?: boolean;
  onNavigate?: () => void;
}

/** The current path is request data, so the highlight streams in while the links themselves stay in the static shell. */
function NavLink(props: NavLinkProps) {
  return (
    <Suspense fallback={<NavLinkView {...props} active={false} />}>
      <ActiveNavLink {...props} />
    </Suspense>
  );
}

function ActiveNavLink(props: NavLinkProps) {
  const pathname = usePathname();
  return <NavLinkView {...props} active={pathname === props.item.href || pathname.startsWith(`${props.item.href}/`)} />;
}

function NavLinkView({ item, collapsed, onNavigate, active }: NavLinkProps & { active: boolean }) {
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        'group relative isolate flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground',
        active && 'text-foreground',
        collapsed && 'justify-center px-0',
      )}
    >
      {/* One highlight per sidebar that slides to the page you open. */}
      {active && (
        <motion.span layoutId="nav-active" className="absolute inset-0 -z-10 rounded-lg bg-accent" transition={{ type: 'spring', stiffness: 520, damping: 42 }}>
          <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-brand" />
        </motion.span>
      )}
      <item.icon className={cn('size-4 shrink-0 transition-colors', active ? 'text-primary' : 'group-hover:text-foreground')} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
  return collapsed ? (
    <Tip content={item.label} side="right">
      {link}
    </Tip>
  ) : (
    link
  );
}

function SidebarBody({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const group = useId();
  return (
    <LayoutGroup id={group}>
    <div className="flex h-full flex-col">
      <div className={cn('flex h-14 shrink-0 items-center px-4', collapsed && 'justify-center px-0')}>
        <Link href="/dashboard" onClick={onNavigate}>
          {collapsed ? <LogoMark /> : <Logo />}
        </Link>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2 no-scrollbar">
        {NAV.map((group) => (
          <div key={group.title} className="space-y-0.5">
            {!collapsed && <div className="px-2.5 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">{group.title}</div>}
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>
      <div className="space-y-2 border-t p-3">
        <BudgetMeter collapsed={collapsed} />
        <NavLink item={SETTINGS_ITEM} collapsed={collapsed} onNavigate={onNavigate} />
      </div>
    </div>
    </LayoutGroup>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [sidebar, setSidebar] = useLocalSetting<'collapsed' | 'expanded'>('af:sidebar', 'expanded');
  const collapsed = sidebar === 'collapsed';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const { data: me } = useMe();
  useRealtimeSync(me?.workspace.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleCollapsed = () => setSidebar(collapsed ? 'expanded' : 'collapsed');

  const upload = useCallback((files: File[]) => files.length && void startUploads(files, { queryClient: qc }), [qc]);

  // Drop files anywhere outside the editor to upload them to the library.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e) || document.body.dataset.dropzone === 'local') return;
      depth++;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const over = (e: DragEvent) => hasFiles(e) && document.body.dataset.dropzone !== 'local' && e.preventDefault();
    const drop = (e: DragEvent) => {
      depth = 0;
      setDragging(false);
      if (!hasFiles(e) || document.body.dataset.dropzone === 'local') return;
      e.preventDefault();
      upload(Array.from(e.dataTransfer?.files ?? []));
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [upload]);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className={cn('hidden shrink-0 border-r bg-surface/60 transition-[width] duration-300 ease-out-expo lg:block', collapsed ? 'w-16' : 'w-60')}>
        <SidebarBody collapsed={collapsed} />
      </aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarBody onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu />
          </Button>
          <Button variant="ghost" size="icon" className="hidden lg:inline-flex" onClick={toggleCollapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <PanelLeft /> : <PanelLeftClose />}
          </Button>
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border bg-surface/70 px-3 text-sm text-muted-foreground transition hover:border-input hover:bg-surface"
          >
            <Search className="size-4" />
            <span className="truncate">Search or jump to…</span>
            <span className="ml-auto hidden items-center gap-0.5 sm:flex">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="secondary" className="hidden sm:inline-flex" onClick={() => fileInput.current?.click()}>
              <Upload /> Upload
            </Button>
            <JobsTray />
            <UserMenu />
          </div>
        </header>
        <main className="relative min-h-0 flex-1 overflow-y-auto scrollbar-thin">{children}</main>
      </div>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          upload(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onUpload={() => fileInput.current?.click()} />
      <UploadTray />
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="rounded-3xl border-2 border-dashed border-primary/60 bg-primary/5 px-16 py-12 text-center">
            <Upload className="mx-auto size-8 text-primary" />
            <div className="mt-3 text-lg font-semibold">Drop to upload</div>
            <div className="text-sm text-muted-foreground">Videos, photos, audio and 3D models go straight to your library</div>
          </div>
        </div>
      )}
    </div>
  );
}
