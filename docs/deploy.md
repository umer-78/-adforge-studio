# Deploying AdForge Studio

AdForge Studio is a website. It runs in three places:

| Part | What it does | Where |
| --- | --- | --- |
| Website (`apps/web`) | Every page, sign-in and the API the pages call | Vercel |
| Worker (`apps/worker`) | Renders, FFmpeg processing, AI jobs, publishing and the scheduler | Railway, from the root `Dockerfile` |
| Database, sign-in and file storage | Postgres with row-level security, Auth, Storage | Supabase |

The website and the worker never call each other. The website writes jobs to the `jobs` table and
the worker claims them, so either side can restart or scale on its own.

## 1. Supabase

1. Create a project at [supabase.com](https://supabase.com) (the free plan works).
2. Apply the migrations in `supabase/migrations` with the Supabase CLI:
   `supabase link --project-ref <your-project-ref>` then `supabase db push`.
3. **Authentication > URL Configuration**: set **Site URL** to the website's address and add
   `https://<your-site>/**` under **Redirect URLs**, so sign-in links and password resets land on the site.
4. **Project Settings > API Keys** holds the three values the website and worker need:
   the project URL, the publishable key and a secret key.

## 2. Website on Vercel

1. In Vercel, **Add New > Project** and import the GitHub repository.
2. Set **Root Directory** to `apps/web`. Vercel detects Next.js and pnpm on its own.
3. Under **Environment Variables**, add the values from `.env.example` that you use. At least:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
   - `NEXT_PUBLIC_APP_URL` only for a custom domain: without it the site uses its Vercel address
   - `APP_ENCRYPTION_KEY` (see [the encryption key](#the-encryption-key))
   - `APP_OWNER_EMAILS` if only you should be able to sign in
4. Deploy. Then put the site's address in the Supabase URL settings (step 1.3) and in the
   worker's `NEXT_PUBLIC_APP_URL`, so provider webhooks reach the site.

## 3. Worker on Railway

The root `Dockerfile` builds the worker with FFmpeg, Chrome Headless Shell for rendering, fonts for
every script and emoji, and a pre-built bundle of the video compositions. Railway finds it on its own.

1. In Railway, **New Project > Deploy from GitHub repo** and pick this repository. If it is not in
   the list, choose **Configure GitHub App** and give Railway access to it.
2. Railway starts building from the `Dockerfile`. The first build takes about 5 to 10 minutes.
3. Open the service, then **Variables > Raw Editor**, and paste:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   SUPABASE_SECRET_KEY=
   APP_ENCRYPTION_KEY=
   NEXT_PUBLIC_APP_URL=https://your-site.vercel.app
   RAILWAY_DEPLOYMENT_DRAINING_SECONDS=45
   ```

   Fill in the empty values with the same ones the website uses. Add any provider keys
   (`ANTHROPIC_API_KEY`, `FAL_KEY`, `ELEVENLABS_API_KEY`, the social app credentials and so on)
   that you also set on Vercel: the worker is the side that calls those services.
4. **Settings > Deploy > Healthcheck Path**: `/healthz`. On each deploy Railway then waits for the
   new worker to report healthy before it stops the old one.
5. Save; Railway redeploys. The **Deploy Logs** show `worker started` and `health endpoint listening`.

The worker needs no public domain: it only talks to Supabase and the AI and social platforms.

### Sizing

- The worker reads the CPU and memory limits of its container and sizes itself: one Chrome tab per
  render on 1 GB, more as memory and CPUs allow, and FFmpeg threads to match the CPUs.
  `RENDER_CONCURRENCY` overrides the tab count.
- 1 GB of memory is enough for short 1080p renders. 2 GB or more renders faster and longer clips.
- To give renders their own machine, run a second Railway service from the same repository with
  `WORKER_POOLS=render`, and set `WORKER_POOLS=media,ai,network` on the first.
- `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=45` gives running jobs 25 seconds to finish when a redeploy
  stops the old worker. Jobs still running then go back in the queue, without using up a retry,
  and the new worker picks them up.
- If a job loop ever hangs for ten minutes, the worker exits so Railway restarts it.

### Running the image elsewhere

```
docker build -t adforge-worker .
docker run --env-file .env -p 8080:8080 adforge-worker
curl localhost:8080/healthz
```

## The encryption key

`APP_ENCRYPTION_KEY` encrypts the provider keys and social account tokens saved in the studio. The
website and the worker must use the same value. To make one:

- Without a terminal: deploy the website first, sign in, open **Settings > Providers** and press
  **Copy a new key**. The key is made in your browser and copied to the clipboard.
- With a terminal: `openssl rand -base64 32`.

Paste it into Vercel and Railway, then redeploy both. Keep it somewhere safe: replacing it makes the
keys and tokens saved with the old one unreadable. To rotate it, move the old value to
`APP_ENCRYPTION_KEY_PREVIOUS` and set a new `APP_ENCRYPTION_KEY`.
