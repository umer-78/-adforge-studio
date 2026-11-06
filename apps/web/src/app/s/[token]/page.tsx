import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ShareView } from '@/components/share/share-view';

export const metadata: Metadata = {
  title: 'Shared files',
  description: 'Files shared from AdForge Studio.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <Share params={params} />
    </Suspense>
  );
}

async function Share({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ShareView token={token} />;
}
