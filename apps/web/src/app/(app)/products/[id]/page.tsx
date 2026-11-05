import { Suspense } from 'react';
import { PageContainer } from '@/components/app/page';
import { Skeleton } from '@/components/ui/misc';
import { ProductDetail } from './detail';

export const metadata = { title: 'Product' };

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
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
  return <ProductDetail key={id} id={id} />;
}
