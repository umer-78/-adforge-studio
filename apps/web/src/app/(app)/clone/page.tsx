import { Suspense } from 'react';
import { PageContainer } from '@/components/app/page';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { CloneView } from './view';

export const metadata = { title: 'Ad Clone' };

export default function ClonePage() {
  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Grow"
        title="Ad Clone"
        description="Start from an ad that already works. AdForge maps it beat by beat (hook, cuts, shots, on-screen text, voice-over) and writes an original ad for your product on the same structure. It copies the structure, never the footage or words."
      />
      <Suspense fallback={<Skeleton className="h-[60vh] rounded-2xl" />}>
        <CloneView />
      </Suspense>
    </PageContainer>
  );
}
