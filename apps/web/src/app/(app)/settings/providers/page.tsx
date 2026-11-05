import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/misc';
import { ProvidersView } from './view';

export const metadata = { title: 'AI providers' };

export default function ProvidersPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] rounded-2xl" />}>
      <ProvidersView />
    </Suspense>
  );
}
