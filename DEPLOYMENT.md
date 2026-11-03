# Deployment

The app has two parts, deployed separately:

| Part | What it is | Where |
| --- | --- | --- |
| **Frontend** (`frontend/`) | React + Vite static site | Vercel (or Render static site) |
| **Backend** (`backend/`) | NestJS API, a background document worker and Redis | Render |
| **Database** | Postgres | Supabase |

The backend can't run on Vercel: it keeps long-running queue workers and
Redis connections, which serverless functions don't support.

Recommended order: **Supabase first**, then the backend (so you have its
URL), then the frontend, then tell the backend which frontend URL to trust.

---

## 1. Database on Supabase

1. Create a project at [supabase.com](https://supabase.com) and note the
   database password you set. Pick a region close to your Render region.
2. Click **Connect** (top of the project page) and copy the
   **Session pooler** connection string. It looks like:
   ```
   postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
3. Replace `[YOUR-PASSWORD]` with your password. If the password contains
   `@ # / : ? %`, URL-encode those characters (e.g. `@` → `%40`).

That string is your `DATABASE_URL`, both on Render and in `backend/.env`.

**Use the Session pooler, not the others.** The *Direct connection*
(`db.<ref>.supabase.co`) only works over IPv6 unless you buy Supabase's IPv4
add-on, and Render can't connect over IPv6. The *Transaction pooler*
(port 6543) is meant for serverless functions, not a long-running server. The
backend logs a warning at startup if it sees either.

**What the backend does for Supabase automatically** (each can be overridden;
see `backend/.env.example`):

- **SSL on.** Pasting the URL with `?sslmode=require` is fine. Optionally
  download the SSL certificate (Database settings → SSL configuration) and set
  `DB_SSL_CA` to verify it too.
- **Smaller connection pools** (`DB_POOL_MAX=5` per process). The API and the
  worker each keep a pool, and Supabase's pooler caps clients (15 on the
  smallest plan).
- **Row level security on every table.** Supabase publishes the `public`
  schema through its REST API with a public "anon" key. With RLS on and no
  policies, that API can't read or write this app's tables, including `users`.
  The app itself is unaffected because it connects as the tables' owner. If you
  don't use Supabase's REST API at all, you can also turn it off under
  Project Settings → Data API.

**Tables** are created by the backend on its first start with
`DB_SYNCHRONIZE=true` (always on in development), so there's nothing to run in
Supabase's SQL editor.

---

## 2. Backend on Render

Everything is described in [`render.yaml`](render.yaml):

- `biography-redis`: Key Value (Redis) with `noeviction`, which BullMQ requires
- `biography-api`: web service, health check at `/api/health`
- `biography-worker`: background worker that builds the EPUB and PDF files

**Steps**

1. Push the repo to GitHub/GitLab.
2. Render Dashboard → **New → Blueprint** → choose the repo.
3. Fill in the values Render asks for:
   - `DATABASE_URL`: your Supabase Session pooler string (asked for both
     the API and the worker; use the same value)
   - `GEMINI_API_KEY` (and optionally `GEMINI_API_KEYS`, `OPENAI_API_KEY`)
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
     (asked for both the API and the worker)
   - `CORS_ORIGINS`: leave empty for now
4. Deploy. `REDIS_URL` and `JWT_SECRET` are filled in automatically.
5. Check `https://biography-api.onrender.com/api/health` (your service name
   may differ) returns `{"status":"ok"}`.
6. **After the first successful deploy**, set `DB_SYNCHRONIZE` to `false` on
   `biography-api`. It's only there to create the tables in the empty
   database. You'll see them under Supabase → Table Editor, each marked as
   RLS enabled.

**Plans and memory.** The Blueprint uses paid starter plans because
background workers have no free tier. On a
512 MB instance the heap is capped with `NODE_OPTIONS=--max-old-space-size=400`.
If you upgrade a service, raise that number to about 75% of its RAM (e.g.
`1536` on a 2 GB instance). Long books with many photos are the heaviest jobs.

**Region.** The three Render resources must be in the same region to use
private connections. Change every `region:` line together, ideally to match
your Supabase region.

**Prefer Render Postgres?** `render.yaml` has a commented block for it.

### Without the Blueprint: one Web Service for API + worker

If you create services by hand, a single **Web Service** can run both the API
and the document worker. It's cheaper, but they share one instance's memory.

| Setting | Value |
| --- | --- |
| Root Directory | `backend` |
| Build Command | `npx --yes pnpm@9.15.9 install --frozen-lockfile && npx --yes pnpm@9.15.9 run build` |
| Start Command | `npm run start:all` |
| Health Check Path | `/api/health` |

Environment: everything the API needs (`NODE_ENV=production`,
`NODE_VERSION=22`, `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`,
`DB_SYNCHRONIZE=true` for the first deploy, the AI keys, the three
`CLOUDINARY_*` keys). For `NODE_OPTIONS`, split the memory between the two
processes: `--max-old-space-size=200` on a 512 MB instance, `700` on 2 GB.

`start:all` stops the whole service if either process exits, so Render
restarts it rather than leaving the site up with no worker. In the logs,
lines are prefixed `[API]` and `[WORKER]`.

On Render's **free** instance type the service sleeps after 15 minutes
without web traffic, which pauses the worker too. Keep the progress page open
while a book generates, or use a paid instance.

---

## 3. Frontend on Vercel

[`frontend/vercel.json`](frontend/vercel.json) sets the install/build commands,
SPA routing (deep links like `/my-books` work on refresh) and asset caching.

1. Vercel → **Add New → Project** → import the repo.
2. **Root Directory:** `frontend`.
3. **Environment variable:** `VITE_API_URL` = your Render API URL, e.g.
   `https://biography-api.onrender.com`. `/api` is added automatically if you
   leave it off. Set it for Production and Preview.
4. Deploy.

`VITE_API_URL` is baked in at build time, so **redeploy the frontend** after
changing it.

### Alternative: frontend on Render

Uncomment the `biography-web` static site at the bottom of `render.yaml`. It
wires `VITE_API_URL` to the API automatically. Use this *or* Vercel, not both.

---

## 4. Lock CORS to your frontend

Once the frontend is live, set `CORS_ORIGINS` on `biography-api`
(comma-separated):

```
https://your-app.vercel.app,https://*.vercel.app
```

The `*.vercel.app` entry allows Vercel preview deployments. Leaving
`CORS_ORIGINS` empty allows any origin, which is fine while testing.

---

## Environment variables

Full list with comments: [`backend/.env.example`](backend/.env.example) and
[`frontend/.env.example`](frontend/.env.example).

The backend accepts connection settings in either form, so the same code runs
on Render, other hosts, Docker and locally:

| Setting | Hosted form | Docker / local form |
| --- | --- | --- |
| Postgres | `DATABASE_URL` (Supabase pooler; SSL automatic) | `DATABASE_URL` or `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` |
| Redis | `REDIS_URL` (`rediss://` = TLS) | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` |

`JWT_SECRET` is required whenever `NODE_ENV=production`. The API refuses to
start without it rather than fall back to a guessable default.

## Existing databases

If you're pointing at a database created before these schema changes, run
the SQL files in [`backend/migrations/`](backend/migrations) in order. Fresh
databases created with `DB_SYNCHRONIZE=true` don't need them.

## Local development

Put the Supabase `DATABASE_URL` in `backend/.env` to develop against
Supabase. You then only need Redis locally:

```bash
cd backend && docker compose up -d redis && pnpm dev   # API + worker
cd frontend && npm run dev                              # http://localhost:5173
```

`docker compose up` (everything in containers) uses the local Postgres
container by default. To point the containers at Supabase, also set
`DOCKER_DATABASE_URL` in `.env` to the same Supabase string.

Consider a separate Supabase project for development, so local experiments and
`DB_SYNCHRONIZE` (always on in development) never touch production data.
