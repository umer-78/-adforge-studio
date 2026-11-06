import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/misc';
import { TeamView } from './view';

export const metadata = { title: 'Team' };

export default function TeamPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] rounded-2xl" />}>
      <TeamView />
    </Suspense>
  );
}
