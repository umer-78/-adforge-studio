import { Suspense } from 'react';
import { Logo } from '@/components/app/logo';
import { Skeleton } from '@/components/ui/misc';
import { ResetForm } from './form';

export const metadata = { title: 'Choose a new password', robots: { index: false } };

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-background px-4 py-8 sm:px-10">
      <a href="/" className="self-start">
        <Logo />
      </a>
      <div className="flex flex-1 items-center justify-center py-10">
        <Suspense fallback={<Skeleton className="h-72 w-full max-w-sm rounded-2xl" />}>
          <ResetForm />
        </Suspense>
      </div>
    </main>
  );
}
