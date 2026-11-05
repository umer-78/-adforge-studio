import type { ReactNode } from 'react';
import { PageContainer } from '@/components/app/page';
import { PageHeader } from '@/components/ui/misc';
import { SettingsNav } from './nav';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <PageContainer>
      <PageHeader title="Settings" description="Your workspace, the services it uses, connected accounts, brand, API access and spend." />
      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
        <SettingsNav />
        <div className="min-w-0">{children}</div>
      </div>
    </PageContainer>
  );
}
