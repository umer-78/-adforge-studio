'use client';

import { AudioLines, Fingerprint, Languages, Library, MessagesSquare, Mic, Repeat } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { VoiceLibrary } from '@/components/voice/library';
import { ChangerPanel, CleanPanel, ClonePanel, DialoguePanel, DubPanel, SpeakPanel } from '@/components/voice/panels';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const TABS = ['speak', 'dialogue', 'changer', 'clean', 'clone', 'dub', 'library'] as const;

export function VoiceView() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = TABS.find((t) => t === sp.get('tab')) ?? 'speak';
  return (
    <Tabs value={tab} onValueChange={(v) => router.replace(`${pathname}?tab=${v}`, { scroll: false })} className="space-y-6">
      <TabsList className="no-scrollbar max-w-full overflow-x-auto">
        <TabsTrigger value="speak">
          <AudioLines className="size-4" /> Text to speech
        </TabsTrigger>
        <TabsTrigger value="dialogue">
          <MessagesSquare className="size-4" /> Dialogue
        </TabsTrigger>
        <TabsTrigger value="changer">
          <Repeat className="size-4" /> Voice changer
        </TabsTrigger>
        <TabsTrigger value="clean">
          <Mic className="size-4" /> Record & clean
        </TabsTrigger>
        <TabsTrigger value="clone">
          <Fingerprint className="size-4" /> Clone a voice
        </TabsTrigger>
        <TabsTrigger value="dub">
          <Languages className="size-4" /> Dub
        </TabsTrigger>
        <TabsTrigger value="library">
          <Library className="size-4" /> My voices
        </TabsTrigger>
      </TabsList>
      <TabsContent value="speak">
        <SpeakPanel />
      </TabsContent>
      <TabsContent value="dialogue">
        <DialoguePanel />
      </TabsContent>
      <TabsContent value="changer">
        <ChangerPanel />
      </TabsContent>
      <TabsContent value="clean">
        <CleanPanel />
      </TabsContent>
      <TabsContent value="clone">
        <ClonePanel />
      </TabsContent>
      <TabsContent value="dub">
        <DubPanel />
      </TabsContent>
      <TabsContent value="library">
        <VoiceLibrary />
      </TabsContent>
    </Tabs>
  );
}
