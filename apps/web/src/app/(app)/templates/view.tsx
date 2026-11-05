'use client';

import { useState } from 'react';
import type { AspectRatio } from '@adforge/core';
import { AspectPicker, useCreateEdit } from '@/components/editor/edits-list';
import { TemplateGallery } from '@/components/editor/template-gallery';

export function TemplatesView() {
  const [aspect, setAspect] = useState<AspectRatio>('9:16');
  const [usingId, setUsingId] = useState<string | null>(null);
  const create = useCreateEdit();
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">Shape</span>
        <AspectPicker value={aspect} onChange={setAspect} />
      </div>
      <TemplateGallery
        aspect={aspect}
        busyId={usingId}
        onUse={(t) => {
          setUsingId(t.id);
          create.mutate({ templateId: t.id, aspect, name: t.name }, { onSettled: () => setUsingId(null) });
        }}
      />
    </div>
  );
}
