import { PageContainer } from '@/components/app/page';
import { DashboardView } from './view';

export const metadata = { title: 'Dashboard' };

export default function DashboardPage() {
  return (
    <PageContainer wide>
      <DashboardView />
    </PageContainer>
  );
}
