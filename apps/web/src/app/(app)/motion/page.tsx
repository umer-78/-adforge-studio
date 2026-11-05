import { Suspense } from 'react';
import { PageContainer } from '@/components/app/page';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { MotionView } from './view';

export const metadata = { title: '3D & Motion' };

export default function MotionPage() {
  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Create"
        title="3D & Motion"
        description="Animated titles, price tags, CTAs and reviews with a live preview. Put your ad on a 3D phone, laptop, TV or billboard with a camera move, or turn a product photo into a 3D model, then render clips for your ads."
      />
      <Suspense fallback={<Skeleton className="h-[70vh] rounded-2xl" />}>
        <MotionView />
      </Suspense>
    </PageContainer>
  );
}
