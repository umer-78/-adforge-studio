import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/misc';
import { ConsentsView } from './view';

export const metadata = { title: 'Consents' };

export default function ConsentsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] rounded-2xl" />}>
      <ConsentsView />
    </Suspense>
  );
}
