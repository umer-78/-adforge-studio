import {
  AGENT_STEPS,
  BUILTIN_SFX,
  CAPABILITIES,
  CAPTION_STYLES,
  EFFECTS,
  estimateCost,
  EXPORT_PRESETS,
  formatUsd,
  LUT_PRESETS,
  MODELS,
  MODELS_BY_ID,
  MOTION_TEMPLATES,
  PLATFORM_SPECS,
  TIMELINE_TEMPLATES,
  TRANSITIONS,
  type AgentStep,
} from '@adforge/core';
import { ArrowRight, BadgeCheck, Gauge, Lock, Music2, ScanFace, ShieldCheck, Sparkle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { CountUp } from '@/components/marketing/count-up';
import { FeatureRail } from '@/components/marketing/feature-rail';
import { CutoutVisual, PlatformsVisual, PromptVisual, StepsVisual, ThumbsVisual, TimelineVisual, WaveVisual } from '@/components/marketing/feature-visuals';
import { HeroStage } from '@/components/marketing/hero-stage';
import { LottieIcon } from '@/components/marketing/lottie-icon';
import type { LottieIconName } from '@/components/marketing/lottie-icons';
import { Magnetic } from '@/components/marketing/magnetic';
import { Marquee } from '@/components/marketing/marquee';
import { Preloader } from '@/components/marketing/preloader';
import { ScrubVideo } from '@/components/marketing/scrub-video';
import { TiltCard } from '@/components/fx/tilt-card';
import { Words } from '@/components/marketing/words';

const DESCRIPTION = `Generate, edit, voice, score and publish ad videos and photos in one studio: ${MODELS.length} AI models, ${Object.keys(PLATFORM_SPECS).length} platforms, and the price shown before anything runs.`;

export const metadata: Metadata = {
  title: { absolute: 'AdForge Studio: ads that stop the scroll' },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
};

/* Everything counted on this page comes from the studio's own catalogs, so the numbers stay true. */
const platforms = Object.values(PLATFORM_SPECS).map((p) => ({ label: p.label, color: p.color }));
const platformList = `${platforms
  .slice(0, -1)
  .map((p) => p.label)
  .join(', ')} and ${platforms.at(-1)?.label}`;
// Variants of one model ("Kling 3 Pro (first + last)") show once.
const modelNames = [...new Set(MODELS.map((m) => m.label.replace(/\s*\(.*\)$/, '')))];
const capabilityNames = Object.values(CAPABILITIES).map((c) => c.label);

const SAMPLE_PROMPT = 'Slow push-in on a cream steel bottle on wet stone, soft morning light, droplets catching the sun';
const SAMPLE_MODEL_ID = 'veo31-fast-t2v';
const sampleEstimate = estimateCost(SAMPLE_MODEL_ID, { prompt: SAMPLE_PROMPT, durationS: 8, aspect: '9:16', resolution: '1080p' });

const AGENT_SHORT: Record<AgentStep, string> = {
  research: 'Research the product',
  script: 'Write the script',
  generate: 'Make the ad',
  launch: 'Launch it, paused',
  optimize: 'Read the results',
};

const FEATURES: { icon: LottieIconName; title: string; body: string; visual: ReactNode }[] = [
  {
    icon: 'generate',
    title: 'Generate',
    body: 'Text and image to video with Kling, Veo, Sora, Seedance and Agnes. Control the first and last frame, sync lips to a voice, or use a talking avatar.',
    visual: <PromptVisual prompt={SAMPLE_PROMPT} model={MODELS_BY_ID[SAMPLE_MODEL_ID]?.label ?? SAMPLE_MODEL_ID} duration="8s" aspect="9:16" price={formatUsd(sampleEstimate.usd, { precise: true })} />,
  },
  {
    icon: 'edit',
    title: 'Edit',
    body: `A multi-track timeline with keyframes, ${TRANSITIONS.length} transitions, ${EFFECTS.length} effects, ${LUT_PRESETS.length} color looks and ${CAPTION_STYLES.length} caption styles. Or type the change you want and the assistant makes it.`,
    visual: <TimelineVisual />,
  },
  {
    icon: 'voice',
    title: 'Voice & sound',
    body: `Voice-overs, dialogue, dubbing and music with ElevenLabs, plus ${BUILTIN_SFX.length} built-in sound effects. Cloning a voice needs a recorded consent first.`,
    visual: <WaveVisual voices={[CAPABILITIES.tts.label, CAPABILITIES.dialogue.label, CAPABILITIES.dub.label, CAPABILITIES.music.label]} />,
  },
  {
    icon: 'photo',
    title: 'Photo',
    body: 'Product shots, edits, upscaling and background removal with Nano Banana, Seedream, Recraft and GPT Image.',
    visual: <CutoutVisual src="/landing/sample-bottle.svg" />,
  },
  {
    icon: 'motion3d',
    title: '3D & motion',
    body: `${MOTION_TEMPLATES.length} motion templates, image to 3D, depth parallax and a 3D studio, all rendered to video with the rest of your edit.`,
    visual: (
      <ThumbsVisual
        images={[
          { src: '/motion/logo-sting.jpg', alt: 'Logo sting template' },
          { src: '/motion/price-tag.jpg', alt: 'Price tag template' },
          { src: '/motion/rating-stars.jpg', alt: 'Rating template' },
        ]}
      />
    ),
  },
  {
    icon: 'publish',
    title: 'Publish',
    body: `Schedule to ${platformList} from one calendar, in ${EXPORT_PRESETS.length} export sizes. Paid ads are created paused, so nothing spends until you turn it on.`,
    visual: <PlatformsVisual platforms={platforms} />,
  },
  {
    icon: 'agent',
    title: 'Agent',
    body: 'Describe the product. The agent researches it, writes the script, makes the ad, sets up a paused campaign and reads the results. Each step waits for your OK, unless you set an auto-approve limit.',
    visual: <StepsVisual steps={AGENT_STEPS.map((s) => AGENT_SHORT[s])} waitingAt={2} />,
  },
];

const STEPS = [
  { title: 'Bring the product', body: 'Upload photos and footage, or generate them. Files are checked, stored privately and sorted into your library.' },
  { title: 'Pick a format', body: `${TIMELINE_TEMPLATES.length} ad layouts and ${MOTION_TEMPLATES.length} motion templates take your brand kit's colors, fonts and logo.` },
  { title: 'Add voice and captions', body: `Record a voice-over, add licensed music and sound effects, and caption it in one of ${CAPTION_STYLES.length} styles.` },
  { title: 'Score it, then publish', body: `An AI review scores the ad for each platform, then it goes out to ${platforms.length} platforms in the right sizes.` },
];

const STATS = [
  { value: MODELS.length, label: 'AI models', note: 'video, image, voice and music' },
  { value: Object.keys(CAPABILITIES).length, label: 'AI tools', note: 'from text to video to splitting stems' },
  { value: platforms.length, label: 'platforms', note: 'scheduled from one calendar' },
  { value: TIMELINE_TEMPLATES.length + MOTION_TEMPLATES.length, label: 'templates', note: `${TIMELINE_TEMPLATES.length} ad layouts and ${MOTION_TEMPLATES.length} motion templates` },
];

const SAFETY = [
  { icon: Gauge, title: 'Price before every run', body: 'Every job shows its estimate from the live price table first, and a monthly budget can stop all spending at the cap.' },
  { icon: ShieldCheck, title: 'Checked before it runs', body: 'Prompts and reference images go through a moderation check before any model sees them.' },
  { icon: ScanFace, title: 'Consent for voices and faces', body: 'Cloning a voice or using a real person needs a recorded consent on file, and you can revoke it at any time.' },
  { icon: Music2, title: 'Licensed audio only', body: 'Music and sound effects carry their license, and publishing checks it before anything goes out.' },
  { icon: BadgeCheck, title: 'AI-generated label', body: 'Posts can carry an AI-generated label, and it is on by default.' },
  { icon: Lock, title: 'Private by design', body: 'Row-level security, signed links that expire, file checks, rate limits, and encrypted keys and social logins.' },
];

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'AdForge Studio',
  applicationCategory: 'MultimediaApplication',
  operatingSystem: 'Web',
  description: DESCRIPTION,
};

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-sm font-medium text-primary">{children}</p>;
}

function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="aurora -top-48 left-[6%] size-[40rem] bg-[#7c5cff]/45" />
      <div className="aurora top-24 right-[2%] size-[32rem] bg-[#ff4d8d]/25 [animation-delay:-7s]" />
      <div className="grid-bg absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_70%_55%_at_50%_30%,#000,transparent)]" />
      <div className="noise absolute inset-0" />
    </div>
  );
}

const chip = 'inline-flex items-center gap-2 rounded-full border bg-background/60 px-3.5 py-1.5 text-sm whitespace-nowrap text-muted-foreground';

export default function LandingPage() {
  return (
    <main>
      <Preloader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />

      {/* Hero */}
      <section className="relative isolate overflow-hidden pt-28 pb-12 sm:pt-32">
        <Backdrop />
        <div className="relative mx-auto max-w-6xl px-4 text-center sm:px-8">
          <p className="hero-in inline-flex items-center gap-2 rounded-full border bg-surface/60 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur" style={{ '--d': '0.15s' } as CSSProperties}>
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-success" />
            </span>
            {MODELS.length} AI models · {platforms.length} platforms · one studio
          </p>
          <h1 className="mt-5 font-display text-[clamp(3.2rem,8.5vw,7.25rem)] leading-[0.95] tracking-[-0.02em]">
            <Words text="Ads that stop" />
            <br />
            <Words text="the scroll." start={3} className="italic" innerClassName="text-gradient pr-[0.06em]" />
          </h1>
          <p className="hero-in mx-auto mt-5 max-w-xl text-base text-balance text-muted-foreground sm:text-lg" style={{ '--d': '0.75s' } as CSSProperties}>
            Generate, edit, voice, score and publish ad videos and photos in one place. Every run shows its price before it starts.
          </p>
          <div className="hero-in mt-7 flex flex-wrap items-center justify-center gap-3" style={{ '--d': '0.9s' } as CSSProperties}>
            <Magnetic>
              <Link href="/dashboard" className={buttonVariants({ variant: 'brand', size: 'lg' })}>
                Open the studio <ArrowRight />
              </Link>
            </Magnetic>
            <a href="#workflow" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
              See how it works
            </a>
          </div>
        </div>
        <div className="relative mt-12">
          <HeroStage
            frames={[
              { src: '/landing/kinetic.mp4', poster: '/landing/kinetic.jpg', label: 'Kinetic title template', side: 'left' },
              { src: '/landing/showcase.mp4', poster: '/landing/showcase.jpg', label: 'Product showcase template' },
              { src: '/landing/compare.mp4', poster: '/landing/compare.jpg', label: 'Comparison template', side: 'right' },
            ]}
          />
        </div>
        <p className="hero-in relative mx-auto mt-10 max-w-md px-4 text-center text-xs text-muted-foreground" style={{ '--d': '1.4s' } as CSSProperties}>
          These loops are built-in motion templates, rendered by the same engine as your exports.
        </p>
      </section>

      {/* What is inside */}
      <section aria-label="Models and tools in the studio" className="border-y bg-surface/40 py-6">
        <Marquee
          seconds={90}
          items={modelNames.map((name) => (
            <span className={chip}>
              <Sparkle className="size-3 text-primary" />
              {name}
            </span>
          ))}
        />
        <Marquee reverse seconds={100} className="mt-3" items={capabilityNames.map((name) => <span className={chip}>{name}</span>)} />
      </section>

      {/* The tools */}
      <FeatureRail
        id="studio"
        heading={
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Eyebrow>The studio</Eyebrow>
              <h2 className="mt-2 max-w-2xl font-display text-[clamp(2.4rem,5vw,4.2rem)] leading-none tracking-tight">
                Everything an ad needs, <span className="text-gradient italic">in one place.</span>
              </h2>
            </div>
            <p className="max-w-sm text-muted-foreground">Start from a prompt, a product photo or footage you already have. Each tool hands its result to the next.</p>
          </div>
        }
      >
        {FEATURES.map((f, i) => (
          <article key={f.title} data-lottie-hover className="group relative flex w-[min(86vw,25rem)] shrink-0 flex-col rounded-3xl border bg-surface/70 p-6 backdrop-blur transition-colors hover:border-primary/40 lg:w-[27rem]">
            <div className="flex items-start justify-between">
              <LottieIcon name={f.icon} className="size-11" />
              <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
            </div>
            <h3 className="mt-5 font-display text-3xl tracking-tight">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            <div className="mt-6 lg:mt-auto lg:pt-6">{f.visual}</div>
          </article>
        ))}
      </FeatureRail>

      {/* How it works */}
      <section id="workflow" className="relative scroll-mt-20 pt-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-8" data-reveal>
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-2 font-display text-[clamp(2.4rem,5vw,4.2rem)] leading-none tracking-tight">
            Watch an ad <span className="text-gradient italic">come together.</span>
          </h2>
          <p className="mt-3 max-w-lg text-muted-foreground">Scroll to play it. This is the product showcase template with a sample product.</p>
        </div>
        <ScrubVideo src="/landing/showcase-scrub.mp4" poster="/landing/showcase.jpg" label="The product showcase template, building up as you scroll" steps={STEPS} />
      </section>

      {/* Numbers */}
      <section aria-label="The studio in numbers" className="mx-auto max-w-6xl px-4 py-24 sm:px-8">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border bg-border lg:grid-cols-4">
          {STATS.map((s, i) => (
            <div key={s.label} data-reveal style={{ '--reveal-index': i } as CSSProperties} className="flex flex-col bg-background p-6 sm:p-8">
              <dt className="text-sm text-muted-foreground">{s.label}</dt>
              <dd className="order-first font-display text-6xl tracking-tight tabular-nums sm:text-7xl">
                <CountUp value={s.value} />
              </dd>
              <dd className="mt-1 text-xs text-muted-foreground">{s.note}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Safety and cost */}
      <section id="safety" className="relative mx-auto max-w-6xl scroll-mt-20 px-4 pb-24 sm:px-8">
        <div data-reveal className="max-w-2xl">
          <Eyebrow>Safety & cost</Eyebrow>
          <h2 className="mt-2 font-display text-[clamp(2.4rem,5vw,4.2rem)] leading-none tracking-tight">
            Know the cost. <span className="text-gradient italic">Keep control.</span>
          </h2>
          <p className="mt-3 text-muted-foreground">Nothing runs, spends or posts without you knowing.</p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SAFETY.map((c, i) => (
            <div key={c.title} data-reveal style={{ '--reveal-index': i % 3 } as CSSProperties}>
              <TiltCard className="h-full rounded-3xl border bg-surface/70 p-6">
                <span className="grid size-10 place-items-center rounded-xl bg-primary/12 text-primary">
                  <c.icon className="size-5" />
                </span>
                <h3 className="mt-5 text-lg font-medium tracking-tight">{c.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
              </TiltCard>
            </div>
          ))}
        </div>
      </section>

      {/* Call to action */}
      <section className="px-4 pb-24 sm:px-8">
        <div data-reveal className="border-gradient relative isolate mx-auto max-w-6xl overflow-hidden rounded-[2rem] px-6 py-16 text-center sm:py-24">
          <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_80%_at_50%_120%,color-mix(in_oklab,var(--primary)_38%,transparent),transparent)]" />
          <h2 className="font-display text-[clamp(2.4rem,6vw,5rem)] leading-none tracking-tight">
            Your next ad <span className="text-gradient italic">starts here.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-muted-foreground">Sign in to open the studio. Prices show before anything runs, and the budget cap keeps spending in check.</p>
          <div className="mt-8 flex justify-center">
            <Magnetic>
              <Link href="/dashboard" className={buttonVariants({ variant: 'brand', size: 'lg' })}>
                Open the studio <ArrowRight />
              </Link>
            </Magnetic>
          </div>
        </div>
      </section>
    </main>
  );
}
