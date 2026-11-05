import { Suspense } from 'react';
import { PageContainer } from '@/components/app/page';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { ScriptsView } from './view';

export const metadata = { title: 'Scripts' };

export default function ScriptsPage() {
  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Create"
        title="Script & Dialogue Studio"
        description="Ad scripts and character dialogues written beat by beat: hook, problem, proof, offer, CTA. Each line carries the shot, camera move and on-screen text, so you can voice it, sketch frames and build the edit in one go."
      />
      <Suspense fallback={<Skeleton className="h-[60vh] rounded-2xl" />}>
        <ScriptsView />
      </Suspense>
    </PageContainer>
  );
}
