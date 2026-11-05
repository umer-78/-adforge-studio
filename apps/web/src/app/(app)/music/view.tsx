'use client';

import { Library, Music, Scissors, Zap } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { MusicLibrary } from '@/components/music/library';
import { MusicPanel, SfxPanel, StemsPanel } from '@/components/music/panels';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const TABS = ['music', 'sfx', 'stems', 'library'] as const;

export function MusicView() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = TABS.find((t) => t === sp.get('tab')) ?? 'music';
  return (
    <Tabs value={tab} onValueChange={(v) => router.replace(`${pathname}?tab=${v}`, { scroll: false })} className="space-y-6">
      <TabsList className="no-scrollbar max-w-full overflow-x-auto">
        <TabsTrigger value="music">
          <Music className="size-4" /> Generate music
        </TabsTrigger>
        <TabsTrigger value="sfx">
          <Zap className="size-4" /> Sound effects
        </TabsTrigger>
        <TabsTrigger value="stems">
          <Scissors className="size-4" /> Split stems
        </TabsTrigger>
        <TabsTrigger value="library">
          <Library className="size-4" /> My music
        </TabsTrigger>
      </TabsList>
      <TabsContent value="music">
        <MusicPanel initialPrompt={sp.get('prompt') ?? ''} />
      </TabsContent>
      <TabsContent value="sfx">
        <SfxPanel />
      </TabsContent>
      <TabsContent value="stems">
        <StemsPanel />
      </TabsContent>
      <TabsContent value="library">
        <MusicLibrary />
      </TabsContent>
    </Tabs>
  );
}
