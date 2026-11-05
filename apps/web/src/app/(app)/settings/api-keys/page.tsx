import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/misc';
import { ApiKeysView } from './view';

export const metadata = { title: 'API & MCP' };

export default function ApiKeysPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] rounded-2xl" />}>
      <ApiKeysView />
    </Suspense>
  );
}
