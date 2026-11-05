import type { AgentRunView } from '@/lib/types';

export const RUN_STATUS_LABEL: Record<AgentRunView['status'], string> = {
  awaiting_approval: 'Needs you',
  running: 'Working',
  completed: 'Finished',
  failed: 'Failed',
  canceled: 'Canceled',
};
