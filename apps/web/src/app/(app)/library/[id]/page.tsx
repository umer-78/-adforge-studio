import { Suspense } from 'react';
import { PageContainer } from '@/components/app/page';
import { AssetDetail } from '@/components/library/asset-detail';
import { Skeleton } from '@/components/ui/misc';

export const metadata = { title: 'File' };

export default function AssetPage({ params }: { params: Promise<{ id: string }> }) {
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
  return <AssetDetail id={id} />;
}
