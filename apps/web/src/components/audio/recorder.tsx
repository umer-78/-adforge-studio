'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Check, Mic, RotateCcw, Square } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { errorMessage } from '@/lib/api-client';
import { recorderAudioMime, recordingToWav } from '@/lib/audio';
import type { AssetView } from '@/lib/types';
import { uploadAndWait } from '@/lib/upload';
import { cn } from '@/lib/utils';

type Phase = 'idle' | 'starting' | 'recording' | 'recorded' | 'saving';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Records from a microphone with a live level meter, then saves the take to the library
 * as a WAV file. `raw` turns off the browser's noise suppression (better for voice cloning).
 */
export function Recorder({
  onSaved,
  name = 'Recording',
  maxSeconds = 300,
  raw = false,
  saveLabel = 'Save take',
  className,
}: {
  onSaved: (asset: AssetView) => void;
  name?: string;
  maxSeconds?: number;
  raw?: boolean;
  saveLabel?: string;
  className?: string;
}) {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [clipping, setClipping] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>('default');
  const [take, setTake] = useState<{ blob: Blob; url: string } | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const raf = useRef(0);
  const startedAt = useRef(0);

  const release = useCallback(() => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void audioCtx.current?.close().catch(() => undefined);
    audioCtx.current = null;
  }, []);

  useEffect(() => () => release(), [release]);
  useEffect(() => () => {
    if (take) URL.revokeObjectURL(take.url);
  }, [take]);

  const loadDevices = async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((d) => d.kind === 'audioinput' && d.deviceId));
    } catch {
      // Device names need permission; the default mic still works.
    }
  };

  const stop = useCallback(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  const start = async () => {
    const mime = recorderAudioMime();
    if (!mime || !navigator.mediaDevices?.getUserMedia) {
      toast.error('This browser cannot record audio. Try Chrome, Edge, Firefox or Safari.');
      return;
    }
    setPhase('starting');
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { ...(deviceId !== 'default' ? { deviceId: { exact: deviceId } } : {}), echoCancellation: !raw, noiseSuppression: !raw, autoGainControl: !raw, channelCount: 1 },
      });
      stream.current = s;
      void loadDevices();
      const ctx = new AudioContext();
      audioCtx.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      ctx.createMediaStreamSource(s).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        let peak = 0;
        for (const v of buf) {
          sum += v * v;
          peak = Math.max(peak, Math.abs(v));
        }
        const db = 20 * Math.log10(Math.sqrt(sum / buf.length) || 1e-6);
        setLevel(Math.max(0, Math.min(1, (db + 60) / 60)));
        if (peak > 0.98) setClipping(true);
        const secs = (performance.now() - startedAt.current) / 1000;
        setElapsed(secs);
        if (secs >= maxSeconds) stop();
        raf.current = requestAnimationFrame(tick);
      };
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(s, { mimeType: mime });
      recorder.current = rec;
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        release();
        const blob = new Blob(chunks, { type: mime.split(';')[0] });
        setTake({ blob, url: URL.createObjectURL(blob) });
        setPhase('recorded');
      };
      rec.start(1000);
      startedAt.current = performance.now();
      setClipping(false);
      setElapsed(0);
      setPhase('recording');
      raf.current = requestAnimationFrame(tick);
    } catch (e) {
      release();
      setPhase('idle');
      toast.error((e as Error).name === 'NotAllowedError' ? 'Allow microphone access in the browser to record.' : errorMessage(e));
    }
  };

  const save = async () => {
    if (!take) return;
    setPhase('saving');
    try {
      const stamp = new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }).replace(/[/:]/g, '-');
      const file = await recordingToWav(take.blob, `${name} ${stamp}.wav`);
      const asset = await uploadAndWait(file, { source: 'recording', queryClient: qc });
      onSaved(asset);
      setTake(null);
      setPhase('idle');
      toast.success('Recording saved to your library');
    } catch (e) {
      setPhase('recorded');
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className={cn('space-y-3 rounded-2xl border bg-card p-4', className)}>
      {phase === 'recorded' || phase === 'saving' ? (
        <div className="space-y-3">
          <audio src={take?.url} controls className="h-10 w-full" />
          <div className="flex flex-wrap gap-2">
            <Button variant="brand" size="sm" loading={phase === 'saving'} onClick={() => void save()}>
              <Check className="size-4" /> {saveLabel}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={phase === 'saving'}
              onClick={() => {
                setTake(null);
                setPhase('idle');
              }}
            >
              <RotateCcw className="size-4" /> Record again
            </Button>
            <span className="ml-auto self-center text-xs tabular-nums text-muted-foreground">{clock(elapsed)}</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <Button
            type="button"
            size="icon"
            variant={phase === 'recording' ? 'destructive' : 'brand'}
            className={cn('size-14 shrink-0 rounded-full', phase === 'recording' && 'animate-pulse-ring')}
            aria-label={phase === 'recording' ? 'Stop recording' : 'Start recording'}
            loading={phase === 'starting'}
            onClick={() => (phase === 'recording' ? stop() : void start())}
          >
            {phase === 'recording' ? <Square className="size-5 fill-current" /> : <Mic className="size-6" />}
          </Button>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{phase === 'recording' ? (clipping ? 'Too loud: move back from the mic' : 'Recording…') : 'Press to record'}</span>
              <span className="tabular-nums">
                {clock(elapsed)} / {clock(maxSeconds)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-3">
              <div className={cn('h-full rounded-full transition-[width] duration-75', clipping ? 'bg-destructive' : level > 0.8 ? 'bg-warning' : 'bg-success')} style={{ width: `${phase === 'recording' ? level * 100 : 0}%` }} />
            </div>
            {devices.length > 1 && phase !== 'recording' && (
              <Select size="sm" value={deviceId} onValueChange={setDeviceId} options={[{ value: 'default', label: 'Default microphone' }, ...devices.map((d) => ({ value: d.deviceId, label: d.label || 'Microphone' }))]} aria-label="Microphone" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
