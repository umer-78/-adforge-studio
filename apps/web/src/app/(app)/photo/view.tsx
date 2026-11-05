'use client';

import { Expand, Film, Image as ImageIcon, Layers, Layers3, Paintbrush, Scissors, Sparkles, WandSparkles } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { GenerateStudio, type StudioMode, type StudioPreset } from '@/components/generate/generate-studio';
import { BatchEditTool } from '@/components/photo/batch-edit';
import { FillExpandTool } from '@/components/photo/fill-expand';
import { ParallaxTool } from '@/components/photo/parallax-tool';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const MODES: StudioMode[] = [
  { capability: 't2i', label: 'Generate', icon: Sparkles },
  { capability: 'i2i', label: 'Edit with words', icon: WandSparkles },
  { capability: 'upscale_image', label: 'Upscale', icon: Expand },
  { capability: 'remove_bg_image', label: 'Remove background', icon: Scissors },
];

const KEEP = 'Keep the product, its label, logo and colors exactly the same.';
const PRESETS: StudioPreset[] = [
  { capability: 'i2i', label: 'Product shot', prompt: `Turn this into a premium e-commerce product shot: seamless soft-gradient studio backdrop, large softbox key light, subtle floor reflection, crisp edges. ${KEEP}` },
  { capability: 'i2i', label: 'New background', prompt: `Replace the background with a sunlit marble kitchen counter and soft out-of-focus plants. Match the lighting, perspective and shadows. ${KEEP}` },
  { capability: 'i2i', label: 'Relight', prompt: 'Relight the scene with warm golden-hour sunlight from the left and long soft shadows. Keep the composition and subject identical.' },
  { capability: 'i2i', label: 'Retouch', prompt: 'Retouch naturally: remove dust, blemishes and stray hairs, even out skin tone, keep real skin texture and identity. No plastic look.' },
  { capability: 'i2i', label: 'Style transfer', prompt: 'Restyle this photo to match the look of @image1: its color palette, lighting, contrast and texture. Keep the subject and composition unchanged.' },
  { capability: 'i2i', label: 'Clean up', prompt: 'Remove distracting objects, cables and text from the background. Keep the subject intact and the scene natural.' },
  { capability: 'i2i', label: 'Lifestyle scene', prompt: `Place the product in a lived-in lifestyle scene: a person's hand reaching for it on a cozy wooden table, morning window light, shallow depth of field. ${KEEP}` },
];

const TABS = ['create', 'fill', 'batch', 'parallax'] as const;

export function PhotoView() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = TABS.find((t) => t === sp.get('tab')) ?? 'create';
  return (
    <Tabs value={tab} onValueChange={(v) => router.replace(`${pathname}?tab=${v}`, { scroll: false })} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="create">
            <ImageIcon className="size-4" /> Create & edit
          </TabsTrigger>
          <TabsTrigger value="fill">
            <Paintbrush className="size-4" /> Fill & expand
          </TabsTrigger>
          <TabsTrigger value="batch">
            <Layers className="size-4" /> Batch
          </TabsTrigger>
          <TabsTrigger value="parallax">
            <Layers3 className="size-4" /> 3D parallax
          </TabsTrigger>
        </TabsList>
        <Button variant="outline" size="sm" asChild>
          <Link href="/generate?mode=i2v">
            <Film className="size-4" /> Animate a photo
          </Link>
        </Button>
      </div>
      <TabsContent value="create">
        <GenerateStudio modes={MODES} kind="image" presets={PRESETS} />
      </TabsContent>
      <TabsContent value="fill">
        <FillExpandTool />
      </TabsContent>
      <TabsContent value="batch">
        <BatchEditTool />
      </TabsContent>
      <TabsContent value="parallax">
        <ParallaxTool />
      </TabsContent>
    </Tabs>
  );
}
