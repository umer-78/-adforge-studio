import { Suspense } from 'react';
import { PageContainer } from '@/components/app/page';
import { Skeleton } from '@/components/ui/misc';
import { CampaignDetail } from './detail';

export const metadata = { title: 'Campaign' };

export default function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageContainer wide>
      <Suspense fallback={<Skeleton className="h-[70vh] rounded-2xl" />}>
        <Detail params={params} />
      </Suspense>
    </PageContainer>
  );
}

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CampaignDetail key={id} id={id} />;
}
