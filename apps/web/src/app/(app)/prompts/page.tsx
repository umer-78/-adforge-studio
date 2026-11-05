import { PageContainer } from '@/components/app/page';
import { PageHeader } from '@/components/ui/misc';
import { PromptsView } from './view';

export const metadata = { title: 'Prompt Enhancer' };

export default function PromptsPage() {
  return (
    <PageContainer wide>
      <PageHeader eyebrow="Create" title="Prompt Enhancer" description="Turn a rough idea into a detailed shot: subject, scene, lighting, lens, camera move, mood and what to avoid. Ad mode adds a 3-second hook and a call to action." />
      <PromptsView />
    </PageContainer>
  );
}
