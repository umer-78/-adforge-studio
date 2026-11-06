import { Suspense } from 'react';
import { PageContainer } from '@/components/app/page';
import { FreeMediaView } from '@/components/stock/free-media-view';
import { PageHeader, Skeleton } from '@/components/ui/misc';

export const metadata = { title: 'Free media' };

export default function FreeMediaPage() {
  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Overview"
        title="Free media"
        description="Photos, videos, music and sound effects you can use in ads for free, from Openverse, Pexels and Pixabay. Each file keeps its license, and the ones that ask for a credit carry it into your exports and captions."
      />
      <Suspense fallback={<Skeleton className="h-[60vh] rounded-2xl" />}>
        <FreeMediaView />
      </Suspense>
    </PageContainer>
  );
}
