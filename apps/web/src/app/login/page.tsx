import Link from 'next/link';
import { Suspense } from 'react';
import { Logo } from '@/components/app/logo';
import { LoopVideo } from '@/components/marketing/loop-video';
import { Skeleton } from '@/components/ui/misc';
import { LoginForm } from './form';

export const metadata = { title: 'Sign in', robots: { index: false } };

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-black lg:block">
        <LoopVideo src="/landing/kinetic.mp4" poster="/landing/kinetic.jpg" className="absolute inset-0 size-full opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/10" />
        <div className="absolute inset-x-10 bottom-10 space-y-3 text-white">
          <p className="font-display text-5xl leading-[1.05] tracking-tight">
            Ads that stop <span className="italic">the scroll.</span>
          </p>
          <p className="max-w-md text-sm text-white/70">Generate, edit, voice, score and publish ad videos and photos in one studio, with the price shown before anything runs.</p>
        </div>
      </aside>
      <section className="flex min-h-dvh flex-col px-4 py-8 sm:px-10">
        <Link href="/" className="self-start">
          <Logo />
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <Suspense fallback={<Skeleton className="h-96 w-full max-w-sm rounded-2xl" />}>
            <LoginForm />
          </Suspense>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          <a href="/terms" className="hover:text-foreground">Terms</a> · <a href="/privacy" className="hover:text-foreground">Privacy</a>
        </p>
      </section>
    </main>
  );
}
