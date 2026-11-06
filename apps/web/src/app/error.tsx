'use client';

import { ErrorView } from '@/components/app/error-view';

export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorView error={error} retry={retry} className="min-h-dvh bg-background" />;
}
