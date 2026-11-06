'use client';

import { ErrorView } from '@/components/app/error-view';

/** Keeps the studio's navigation on screen when one page fails. */
export default function StudioError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorView error={error} retry={retry} home="/dashboard" homeLabel="Go to the dashboard" className="min-h-[60vh]" />;
}
