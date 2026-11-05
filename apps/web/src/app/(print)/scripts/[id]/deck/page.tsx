import { Suspense } from 'react';
import { StoryboardDeck } from '@/components/scripts/storyboard-deck';

export const metadata = { title: 'Storyboard deck' };

export default function DeckPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-neutral-600">Loading the deck…</div>}>
      <Deck params={params} />
    </Suspense>
  );
}

async function Deck({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StoryboardDeck id={id} />;
}
