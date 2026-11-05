'use client';

import { useQuery } from '@tanstack/react-query';
import { Pause, Play } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api-client';
import type { VoiceView } from '@/lib/types';
import { cn } from '@/lib/utils';

export function useVoices() {
  return useQuery({ queryKey: ['voices'], queryFn: () => api.get<{ items: VoiceView[] }>('/voices').then((r) => r.items), staleTime: 60_000 });
}

export const voiceHint = (v: VoiceView) =>
  [v.isCloned ? 'Cloned' : null, v.labels.gender, v.labels.accent, v.labels.age, v.labels.use_case ?? v.labels.description].filter(Boolean).join(' · ');

/** Plays a voice's sample; starting one stops any other sample on the page. */
export function VoicePreview({ url, className }: { url: string | null | undefined; className?: string }) {
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent<HTMLAudioElement>).detail !== ref.current) ref.current?.pause();
    };
    document.addEventListener('af:voice-preview', onOther);
    return () => {
      document.removeEventListener('af:voice-preview', onOther);
      ref.current?.pause();
    };
  }, []);
  useEffect(() => {
    ref.current?.pause();
    ref.current = null;
  }, [url]);
  if (!url) return null;
  const toggle = () => {
    if (!ref.current) {
      ref.current = new Audio(url);
      ref.current.onended = () => setPlaying(false);
      ref.current.onpause = () => setPlaying(false);
    }
    if (playing) ref.current.pause();
    else {
      document.dispatchEvent(new CustomEvent('af:voice-preview', { detail: ref.current }));
      void ref.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };
  return (
    <Button type="button" size="icon-sm" variant="ghost" aria-label={playing ? 'Stop sample' : 'Play sample'} className={className} onClick={toggle}>
      {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
    </Button>
  );
}

/**
 * Picks one of the workspace's saved voices. `by` chooses what the value holds: the voice
 * row id (characters) or the ElevenLabs voice id (generation params).
 */
export function VoicePicker({
  value,
  onChange,
  by = 'provider',
  noneLabel,
  size = 'default',
  className,
  preview = true,
}: {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  by?: 'id' | 'provider';
  /** When set, an empty choice with this label is offered. */
  noneLabel?: string;
  size?: 'default' | 'sm';
  className?: string;
  preview?: boolean;
}) {
  const voices = useVoices();
  const key = (v: VoiceView) => (by === 'id' ? v.id : v.providerVoiceId);
  const current = voices.data?.find((v) => key(v) === value);
  if (voices.data && !voices.data.length) {
    return (
      <div className={cn('flex items-center rounded-lg border border-dashed px-3 text-xs text-muted-foreground', size === 'sm' ? 'h-8' : 'h-9', className)}>
        No voices yet.&nbsp;
        <Link href="/voice?tab=library" className="text-primary hover:underline">
          Add voices
        </Link>
      </div>
    );
  }
  return (
    <div className={cn('flex min-w-0 items-center gap-1', className)}>
      <Select
        size={size}
        value={value ?? (noneLabel ? 'none' : undefined)}
        onValueChange={(v) => onChange(v === 'none' ? null : v)}
        placeholder={voices.isLoading ? 'Loading voices…' : 'Choose a voice'}
        aria-label="Voice"
        options={[...(noneLabel ? [{ value: 'none', label: noneLabel }] : []), ...(voices.data ?? []).map((v) => ({ value: key(v), label: v.name, hint: voiceHint(v) || undefined }))]}
      />
      {preview && <VoicePreview url={current?.previewUrl} className="shrink-0" />}
    </div>
  );
}
