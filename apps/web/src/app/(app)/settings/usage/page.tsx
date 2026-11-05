import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/misc';
import { UsageSettings } from './view';

export const metadata = { title: 'Usage & budget' };

export default function UsagePage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] rounded-2xl" />}>
      <UsageSettings />
    </Suspense>
  );
}
