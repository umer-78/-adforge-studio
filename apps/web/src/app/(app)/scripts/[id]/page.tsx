import { Suspense } from 'react';
import { PageContainer } from '@/components/app/page';
import { ScriptEditor } from '@/components/scripts/script-editor';
import { Skeleton } from '@/components/ui/misc';

export const metadata = { title: 'Script' };

export default function ScriptPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageContainer wide>
      <Suspense fallback={<Skeleton className="h-[70vh] rounded-2xl" />}>
        <Editor params={params} />
      </Suspense>
    </PageContainer>
  );
}

async function Editor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ScriptEditor key={id} id={id} />;
}
