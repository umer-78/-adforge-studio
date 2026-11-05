import { Suspense } from 'react';
import { PageContainer } from '@/components/app/page';
import { LibraryView } from '@/components/library/library-view';
import { PageHeader, Skeleton } from '@/components/ui/misc';

export const metadata = { title: 'Trash' };

export default function TrashPage() {
  return (
    <PageContainer wide>
      <PageHeader title="Trash" description="Files here are deleted for good after your retention period (Settings → Workspace)." />
      <Suspense fallback={<Skeleton className="h-[60vh] rounded-2xl" />}>
        <LibraryView trash />
      </Suspense>
    </PageContainer>
  );
}
