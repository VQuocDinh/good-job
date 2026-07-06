# Deploy (demo go-live): Render (backend) + Vercel (frontend)

Backend (NestJS API + Postgres/pgvector + Redis) runs on **Render** via `render.yaml`.
Frontend (Vite/React static site) runs on **Vercel**.

Because Vite bakes `VITE_API_URL` into the bundle at **build time**, deploy the backend
first, then build the frontend against its URL.

---

## 1. Backend on Render

1. Push this repo to GitHub/GitLab.
2. Render dashboard → **New +** → **Blueprint** → select the repo. Render reads `render.yaml`
   and provisions: `goodjob-db` (Postgres 16), `goodjob-redis`, `goodjob-api` (Docker).
3. On first apply, set the `sync:false` env vars on the **goodjob-api** service:
   - `ADMIN_EMAILS` — your admin email(s), comma-separated.
   - `WEB_ORIGIN` — leave blank for now (fill in after step 2, once you have the Vercel URL).
   - `GEMINI_API_KEY` — optional (unset = semantic search disabled, app still works).
4. Wait for the deploy. `prisma migrate deploy` runs automatically on boot (creates tables
   + the `vector` extension). Confirm health at:
   `https://goodjob-api.onrender.com/health` → should return `{"status":"ok",...}`.

Copy the API URL, e.g. `https://goodjob-api.onrender.com`.

## 2. Frontend on Vercel

1. Vercel → **Add New** → **Project** → import the repo.
2. Configure the project:
   - **Root Directory**: `apps/web`
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Add an Environment Variable:
   - `VITE_API_URL = https://goodjob-api.onrender.com`  (the URL from step 1)
4. Deploy. Copy the resulting URL, e.g. `https://your-app.vercel.app`.

## 3. Wire CORS back to the frontend

1. Render → `goodjob-api` → Environment → set `WEB_ORIGIN = https://your-app.vercel.app`.
2. Save → the API redeploys. This allows both REST (CORS) and WebSocket from the frontend.

Done. Open the Vercel URL and log in.

---

## Notes & caveats (free tier)

- **Cold starts**: the free API sleeps after ~15 min idle; the first request wakes it (slow).
- **Uploads are ephemeral**: free Render services can't mount a persistent disk, so uploaded
  images/videos are lost on every redeploy/restart. To keep them, switch the API to a paid
  plan and uncomment the `disk:` block in `render.yaml` (or move uploads to object storage).
- **Free Postgres expires** after 30 days — fine for a short-lived demo.
- **Changing `VITE_API_URL` requires a Vercel rebuild** (it's compiled into the bundle, not
  read at runtime).
- Single instance only — this setup relies on in-memory rate limiting and local-disk uploads,
  which is exactly right for one instance. Scaling horizontally would need Redis-backed rate
  limiting and object storage.
