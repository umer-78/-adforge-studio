import { parseMotionProps, type ResolvedAsset } from '@adforge/core';
import type { MotionComponent, MotionProps } from './kit';
import { LogoSting } from './templates/brand';
import { CtaButton, PriceTag, ProductShowcase, SaleBadge } from './templates/commerce';
import { BulletList, Comparison } from './templates/data';
import { RatingStars, Subscribe, Testimonial } from './templates/social';
import { KineticTitle, LowerThird, UgcHookTemplate } from './templates/titles';
import { Countdown, ProgressBar, QrCard } from './templates/utility';

// Props are parsed with each template's schema before rendering, so the registry erases them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const MOTION_COMPONENTS: Record<string, MotionComponent<any>> = {
  'kinetic-title': KineticTitle,
  'lower-third': LowerThird,
  'price-tag': PriceTag,
  'sale-badge': SaleBadge,
  countdown: Countdown,
  'cta-button': CtaButton,
  'rating-stars': RatingStars,
  'logo-sting': LogoSting,
  'progress-bar': ProgressBar,
  'qr-card': QrCard,
  'bullet-list': BulletList,
  testimonial: Testimonial,
  comparison: Comparison,
  subscribe: Subscribe,
  'product-showcase': ProductShowcase,
  'ugc-hook': UgcHookTemplate,
};

export interface MotionViewProps extends Omit<MotionProps<Record<string, unknown>>, 'p' | 'asset'> {
  templateId: string;
  props: Record<string, unknown>;
  assets: Record<string, ResolvedAsset>;
}

/** Renders a motion template with validated props inside a box of width × height. */
export function MotionView({ templateId, props, assets, ...rest }: MotionViewProps) {
  const Component = MOTION_COMPONENTS[templateId];
  if (!Component) return null;
  const p = parseMotionProps(templateId, props);
  return <Component p={p} asset={(id) => (id ? (assets[id] ?? null) : null)} {...rest} />;
}

export type { MotionProps } from './kit';
