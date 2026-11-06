'use client';

import { CircleCheck, CircleHelp, CircleX, TriangleAlert, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { FEED_LOUDNESS_LUFS, formatDuration, worstStatus, type AdChecks, type CheckStatus } from '@adforge/core';
import { Button } from '@/components/ui/button';
import { Tip } from '@/components/ui/tooltip';
import { cn, timeAgo } from '@/lib/utils';

const ICON: Record<CheckStatus, ReactNode> = {
  pass: <CircleCheck className="size-4 text-success" aria-label="Passed" />,
  warn: <TriangleAlert className="size-4 text-warning" aria-label="Worth a look" />,
  fail: <CircleX className="size-4 text-destructive" aria-label="Problem" />,
  none: <CircleHelp className="size-4 text-muted-foreground" aria-label="Not checked" />,
};

export function StatusIcon({ status }: { status: CheckStatus }) {
  return <span className="mt-0.5 shrink-0">{ICON[status]}</span>;
}

function Row({ status, title, children, action }: { status: CheckStatus; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 py-2">
      <StatusIcon status={status} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{children}</div>
      </div>
      {action}
    </div>
  );
}

/** Flash safety, loudness, sound-off and wording results for one file, with fixes where there is one. */
export function AdChecksCard({ checks, type, running, onRun, onMatchLoudness, onAddCaptions }: { checks: AdChecks | null; type: string; running: boolean; onRun: () => void; onMatchLoudness: () => void; onAddCaptions: () => void }) {
  if (type !== 'video' && type !== 'audio') return null;
  const overall = checks ? worstStatus([checks.flash?.status ?? 'none', checks.loudness.status, checks.soundOff.status, checks.policy.status]) : 'none';
  return (
    <div className={cn('rounded-xl border p-3 text-sm', overall === 'fail' && 'border-destructive/40', overall === 'warn' && 'border-warning/40')}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium">
          <Zap className="size-4 text-primary" /> Ad checks
        </div>
        <Button size="xs" variant="ghost" loading={running} onClick={onRun}>
          {checks ? 'Check again' : 'Run checks'}
        </Button>
      </div>
      {!checks ? (
        <p className="mt-1 text-xs text-muted-foreground">Checks for flashing that can trigger seizures, loudness against what feeds play, whether it works muted, and wording ad networks reject. Free, and they run on their own for new videos.</p>
      ) : (
        <div className="mt-1 divide-y">
          {checks.flash && (
            <Row status={checks.flash.status} title="Flash safety">
              {checks.flash.status === 'pass' ? (
                'No rapid flashing (WCAG: at most three flashes a second).'
              ) : (
                <>
                  Up to {Math.max(checks.flash.maxFlashesPerSecond, checks.flash.maxRedFlashesPerSecond)} flashes a second{checks.flash.maxRedFlashesPerSecond > checks.flash.maxFlashesPerSecond ? ', in saturated red' : ''}
                  {checks.flash.ranges.length > 0 && <> at {checks.flash.ranges.slice(0, 3).map(([a, b]) => `${formatDuration(a)}–${formatDuration(b)}`).join(', ')}</>}.{' '}
                  {checks.flash.status === 'fail' ? 'This can trigger seizures in people with photosensitive epilepsy. Slow the flashing or shrink it below a quarter of the screen.' : 'Close to the safe limit of three flashes a second.'}
                </>
              )}
            </Row>
          )}
          <Row
            status={checks.loudness.status}
            title={`Loudness${checks.loudness.lufs != null ? `: ${checks.loudness.lufs} LUFS` : ''}`}
            action={
              (checks.loudness.status === 'warn' || checks.loudness.status === 'fail') && (
                <Tip content={`Sets the sound to ${FEED_LOUDNESS_LUFS} LUFS with peaks under -1.5 dBTP, as a new version.`}>
                  <Button size="xs" variant="outline" onClick={onMatchLoudness}>
                    Match feeds
                  </Button>
                </Tip>
              )
            }
          >
            {checks.loudness.message}
          </Row>
          {type === 'video' && (
            <Row
              status={checks.soundOff.status}
              title="Works with the sound off"
              action={
                checks.soundOff.status === 'warn' && (
                  <Button size="xs" variant="outline" onClick={onAddCaptions}>
                    Add captions
                  </Button>
                )
              }
            >
              {checks.soundOff.message}
            </Row>
          )}
          <Row status={checks.policy.status} title="Ad policy wording">
            {checks.policy.source == null ? (
              'Transcribe the file to check what is said. Captions and titles are checked in Publish.'
            ) : checks.policy.findings.length === 0 ? (
              'Nothing in the speech that ad networks usually reject.'
            ) : (
              <ul className="mt-0.5 space-y-1">
                {checks.policy.findings.map((f) => (
                  <li key={f.id}>
                    <span className={cn('font-medium', f.severity === 'high' ? 'text-destructive' : f.severity === 'medium' ? 'text-warning' : 'text-foreground')}>{f.title}</span> (“{f.match}”): {f.detail}
                  </li>
                ))}
              </ul>
            )}
          </Row>
          <div className="pt-2 text-[11px] text-muted-foreground">Checked {timeAgo(checks.checkedAt)}. Rule-based checks; each network makes the final call on its policies.</div>
        </div>
      )}
    </div>
  );
}
