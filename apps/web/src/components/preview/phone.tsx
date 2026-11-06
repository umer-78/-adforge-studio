'use client';

import { SAFE_ZONES_BY_ID, type FrameRect } from '@adforge/core';
import { BatteryFull, Bookmark, Camera, ChevronRight, ChevronUp, Ellipsis, EllipsisVertical, Forward, Heart, House, MessageCircle, MessageSquare, Music2, Plus, Repeat2, Search, Send, Signal, SquarePlay, ThumbsDown, ThumbsUp, User, Users, Wifi, X } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A phone-sized mock of each placement's interface, drawn at a fixed 390×844 screen and scaled to
 * fit. Full-screen placements show the ad in an exact 9:16 frame between the status bar and the
 * bottom bar, so the interface lines up with the safe-zone measurements in @adforge/core.
 */

export type Placement = 'reels' | 'stories' | 'tiktok' | 'shorts' | 'feed';

export const PLACEMENTS: { id: Placement; label: string; hint: string }[] = [
  { id: 'reels', label: 'Reels', hint: 'Instagram and Facebook Reels' },
  { id: 'stories', label: 'Stories', hint: 'Instagram and Facebook Stories' },
  { id: 'tiktok', label: 'TikTok', hint: 'TikTok For You feed' },
  { id: 'shorts', label: 'Shorts', hint: 'YouTube Shorts' },
  { id: 'feed', label: 'Feed post', hint: 'A post in a scrolling feed' },
];

export const SCREEN_W = 390;
export const SCREEN_H = 844;
const BEZEL = 12;
const STATUS_H = 47;
/** The 9:16 frame full-screen placements show the ad in. */
export const FRAME_H = Math.round((SCREEN_W * 16) / 9);
const FRAME_TOP = STATUS_H;
const FEED_HEADER_H = 50;
const NAV_H = 83;
/** Height of the scrolling area under the feed header. */
export const FEED_VIEW_H = SCREEN_H - STATUS_H - FEED_HEADER_H - NAV_H;

export interface PostMediaSource {
  kind: 'video' | 'image';
  src: string | null;
  poster: string | null;
  /** Width over height, when known. */
  aspect: number | null;
}

export interface PreviewPost {
  media: PostMediaSource | null;
  handle: string;
  avatarUrl: string | null;
  caption: string;
  /** Call-to-action label for an ad; null for an ordinary post. */
  cta: string | null;
  /** A neutral stand-in post used to fill a test feed. */
  sample?: boolean;
  /** Seed for a stand-in's colors. */
  tint?: number;
}

const VERTICAL = 9 / 16;
/** Whether media of this shape fills a 9:16 frame without bars. */
export const fillsFrame = (aspect: number | null) => aspect == null || Math.abs(aspect - VERTICAL) / VERTICAL < 0.03;
/** Feeds show portrait media at most 4:5 and landscape at most 1.91:1. */
export const feedAspect = (aspect: number | null) => Math.min(1.91, Math.max(0.8, aspect ?? 0.8));

/* ------------------------------------------------------------------ Frame */

/** Scales the 390×844 phone to the height of its container. */
export function PhoneFrame({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setHeight(entry!.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const outerW = SCREEN_W + BEZEL * 2;
  const outerH = SCREEN_H + BEZEL * 2;
  const k = height ? height / outerH : 0;
  return (
    <div ref={box} className={cn('flex h-full min-h-0 justify-center', className)}>
      {k > 0 && (
        <div className="relative shrink-0" style={{ width: outerW * k, height: outerH * k }} role="img" aria-label={label}>
          <div className="absolute top-0 left-0 origin-top-left rounded-[58px] bg-[#0b0b0f] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] ring-1 ring-white/15" style={{ width: outerW, height: outerH, transform: `scale(${k})` }}>
            <div className="absolute overflow-hidden rounded-[46px] bg-black text-white" style={{ inset: BEZEL }}>
              {children}
              <div className="pointer-events-none absolute top-[11px] left-1/2 z-50 h-[34px] w-[122px] -translate-x-1/2 rounded-full bg-black" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBar({ solid }: { solid: boolean }) {
  return (
    <div className={cn('absolute inset-x-0 top-0 z-40 flex items-center justify-between px-8 pt-1 text-[16px] font-semibold', solid && 'bg-black')} style={{ height: STATUS_H }}>
      <span className="tabular-nums">9:41</span>
      <span className="flex items-center gap-1.5">
        <Signal className="size-4" strokeWidth={2.5} />
        <Wifi className="size-4" strokeWidth={2.5} />
        <BatteryFull className="size-6" strokeWidth={1.75} />
      </span>
    </div>
  );
}

/**
 * The parts of the screen that stay put while posts scroll: status bar, the top header of the
 * placement and its bottom bar. `children` fills the post area.
 */
export function ScreenShell({ placement, children }: { placement: Placement; children: ReactNode }) {
  if (placement === 'feed') {
    return (
      <div className="absolute inset-0 bg-[#0c0c0f]">
        <StatusBar solid />
        <div className="absolute inset-x-0 z-30 flex items-center justify-between border-b border-white/10 bg-[#0c0c0f] px-4" style={{ top: STATUS_H, height: FEED_HEADER_H }}>
          <span className="flex items-center gap-1 text-[20px] font-bold tracking-tight">For you</span>
          <span className="flex items-center gap-5">
            <Heart className="size-6" />
            <Send className="size-6" />
          </span>
        </div>
        <div className="absolute inset-x-0 overflow-hidden" style={{ top: STATUS_H + FEED_HEADER_H, height: FEED_VIEW_H }}>
          {children}
        </div>
        <BottomNav placement="feed" />
      </div>
    );
  }
  return (
    <div className="absolute inset-0 bg-black">
      <StatusBar solid />
      <div className="absolute inset-x-0 overflow-hidden" style={{ top: FRAME_TOP, height: FRAME_H }}>
        {children}
        <FrameHeader placement={placement} />
      </div>
      {placement === 'stories' ? <ReplyBar /> : <BottomNav placement={placement} />}
    </div>
  );
}

function FrameHeader({ placement }: { placement: Placement }) {
  const shadow = 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]';
  if (placement === 'reels') {
    return (
      <div className={cn('pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-3', shadow)}>
        <span className="text-[22px] font-bold tracking-tight">Reels</span>
        <Camera className="size-7" />
      </div>
    );
  }
  if (placement === 'tiktok') {
    return (
      <div className={cn('pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-center gap-5 pt-3 text-[17px] font-semibold', shadow)}>
        <span className="text-white/60">Following</span>
        <span className="relative">
          For You
          <span className="absolute -bottom-1.5 left-1/2 h-[3px] w-7 -translate-x-1/2 rounded-full bg-white" />
        </span>
        <Search className="absolute top-3 right-4 size-6" />
      </div>
    );
  }
  if (placement === 'shorts') {
    return (
      <div className={cn('pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-end gap-6 px-4 pt-3', shadow)}>
        <Search className="size-6" />
        <EllipsisVertical className="size-6" />
      </div>
    );
  }
  return null;
}

function BottomNav({ placement }: { placement: Placement }) {
  const items: { icon: ReactNode; label?: string }[] =
    placement === 'tiktok'
      ? [{ icon: <House className="size-6" />, label: 'Home' }, { icon: <Users className="size-6" />, label: 'Friends' }, { icon: <span className="flex h-8 w-11 items-center justify-center rounded-lg bg-white text-black"><Plus className="size-5" strokeWidth={3} /></span> }, { icon: <MessageSquare className="size-6" />, label: 'Inbox' }, { icon: <User className="size-6" />, label: 'Profile' }]
      : placement === 'shorts'
        ? [{ icon: <House className="size-6" />, label: 'Home' }, { icon: <SquarePlay className="size-6" />, label: 'Shorts' }, { icon: <span className="flex size-9 items-center justify-center rounded-full border-2 border-white"><Plus className="size-5" /></span> }, { icon: <Users className="size-6" />, label: 'Subscriptions' }, { icon: <User className="size-6" />, label: 'You' }]
        : [{ icon: <House className="size-6" /> }, { icon: <Search className="size-6" /> }, { icon: <span className="flex size-7 items-center justify-center rounded-lg border-2 border-white"><Plus className="size-4" strokeWidth={3} /></span> }, { icon: <SquarePlay className="size-6" /> }, { icon: <User className="size-6" /> }];
  const height = placement === 'feed' ? NAV_H : SCREEN_H - FRAME_TOP - FRAME_H;
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex items-start justify-around border-t border-white/10 bg-black px-2 pt-2.5" style={{ height }}>
      {items.map((it, i) => (
        <span key={i} className="flex flex-col items-center gap-0.5 text-[10px] text-white/90">
          {it.icon}
          {it.label}
        </span>
      ))}
    </div>
  );
}

function ReplyBar() {
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex items-center gap-4 bg-black px-4 pt-3" style={{ height: SCREEN_H - FRAME_TOP - FRAME_H }}>
      <span className="flex h-11 flex-1 items-center rounded-full border border-white/40 px-4 text-[15px] text-white/70">Send message</span>
      <Heart className="size-7" />
      <Send className="size-7" />
    </div>
  );
}

/* ------------------------------------------------------------------ Media */

/** Plays while `active`; otherwise rests on its first frame. */
export function PostMedia({ media, active, muted, cover, className }: { media: PostMediaSource; active: boolean; muted: boolean; cover: boolean; className?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (active) void el.play().catch(() => undefined);
    else {
      el.pause();
      el.currentTime = 0;
    }
  }, [active, media.src]);
  const fit = cover ? 'object-cover' : 'object-contain';
  if (!media.src) return <div className={cn('absolute inset-0 bg-neutral-900', className)} />;
  return media.kind === 'video' ? (
    <video
      ref={video}
      src={media.src}
      poster={media.poster ?? undefined}
      muted={muted}
      loop
      playsInline
      preload="metadata"
      className={cn('absolute inset-0 size-full', fit, className)}
    />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={media.src} alt="" draggable={false} className={cn('absolute inset-0 size-full', fit, className)} />
  );
}

const SAMPLE_GRADIENTS = [
  ['#3b2f63', '#1d1b2e'],
  ['#20403a', '#11201d'],
  ['#5a3a24', '#26180f'],
  ['#233b5c', '#111c2c'],
  ['#4d2340', '#1f0f1a'],
  ['#3d4a22', '#1b2110'],
];

/** A neutral stand-in post, clearly marked, for test feeds with too few library files. */
function SampleFill({ tint = 0 }: { tint?: number }) {
  const [a, b] = SAMPLE_GRADIENTS[tint % SAMPLE_GRADIENTS.length]!;
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ background: `radial-gradient(120% 80% at 30% 20%, ${a}, ${b})` }}>
      <span className="rounded-full bg-black/30 px-3 py-1 text-[13px] text-white/70">Sample post</span>
    </div>
  );
}

/* ------------------------------------------------------------------ Full-screen post */

const shadowText = 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]';

function Avatar({ post, size, square }: { post: PreviewPost; size: number; square?: boolean }) {
  const initial = post.handle.replace(/^@/, '').slice(0, 1).toUpperCase() || 'A';
  return post.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={post.avatarUrl} alt="" className={cn('shrink-0 object-cover ring-1 ring-white/30', square ? 'rounded-lg' : 'rounded-full')} style={{ width: size, height: size }} />
  ) : (
    <span className={cn('flex shrink-0 items-center justify-center bg-gradient-to-br from-violet-500 to-pink-500 font-semibold text-white ring-1 ring-white/30', square ? 'rounded-lg' : 'rounded-full')} style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {initial}
    </span>
  );
}

const handleText = (h: string) => (h.startsWith('@') ? h.slice(1) : h);

function Caption({ text, lines = 2, className }: { text: string; lines?: number; className?: string }) {
  if (!text.trim()) return null;
  return (
    <p className={cn('text-[14px] leading-[1.3] break-words', className)} style={{ display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as CSSProperties}>
      {text}
    </p>
  );
}

function Rail({ items, style }: { items: { icon: ReactNode; label?: string }[]; style: CSSProperties }) {
  return (
    <div className={cn('absolute z-10 flex flex-col items-center gap-5', shadowText)} style={style}>
      {items.map((it, i) => (
        <span key={i} className="flex flex-col items-center gap-1 text-[12px] font-semibold">
          {it.icon}
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** Where the zone's numbers put a rectangle, in px of the 390×693 frame. */
const box = (r: FrameRect): CSSProperties => ({ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` });

export function ZoneOverlay({ placement }: { placement: Placement }) {
  const zone = SAFE_ZONES_BY_ID[placement];
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {zone.covered.map((c) => (
        <div key={c.label} title={c.label} className="absolute border border-red-400/80 bg-red-500/25" style={box(c.rect)} />
      ))}
      <div className="absolute rounded-sm outline-2 outline-sky-300 outline-dashed" style={box(zone.safe)} />
    </div>
  );
}

/** One ad or post in a 9:16 placement: media plus the interface that sits on it. */
export function FramePost({ placement, post, active, muted, showZones, storyProgress = 0.35 }: { placement: Exclude<Placement, 'feed'>; post: PreviewPost; active: boolean; muted: boolean; showZones?: boolean; storyProgress?: number }) {
  const media = post.media;
  const fills = fillsFrame(media?.aspect ?? null);
  const handle = handleText(post.handle);
  return (
    <div className="relative overflow-hidden bg-black" style={{ width: SCREEN_W, height: FRAME_H }}>
      {post.sample || !media ? (
        <SampleFill tint={post.tint} />
      ) : (
        <>
          {!fills && media.poster && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media.poster} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-60 blur-2xl" />
          )}
          <PostMedia media={media} active={active} muted={muted} cover={fills} />
        </>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[16%] bg-gradient-to-b from-black/45 to-transparent" />

      {placement === 'reels' && (
        <>
          <Rail
            style={{ right: 10, bottom: 24 }}
            items={[
              { icon: <Heart className="size-7" />, label: '12.4K' },
              { icon: <MessageCircle className="size-7 -scale-x-100" />, label: '318' },
              { icon: <Send className="size-7" />, label: '1,042' },
              { icon: <Ellipsis className="size-6" /> },
              { icon: <Avatar post={post} size={28} square /> },
            ]}
          />
          <div className={cn('absolute z-10 space-y-2', shadowText)} style={{ left: 14, right: 70, bottom: 18 }}>
            <div className="flex items-center gap-2 text-[14px] font-semibold">
              <Avatar post={post} size={32} />
              <span className="truncate">{handle}</span>
              <span className="rounded-md border border-white/70 px-2 py-0.5 text-[12px]">Follow</span>
            </div>
            <Caption text={post.caption} />
            {post.cta && <span className="block text-[12px] text-white/85">Sponsored</span>}
            <div className="flex items-center gap-1.5 text-[12px] text-white/90">
              <Music2 className="size-3.5" /> <span className="truncate">{handle} · Original audio</span>
            </div>
            {post.cta && (
              <div className="flex h-10 items-center justify-between rounded-lg bg-white/20 px-3 text-[14px] font-semibold backdrop-blur">
                {post.cta}
                <ChevronRight className="size-4" />
              </div>
            )}
          </div>
        </>
      )}

      {placement === 'stories' && (
        <>
          <div className={cn('absolute inset-x-0 top-0 z-10 space-y-2.5 px-2.5 pt-2', shadowText)}>
            <div className="flex gap-1">
              {[1, storyProgress, 0].map((p, i) => (
                <span key={i} className="h-[2.5px] flex-1 overflow-hidden rounded-full bg-white/35">
                  <span className="block h-full bg-white" style={{ width: `${p * 100}%` }} />
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2 px-1 text-[14px]">
              <Avatar post={post} size={32} />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{handle}</span>
                {post.cta && <span className="block text-[12px] text-white/85">Sponsored</span>}
              </span>
              <Ellipsis className="ml-auto size-6" />
              <X className="size-7" />
            </div>
          </div>
          {post.cta && (
            <div className={cn('absolute inset-x-0 z-10 flex flex-col items-center gap-1', shadowText)} style={{ bottom: 22 }}>
              <ChevronUp className="size-5" />
              <span className="rounded-full bg-white px-5 py-2 text-[14px] font-semibold text-black">{post.cta}</span>
            </div>
          )}
        </>
      )}

      {placement === 'tiktok' && (
        <>
          <Rail
            style={{ right: 8, bottom: 26 }}
            items={[
              {
                icon: (
                  <span className="relative mb-2">
                    <Avatar post={post} size={46} />
                    <span className="absolute -bottom-2 left-1/2 flex size-5 -translate-x-1/2 items-center justify-center rounded-full bg-primary">
                      <Plus className="size-3.5" strokeWidth={3} />
                    </span>
                  </span>
                ),
              },
              { icon: <Heart className="size-8 fill-white" />, label: '48.2K' },
              { icon: <MessageCircle className="size-8 fill-white" />, label: '612' },
              { icon: <Bookmark className="size-8 fill-white" />, label: '2,931' },
              { icon: <Forward className="size-8 fill-white" />, label: '1,207' },
              { icon: <span className="flex size-11 items-center justify-center rounded-full bg-neutral-800 ring-[7px] ring-neutral-900"><Music2 className="size-4" /></span> },
            ]}
          />
          <div className={cn('absolute z-10 space-y-1.5', shadowText)} style={{ left: 12, right: 74, bottom: 14 }}>
            <span className="block text-[16px] font-semibold">{handle}</span>
            <Caption text={post.caption} />
            {post.cta && <span className="inline-block rounded bg-white/25 px-1.5 py-0.5 text-[11px]">Sponsored</span>}
            <div className="flex items-center gap-1.5 text-[13px]">
              <Music2 className="size-3.5" /> <span className="truncate">{post.cta ? 'Promoted music' : `original sound - ${handle}`}</span>
            </div>
            {post.cta && (
              <div className="mt-1 flex h-9 items-center justify-between rounded bg-primary px-3 text-[14px] font-semibold">
                {post.cta}
                <ChevronRight className="size-4" />
              </div>
            )}
          </div>
        </>
      )}

      {placement === 'shorts' && (
        <>
          <Rail
            style={{ right: 8, bottom: 22 }}
            items={[
              { icon: <ThumbsUp className="size-7 fill-white" />, label: '9.1K' },
              { icon: <ThumbsDown className="size-7 fill-white" />, label: 'Dislike' },
              { icon: <MessageSquare className="size-7 fill-white" />, label: '204' },
              { icon: <Forward className="size-7 fill-white" />, label: 'Share' },
              { icon: <Repeat2 className="size-7" />, label: 'Remix' },
              { icon: <Avatar post={post} size={34} square /> },
            ]}
          />
          <div className={cn('absolute z-10 space-y-2', shadowText)} style={{ left: 12, right: 78, bottom: 16 }}>
            <div className="flex items-center gap-2 text-[14px] font-semibold">
              <Avatar post={post} size={30} />
              <span className="truncate">@{handle}</span>
              <span className="rounded-full bg-white px-3 py-1 text-[12px] text-black">Subscribe</span>
            </div>
            <Caption text={post.caption} />
            {post.cta && (
              <>
                <span className="block text-[12px] font-semibold">Sponsored</span>
                <div className="flex h-9 items-center justify-center rounded-full bg-white/20 text-[14px] font-semibold backdrop-blur">{post.cta}</div>
              </>
            )}
          </div>
        </>
      )}

      {showZones && <ZoneOverlay placement={placement} />}
    </div>
  );
}

/* ------------------------------------------------------------------ Feed post */

/** A post card in a scrolling feed. Portrait media is cropped to 4:5, as feeds do. */
export function FeedCard({ post, active, muted, showZones }: { post: PreviewPost; active: boolean; muted: boolean; showZones?: boolean }) {
  const media = post.media;
  const aspect = feedAspect(media?.aspect ?? null);
  const handle = handleText(post.handle);
  return (
    <article className="border-b border-white/10 bg-[#0c0c0f] pb-3" style={{ width: SCREEN_W }}>
      <header className="flex items-center gap-2.5 px-3 py-2.5">
        <Avatar post={post} size={34} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[14px] font-semibold">{handle}</span>
          <span className="block text-[12px] text-white/60">{post.cta ? 'Sponsored' : 'Suggested for you'}</span>
        </span>
        <Ellipsis className="size-5" />
      </header>
      <div className="relative overflow-hidden bg-black" style={{ width: SCREEN_W, height: Math.round(SCREEN_W / aspect) }}>
        {post.sample || !media ? <SampleFill tint={post.tint} /> : <PostMedia media={media} active={active} muted={muted} cover />}
        {showZones && (
          <div className="pointer-events-none absolute inset-0 z-30">
            <div className="absolute rounded-sm outline-2 outline-sky-300 outline-dashed" style={box(SAFE_ZONES_BY_ID.feed.safe)} />
          </div>
        )}
      </div>
      {post.cta && (
        <div className="flex h-11 items-center justify-between border-b border-white/10 px-3 text-[14px] font-semibold">
          {post.cta}
          <ChevronRight className="size-4" />
        </div>
      )}
      <div className="flex items-center gap-4 px-3 pt-2.5">
        <Heart className="size-6" />
        <MessageCircle className="size-6 -scale-x-100" />
        <Send className="size-6" />
        <Bookmark className="ml-auto size-6" />
      </div>
      <div className="space-y-1 px-3 pt-2 text-[14px]">
        <span className="block font-semibold">2,318 likes</span>
        {post.caption.trim() && (
          <p className="leading-snug" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as CSSProperties}>
            <span className="font-semibold">{handle}</span> {post.caption}
          </p>
        )}
        <span className="block text-white/55">View all 86 comments</span>
      </div>
    </article>
  );
}
