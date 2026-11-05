import { Suspense } from 'react';
import { PageContainer } from '@/components/app/page';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { CampaignBuilder } from './builder';

export const metadata = { title: 'New campaign' };

export default function NewCampaignPage() {
  return (
    <PageContainer>
      <PageHeader eyebrow="Ads" title="New campaign" description="One campaign, one ad set and an ad per video. It is created paused on the platform; you switch the ads on when you are ready." />
      <Suspense fallback={<Skeleton className="h-[60vh] rounded-2xl" />}>
        <CampaignBuilder />
      </Suspense>
    </PageContainer>
  );
}
