'use client';

import { useQuery } from '@tanstack/react-query';
import { Box, Rotate3d, Smartphone, Sparkles } from 'lucide-react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ImageTo3dPanel } from '@/components/motion/image-to-3d';
import { MotionTemplates } from '@/components/motion/motion-templates';
import { Skeleton } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api-client';
import type { AssetView } from '@/lib/types';
import { qs } from '@/lib/utils';

// WebGL only loads on the 3D tab.
const ModelViewer = dynamic(() => import('@/components/motion/model-viewer').then((m) => m.ModelViewer), { ssr: false, loading: () => <Skeleton className="h-[70vh] rounded-2xl" /> });
const DeviceStudio = dynamic(() => import('@/components/motion/device-studio').then((m) => m.DeviceStudio), { ssr: false, loading: () => <Skeleton className="h-[70vh] rounded-2xl" /> });

const TABS = ['templates', 'devices', 'model', 'viewer'] as const;
type Tab = (typeof TABS)[number];

function useAsset(id: string | null) {
  return useQuery({ queryKey: ['asset', id, 'view'], enabled: !!id, queryFn: () => api.get<{ asset: AssetView }>(`/assets/${id}`).then((r) => r.asset) });
}

export function MotionView() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const modelId = sp.get('model');
  const imageId = sp.get('image');
  const templateId = sp.get('template');
  const screenId = sp.get('screen');
  const tab: Tab = TABS.find((t) => t === sp.get('tab')) ?? (modelId ? 'viewer' : imageId ? 'model' : screenId ? 'devices' : 'templates');
  const model = useAsset(modelId);
  const image = useAsset(imageId);
  const screen = useAsset(screenId);
  const go = (next: Partial<Record<'tab' | 'template' | 'model' | 'image' | 'screen', string | null>>) => {
    const params = { tab, template: templateId, model: modelId, image: imageId, screen: screenId, ...next };
    router.replace(`${pathname}${qs(params)}`, { scroll: false });
  };
  return (
    <Tabs value={tab} onValueChange={(v) => go({ tab: v })} className="space-y-6">
      <TabsList className="no-scrollbar max-w-full overflow-x-auto">
        <TabsTrigger value="templates">
          <Sparkles className="size-4" /> Motion graphics
        </TabsTrigger>
        <TabsTrigger value="devices">
          <Smartphone className="size-4" /> Device mockups
        </TabsTrigger>
        <TabsTrigger value="model">
          <Box className="size-4" /> Image to 3D
        </TabsTrigger>
        <TabsTrigger value="viewer">
          <Rotate3d className="size-4" /> 3D studio
        </TabsTrigger>
      </TabsList>
      <TabsContent value="templates">
        <MotionTemplates templateId={templateId} onTemplate={(id) => go({ template: id })} />
      </TabsContent>
      <TabsContent value="devices">
        {tab === 'devices' && <DeviceStudio initial={screen.data && (screen.data.type === 'video' || screen.data.type === 'image') ? screen.data : null} />}
      </TabsContent>
      <TabsContent value="model">
        <ImageTo3dPanel initialImage={image.data?.type === 'image' ? image.data : null} />
      </TabsContent>
      <TabsContent value="viewer">{tab === 'viewer' && <ModelViewer initial={model.data?.type === 'model3d' ? model.data : null} />}</TabsContent>
    </Tabs>
  );
}
