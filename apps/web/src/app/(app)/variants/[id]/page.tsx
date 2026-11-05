import { Suspense } from 'react';
import { PageContainer } from '@/components/app/page';
import { Skeleton } from '@/components/ui/misc';
import { VariantBatchDetail } from './detail';

export const metadata = { title: 'Variants' };

export default function VariantBatchPage({ params }: { params: Promise<{ id: string }> }) {
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
  return <VariantBatchDetail key={id} id={id} />;
}
