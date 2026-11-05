'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AudioLines, Languages, Library, Mic, Plus, Repeat, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { DUB_LANGUAGES, formatDuration, LANGUAGES, languageName } from '@adforge/core';
import { AssetSlot, AssetPicker } from '@/components/app/asset-picker';
import { AssetThumb } from '@/components/app/asset-card';
import { ConsentPicker } from '@/components/app/consent-picker';
import { useVoices, VoicePicker } from '@/components/app/voice-picker';
import { AudioFeed } from '@/components/audio/audio-feed';
import { Recorder } from '@/components/audio/recorder';
import { RunBar } from '@/components/audio/run-bar';
import { Composer, Labeled, studioColumns, useCapabilityModel } from '@/components/audio/studio';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, Notice } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api-client';
import { useLocalSetting } from '@/lib/hooks/use-local-setting';
import type { AssetView, VoiceView } from '@/lib/types';
import { cn } from '@/lib/utils';

const V3_TAGS = ['excited', 'whispers', 'laughs', 'sighs', 'sarcastic', 'curious', 'mischievously', 'crying', 'exhales'];

/* --------------------------------- Speak --------------------------------- */

export function SpeakPanel() {
  const sp = useSearchParams();
  const { models, model, modelId, setModelId } = useCapabilityModel('tts');
  const [text, setText] = useState(() => sp.get('text') ?? '');
  const [voiceId, setVoiceId] = useLocalSetting<string | null>('af:voice:last', null);
  const [language, setLanguage] = useState('auto');
  const [stability, setStability] = useState(0.5);
  const [similarity, setSimilarity] = useState(0.75);
  const [style, setStyle] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [takes, setTakes] = useState('1');
  const [advanced, setAdvanced] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const v = sp.get('voice');
    if (v) setVoiceId(v);
    // Only the link that opened the page sets the voice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const v3 = modelId === 'eleven-v3-tts';
  const limit = v3 ? 3000 : 10000;
  const insertTag = (tag: string) => {
    const el = area.current;
    const at = el?.selectionStart ?? text.length;
    const next = `${text.slice(0, at)}[${tag}] ${text.slice(at)}`;
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + tag.length + 3, at + tag.length + 3);
    });
  };
  const prompt = v3 ? text.trim() : text.replace(/\[[^\]]*\]\s*/g, '').trim();
  const params = { prompt, ...(voiceId ? { voiceId } : {}), stability: v3 ? Math.round(stability * 2) / 2 : stability, similarity, style, speed, ...(language !== 'auto' ? { language } : {}) };
  const problems = [!voiceId ? 'Choose a voice.' : '', !prompt ? 'Write what the voice should say.' : '', text.length > limit ? `Keep it under ${limit.toLocaleString()} characters for ${model?.label ?? 'this model'}.` : ''].filter(Boolean);

  return (
    <div className={studioColumns}>
      <Composer>
        <Field label="Voice">
          <VoicePicker value={voiceId} onChange={setVoiceId} />
        </Field>
        <Field label="Script" aside={<span className={cn(text.length > limit && 'text-destructive')}>{`${text.length.toLocaleString()} / ${limit.toLocaleString()}`}</span>}>
          <Textarea ref={area} rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Stop scrolling. This bottle keeps your water ice-cold for twenty-four hours." className="text-[15px] leading-relaxed" />
        </Field>
        {v3 && (
          <div className="flex flex-wrap gap-1.5">
            {V3_TAGS.map((t) => (
              <button key={t} type="button" onClick={() => insertTag(t)} className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground transition hover:border-primary/60 hover:text-primary">
                [{t}]
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Model">
            <Select value={modelId} onValueChange={setModelId} options={models.map((m) => ({ value: m.id, label: m.label, hint: m.description }))} />
          </Field>
          <Field label="Language">
            <Select value={language} onValueChange={setLanguage} options={[{ value: 'auto', label: 'Detect from text' }, ...LANGUAGES.map((l) => ({ value: l.code, label: l.name }))]} />
          </Field>
        </div>
        <Field label="Takes">
          <Segmented size="sm" value={takes} onChange={setTakes} options={['1', '2', '3'].map((v) => ({ value: v, label: v }))} />
        </Field>
        <button type="button" className="text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => setAdvanced((v) => !v)}>
          {advanced ? 'Hide' : 'Show'} voice settings
        </button>
        {advanced && (
          <div className="space-y-4 rounded-xl bg-surface-2/60 p-3">
            {v3 ? (
              <Field label="Delivery" hint="Creative is the most expressive; Robust follows the voice most closely.">
                <Segmented size="sm" value={String(Math.round(stability * 2) / 2)} onChange={(v) => setStability(Number(v))} options={[{ value: '0', label: 'Creative' }, { value: '0.5', label: 'Natural' }, { value: '1', label: 'Robust' }]} />
              </Field>
            ) : (
              <Labeled label="Stability" value={stability.toFixed(2)}>
                <Slider min={0} max={1} step={0.05} value={[stability]} onValueChange={([v]) => setStability(v ?? 0.5)} />
              </Labeled>
            )}
            <Labeled label="Similarity" value={similarity.toFixed(2)}>
              <Slider min={0} max={1} step={0.05} value={[similarity]} onValueChange={([v]) => setSimilarity(v ?? 0.75)} />
            </Labeled>
            <Labeled label="Style exaggeration" value={style.toFixed(2)}>
              <Slider min={0} max={1} step={0.05} value={[style]} onValueChange={([v]) => setStyle(v ?? 0)} />
            </Labeled>
            <Labeled label="Speed" value={`${speed.toFixed(2)}×`}>
              <Slider min={0.7} max={1.2} step={0.05} value={[speed]} onValueChange={([v]) => setSpeed(v ?? 1)} />
            </Labeled>
          </div>
        )}
        <RunBar model={model} input={{ capability: 'tts', params, variants: Number(takes) }} problems={problems} label="Generate voice-over" icon={<AudioLines className="size-4" />} />
      </Composer>
      <AudioFeed capabilities={['tts']} emptyTitle="No voice-overs yet" emptyDescription="Pick a voice, paste your script and generate. Every take lands in your library, ready for the editor." />
    </div>
  );
}

/* -------------------------------- Dialogue -------------------------------- */

interface Row {
  id: string;
  voiceId: string | null;
  text: string;
}

export function DialoguePanel() {
  const { model } = useCapabilityModel('dialogue');
  const voices = useVoices();
  const [rows, setRows] = useState<Row[]>(() => [
    { id: crypto.randomUUID(), voiceId: null, text: '' },
    { id: crypto.randomUUID(), voiceId: null, text: '' },
  ]);
  const name = (id: string | null) => voices.data?.find((v) => v.providerVoiceId === id)?.name ?? 'Speaker';
  const filled = rows.filter((r) => r.text.trim());
  const prompt = filled.map((r) => `${name(r.voiceId)}: ${r.text.trim()}`).join('\n');
  const problems = [filled.length < 2 ? 'Write at least two lines.' : '', filled.some((r) => !r.voiceId) ? 'Pick a voice for every line.' : '', prompt.length > 3000 ? 'Keep the whole dialogue under 3,000 characters.' : ''].filter(Boolean);
  const update = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <div className={studioColumns}>
      <Composer>
        <p className="text-sm text-muted-foreground">One take with natural back-and-forth: interruptions, reactions and timing between the speakers. Audio tags like [laughs] work here too.</p>
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={r.id} className="space-y-2 rounded-xl border p-3">
              <div className="flex items-center gap-2">
                <span className="w-5 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                <VoicePicker size="sm" value={r.voiceId} onChange={(v) => update(r.id, { voiceId: v })} className="flex-1" />
                <Button size="icon-xs" variant="ghost" aria-label="Remove line" disabled={rows.length <= 2} onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <Textarea rows={2} value={r.text} onChange={(e) => update(r.id, { text: e.target.value })} placeholder={i % 2 ? 'Wait, it actually stays cold?' : 'I left it in the car all day. [laughs] Still ice.'} />
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full border-dashed"
          disabled={rows.length >= 40}
          onClick={() => setRows((rs) => [...rs, { id: crypto.randomUUID(), voiceId: rs[rs.length - 2]?.voiceId ?? null, text: '' }])}
        >
          <Plus className="size-4" /> Add line
        </Button>
        <RunBar model={model} input={{ capability: 'dialogue', params: { prompt }, sourceRef: { dialogue: filled.map((r) => ({ text: r.text.trim(), voiceId: r.voiceId })) } }} problems={problems} label="Perform the dialogue" />
      </Composer>
      <AudioFeed capabilities={['dialogue']} emptyTitle="No dialogues yet" emptyDescription="Cast two or more voices and write the exchange. It is performed in one natural take." />
    </div>
  );
}

/* ----------------------------- Voice changer ----------------------------- */

export function ChangerPanel() {
  const { model } = useCapabilityModel('sts');
  const [input, setInput] = useState<AssetView | null>(null);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [stability, setStability] = useState(0.5);
  const [similarity, setSimilarity] = useState(0.75);
  const [recording, setRecording] = useState(false);
  const problems = [!input ? 'Pick or record the speech to re-voice.' : input.status !== 'ready' ? 'Wait for the file to finish processing.' : '', !voiceId ? 'Choose the new voice.' : ''].filter(Boolean);
  return (
    <div className={studioColumns}>
      <Composer>
        <p className="text-sm text-muted-foreground">Keeps your timing, emphasis and emotion, and swaps the voice. Act it out yourself, then cast any voice.</p>
        {recording ? (
          <Recorder name="Performance" onSaved={(a) => (setInput(a), setRecording(false))} />
        ) : (
          <AssetSlot label="Your performance" types={['audio', 'video']} value={input} onChange={setInput} required />
        )}
        <Button variant="ghost" size="sm" onClick={() => setRecording((v) => !v)}>
          <Mic className="size-4" /> {recording ? 'Pick a file instead' : 'Record it now'}
        </Button>
        <Field label="New voice">
          <VoicePicker value={voiceId} onChange={setVoiceId} />
        </Field>
        <Labeled label="Stability" value={stability.toFixed(2)}>
          <Slider min={0} max={1} step={0.05} value={[stability]} onValueChange={([v]) => setStability(v ?? 0.5)} />
        </Labeled>
        <Labeled label="Similarity" value={similarity.toFixed(2)}>
          <Slider min={0} max={1} step={0.05} value={[similarity]} onValueChange={([v]) => setSimilarity(v ?? 0.75)} />
        </Labeled>
        <RunBar model={model} input={{ capability: 'sts', params: { prompt: '', ...(input ? { audioAssetId: input.id } : {}), ...(voiceId ? { voiceId } : {}), stability, similarity } }} problems={problems} label="Change the voice" icon={<Repeat className="size-4" />} />
      </Composer>
      <AudioFeed capabilities={['sts']} emptyTitle="Nothing re-voiced yet" emptyDescription="Record a line the way you want it said, then pick the voice that should say it." />
    </div>
  );
}

/* ---------------------------- Record and clean ---------------------------- */

export function CleanPanel() {
  const { model } = useCapabilityModel('isolate');
  const [input, setInput] = useState<AssetView | null>(null);
  const problems = [!input ? 'Record or pick a file with speech.' : input.status !== 'ready' ? 'Wait for the file to finish processing.' : ''].filter(Boolean);
  return (
    <div className={studioColumns}>
      <Composer>
        <Field label="Record a voice-over" hint="Saved to your library as WAV. A quiet room and 15–20 cm from the mic works best.">
          <Recorder name="Voice-over" onSaved={setInput} />
        </Field>
        <AssetSlot label="Speech to clean up" types={['audio', 'video']} value={input} onChange={setInput} />
        <p className="text-xs text-muted-foreground">Removes room echo, hum, traffic and background music. The clean copy is saved as a new version next to the original.</p>
        <RunBar model={model} input={{ capability: 'isolate', params: { prompt: '', ...(input ? { audioAssetId: input.id } : {}) } }} problems={problems} label="Clean up the voice" icon={<Wand2 className="size-4" />} />
      </Composer>
      <AudioFeed capabilities={['isolate']} emptyTitle="Nothing cleaned up yet" emptyDescription="Record on your phone or laptop, then strip the noise in one click." />
    </div>
  );
}

/* --------------------------------- Clone --------------------------------- */

const READING = `The quick brown fox jumps over the lazy dog. I picked up a bottle this morning, and honestly? It changed my whole routine. Is it worth twenty-nine dollars? Let me show you exactly why I think it is. Seven days, three gym sessions, one very happy me.`;

export function ClonePanel() {
  const router = useRouter();
  const qc = useQueryClient();
  const [consentId, setConsentId] = useState<string | null>(null);
  const [samples, setSamples] = useState<AssetView[]>([]);
  const [picking, setPicking] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [removeNoise, setRemoveNoise] = useState(true);
  const seconds = samples.reduce((s, a) => s + (a.durationS ?? 0), 0);
  const quality = seconds >= 60 ? { label: 'Great', tone: 'bg-success', pct: 100 } : seconds >= 30 ? { label: 'Good', tone: 'bg-warning', pct: 66 } : seconds >= 10 ? { label: 'Usable', tone: 'bg-warning', pct: 33 } : { label: 'Too short', tone: 'bg-destructive', pct: Math.min(30, (seconds / 10) * 30) };
  const add = (list: AssetView[]) => setSamples((cur) => [...cur, ...list.filter((a) => !cur.some((c) => c.id === a.id))].slice(0, 10));
  const clone = useMutation({
    mutationFn: () => api.post<VoiceView>('/voices/clone', { name: name.trim(), description: description.trim() || undefined, consentId, assetIds: samples.map((s) => s.id), removeNoise }),
    onSuccess: (v) => {
      void qc.invalidateQueries({ queryKey: ['voices'] });
      toast.success(`${v.name} is ready to use`);
      router.replace('/voice?tab=library');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const problems = [!consentId ? 'Record consent from the speaker first.' : '', seconds < 10 ? 'Add at least 10 seconds of speech.' : '', !name.trim() ? 'Name the voice.' : '', samples.some((s) => s.status !== 'ready') ? 'Wait for the recordings to finish processing.' : ''].filter(Boolean);
  return (
    <div className={studioColumns}>
      <Composer>
        <Notice tone="info" title="Only clone a voice you have permission to use">
          The speaker must agree in writing. The consent is stored with the voice, and deleting the voice also deletes it from ElevenLabs. Instant cloning needs an ElevenLabs Starter plan or higher.
        </Notice>
        <ConsentPicker kinds={['voice_clone']} value={consentId} onChange={setConsentId} />
        <Field label="Voice name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Umer · warm narrator" maxLength={100} />
        </Field>
        <Field label="Notes (optional)">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Calm, mid-30s, British English" maxLength={500} />
        </Field>
        <label className="flex items-center justify-between gap-3 text-sm">
          Remove background noise
          <Switch checked={removeNoise} onCheckedChange={setRemoveNoise} />
        </label>
        <div className="flex items-center gap-3 border-t pt-4">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
            <div className={cn('h-full rounded-full transition-all', quality.tone)} style={{ width: `${quality.pct}%` }} />
          </div>
          <span className="text-xs text-muted-foreground">
            {formatDuration(seconds)} · {quality.label}
          </span>
        </div>
        {problems[0] && <p className="text-xs text-muted-foreground">{problems[0]}</p>}
        <Button variant="brand" size="lg" className="w-full" loading={clone.isPending} disabled={!!problems.length} onClick={() => clone.mutate()}>
          <Sparkles className="size-4" /> Create the voice
        </Button>
      </Composer>
      <div className="space-y-4">
        <div className="space-y-3 rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-medium">Recordings</h3>
            <Button size="sm" variant="secondary" onClick={() => setPicking(true)} disabled={samples.length >= 10}>
              <Library className="size-4" /> From library
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">1–3 minutes of clear speech in one voice works best. Read naturally, as you would in an ad. Here is something to read:</p>
          <blockquote className="rounded-xl border-l-2 border-primary bg-surface-2/60 p-3 text-sm leading-relaxed">{READING}</blockquote>
          <Recorder name={name.trim() || 'Voice sample'} raw maxSeconds={180} saveLabel="Add this take" onSaved={(a) => add([a])} />
          {samples.length > 0 && (
            <ul className="divide-y rounded-xl border">
              {samples.map((s) => (
                <li key={s.id} className="flex items-center gap-3 p-2.5">
                  <AssetThumb asset={s} hoverPlay={false} className="size-10 shrink-0 rounded-md" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.durationS != null ? formatDuration(s.durationS) : 'Processing…'}</div>
                  </div>
                  {s.url && <audio src={s.url} controls preload="none" className="h-8 w-48" />}
                  <Button size="icon-xs" variant="ghost" aria-label="Remove" onClick={() => setSamples((cur) => cur.filter((c) => c.id !== s.id))}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <AssetPicker open={picking} onOpenChange={setPicking} types={['audio']} multiple max={10 - samples.length} title="Add recordings of the speaker" onPick={add} />
    </div>
  );
}

/* ---------------------------------- Dub ---------------------------------- */

export function DubPanel() {
  const { model } = useCapabilityModel('dub');
  const [input, setInput] = useState<AssetView | null>(null);
  const [language, setLanguage] = useState('es');
  const [consentId, setConsentId] = useState<string | null>(null);
  const options = useMemo(() => DUB_LANGUAGES.map((code) => ({ value: code, label: languageName(code) })).sort((a, b) => a.label.localeCompare(b.label)), []);
  const problems = [!input ? 'Pick the video to dub.' : input.status !== 'ready' ? 'Wait for the video to finish processing.' : '', !consentId ? 'Record consent from the people who speak in it.' : ''].filter(Boolean);
  return (
    <div className={studioColumns}>
      <Composer>
        <p className="text-sm text-muted-foreground">Translates the speech and re-voices it in each speaker’s own voice, keeping the music and effects. The dubbed video is saved as a new version.</p>
        <AssetSlot label="Video" types={['video']} value={input} onChange={setInput} required />
        <Field label="Translate to">
          <Select value={language} onValueChange={setLanguage} options={options} />
        </Field>
        <ConsentPicker kinds={['lipsync_dub']} value={consentId} onChange={setConsentId} />
        <RunBar model={model} input={{ capability: 'dub', params: { prompt: '', ...(input ? { videoAssetId: input.id } : {}), language }, consentId }} problems={problems} label={`Dub into ${languageName(language)}`} icon={<Languages className="size-4" />} />
      </Composer>
      <AudioFeed capabilities={['dub']} emptyTitle="No dubs yet" emptyDescription="Reach new markets with the same ad: pick a video and a language." />
    </div>
  );
}
