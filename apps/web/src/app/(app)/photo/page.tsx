import { Suspense } from 'react';
import { PageContainer } from '@/components/app/page';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { PhotoView } from './view';

export const metadata = { title: 'Photo Studio' };

export default function PhotoPage() {
  return (
    <PageContainer wide>
      <PageHeader eyebrow="AI photo" title="Photo Studio" description="Product shots, edits, fills, upscales and cutouts, one photo or a whole batch. Turn any photo into a moving 3D clip." />
      <Suspense fallback={<Skeleton className="h-[70vh] rounded-2xl" />}>
        <PhotoView />
      </Suspense>
    </PageContainer>
  );
}
