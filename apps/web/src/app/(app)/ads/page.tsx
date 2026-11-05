import { Suspense } from 'react';
import { PageContainer } from '@/components/app/page';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { AdsView } from './view';

export const metadata = { title: 'Ads' };

export default function AdsPage() {
  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Distribute"
        title="Ads"
        description="Launch Meta and TikTok campaigns from your videos. Everything is created paused, so nothing spends until you switch an ad on yourself. Results sync every few hours and the winners rise to the top."
      />
      <Suspense fallback={<Skeleton className="h-[60vh] rounded-2xl" />}>
        <AdsView />
      </Suspense>
    </PageContainer>
  );
}
