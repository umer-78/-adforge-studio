'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api-client';

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechCtor = new () => SpeechRecognitionLike;

function speechCtor(): SpeechCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Voice dictation for prompt boxes. Uses the browser's speech recognition when it exists
 * (free, live words); otherwise records and transcribes on the server.
 */
export function useDictation(onText: (text: string, final: boolean) => void, lang = 'en-US') {
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const rec = useRef<SpeechRecognitionLike | null>(null);
  const media = useRef<{ recorder: MediaRecorder; stream: MediaStream; startedAt: number } | null>(null);
  const cb = useRef(onText);
  cb.current = onText;

  const stop = useCallback(() => {
    rec.current?.stop();
    if (media.current && media.current.recorder.state !== 'inactive') media.current.recorder.stop();
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    const Ctor = speechCtor();
    if (Ctor) {
      const r = new Ctor();
      r.lang = lang;
      r.continuous = true;
      r.interimResults = true;
      r.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i]!;
          cb.current(res[0].transcript, res.isFinal);
        }
      };
      r.onerror = (e) => {
        if (e.error !== 'aborted' && e.error !== 'no-speech') toast.error(e.error === 'not-allowed' ? 'Allow microphone access to dictate.' : `Dictation stopped: ${e.error}`);
      };
      r.onend = () => setListening(false);
      rec.current = r;
      r.start();
      setListening(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setListening(false);
        const durationS = (Date.now() - (media.current?.startedAt ?? Date.now())) / 1000;
        media.current = null;
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size < 2000) return;
        setBusy(true);
        try {
          const form = new FormData();
          form.set('audio', blob, 'dictation.webm');
          form.set('durationS', String(Math.round(durationS)));
          form.set('language', lang.slice(0, 2));
          const res = await fetch('/api/transcribe', { method: 'POST', body: form, credentials: 'same-origin' });
          const data = (await res.json()) as { text?: string; error?: { message: string } };
          if (!res.ok) throw new Error(data.error?.message ?? 'Transcription failed');
          if (data.text) cb.current(data.text, true);
        } catch (err) {
          toast.error(errorMessage(err));
        } finally {
          setBusy(false);
        }
      };
      media.current = { recorder, stream, startedAt: Date.now() };
      recorder.start();
      setListening(true);
    } catch {
      toast.error('Allow microphone access to dictate.');
    }
  }, [lang]);

  return { listening, busy, start, stop, toggle: () => (listening ? stop() : void start()), native: !!speechCtor() };
}
