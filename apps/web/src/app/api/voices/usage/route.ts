import { elevenSubscription, requireProviderKey } from '@adforge/core/server';
import { route } from '@/lib/server/api';

/** ElevenLabs plan and character usage, so voice work can be priced against what is left. */
export const GET = route({ limit: ['voice-usage', 120, 3600] }, async ({ caller }) => {
  const key = await requireProviderKey(caller.workspaceId, 'elevenlabs');
  return elevenSubscription(key);
});
