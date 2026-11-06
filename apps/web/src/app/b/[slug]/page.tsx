import { BIO_SLUG_RE } from '@adforge/core';
import { serviceClient } from '@adforge/core/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache, Suspense } from 'react';
import { BioBeacon } from '@/components/bio/bio-beacon';
import { bioColors, BioPage } from '@/components/bio/bio-page';
import { publishedBioPage } from '@/lib/server/bio';

type Params = { params: Promise<{ slug: string }> };

const load = cache(async (slug: string) => {
  const s = slug.toLowerCase();
  return BIO_SLUG_RE.test(s) ? publishedBioPage(serviceClient(), s) : null;
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const page = await load(slug).catch(() => null);
  if (!page) return { title: 'Page not found', robots: { index: false, follow: false } };
  const title = page.title || `@${page.slug}`;
  const description = page.bio || `Links from ${title}.`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/b/${page.slug}` },
    openGraph: { title, description, type: 'profile', url: `/b/${page.slug}`, ...(page.avatarUrl ? { images: [{ url: page.avatarUrl, width: 400, height: 400 }] } : {}) },
    twitter: { card: 'summary', title, description },
  };
}

export default function BioRoute({ params }: Params) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <Bio params={params} />
    </Suspense>
  );
}

async function Bio({ params }: Params) {
  const { slug } = await params;
  const page = await load(slug);
  if (!page) notFound();
  return (
    <div className="min-h-dvh" style={{ background: bioColors(page.theme).bg }}>
      <BioPage page={page} className="min-h-dvh" />
      <BioBeacon pageId={page.id} />
    </div>
  );
}
