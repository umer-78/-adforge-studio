import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/misc';
import { AccountsView } from './view';

export const metadata = { title: 'Social accounts' };

export default function AccountsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] rounded-2xl" />}>
      <AccountsView />
    </Suspense>
  );
}
