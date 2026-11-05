import { Suspense } from 'react';
import { PageContainer } from '@/components/app/page';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { AgentView } from './view';

export const metadata = { title: 'Agent' };

export default function AgentPage() {
  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Grow"
        title="Agent"
        description="Give it a product and a goal. The agent researches the audience and competitor ads, writes the script, makes the video and creates paused ads, then reads the results and suggests what to test next. It asks before every step and shows the price first."
      />
      <Suspense fallback={<Skeleton className="h-[60vh] rounded-2xl" />}>
        <AgentView />
      </Suspense>
    </PageContainer>
  );
}
