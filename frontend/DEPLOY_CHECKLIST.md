# Vercel Frontend Deployment Checklist

## Pre-Flight (Before You Start)

- [ ] Backend is deployed and accessible: `curl https://api.yourdomain.com/api/v1/health`
- [ ] Backend `CORS_ORIGINS` is updated to include planned frontend URL
- [ ] GitHub account is created and authenticated
- [ ] Vercel account is created (vercel.com)
- [ ] (Optional) Sentry project is created and DSN copied

---

## Step 1: Frontend Configuration (5 min)

- [ ] `frontend/vercel.json` exists (SPA rewrite rule for client-side routing)
- [ ] `frontend/.gitignore` includes `.env` and `.env.production` (no secrets in git)
- [ ] `src/sentry.ts` has correct sample rate (`tracesSampleRate: 0.1` for prod)
- [ ] Verify build passes locally: `cd frontend && npm run build`
- [ ] No build warnings about undefined env vars

**Verify:**
```bash
cd frontend
npm run build 2>&1 | grep -i "error\|undefined\|warning" | head -5
```

---

## Step 2: GitHub Repository (2 min)

- [ ] Repository is on GitHub (public or you have write access)
- [ ] All changes are committed: `git status` is clean
- [ ] Latest commit is on `main` branch: `git branch --show-current`

**Push if needed:**
```bash
git add -A
git commit -m "Frontend: add Vercel config and env vars docs"
git push origin main
```

---

## Step 3: Vercel Project (10 min)

### 3a: Connect Repository

- [ ] Go to [vercel.com/dashboard](https://vercel.com/dashboard)
- [ ] Click **"Add New"** → **"Project"**
- [ ] Click **"Import Git Repository"**
- [ ] Find and import `servers_poker` repo
- [ ] Vercel prompts for project settings:
  - [ ] **Framework Preset:** Vite
  - [ ] **Root Directory:** `frontend` (if monorepo) — or blank if root is frontend/
  - [ ] **Build Command:** `npm run build` (should auto-detect)
  - [ ] **Output Directory:** `dist` (should auto-detect)
  - [ ] **Install Command:** `npm ci` (should auto-detect)
  - [ ] **Node.js Version:** 22 or latest

- [ ] Click **"Deploy"** and wait for initial build (may succeed or fail if env vars missing)

### 3b: Add Environment Variables

- [ ] Go to **Project Settings** → **Environment Variables**
- [ ] Click **"Add"** for `VITE_API_URL`:
  - **Name:** `VITE_API_URL`
  - **Value:** `https://api.yourdomain.com` (your actual backend domain)
  - **Scopes:** Production (uncheck Development/Preview)
  - Click **"Save"**

- [ ] (Optional) Click **"Add"** for `VITE_SENTRY_DSN`:
  - **Name:** `VITE_SENTRY_DSN`
  - **Value:** Your Sentry DSN (or leave blank to skip)
  - **Scopes:** Production
  - Click **"Save"**

- [ ] Verify both variables appear in the list with correct scopes

### 3c: Redeploy with Environment Variables

- [ ] Go to **Deployments**
- [ ] Click the three-dot menu on the latest deployment
- [ ] Click **"Redeploy"**
- [ ] Vercel rebuilds with env vars now injected

---

## Step 4: Verify Deployment (5 min)

### 4a: Build Succeeded

- [ ] Go to **Deployments** → latest deployment
- [ ] Click **"Build"** tab
- [ ] Scroll through logs, verify:
  - [ ] `npm ci` completed
  - [ ] `npm run build` ran (tsc and vite build both succeeded)
  - [ ] Env vars were injected (look for log lines mentioning `VITE_API_URL`)
  - [ ] No errors in the build logs

### 4b: Visit the Deployed Site

- [ ] Vercel assigned a URL (e.g., `https://your-app.vercel.app`)
- [ ] Open it in a browser
- [ ] Verify:
  - [ ] Page loads (no blank page)
  - [ ] No red error toasts or console errors
  - [ ] Logo and layout visible

### 4c: Test API Connectivity

- [ ] Open DevTools → Console
- [ ] Type: `console.log(import.meta.env.VITE_API_URL)` → should show your backend domain
- [ ] Navigate to a page that makes an API call (e.g., register, login, tournaments list)
- [ ] Check the Network tab:
  - [ ] Requests go to your backend domain (not localhost, not vercel.app)
  - [ ] No CORS errors (403, blocked by CORS policy)
  - [ ] API responses are successful (200, 201, etc.)

### 4d: Test WebSocket (Socket.IO)

- [ ] Open DevTools → Network tab
- [ ] Filter for `socket.io`
- [ ] Perform an action that requires WebSocket (e.g., view live game, join tournament lobby)
- [ ] Verify:
  - [ ] Socket.io HTTP upgrade request appears (status 101 Switching Protocols = success)
  - [ ] No connection errors or timeouts

### 4e: (Optional) Test Sentry Error Tracking

If `VITE_SENTRY_DSN` is set:

- [ ] Open DevTools → Console
- [ ] Trigger an error: `throw new Error('Test error')`
- [ ] Go to [sentry.io](https://sentry.io) and check if the error was captured

---

## Step 5: Update Backend CORS (Critical!)

The backend must allow requests from the Vercel domain:

- [ ] SSH into Oracle: `ssh ubuntu@YOUR_ORACLE_IP`
- [ ] Edit `.env.production`:
  ```bash
  nano /opt/botroyale/.env.production
  ```
- [ ] Find the line `CORS_ORIGINS=...` and add your Vercel domain:
  ```
  CORS_ORIGINS=https://your-app.vercel.app,https://yourdomain.com
  ```
- [ ] Save (Ctrl+O, Enter, Ctrl+X)
- [ ] Restart the backend:
  ```bash
  docker compose -f docker-compose.prod.yml up -d --no-deps backend
  ```
- [ ] Verify:
  ```bash
  curl -H "Origin: https://your-app.vercel.app" \
       -H "Access-Control-Request-Method: POST" \
       https://api.yourdomain.com/api/v1/health
  # Should show Access-Control-Allow-Origin header in response
  ```

- [ ] Re-test the Vercel site (if CORS errors were occurring, they should now be fixed)

---

## Step 6: Configure Custom Domain (Optional)

If you want a custom domain instead of `your-app.vercel.app`:

- [ ] Go to Vercel → **Project Settings** → **Domains**
- [ ] Click **"Add"** → enter your domain (e.g., `app.yourdomain.com`)
- [ ] Vercel shows DNS instructions. Choose:
  - **Option A (Easier):** Vercel Nameservers (change your registrar's DNS)
  - **Option B:** CNAME record (add CNAME pointing to `cname.vercel.com`)
- [ ] Complete the DNS setup at your registrar
- [ ] Wait for DNS to propagate (~10 min to a few hours)
- [ ] Vercel auto-provisions an SSL certificate
- [ ] Test: open `https://your-custom-domain.com`

**After adding custom domain:**
- [ ] Update backend `CORS_ORIGINS` to include the custom domain:
  ```bash
  CORS_ORIGINS=https://your-app.vercel.app,https://yourdomain.com,https://app.yourdomain.com
  ```
- [ ] Restart backend

---

## Step 7: Set Up Automatic Deployments (Already Done!)

Once connected, Vercel automatically deploys:

- [ ] Every push to `main` → Production deploy
- [ ] Every commit to feature branches → Preview deploy (optional, configurable)

**To trigger a deploy:** Just push to main:
```bash
git add .
git commit -m "Update feature"
git push origin main
```

---

## Step 8: Monitoring & Alerts (Optional)

- [ ] Go to **Project Settings** → **Notifications**
- [ ] Add email for failed deployment alerts
- [ ] (Optional) Add Slack integration

---

## Rollback Procedure (If Needed)

If the latest deployment breaks:

- [ ] Go to **Deployments** in Vercel
- [ ] Find the last working deployment
- [ ] Click three-dot menu → **"Promote to Production"**
- [ ] Vercel re-deploys the previous version instantly (no rebuild needed)

---

## Troubleshooting Quick Links

| Issue | Docs |
|---|---|
| "Cannot GET /tournaments" (404 on direct navigation) | See VERCEL_DEPLOYMENT.md → Troubleshooting |
| "Failed to connect to API" | See VERCEL_DEPLOYMENT.md → Troubleshooting |
| "Socket.IO not connecting" | See VERCEL_DEPLOYMENT.md → Troubleshooting |
| "Env vars not defined" | See ENV_VARS.md |

---

## Summary

| Checklist Item | Est. Time |
|---|---|
| Frontend config (verify build passes) | 5 min |
| GitHub (ensure main is clean) | 2 min |
| Vercel setup (connect repo, add env vars, redeploy) | 10 min |
| Verify deployment (build logs, site loads, API works) | 5 min |
| Update backend CORS | 3 min |
| (Optional) Custom domain | 5 min + DNS |
| **Total** | **~25 min** |

Once complete, the frontend is live and automatically deploys on every push to `main`.
