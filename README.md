# AdForge Studio

A website for making, editing and publishing ad videos and photos in one place: upload or generate
footage, cut it in a timeline editor, add voice, music and motion graphics, preview it on 3D
devices, then schedule it to social platforms or launch it as a paused ad.

## What's inside

- **Library**: uploads with automatic tags, transcripts and search, folders, versions and sharing.
- **Generate**: video and image generation through fal, Replicate and Agnes, with a cost estimate
  before every job and a monthly budget cap.
- **Editor**: a multi-track timeline with captions, text, transitions, effects, LUTs, an AI edit
  assistant and exports sized for each platform, with a licence check before export.
- **Voice, music and sound**: voiceovers, dubbing, music and sound effects, with consent records for
  cloned voices and licences on every track.
- **3D and motion**: animated titles, price tags and CTAs; ads placed on a 3D phone, laptop, TV or
  billboard with camera moves; product photos turned into 3D models; clips rendered in the browser.
- **Growth**: product imports, ad cloning, variants, an inspiration board, scheduling to YouTube,
  TikTok, Instagram, Facebook, LinkedIn, X and Pinterest, ad launches on Meta and TikTok (always
  paused first), analytics and an agent mode that plans and runs a campaign with your approval.
- **Workspace**: provider keys stored encrypted, API keys for the REST API and the MCP server,
  usage against a monthly budget, and consent records.

## How it fits together

```
apps/web        Next.js website and API (Vercel)
apps/worker     Job worker: renders, FFmpeg, AI calls, publishing, scheduler (Railway, Dockerfile)
packages/core   Shared types, schemas, provider clients and server helpers
packages/compositions   Remotion video compositions used by the editor and the worker
supabase        Database migrations (Postgres, row-level security, storage)
```

The website writes jobs to Postgres and the worker claims them, so each side scales and restarts
on its own. Files live in Supabase Storage or any S3-compatible bucket and are served with signed
URLs.

## Run it locally

Requirements: Node 22, pnpm 10 (`corepack enable`), FFmpeg, and a Supabase project.

```
pnpm install
cp .env.example .env          # fill in the Supabase values at least
pnpm dev                      # website on http://localhost:3000 and the worker
```

Other commands: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`.

## Deploy

See [docs/deploy.md](docs/deploy.md): Supabase for data, Vercel for the website and Railway for
the worker. Every variable is described in [.env.example](.env.example).
