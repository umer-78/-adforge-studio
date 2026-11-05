import { Suspense } from 'react';
import { Editor } from '@/components/editor/editor';

export const metadata = { title: 'Editor' };

async function EditorRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Editor id={id} />;
}

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="h-dvh bg-background" />}>
      <EditorRoute params={params} />
    </Suspense>
  );
}
