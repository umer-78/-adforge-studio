import { Suspense } from 'react';
import { PageContainer } from '@/components/app/page';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { ProductsView } from './view';

export const metadata = { title: 'URL to Video' };

export default function ProductsPage() {
  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Grow"
        title="URL to Video"
        description="Paste a product page. AdForge reads the facts, price, photos, logo and colors, finds the angles that sell, and turns them into a timed ad script you can voice, storyboard and edit."
      />
      <Suspense fallback={<Skeleton className="h-[60vh] rounded-2xl" />}>
        <ProductsView />
      </Suspense>
    </PageContainer>
  );
}
