'use client';

import { useMutation } from '@tanstack/react-query';
import { Check, Mic, Send, Square, Undo2, WandSparkles, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { applyEditPlan, type EditPlan } from '@adforge/core';
import { LlmPrice } from '@/components/scripts/llm-price';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api-client';
import { useDictation } from '@/lib/hooks/use-dictation';
import { cn } from '@/lib/utils';
import { usePlayhead } from './playhead';
import { useEditor } from './store';

const SUGGESTIONS = [
  'Add a bold hook title for the first 2 seconds',
  'Put crossfades between all the clips',
  'Make the music quieter under the voice',
  'Add a “Shop now” button for the last 3 seconds',
  'Speed up the second clip so the edit is 15 seconds',
  'Add a warm film look to every video clip',
];

interface Turn {
  id: number;
  instruction: string;
  plan?: EditPlan;
  applied?: number;
  errors?: string[];
  error?: string;
  /** Revision right after the plan was applied, to offer a one-click undo while nothing else changed. */
  revision?: number;
  undone?: boolean;
}

export function AssistantPanel() {
  const id = useEditor((s) => s.id);
  const revision = useEditor((s) => s.revision);
  const [text, setText] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const counter = useRef(0);
  const base = useRef('');
  const dictation = useDictation((spoken, final) => {
    const next = `${base.current}${base.current && !base.current.endsWith(' ') ? ' ' : ''}${spoken}`.slice(0, 2000);
    setText(next);
    if (final) base.current = next;
  });

  const plan = useMutation({
    mutationFn: (instruction: string) => {
      const s = useEditor.getState();
      return api.post<EditPlan>(`/timelines/${s.id}/assistant`, {
        instruction,
        data: s.timeline,
        playheadSeconds: usePlayhead.getState().frame / s.timeline.fps,
        selectedClipIds: s.selection,
      });
    },
  });

  const update = (turnId: number, patch: Partial<Turn>) => setTurns((list) => list.map((t) => (t.id === turnId ? { ...t, ...patch } : t)));

  const submit = (instruction: string) => {
    const clean = instruction.trim();
    if (clean.length < 2 || plan.isPending || !id) return;
    dictation.stop();
    const turnId = ++counter.current;
    setTurns((list) => [...list, { id: turnId, instruction: clean }]);
    setText('');
    base.current = '';
    plan.mutate(clean, {
      onSuccess: (p) => {
        let result = { applied: 0, errors: [] as string[] };
        useEditor.getState().edit((d) => {
          result = applyEditPlan(d, p);
        });
        update(turnId, { plan: p, applied: result.applied, errors: result.errors, revision: result.applied ? useEditor.getState().revision : undefined });
      },
      onError: (err) => update(turnId, { error: errorMessage(err) }),
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {turns.length === 0 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <WandSparkles className="size-4 text-primary" /> Edit with words
            </div>
            <p className="text-xs text-muted-foreground">Describe a change and it is made on the timeline as one step you can undo. It knows where the playhead is and which clips are selected.</p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => submit(s)} className="rounded-full border px-2.5 py-1 text-left text-[11px] text-muted-foreground transition hover:border-primary/50 hover:text-foreground">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((t) => (
            <div key={t.id} className="space-y-2">
              <div className="ml-6 rounded-xl rounded-br-sm bg-primary/15 px-3 py-2 text-[13px]">{t.instruction}</div>
              {t.error ? (
                <div className="rounded-xl rounded-bl-sm border border-destructive/40 px-3 py-2 text-xs text-destructive">{t.error}</div>
              ) : !t.plan ? (
                <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                  <span className="size-1.5 animate-pulse rounded-full bg-primary" /> Planning the edit…
                </div>
              ) : (
                <div className="space-y-2 rounded-xl rounded-bl-sm border bg-surface px-3 py-2.5 text-[13px]">
                  <p>{t.plan.summary}</p>
                  {t.plan.ops.length > 0 && (
                    <ul className="space-y-1 text-xs">
                      {t.plan.ops.map((op, i) => {
                        const failed = t.errors?.some((e) => e.startsWith(`Step ${i + 1} (`));
                        return (
                          <li key={i} className={cn('flex gap-1.5', failed ? 'text-destructive' : 'text-muted-foreground')}>
                            {failed ? <X className="mt-0.5 size-3 shrink-0" /> : <Check className="mt-0.5 size-3 shrink-0 text-emerald-400" />}
                            <span>{op.reason}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {!!t.errors?.length && <p className="text-[11px] text-destructive">{t.errors.length} step{t.errors.length > 1 ? 's' : ''} could not be applied: {t.errors.join('; ')}</p>}
                  {t.applied != null && t.applied > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">{t.undone ? 'Undone.' : `${t.applied} change${t.applied > 1 ? 's' : ''} made.`}</span>
                      {!t.undone && t.revision === revision && (
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => {
                            useEditor.getState().undo();
                            update(t.id, { undone: true });
                          }}
                        >
                          <Undo2 /> Undo
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
      <form
        className="space-y-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <Textarea
          rows={2}
          value={text}
          maxLength={2000}
          onChange={(e) => {
            setText(e.target.value);
            base.current = e.target.value;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit(text);
            }
          }}
          placeholder={dictation.listening ? 'Listening…' : 'e.g. trim the pauses and add captions'}
          className="min-h-14 resize-none text-[13px]"
          aria-label="Describe an edit"
        />
        <div className="flex items-center gap-2">
          <Button type="button" size="icon-xs" variant={dictation.listening ? 'destructive' : 'ghost'} loading={dictation.busy} onClick={dictation.toggle} aria-label={dictation.listening ? 'Stop dictation' : 'Dictate'} title={dictation.listening ? 'Stop' : 'Dictate'}>
            {dictation.listening ? <Square /> : <Mic />}
          </Button>
          <LlmPrice task="editPlan" className="flex-1" />
          <Button type="submit" size="xs" loading={plan.isPending} disabled={text.trim().length < 2}>
            <Send /> Edit
          </Button>
        </div>
      </form>
    </div>
  );
}
