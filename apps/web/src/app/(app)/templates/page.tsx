import { Suspense } from 'react';
import { PageContainer } from '@/components/app/page';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { TemplatesView } from './view';

export const metadata = { title: 'Templates' };

export default function TemplatesPage() {
  return (
    <PageContainer wide>
      <PageHeader eyebrow="Edit" title="Templates" description="Proven ad structures with slots for your shots, ready in your brand colors and fonts. Save any edit of yours as a template too." />
      <Suspense fallback={<Skeleton className="h-[60vh] rounded-2xl" />}>
        <TemplatesView />
      </Suspense>
    </PageContainer>
  );
}
