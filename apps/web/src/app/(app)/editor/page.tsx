import { Suspense } from 'react';
import { PageContainer } from '@/components/app/page';
import { EditsView } from '@/components/editor/edits-list';
import { PageHeader, Skeleton } from '@/components/ui/misc';

export const metadata = { title: 'Editor' };

export default function EditorListPage() {
  return (
    <PageContainer wide>
      <PageHeader eyebrow="Edit" title="Editor" description="Multi-track editing for ads: trim, captions, voice, music, motion graphics, color and AI edits by instruction, then export for every platform." />
      <Suspense fallback={<Skeleton className="h-[60vh] rounded-2xl" />}>
        <EditsView />
      </Suspense>
    </PageContainer>
  );
}
