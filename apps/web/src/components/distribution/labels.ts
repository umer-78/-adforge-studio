import type { AD_OBJECTIVES } from '@adforge/core';

export const OBJECTIVE_LABEL: Record<(typeof AD_OBJECTIVES)[number], string> = {
  traffic: 'Traffic to your site',
  sales: 'Sales',
  engagement: 'Engagement',
  awareness: 'Awareness',
  leads: 'Leads',
  video_views: 'Video views',
};

export const ctaLabel = (c: string) => c.charAt(0) + c.slice(1).toLowerCase().replace(/_/g, ' ');
