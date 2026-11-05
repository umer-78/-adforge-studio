import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/misc';
import { BrandView } from './view';

export const metadata = { title: 'Brand kits' };

export default function BrandPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] rounded-2xl" />}>
      <BrandView />
    </Suspense>
  );
}
