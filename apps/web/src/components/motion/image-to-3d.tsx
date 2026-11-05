'use client';

import { Box, Scissors } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AssetSlot } from '@/components/app/asset-picker';
import { RunBar } from '@/components/audio/run-bar';
import { Composer, studioColumns, useCapabilityModel } from '@/components/audio/studio';
import { RecentGenerations } from '@/components/generate/recent-generations';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { AssetView } from '@/lib/types';

const TIPS = ['One product, centered, fully in frame', 'Plain or removed background', 'Even light, no hard shadows or glare', 'A three-quarter angle shows the most shape'];

/** Turns a product photo into a GLB model for the 3D studio. */
export function ImageTo3dPanel({ initialImage }: { initialImage: AssetView | null }) {
  const { model } = useCapabilityModel('image_to_3d');
  const [image, setImage] = useState<AssetView | null>(initialImage);
  const [textured, setTextured] = useState(true);
  useEffect(() => {
    if (initialImage) setImage(initialImage);
    // Only a different linked photo replaces the one picked here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialImage?.id]);
  const problems = [!image ? 'Pick a product photo.' : image.status !== 'ready' ? 'Wait for the photo to finish processing.' : ''].filter(Boolean);
  return (
    <div className={studioColumns}>
      <Composer>
        <AssetSlot label="Product photo" types={['image']} value={image} onChange={setImage} required />
        <div className="rounded-xl bg-surface-2/60 p-3">
          <p className="mb-2 text-xs font-medium">For the best model</p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {TIPS.map((t) => (
              <li key={t}>• {t}</li>
            ))}
          </ul>
          <Button size="xs" variant="ghost" className="mt-2 -ml-2" asChild>
            <Link href="/photo?tab=create">
              <Scissors className="size-3.5" /> Remove the background first
            </Link>
          </Button>
        </div>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            <span className="font-medium">Textured</span>
            <span className="block text-xs text-muted-foreground">Full color and materials. Turn off for a quick shape-only draft.</span>
          </span>
          <Switch checked={textured} onCheckedChange={setTextured} />
        </label>
        <RunBar model={model} input={{ capability: 'image_to_3d', params: { prompt: '', ...(image ? { imageAssetId: image.id } : {}), textured } }} problems={problems} label="Make 3D model" icon={<Box className="size-4" />} />
      </Composer>
      <div className="min-w-0 space-y-4">
        <RecentGenerations capabilities={['image_to_3d']} limit={9} title="Your 3D models" />
        <p className="text-xs text-muted-foreground">Finished models open in the 3D studio, where you can stage them and render turntable clips for ads.</p>
      </div>
    </div>
  );
}
