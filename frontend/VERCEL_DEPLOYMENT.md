# Vercel Deployment Guide — BotRoyale Frontend

## Overview

This guide covers deploying the BotRoyale React frontend to Vercel (free tier), with production environment configuration and integration with your Oracle Cloud backend.

---

## Pre-Deployment Checklist

- [ ] Backend is deployed and accessible at your domain (e.g., `https://api.yourdomain.com`)
- [ ] `VITE_API_URL` is confirmed and tested locally
- [ ] (Optional) Sentry DSN is available for error tracking
- [ ] GitHub repository is public or you have a GitHub account with write access
- [ ] Vercel account is created (vercel.com)

---

## Step 1: Prepare Environment Variables

### Required Variables

| Variable | Example | Notes |
|---|---|---|
| `VITE_API_URL` | `https://api.yourdomain.com` | Backend origin. No trailing slash, no `/api/v1` suffix. |

### Optional Variables

| Variable | Example | Notes |
|---|---|---|
| `VITE_SENTRY_DSN` | `https://xxxxx@oyyy.ingest.sentry.io/zzz` | Error tracking (optional). |

### Variable Rules

- **`VITE_` prefix is mandatory** — only env vars prefixed with `VITE_` are exposed to the browser during the build. Without the prefix, Vercel will not embed the value into the bundle, and `import.meta.env.VITE_API_URL` will be undefined.
- **Build-time injection** — these vars are hardcoded into the JavaScript bundle at build time. They cannot be changed without rebuilding.
- **No secrets in frontend** — never put API keys, database passwords, or JWT secrets in frontend env vars. They are visible to anyone who opens the browser console (`console.log(import.meta.env)`).

---

## Step 2: Connect Repository to Vercel

### Option A: Via Vercel Dashboard (Recommended)

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click **"Add New..."** → **"Project"**
3. Click **"Import Git Repository"**
4. Search for your GitHub repo (`servers_poker` or `servers-poker`, depending on your naming)
5. Click **"Import"**

### Option B: Via Vercel CLI

```bash
# Install Vercel CLI (if not already installed)
npm i -g vercel

# In the root of your repo
vercel link

# You will be prompted to:
# 1. Confirm the project name
# 2. Select or create a Vercel project
# 3. Confirm the project root (or point to frontend/)
```

---

## Step 3: Configure Project Settings in Vercel Dashboard

After importing, Vercel auto-detects the build settings. **Verify and adjust these:**

### Project Settings

**Settings** → **General**

| Field | Value |
|---|---|
| **Framework Preset** | Vite |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm ci` |
| **Root Directory** | `frontend` (if monorepo; leave blank if root is frontend/) |
| **Node.js Version** | 22 (or latest) |

### Deployment Branch

**Settings** → **Git**

| Field | Value |
|---|---|
| **Production Branch** | `main` |

**Preview deployments** can be enabled for PRs to test before merging.

---

## Step 4: Add Environment Variables

**Settings** → **Environment Variables**

Add the required variables. **Important:** Set the scope to **Production** only (unless you also want them in Preview/Development).

### For Production Only

Click **"Add"** for each variable:

**Variable 1:**
- **Name:** `VITE_API_URL`
- **Value:** `https://api.yourdomain.com` (replace with your actual backend domain)
- **Scopes:** Production only (toggle the three dots)

**Variable 2 (Optional):**
- **Name:** `VITE_SENTRY_DSN`
- **Value:** Your Sentry DSN (or leave blank to disable error tracking)
- **Scopes:** Production only

After adding, verify the list shows your variables and their scopes.

---

## Step 5: Deploy

### Option A: Automatic Deploy (Recommended)

Once connected, Vercel automatically deploys:
- On every push to the **Production Branch** (main)
- On every commit to feature branches (Preview deploy — optional, configurable)

**To trigger a deploy:** Simply push to `main`:

```bash
git add .
git commit -m "Deploy frontend to Vercel"
git push origin main
```

Vercel detects the push and starts building. You can watch the build progress in the Vercel dashboard.

### Option B: Manual Deploy

In the Vercel dashboard, go to **Deployments** → **redeploy** a specific previous deployment or commit.

---

## Step 6: Verify Deployment

### Check Build Logs

1. Go to Vercel Dashboard → **Deployments**
2. Click the latest deployment
3. View **Build** logs to ensure no errors
4. Verify the build command ran: `npm run build`
5. Check that the Output Directory shows `dist` with a file listing

### Test the Live Site

1. Vercel assigns a URL like `https://your-app.vercel.app`
2. Open the URL in a browser
3. **Try these checks:**
   - Page loads and renders (no JS errors)
   - Open DevTools Console → no "Cannot connect to API" errors
   - Register a new account (if available) → API call should succeed
   - Check the Network tab → API requests go to `https://api.yourdomain.com` (not localhost)
   - WebSocket connections → look for `socket.io` requests upgrading to WebSocket (101 Switching Protocols)

### Check Environment Variables in Build

Vercel shows which env vars were injected during the build. Go to the build logs and look for:

```
Injecting environment variables:
- VITE_API_URL
- VITE_SENTRY_DSN (if set)
```

If variables are missing, they weren't added correctly in Step 4.

---

## Step 7: Configure Custom Domain (Optional)

If you want to use your own domain instead of `your-app.vercel.app`:

1. Go to **Project Settings** → **Domains**
2. Click **"Add"** → enter your domain (e.g., `app.yourdomain.com`)
3. Follow Vercel's DNS instructions:
   - **Option A:** Vercel Nameservers (change your registrar's nameservers)
   - **Option B:** CNAME record (add a CNAME pointing to `cname.vercel.com`)
4. Vercel auto-provisions a free SSL certificate

**After adding:**
- Update `CORS_ORIGINS` on your Oracle backend to include the custom domain
- Vercel redirects `http://` to `https://` automatically

---

## Step 8: Update Backend CORS (Critical)

The backend must allow requests from your Vercel domain. Update `/opt/botroyale/.env.production`:

```bash
CORS_ORIGINS=https://your-app.vercel.app,https://yourdomain.com,https://app.yourdomain.com
```

Then restart the backend:

```bash
docker compose -f docker-compose.prod.yml up -d --no-deps backend
```

**Without this:** The browser will block API requests with a CORS error: `Access to XMLHttpRequest blocked by CORS policy`.

---

## Architecture: Frontend → Backend Communication

```
User's Browser (Vercel Domain)
    │
    ├─→ Static assets (JS, CSS, images)  from Vercel CDN
    │
    ├─→ API requests (REST)               to https://api.yourdomain.com (your backend)
    │
    └─→ WebSocket connections (Socket.IO) to https://api.yourdomain.com/socket.io/ (your backend)
```

**Key points:**
- Frontend assets are served by Vercel's CDN (fast, worldwide)
- API calls bypass Vercel and go directly to your backend (Oracle)
- WebSocket connections also go directly to your backend (Vercel cannot proxy WebSockets)
- All cross-origin requests are handled by your backend's CORS config

---

## Troubleshooting

### "Cannot GET /tournaments" (404)

**Cause:** Direct navigation to a route (e.g., typing `/tournaments` in the address bar) returns 404.

**Solution:** The `vercel.json` file in the frontend root includes a rewrite rule that sends all unmatched paths to `index.html`, allowing React Router to handle them. This is already configured.

**Verify:** Check that `frontend/vercel.json` exists and contains the rewrite rule (see `vercel.json` in the repo root).

### "Failed to connect to API"

**Cause:** `VITE_API_URL` is incorrect or the backend is unreachable.

**Check:**
1. Verify the backend is running: `curl https://api.yourdomain.com/api/v1/health`
2. Verify `VITE_API_URL` in Vercel env vars matches the backend domain exactly
3. Verify backend `CORS_ORIGINS` includes the Vercel domain
4. Check browser console for the actual error message (may be a 502, timeout, or CORS)

### "Socket.IO polling timeout / WebSocket failed to connect"

**Cause:** WebSocket upgrade failed (Cloudflare or reverse proxy doesn't support it) or polling fallback is timing out.

**Check:**
1. Verify Cloudflare SSL/TLS mode is set to **Full** (not Flexible)
2. Verify nginx config includes the `/socket.io/` location with WebSocket upgrade headers
3. Check browser Network tab → filter by "socket.io" → look for 101 Switching Protocols response (successful) or 403/502 (failure)

### Build fails with "VITE_* is not defined"

**Cause:** The env var is missing or wasn't set in Vercel Settings during the build.

**Check:**
1. Go to Vercel Dashboard → **Settings** → **Environment Variables**
2. Verify the variable is listed and scoped to **Production**
3. Redeploy: Go to **Deployments** → click the three-dot menu → **Redeploy**

### "Sentry is not reporting errors"

**Cause:** `VITE_SENTRY_DSN` is missing or Sentry is disabled because `import.meta.env.PROD` is false.

**Check:**
1. Verify the build was from `vite build` (not `vite dev`)
2. Verify `VITE_SENTRY_DSN` is set in Vercel env vars
3. Check `src/sentry.ts` — the `enabled` flag requires `import.meta.env.PROD === true` (only true in production builds)

---

## Performance Optimization Tips

### 1. Enable Image Optimization

Vercel auto-optimizes images via `next/image` (Next.js only). Since you're using Vite + React, images are served as-is from the CDN. To optimize:

- Use modern formats (WebP, AVIF) for image assets
- Compress PNGs and JPGs before committing
- Consider using a CDN transform service (Cloudflare Polish, Imgix, etc.)

### 2. Enable Edge Caching

The `vercel.json` file includes cache headers for `/assets/*`:

```json
{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
```

This caches hashed asset files (JS, CSS) for 1 year. Non-hashed files (index.html) are not cached, so updates are immediate.

### 3. Monitor Build Time

Each deploy rebuilds the entire frontend. Build time is shown in Vercel logs. If it exceeds 2–3 minutes:

- Check if dependencies are bloated (`npm ls`)
- Consider code splitting or lazy loading
- Check for large assets being bundled (use `vite-plugin-visualizer`)

### 4. Enable Analytics

Vercel provides free analytics. Go to **Project Settings** → **Analytics** to view:
- Page load times
- Core Web Vitals
- Traffic by region

---

## Local Development with Backend

When developing locally, the `vite.config.ts` proxy redirects `/api` to `http://localhost:3000`:

```typescript
server: {
  proxy: {
    '/api': 'http://localhost:3000',
  },
},
```

So during `npm run dev` (Vite dev server), you can use `VITE_API_URL=http://localhost:5173` (the dev server URL) or just rely on the proxy.

**For production-like testing locally:**
- Set `VITE_API_URL=http://localhost:3000` in `.env.local`
- Run `npm run build` and `npm run preview`
- Open `http://localhost:4173` (preview server)
- All requests go directly to `http://localhost:3000` (like production)

---

## Environment Variable Priority

Vite resolves env vars in this order (first found wins):

1. `.env.production` (committed, production defaults)
2. `.env.production.local` (gitignored, production overrides)
3. `.env` (committed, development defaults)
4. `.env.local` (gitignored, development overrides)

**Vercel overwrites all of these** with variables set in the dashboard during the build.

---

## Monitoring and Alerts

### Error Tracking (Sentry)

If `VITE_SENTRY_DSN` is set, all JavaScript errors are reported to Sentry.

1. Go to [sentry.io](https://sentry.io)
2. Create a project for your frontend
3. Copy the DSN
4. Add `VITE_SENTRY_DSN` to Vercel env vars
5. Redeploy

Sentry captures:
- Uncaught exceptions
- Promise rejections
- 4xx/5xx HTTP errors (via axios interceptors)
- Performance traces (sample rate is 10% in production to avoid noise)

### Vercel Deployment Alerts

Set up notifications for failed deployments:

1. Go to **Project Settings** → **Notifications**
2. Add your email or Slack channel
3. Enable alerts for: Failed deployments, Ready deployments

---

## Rollback Procedure

If a deployment breaks:

1. Go to Vercel Dashboard → **Deployments**
2. Find a previous working deployment
3. Click the three-dot menu → **Promote to Production**
4. Vercel re-deploys the previous version without rebuilding

This is faster than reverting in git and waiting for a rebuild.

---

## Summary

| Step | Action | Time |
|---|---|---|
| 1 | Prepare env vars | 1 min |
| 2 | Import GitHub repo to Vercel | 2 min |
| 3 | Configure build settings (auto-detected, verify) | 1 min |
| 4 | Add env variables in Vercel dashboard | 2 min |
| 5 | Push to main or click deploy | 3–5 min build time |
| 6 | Verify site loads and API works | 2 min |
| 7 (Optional) | Add custom domain | 5 min + DNS propagation |

**Total time:** ~15–20 minutes (first time), then automatic on every push.

Once deployed, the Vercel frontend is live at `https://your-app.vercel.app` and connected to your Oracle backend at `https://api.yourdomain.com`. Every push to `main` triggers a new production deploy.
