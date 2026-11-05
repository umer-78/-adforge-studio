import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/misc';
import { AdAccountsView } from './view';

export const metadata = { title: 'Ad accounts' };

export default function AdAccountsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] rounded-2xl" />}>
      <AdAccountsView />
    </Suspense>
  );
}
