import { PageContainer } from '@/components/app/page';
import { BioView } from '@/components/bio/bio-editor';
import { PageHeader } from '@/components/ui/misc';

export const metadata = { title: 'Link in bio' };

export default function BioPageRoute() {
  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Distribute"
        title="Link in bio"
        description="One public page for the link in your social bios. Add your shop, latest video and offers, pick a look, and see how many people visit and which links they press."
      />
      <BioView />
    </PageContainer>
  );
}
