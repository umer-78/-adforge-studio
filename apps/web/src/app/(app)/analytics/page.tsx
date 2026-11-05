import { Suspense } from 'react';
import { PageContainer } from '@/components/app/page';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { AnalyticsDashboard } from './view';

export const metadata = { title: 'Analytics' };

export default function AnalyticsPage() {
  return (
    <PageContainer wide>
      <PageHeader eyebrow="Distribute" title="Analytics" description="What your posts and ads did, day by day, and which variant is winning each test. Numbers refresh as the platforms report them." />
      <Suspense fallback={<Skeleton className="h-[60vh] rounded-2xl" />}>
        <AnalyticsDashboard />
      </Suspense>
    </PageContainer>
  );
}
