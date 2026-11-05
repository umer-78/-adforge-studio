import { Suspense } from 'react';
import { PageContainer } from '@/components/app/page';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { InspirationView } from './view';

export const metadata = { title: 'Inspiration' };

export default function InspirationPage() {
  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Grow"
        title="Inspiration"
        description="Your swipe file and competitor tracker. Search Meta's Ad Library, follow competitors so their new ads land here on their own, and sort by how long each ad has run: the long runners are the ones making money."
      />
      <Suspense fallback={<Skeleton className="h-[60vh] rounded-2xl" />}>
        <InspirationView />
      </Suspense>
    </PageContainer>
  );
}
