import { Suspense } from 'react';
import { PageContainer } from '@/components/app/page';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { GenerateView } from './view';

export const metadata = { title: 'Generate' };

export default function GeneratePage() {
  return (
    <PageContainer wide>
      <PageHeader eyebrow="AI video" title="Generate" description="Text, image or video in, ad-ready clips out. You see the price and time before every run." />
      <Suspense fallback={<Skeleton className="h-[70vh] rounded-2xl" />}>
        <GenerateView />
      </Suspense>
    </PageContainer>
  );
}
