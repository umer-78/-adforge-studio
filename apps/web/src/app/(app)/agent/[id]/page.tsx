import { Suspense } from 'react';
import { PageContainer } from '@/components/app/page';
import { Skeleton } from '@/components/ui/misc';
import { AgentRunDetail } from './detail';

export const metadata = { title: 'Agent run' };

export default function AgentRunPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageContainer wide>
      <Suspense fallback={<Skeleton className="h-[70vh] rounded-2xl" />}>
        <Detail params={params} />
      </Suspense>
    </PageContainer>
  );
}

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AgentRunDetail key={id} id={id} />;
}
