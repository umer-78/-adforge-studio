import { Suspense } from 'react';
import { PageContainer } from '@/components/app/page';
import { LibraryView } from '@/components/library/library-view';
import { PageHeader, Skeleton } from '@/components/ui/misc';

export const metadata = { title: 'Library' };

export default function LibraryPage() {
  return (
    <PageContainer wide>
      <PageHeader title="Library" description="Every video, photo, sound and 3D model. Drop files anywhere on this page to upload." />
      <Suspense fallback={<Skeleton className="h-[60vh] rounded-2xl" />}>
        <LibraryView />
      </Suspense>
    </PageContainer>
  );
}
