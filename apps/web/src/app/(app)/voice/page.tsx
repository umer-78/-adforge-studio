import { Suspense } from 'react';
import { PageContainer } from '@/components/app/page';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { VoiceView } from './view';

export const metadata = { title: 'Voice-over' };

export default function VoicePage() {
  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Create"
        title="Voice-over"
        description="Natural voice-overs and multi-voice dialogue in 30+ languages. Change a voice, clean up a recording, clone a voice with consent, or dub a whole ad."
      />
      <Suspense fallback={<Skeleton className="h-[70vh] rounded-2xl" />}>
        <VoiceView />
      </Suspense>
    </PageContainer>
  );
}
