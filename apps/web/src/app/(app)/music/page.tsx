import { Gift } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { PageContainer } from '@/components/app/page';
import { Button } from '@/components/ui/button';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { MusicView } from './view';

export const metadata = { title: 'Music & SFX' };

export default function MusicPage() {
  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Create"
        title="Music & SFX"
        description="Original music, songs and audio logos cleared for ads, plus sound effects for every cut. Only licensed audio goes into your exports: every track carries its license, tempo and beat markers."
        actions={
          <Button asChild variant="secondary">
            <Link href="/free-media?kind=music">
              <Gift /> Free music and sounds
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<Skeleton className="h-[70vh] rounded-2xl" />}>
        <MusicView />
      </Suspense>
    </PageContainer>
  );
}
