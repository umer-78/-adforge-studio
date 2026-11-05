'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, Notice } from '@/components/ui/misc';
import { supabaseBrowser } from '@/lib/supabase/browser';

/** Reached from the reset email, which signs the person in first. */
export function ResetForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mismatch = again.length > 0 && again !== password;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mismatch || password.length < 8) return;
    setBusy(true);
    setError(null);
    const sb = supabaseBrowser();
    const { data } = await sb.auth.getSession();
    if (!data.session) {
      setBusy(false);
      setError('This reset link has expired. Request a new one from the sign-in page.');
      return;
    }
    const { error: err } = await sb.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    toast.success('Password changed');
    router.replace('/dashboard');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-5">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="text-sm text-muted-foreground">At least 8 characters. You stay signed in on this device.</p>
      </div>
      {error && (
        <Notice tone="error">
          {error} <a href="/login" className="font-medium underline">Sign in</a>
        </Notice>
      )}
      <Field label="New password" htmlFor="pw">
        <Input id="pw" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      </Field>
      <Field label="Type it again" htmlFor="pw2" error={mismatch ? 'The two passwords are different.' : undefined}>
        <Input id="pw2" type="password" autoComplete="new-password" minLength={8} required value={again} onChange={(e) => setAgain(e.target.value)} />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={busy} disabled={mismatch || password.length < 8}>
        Save password
      </Button>
    </form>
  );
}
