import {
  AudioLines,
  Bot,
  Box,
  ChartColumn,
  Clapperboard,
  Copy,
  FileText,
  FolderOpen,
  Gift,
  Image,
  LayoutDashboard,
  LayoutTemplate,
  Layers,
  Link2,
  Megaphone,
  Music,
  Radar,
  Send,
  Settings,
  ShoppingBag,
  Sparkles,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'Recent work, spend and what is running' },
      { href: '/library', label: 'Library', icon: FolderOpen, description: 'Every video, photo and sound' },
      { href: '/free-media', label: 'Free media', icon: Gift, description: 'Free photos, videos, music and sounds for ads' },
    ],
  },
  {
    title: 'Create',
    items: [
      { href: '/generate', label: 'Generate', icon: Sparkles, description: 'AI video and image generation' },
      { href: '/prompts', label: 'Prompt Enhancer', icon: WandSparkles, description: 'Turn a rough idea into a pro prompt' },
      { href: '/scripts', label: 'Scripts', icon: FileText, description: 'Ad scripts and dialogues' },
      { href: '/voice', label: 'Voice-over', icon: AudioLines, description: 'Text to speech, cloning, dubbing' },
      { href: '/music', label: 'Music & SFX', icon: Music, description: 'Licensed music, songs and sound effects' },
      { href: '/photo', label: 'Photo Studio', icon: Image, description: 'Product shots, edits, upscales' },
      { href: '/motion', label: '3D & Motion', icon: Box, description: 'Motion graphics and 3D models' },
    ],
  },
  {
    title: 'Edit',
    items: [
      { href: '/editor', label: 'Editor', icon: Clapperboard, description: 'Timeline video editor' },
      { href: '/templates', label: 'Templates', icon: LayoutTemplate, description: 'Proven ad structures' },
    ],
  },
  {
    title: 'Grow',
    items: [
      { href: '/products', label: 'URL to Video', icon: ShoppingBag, description: 'Make ads from a product page' },
      { href: '/clone', label: 'Ad Clone', icon: Copy, description: 'Reuse a winning ad structure' },
      { href: '/variants', label: 'Variants', icon: Layers, description: 'Batch hooks, CTAs and voices' },
      { href: '/inspiration', label: 'Inspiration', icon: Radar, description: 'Competitor ads and swipe file' },
      { href: '/agent', label: 'Agent', icon: Bot, description: 'Research → script → ads, with approvals' },
    ],
  },
  {
    title: 'Distribute',
    items: [
      { href: '/publish', label: 'Publish', icon: Send, description: 'Post and schedule to 7 platforms' },
      { href: '/bio', label: 'Link in bio', icon: Link2, description: 'One public page for your links, with clicks counted' },
      { href: '/ads', label: 'Ads', icon: Megaphone, description: 'Launch Meta and TikTok ads' },
      { href: '/analytics', label: 'Analytics', icon: ChartColumn, description: 'Posts, ads and spend' },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = { href: '/settings', label: 'Settings', icon: Settings, description: 'Workspace, providers, connections, API keys' };

export const ALL_NAV: NavItem[] = [...NAV.flatMap((g) => g.items), SETTINGS_ITEM];
