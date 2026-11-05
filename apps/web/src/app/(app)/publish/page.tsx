import { Suspense } from 'react';
import { PageContainer } from '@/components/app/page';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { PublishView } from './view';

export const metadata = { title: 'Publish' };

export default function PublishPage() {
  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Distribute"
        title="Publish"
        description="Post or schedule to YouTube, TikTok, Instagram, Facebook, LinkedIn, X and Pinterest from one place. Each platform's limits are checked before anything goes out, and music without commercial rights is blocked."
      />
      <Suspense fallback={<Skeleton className="h-[60vh] rounded-2xl" />}>
        <PublishView />
      </Suspense>
    </PageContainer>
  );
}
