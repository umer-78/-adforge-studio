import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/misc';
import { GeneralSettings } from './general';

export const metadata = { title: 'Settings' };

export default function SettingsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] rounded-2xl" />}>
      <GeneralSettings />
    </Suspense>
  );
}
