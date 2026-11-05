import { cancelJob } from '@adforge/core/server';
import { owned, route } from '@/lib/server/api';
import { returnToGate } from '@/lib/server/agent';
import { toJobView } from '@/lib/server/workspace';

export const POST = route({}, async ({ sb, caller, params }) => {
  const job = await owned(sb, 'jobs', params.id!, caller, 'This job');
  await cancelJob(sb, job.id);
  // A running agent step returns to its gate itself; a queued one never reaches the worker.
  const runId = job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload) ? (job.payload as Record<string, unknown>).runId : null;
  if (job.type === 'agent.step' && job.status === 'queued' && typeof runId === 'string') await returnToGate(sb, caller.workspaceId, runId, 'The step was stopped before it finished.');
  return toJobView(await owned(sb, 'jobs', job.id, caller));
});
