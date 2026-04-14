# Frontend Environment Variables Reference

## Overview

BotRoyale frontend uses **Vite** for build tooling. Environment variables are injected at **build time** (not runtime) and must be prefixed with `VITE_` to be exposed to the browser.

---

## Variables

### Required

#### `VITE_API_URL`

**Type:** String (URL origin)  
**Default:** `http://localhost:3000` (fallback in `src/lib/axios.ts`)  
**Example:** `https://api.yourdomain.com`  
**Usage:** Base URL for all REST API calls and WebSocket connections

**Rules:**
- No trailing slash
- No `/api/v1` suffix (the client appends this)
- Must be an absolute HTTPS URL in production
- Can be HTTP for localhost development

**Where it's used:**
- `src/lib/axios.ts` — REST API base: `${VITE_API_URL}/api/v1`
- `src/hooks/useTournamentSocket.ts` — WebSocket namespace: `${VITE_API_URL}/tournament`
- `src/hooks/useTournamentLobby.ts` — WebSocket namespace: `${VITE_API_URL}/tournament`

**Backend dependency:**
- Backend's `CORS_ORIGINS` must include the frontend origin (e.g., `https://your-app.vercel.app`)
- Backend's nginx config must proxy `/api/` and `/socket.io/` from this origin

---

### Optional

#### `VITE_SENTRY_DSN`

**Type:** String (Sentry DSN)  
**Default:** None (error tracking disabled)  
**Example:** `https://xxxxx@oyyy.ingest.sentry.io/zzz`  
**Usage:** Sentry error tracking and performance monitoring

**Rules:**
- If not set, error tracking is disabled (errors are only logged to console)
- `src/sentry.ts` checks `import.meta.env.PROD` — only active in production builds
- Sample rate is 10% in production (`tracesSampleRate: 0.1`), 100% in dev

**Where it's used:**
- `src/main.tsx` — Sentry initialization
- `src/lib/axios.ts` — HTTP error capture
- `src/sentry.ts` — Exception and performance integration

**Setup:**
1. Create a Sentry project at [sentry.io](https://sentry.io)
2. Copy the DSN
3. In Vercel Settings → Environment Variables, add `VITE_SENTRY_DSN`
4. Redeploy

---

## Scopes

| Scope | When Applied | Recommended Use |
|---|---|---|
| **Production** | `vite build` (main branch) | Prod API URL, Sentry DSN |
| **Preview** | `vite build` (PRs, branches) | Staging API URL (if available) |
| **Development** | `vite dev` (local) | localhost URLs |

---

## Local Development

### `.env.local` (gitignored)

Override dev defaults:

```bash
VITE_API_URL=http://localhost:3000
VITE_SENTRY_DSN=
```

### Using Vite Proxy

Instead of setting `VITE_API_URL` explicitly, you can rely on Vite's dev proxy:

```bash
# vite.config.ts has:
server: {
  proxy: {
    '/api': 'http://localhost:3000',
  },
}

# So calls to http://localhost:5173/api/v1/* are proxied to localhost:3000
```

In this case, leave `VITE_API_URL` unset, and the fallback is used.

---

## Production (Vercel)

### Setup Steps

1. **Dashboard:** Vercel → Project Settings → Environment Variables
2. **Add variables:**
   - Name: `VITE_API_URL`, Value: `https://api.yourdomain.com`, Scope: Production
   - Name: `VITE_SENTRY_DSN` (optional), Value: your DSN, Scope: Production
3. **Redeploy:** Deployments → Redeploy (or push to main)

### Verification

After deployment:
1. Open DevTools Console
2. Check: `console.log(import.meta.env.VITE_API_URL)` → should show your domain
3. Make an API call and verify the request goes to the correct origin

---

## CI/CD Pipeline

### GitHub Actions

The CI workflow (`ci.yml` in root) does NOT use `VITE_` env vars for testing. Tests run with:

```bash
NODE_ENV=test
VITE_API_URL=http://localhost:3000  # (not required for unit tests)
```

### Frontend Build in CI

When Vercel receives a push to `main`:

1. Vercel checks out the repo
2. Runs `npm ci` (in `frontend/`)
3. Runs `npm run build` → `tsc -b && vite build`
4. During the build, Vercel injects env vars from Settings
5. The built `dist/` is deployed to the Vercel CDN

**No build artifact is ever committed to git.** Build happens on Vercel's infra.

---

## Common Issues

### "Cannot GET /api/v1/..."

**Cause:** `VITE_API_URL` is undefined or points to the wrong domain.

**Debug:**
```bash
# In browser console:
console.log(import.meta.env.VITE_API_URL)  # Should show your backend domain
```

**Fix:** Verify the variable is set in Vercel Settings and redeploy.

### "CORS error: Access to XMLHttpRequest blocked"

**Cause:** Backend's `CORS_ORIGINS` doesn't include the frontend domain.

**Fix:** Update backend `.env.production`:
```bash
CORS_ORIGINS=https://your-app.vercel.app,https://yourdomain.com
```

Then restart the backend:
```bash
docker compose -f docker-compose.prod.yml up -d --no-deps backend
```

### "Sentry is not reporting errors"

**Cause:** `VITE_SENTRY_DSN` is missing, or build was not a production build.

**Debug:**
1. Check `import.meta.env.VITE_SENTRY_DSN` in console
2. Check that the build was from `vite build` (not `vite dev`)
3. Verify Sentry DSN is valid (test in browser console)

---

## Build-Time Injection

Vite injects env vars **into the JavaScript bundle** at build time. This means:

✅ **Secure (safe to expose):**
- Public API URLs
- Analytics tracking IDs
- Environment labels (prod/staging/dev)

❌ **Never expose:**
- API keys or secrets
- Database credentials
- Signing keys
- Private user data

The `VITE_` prefix is a convention that makes this explicit: "This will be in the browser, keep it public."

---

## References

- **Vite Env Docs:** https://vitejs.dev/guide/env-and-modes.html
- **Vercel Env Docs:** https://vercel.com/docs/projects/environment-variables
- **Sentry React Docs:** https://docs.sentry.io/platforms/javascript/guides/react/
