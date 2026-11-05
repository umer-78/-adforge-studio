'use client';

import type { Provider } from '@supabase/supabase-js';
import { MailCheck } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, Notice } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { supabaseBrowser } from '@/lib/supabase/browser';

type Mode = 'password' | 'link' | 'signup' | 'reset';

const OAUTH_LABEL: Partial<Record<Provider, string>> = { google: 'Google', github: 'GitHub', apple: 'Apple', azure: 'Microsoft', linkedin_oidc: 'LinkedIn' };
const OAUTH = (process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s): s is Provider => s in OAUTH_LABEL);

const safeNext = (p: string | null) => (p && p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/api/') && !p.startsWith('/auth/') ? p : '/dashboard');

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m === 'not_allowed') return 'This email is not on the list of people who can use this studio. The owner can add it to APP_OWNER_EMAILS.';
  if (m.includes('invalid login credentials')) return 'That email and password do not match.';
  if (m.includes('email not confirmed')) return 'Confirm your email first: open the link we sent you, then sign in.';
  if (m.includes('rate limit')) return 'Too many emails were sent just now. Wait a few minutes, or sign in with your password.';
  if (m.includes('already registered')) return 'There is already an account with this email. Sign in instead.';
  return message;
}

export function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const next = safeNext(params.get('next'));
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() => {
    const e = params.get('error');
    return e ? friendly(e) : null;
  });
  const [sent, setSent] = useState<string | null>(null);
  const callback = (to: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(to)}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(mode);
    try {
      const sb = supabaseBrowser();
      const address = email.trim();
      if (mode === 'password') {
        const { error: err } = await sb.auth.signInWithPassword({ email: address, password });
        if (err) throw err;
        router.replace(next);
        router.refresh();
        return;
      }
      if (mode === 'link') {
        const { error: err } = await sb.auth.signInWithOtp({ email: address, options: { emailRedirectTo: callback(next) } });
        if (err) throw err;
        setSent(`We sent a sign-in link to ${address}. Open it on this device.`);
      } else if (mode === 'signup') {
        const { data, error: err } = await sb.auth.signUp({ email: address, password, options: { emailRedirectTo: callback(next) } });
        if (err) throw err;
        if (data.session) {
          router.replace(next);
          router.refresh();
          return;
        }
        setSent(`Check ${address} for a link to confirm your account.`);
      } else {
        const { error: err } = await sb.auth.resetPasswordForEmail(address, { redirectTo: callback('/reset-password') });
        if (err) throw err;
        setSent(`If ${address} has an account, a link to set a new password is on its way.`);
      }
    } catch (err) {
      setError(friendly((err as Error).message));
    } finally {
      setBusy(null);
    }
  }

  async function oauth(provider: Provider) {
    setError(null);
    setBusy(provider);
    const { error: err } = await supabaseBrowser().auth.signInWithOAuth({ provider, options: { redirectTo: callback(next) } });
    if (err) {
      setError(friendly(err.message));
      setBusy(null);
    }
  }

  if (sent) {
    return (
      <div className="w-full max-w-sm space-y-5 text-center">
        <MailCheck className="mx-auto size-10 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="text-sm text-muted-foreground">{sent}</p>
        <Button variant="ghost" onClick={() => setSent(null)}>
          Back to sign in
        </Button>
      </div>
    );
  }

  const needsPassword = mode === 'password' || mode === 'signup';
  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Welcome back'}</h1>
        <p className="text-sm text-muted-foreground">{mode === 'reset' ? 'We will email you a link to choose a new password.' : 'Sign in to your studio.'}</p>
      </div>
      {params.get('signedOut') && !error && <Notice tone="success">You are signed out.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {mode !== 'reset' && (
        <Segmented
          value={mode}
          onChange={(m) => (setMode(m), setError(null))}
          className="w-full [&>*]:flex-1"
          options={[
            { value: 'password', label: 'Password' },
            { value: 'link', label: 'Email link' },
            { value: 'signup', label: 'New account' },
          ]}
        />
      )}
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoFocus />
        </Field>
        {needsPassword && (
          <Field
            label="Password"
            htmlFor="password"
            aside={
              mode === 'password' ? (
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => (setMode('reset'), setError(null))}>
                  Forgot it?
                </button>
              ) : undefined
            }
            hint={mode === 'signup' ? 'At least 8 characters.' : undefined}
          >
            <Input
              id="password"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={mode === 'signup' ? 8 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        )}
        <Button type="submit" size="lg" className="w-full" loading={busy === mode}>
          {mode === 'password' ? 'Sign in' : mode === 'link' ? 'Email me a link' : mode === 'signup' ? 'Create account' : 'Send reset link'}
        </Button>
        {mode === 'reset' && (
          <Button type="button" variant="ghost" className="w-full" onClick={() => setMode('password')}>
            Back to sign in
          </Button>
        )}
      </form>
      {OAUTH.length > 0 && mode !== 'reset' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>
          {OAUTH.map((p) => (
            <Button key={p} type="button" variant="outline" className="w-full" loading={busy === p} onClick={() => oauth(p)}>
              Continue with {OAUTH_LABEL[p]}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
