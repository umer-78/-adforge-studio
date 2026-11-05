/** Services the app calls with a workspace's own API key (or the server's). */
export const KEY_PROVIDERS = ['anthropic', 'openai', 'fal', 'replicate', 'agnes', 'elevenlabs', 'ayrshare'] as const;
export type KeyProvider = (typeof KEY_PROVIDERS)[number];

export interface ProviderInfo {
  label: string;
  /** What the key unlocks in the app. */
  uses: string;
  /** Where to create a key. */
  keyUrl: string;
  placeholder: string;
}

export const PROVIDER_INFO: Record<KeyProvider, ProviderInfo> = {
  anthropic: {
    label: 'Anthropic (Claude)',
    uses: 'Scripts, prompt enhancer, product research, ad scoring and the agent.',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    placeholder: 'sk-ant-…',
  },
  openai: {
    label: 'OpenAI',
    uses: 'Library search by meaning, content moderation and a transcription fallback.',
    keyUrl: 'https://platform.openai.com/api-keys',
    placeholder: 'sk-…',
  },
  fal: {
    label: 'fal.ai',
    uses: 'Most video and image models: Kling, Veo, Seedance, Flux, upscalers and background removal.',
    keyUrl: 'https://fal.ai/dashboard/keys',
    placeholder: 'key-id:secret',
  },
  replicate: {
    label: 'Replicate',
    uses: 'Extra video, image and 3D models hosted on Replicate.',
    keyUrl: 'https://replicate.com/account/api-tokens',
    placeholder: 'r8_…',
  },
  agnes: {
    label: 'Agnes AI',
    uses: 'Agnes image and video models.',
    keyUrl: 'https://apihub.agnes-ai.com',
    placeholder: 'sk-…',
  },
  elevenlabs: {
    label: 'ElevenLabs',
    uses: 'Voice-over, voice cloning, dubbing, speech to text, music and sound effects.',
    keyUrl: 'https://elevenlabs.io/app/settings/api-keys',
    placeholder: 'sk_…',
  },
  ayrshare: {
    label: 'Ayrshare',
    uses: 'Optional: publish to social platforms through Ayrshare instead of direct connections.',
    keyUrl: 'https://app.ayrshare.com',
    placeholder: 'XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX',
  },
};
