# BotRoyale Frontend — Vercel Deployment Quick Start

## TL;DR (5 Minutes)

1. **Vercel Dashboard:** [vercel.com/dashboard](https://vercel.com/dashboard) → Import GitHub repo → Choose `servers_poker`
2. **Build Settings** (auto-detected, verify):
   - Framework: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Root Directory: `frontend`
3. **Add Environment Variables:**
   - `VITE_API_URL` = `https://api.yourdomain.com` (Production scope)
   - `VITE_SENTRY_DSN` = `[optional]` (Production scope)
4. **Deploy** → Wait 3–5 min → Site is live
5. **Update Backend CORS:**
   ```bash
   ssh ubuntu@YOUR_ORACLE_IP
   nano /opt/botroyale/.env.production
   # Add: CORS_ORIGINS=https://your-app.vercel.app,...
   docker compose -f docker-compose.prod.yml up -d --no-deps backend
   ```

That's it! Automatic deploys on every push to `main` thereafter.

---

## Key Files

| File | Purpose |
|---|---|
| [`VERCEL_DEPLOYMENT.md`](./VERCEL_DEPLOYMENT.md) | 📖 Complete step-by-step guide (8 steps, 20 min) |
| [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) | ✅ Interactive checklist (25 min, copy-paste commands) |
| [`ENV_VARS.md`](./ENV_VARS.md) | 🔧 Environment variable reference |
| [`DEPLOYMENT_SUMMARY.md`](./DEPLOYMENT_SUMMARY.md) | 📊 Architecture, security, performance |
| [`vercel.json`](./vercel.json) | ⚙️ SPA routing + security headers (ready to go) |

---

## What's Configured

✅ **SPA Routing** — Direct navigation (e.g., `/tournaments/123`) now works  
✅ **Security Headers** — XSS, clickjacking, referrer, permissions policies  
✅ **Asset Caching** — 1-year immutable cache for bundled code  
✅ **Sentry Integration** — 10% sample rate in production (was 100%)  
✅ **Environment Variables** — `VITE_API_URL` injected at build time  
✅ **CORS Ready** — Backend config documented  
✅ **Tests** — All 29 tests passing  

---

## Architecture

```
Vercel CDN (Frontend)
    ↓
Backend at https://api.yourdomain.com
    ↓
Supabase/Neon PostgreSQL
```

**API calls bypass Vercel** — they go directly from the browser to your backend (no proxy layer).

---

## Environment Variables

### Required

```
VITE_API_URL=https://api.yourdomain.com
```

No trailing slash, no `/api/v1` suffix.

### Optional

```
VITE_SENTRY_DSN=https://xxxxx@oyyy.ingest.sentry.io/zzz
```

---

## Build & Deploy

### Local Testing

```bash
npm run build        # Verify build succeeds
npm run preview      # Test in production mode
```

### Automatic Deployment

```bash
git push origin main  # Vercel detects → builds → deploys
```

View deployment at: Vercel Dashboard → Deployments

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "Cannot GET /tournaments" | `vercel.json` rewrite rule is in place ✓ |
| "API calls fail (CORS)" | Update backend `CORS_ORIGINS` with Vercel domain |
| "WebSocket not connecting" | Check backend nginx config has `/socket.io/` location |
| "Env vars undefined" | Verify in Vercel Settings with Production scope |

See [`VERCEL_DEPLOYMENT.md`](./VERCEL_DEPLOYMENT.md#troubleshooting) for full troubleshooting.

---

## Status

| Check | Result |
|---|---|
| Production-ready | ✅ Yes |
| Tests passing | ✅ 29/29 |
| Configuration complete | ✅ Yes |
| Documentation | ✅ 4 files |
| Ready to deploy | ✅ Yes |

**Next:** Follow [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) (25 minutes, then done).

---

## Support

- Full guide: [`VERCEL_DEPLOYMENT.md`](./VERCEL_DEPLOYMENT.md)
- Env var reference: [`ENV_VARS.md`](./ENV_VARS.md)
- Vercel docs: https://vercel.com/docs
- Vite docs: https://vitejs.dev
