import { Suspense } from 'react';
import { PageContainer } from '@/components/app/page';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { VariantsView } from './view';

export const metadata = { title: 'Variants' };

export default function VariantsPage() {
  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Grow"
        title="Variants"
        description="Turn one edit into up to ten versions that change only what you want to test: the hook, the call to action, the voice, the music, the captions or the first shot. Each version gets a hypothesis, renders on its own, and goes out as an A/B test."
      />
      <Suspense fallback={<Skeleton className="h-[60vh] rounded-2xl" />}>
        <VariantsView />
      </Suspense>
    </PageContainer>
  );
}
