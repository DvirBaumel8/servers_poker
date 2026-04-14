# BotRoyale: Deployment Approaches & Architecture

A comprehensive guide to the production deployment strategy for BotRoyale, covering both backend and frontend, with decision rationale and architecture diagrams.

---

## Overview

BotRoyale uses a **distributed, zero-cost architecture**:

- **Frontend:** React SPA on Vercel (free tier, global CDN)
- **Backend:** NestJS on Oracle Cloud ARM instance (free tier, 4 OCPUs / 24GB RAM)
- **Database:** Managed PostgreSQL (Supabase or Neon, free tier)
- **TLS Termination:** Cloudflare (free tier, no origin cert needed)
- **CI/CD:** GitHub Actions (free for public repos)

**Total Monthly Cost: $0 (within free tier limits)**

---

## Part 1: Backend Deployment Architecture

### Why Oracle Cloud ARM?

| Consideration | Solution |
|---|---|
| Cost | Free tier: 4 OCPU / 24GB RAM (worth ~$600/month) |
| Performance | ARM64 architecture is efficient for Node.js workloads |
| Capacity | 24GB RAM comfortably handles NestJS + Redis + tournament engine |
| Scale | Can migrate to paid tier without architecture change |

### Deployment Stack

```
┌─────────────────────────────────────────────────────────────┐
│ GitHub Repository (source)                                  │
│ - Code pushed to main branch                                │
│ - Triggers GitHub Actions CI/CD pipeline                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ GitHub Actions CI/CD (.github/workflows/ci.yml)             │
│ 1. Lint & typecheck (backend + frontend)                   │
│ 2. Run tests (backend: vitest, frontend: vitest)           │
│ 3. Build backend (nest build → dist/)                      │
│ 4. Build frontend (vite build → dist/)                     │
│ 5. Build Docker image (multi-arch: amd64 + arm64)          │
│ 6. Push to GHCR (GitHub Container Registry)                │
│ 7. Trigger deploy.yml workflow                             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ GitHub Actions Deploy (.github/workflows/deploy.yml)        │
│ 1. SSH into Oracle instance                                │
│ 2. Pull latest image from GHCR                             │
│ 3. Run database migrations                                 │
│ 4. Restart backend container (zero downtime)               │
│ 5. Verify health check passes                              │
│ 6. Clean up old images                                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ Oracle Cloud ARM Instance (Ubuntu 22.04)                    │
│ Port 22: SSH (restricted to known IPs)                     │
│ Port 80: HTTP (Cloudflare proxies, nginx listens)          │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ Docker Compose (docker-compose.prod.yml)             │  │
│ │ ├─ nginx:1.27-alpine (port 80, reverse proxy)       │  │
│ │ ├─ backend:latest (GHCR image, port 3000 internal)  │  │
│ │ └─ redis:7-alpine (internal, AOF persistence)       │  │
│ └───────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┴──────────────┬───────────────┐
         ▼                              ▼               ▼
┌──────────────────┐        ┌──────────────────┐  ┌──────────┐
│ Cloudflare       │        │ Supabase/Neon    │  │ Redis    │
│ (TLS, DNS)       │        │ (PostgreSQL)     │  │ (cache)  │
│ api.yourdomain   │        │ Managed DB       │  │ Persist  │
└──────────────────┘        └──────────────────┘  └──────────┘
         ▲
         │ (HTTPS reverse proxy)
         │
    User Browser
```

### Backend Services (Docker Compose)

#### 1. **nginx** (Reverse Proxy & TLS Termination)
- **Image:** `nginx:1.27-alpine`
- **Port:** 80 (HTTP only, Cloudflare handles TLS at edge)
- **Config:** `nginx/nginx.conf` (in repo)
- **Role:** 
  - Proxies `/api/` requests to backend:3000
  - Handles WebSocket upgrades for `/socket.io/`
  - Trusts X-Forwarded-For from Cloudflare
  - Sets security headers
- **Restart:** `unless-stopped` (auto-restarts if crashed)
- **Health Check:** nginx -t (config validation)

#### 2. **backend** (NestJS Application)
- **Image:** `ghcr.io/<repo>:latest` (GHCR — GitHub Container Registry)
- **Port:** 3000 (internal only, exposed via nginx)
- **Environment:** `.env.production` (database creds, JWT secret, etc.)
- **Role:**
  - REST API: `/api/v1/*`
  - WebSocket: `/socket.io/` (Socket.IO namespaces: `/game`, `/tournament`)
  - Real-time game logic
  - Database operations
- **Restart:** `unless-stopped`
- **Health Check:** HTTP GET `/api/v1/health` → expects 200 OK
- **User:** `poker:nodejs` (uid 1001, non-root for security)

#### 3. **redis** (In-Process Caching)
- **Image:** `redis:7-alpine`
- **Port:** 6379 (internal only)
- **Config:** AOF persistence enabled (`--appendonly yes`)
- **Role:**
  - Game state caching (hot path)
  - Pub/Sub for distributed Socket.IO events
  - Session storage
  - Leaderboard cache
- **Restart:** `unless-stopped`
- **Health Check:** redis-cli ping → expects PONG
- **Volume:** `redis-data` (persistent across restarts)
- **User:** redis (uid 999, built-in user in image)

#### 4. **migrate** (Database Migrations)
- **Image:** Same as backend (`ghcr.io/<repo>:latest`)
- **Profile:** `migrate` (run on-demand, not by default)
- **Command:** `node dist/src/migrations/run.js`
- **Role:** One-shot TypeORM migration runner
- **Restart:** `no` (runs once, exits)
- **Usage:**
  ```bash
  docker compose -f docker-compose.prod.yml --profile migrate run --rm migrate
  ```

### Database Layer (External, Managed)

**Why External?** 
- Prevents database from running inside Docker container
- Managed backups, point-in-time recovery, high availability
- Simpler scaling (separate from compute)
- Free tier capacity (60–100 connections)

#### Supabase
- **Postgres Version:** 16
- **Free Tier:** 500 MB storage, 60 connections, daily backups
- **Backup:** Automatic (7-day retention)
- **Connection:** `postgres://user:pass@db.supabase.co:5432/postgres` (SSL required)

#### Neon
- **Postgres Version:** 16
- **Free Tier:** 3 GB storage, 100 pooled connections, daily backups
- **Backup:** Automatic (7-day retention)
- **Connection:** Similar to Supabase, pooler included

**Backend Config:**
```bash
DB_HOST=db.xxx.supabase.co
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=<strong-password>
DB_NAME=postgres
DB_SSL=true              # Required for managed services
DB_POOL_SIZE=10          # Conservative for free tier limits
```

### Network Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Docker Compose Network: poker-prod-network (bridge)         │
│                                                             │
│  nginx              backend            redis               │
│  (port 80)          (port 3000)        (port 6379)         │
│    │                  │                  │                 │
│    └──────────────────┼──────────────────┘                 │
│                       │                                    │
│         (internal docker DNS resolution)                  │
│         - nginx → backend:3000 (upstream)                │
│         - backend → redis:6379 (REDIS_HOST=redis)       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         │
         │ (port 80 exposed to host)
         │
    Oracle Security List (VCN firewall)
         │
         │ (iptables inside instance)
         │
    Internet (Cloudflare proxy)
```

**Key:** Services communicate by hostname (docker DNS), not IP addresses.

### Deployment Flow

```
Developer pushes code to main
         │
         ▼
GitHub Actions CI Pipeline
  ├─ Lint
  ├─ Type-check
  ├─ Unit tests
  ├─ Build backend (tsc)
  ├─ Build frontend (vite)
  └─ Build Docker image (multi-platform: amd64, arm64)
         │
         ▼
Push to GHCR (image:latest, image:sha, image:main)
         │
         ▼
Trigger deploy.yml workflow
         │
         ▼
SSH into Oracle
  1. docker login ghcr.io (with GHCR_TOKEN)
  2. docker compose pull backend migrate
  3. docker compose --profile migrate run --rm migrate
  4. docker compose up -d --no-deps backend
  5. Health check polling (60s timeout)
  6. docker image prune (cleanup)
         │
         ▼
Backend live, nginx passes traffic, frontend can connect
```

### Secrets Management

| Secret | Storage | Usage | Rotation |
|---|---|---|---|
| `JWT_SECRET` | `.env.production` on Oracle | Signing auth tokens | Manual (would need re-auth) |
| `DB_PASSWORD` | `.env.production` on Oracle | PostgreSQL connection | Manual (would need migration) |
| `CORS_ORIGINS` | `.env.production` on Oracle | Express CORS middleware | Manual (redeploy) |
| `GHCR_TOKEN` | GitHub Secrets | Docker login (deploy step) | Auto-rotate recommended (90 days) |
| `ORACLE_SSH_KEY` | GitHub Secrets | SSH into Oracle (deploy) | Auto-rotate recommended (90 days) |

**Best Practice:** 
- Secrets in `.env.production` are never committed (in `.gitignore`)
- GitHub Secrets are encrypted and only visible to Actions
- Rotate PAT tokens every 90 days

### Monitoring & Troubleshooting

#### Health Checks
- **nginx:** `nginx -t` (syntax validation)
- **backend:** `curl http://localhost:3000/api/v1/health`
- **redis:** `redis-cli ping`

#### Logs
```bash
docker compose -f docker-compose.prod.yml logs -f           # All services
docker logs poker-backend -f --tail 100                     # Backend only
docker logs poker-nginx -f                                  # nginx only
```

#### Rollback
```bash
# Roll back to previous image (if new deploy breaks)
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
# (will pull previous cached image, or specify SHA explicitly)
```

---

## Part 2: Frontend Deployment Architecture

### Why Vercel?

| Consideration | Solution |
|---|---|
| Cost | Free tier: unlimited bandwidth, 100GB storage, auto-scaling |
| Speed | Global CDN (Vercel edge network) |
| Simplicity | Auto-detects Vite, zero-config deployment |
| Integration | Built-in GitHub integration (auto-deploy on push) |
| Scale | Serverless functions (not used, but available) |

### Deployment Stack

```
┌─────────────────────────────────────────────────────────────┐
│ GitHub Repository (source)                                  │
│ - Code pushed to main branch                                │
│ - Frontend and Backend both in same repo                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ Vercel Platform (automatic on push to main)                 │
│ 1. Checkout code                                           │
│ 2. Install dependencies (npm ci in frontend/)              │
│ 3. Type-check (tsc -b)                                     │
│ 4. Build (vite build → dist/)                              │
│ 5. Inject environment variables (VITE_*)                   │
│ 6. Deploy to edge network (200+ regions)                   │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┴──────────────┬────────────────────┐
         ▼                              ▼                    ▼
┌──────────────────┐        ┌──────────────────┐  ┌──────────────┐
│ Vercel CDN       │        │ Your Backend     │  │ Vercel       │
│ (static assets)  │        │ (API calls)      │  │ Analytics    │
│ JS, CSS, images  │        │ api.yourdomain   │  │ (optional)   │
│ your-app.vercel  │        │ Direct from      │  │              │
│ .app             │        │ browser, no      │  │              │
│ (worldwide fast) │        │ proxy layer      │  │              │
└──────────────────┘        └──────────────────┘  └──────────────┘
         ▲                              │
         │ (only static assets)         │ (REST + WebSocket)
         │                              │
         └──────────────┬───────────────┘
                        │
                   User Browser
```

### Frontend Build Process

```
Vercel receives push to main
         │
         ▼
Check build settings (auto-detected or configured)
  • Framework: Vite
  • Build Command: npm run build
  • Output Directory: dist
  • Root Directory: frontend (or .)
         │
         ▼
Install dependencies
  npm ci (in frontend/)
  └─ Installs from package-lock.json (reproducible)
         │
         ▼
Type-check
  tsc -b
  └─ Ensures no TypeScript errors
         │
         ▼
Build
  vite build
  ├─ Bundles React + dependencies
  ├─ Splits code into chunks
  ├─ Minifies and optimizes
  ├─ Hashes filenames (cache busting)
  └─ Outputs to dist/
         │
         ▼
Inject environment variables (from Vercel Settings)
  VITE_API_URL=https://api.yourdomain.com
  VITE_SENTRY_DSN=https://...@ingest.sentry.io/...
  └─ Hardcoded into JavaScript (build-time injection)
         │
         ▼
Deploy to edge
  ├─ Upload dist/ to 200+ regions (Vercel CDN)
  ├─ Create vercel.json rules (SPA routing, security headers)
  ├─ Set up TLS certificate (auto via Let's Encrypt)
  └─ Live at: https://your-app.vercel.app
         │
         ▼
Frontend accessible globally
  ├─ Static assets served from nearest edge (fast)
  ├─ HTML has SPA rewrite rule (all routes → index.html)
  ├─ React Router handles client-side routing
  └─ API calls go directly to backend (no proxy)
```

### Configuration Files

#### `frontend/vercel.json`
Controls how Vercel serves the application.

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ]
}
```

**Explanation:**
- **Rewrites:** All unmatched routes redirect to `/index.html` (React Router takes over)
- **Headers:** Security headers + cache control
  - `X-Content-Type-Options: nosniff` — prevents MIME-sniffing
  - `X-Frame-Options: DENY` — prevents clickjacking
  - `Referrer-Policy: strict-origin-when-cross-origin` — privacy-preserving
  - `Permissions-Policy` — restricts camera, microphone, geolocation
  - Cache-Control: 1-year immutable for hashed assets (`/assets/*`)

#### `frontend/vite.config.ts`
Vite build configuration.

```typescript
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',  // Dev-only proxy
    },
  },
  // No build overrides — uses Vite defaults
  // Output: dist/
  // No manual chunks, no custom base path
})
```

**Key Points:**
- Dev proxy (`/api` → `localhost:3000`) only active during `vite dev`
- Production build ignores proxy, uses `VITE_API_URL` from env
- No `base` option means assets served from `/` (correct for Vercel root domain)

### Environment Variables (Frontend)

#### Required
```
VITE_API_URL=https://api.yourdomain.com
```
- Set in Vercel Settings → Environment Variables → Production scope
- No trailing slash, no `/api/v1` suffix
- Used by:
  - `src/lib/axios.ts` — REST API: `${VITE_API_URL}/api/v1`
  - `src/hooks/useTournamentSocket.ts` — WebSocket: `${VITE_API_URL}/tournament`

#### Optional
```
VITE_SENTRY_DSN=https://xxxxx@oyyy.ingest.sentry.io/zzz
```
- Set in Vercel Settings → Environment Variables → Production scope
- Used by `src/sentry.ts` for error tracking
- Only active when `import.meta.env.PROD === true` (production builds only)

#### Build-Time Injection
- Env vars are **hardcoded into the JavaScript bundle at build time**
- Cannot be changed without rebuilding
- Safe to expose: no secrets, only public URLs
- Vercel injects them automatically during the build step

### Frontend Services (What Vercel Runs)

#### Static Asset Hosting
- **What:** `dist/` directory (built HTML, CSS, JS, images)
- **Where:** Vercel's CDN (200+ regions)
- **How:** Automatic with every deploy
- **Headers:** Set via `vercel.json`
- **Caching:** 1 year for hashed assets, no-cache for `index.html`

#### SPA Rewrite Rule
```json
"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
```
- Routes like `/tournaments/123` return `index.html`
- React Router parses the URL in JavaScript
- Enables full SPA routing without server-side configuration

#### Edge Functions (Optional, Not Used)
- Vercel supports serverless functions at `/api/*`
- Not needed here — backend handles all API logic
- Available if you want custom middleware (auth, logging, etc.)

### Deployment Flow

```
Developer commits & pushes to main
         │
         ▼
GitHub webhook triggers Vercel build
         │
         ▼
Vercel receives webhook
  ├─ Branch: main?
  ├─ Changed files: frontend/* or global?
  └─ Commit message: contains [skip vercel]?
         │
         ▼
Checkout code on Vercel build server
         │
         ▼
Read .vercelignore (if exists, filters what to deploy)
         │
         ▼
Install dependencies
  npm ci --no-audit
  └─ In frontend/ directory (respects root-dir setting)
         │
         ▼
Build
  npm run build
  └─ tsc -b && vite build
         │
         ▼
Inject environment variables from Vercel Settings
  ├─ VITE_API_URL
  ├─ VITE_SENTRY_DSN
  └─ Any others configured
         │
         ▼
Deploy
  ├─ Upload dist/ to edge servers
  ├─ Apply vercel.json rules
  ├─ Generate preview URL (for PRs)
  ├─ Promote to production (for main branch)
  └─ Create deployment record
         │
         ▼
Production live
  • https://your-app.vercel.app
  • Your custom domain (if configured)
         │
         ▼
Rollback (on-demand)
  • Click "Promote to Production" on any previous deployment
  • Instant rollback without rebuild
```

### Network & Communication

```
User's Browser
    │
    ├─ Request: GET https://your-app.vercel.app/tournaments
    │ (routed to nearest Vercel edge)
    │
    ▼
Vercel Edge Server (rewrite rule applies)
    │
    ├─ SPA rewrite: /(.*) → /index.html
    │
    ▼
Return index.html + bundled JS
    │ (React Router loaded)
    │
    ▼
React parses URL: /tournaments
    │
    ├─ Renders TournamentsPage component
    │
    ├─ Component mounts, calls useEffect
    │
    ▼
API Call via axios
    │
    ├─ Request: GET https://api.yourdomain.com/api/v1/tournaments
    │ (NOT through Vercel)
    │
    ▼
Browser makes CORS preflight (OPTIONS) to api.yourdomain.com
    │
    ├─ Backend returns CORS headers if origin is allowed
    │
    ▼
Request sent to backend (nginx → backend container)
    │
    ▼
Response with data
    │
    ▼
React renders tournaments list
```

**Key:** API calls bypass Vercel entirely. They go directly from the browser to your backend.

### WebSocket (Socket.IO) Flow

```
User connects to tournament
    │
    ▼
React component calls io() constructor
    │
    ├─ URL: https://api.yourdomain.com/tournament
    │ (same backend origin as REST API)
    │
    ▼
Browser attempts WebSocket handshake
    │
    ├─ GET /socket.io/?transport=websocket
    │ (sent to api.yourdomain.com)
    │
    ▼
nginx detects /socket.io/ location block
    │
    ├─ Proxy to backend:3000
    ├─ Add Upgrade headers
    ├─ Add Connection: upgrade header
    │
    ▼
Backend Socket.IO server receives handshake
    │
    ├─ Validates JWT (from socket.io auth)
    ├─ Subscribes client to /tournament namespace
    │
    ▼
101 Switching Protocols response
    │
    ├─ Browser upgrades connection to WebSocket
    │
    ▼
Real-time events flow (game updates, player actions, etc.)
```

**Key:** WebSocket connection is established directly to your backend, not through Vercel. Vercel cannot proxy WebSocket connections.

---

## Part 3: Integration Architecture

### Overall System Flow

```
                         Development Workflow
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
          Local Dev: npm run dev      Local Test: npm run build
          (Backend + Frontend)        (Production build)
                    │                           │
                    └─────────────┬─────────────┘
                                  │
                          Push to main branch
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
        ▼                         ▼                         ▼
  GitHub Actions CI        GitHub Actions CI      GitHub Actions
  (backend + frontend      (build Docker            Deploy
   tests, lint, build)     image, push to GHCR)    (SSH to Oracle)
        │                         │                         │
        ▼                         ▼                         ▼
  Tests pass?              Multi-arch image?        SSH Success?
  Types correct?           Pushed to GHCR?          Migrations ok?
        │                         │                         │
        └─────────────────────────┼─────────────┬───────────┘
                                  │             │
                    Deploy triggered to Oracle
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
            nginx reverse proxy          Backend container
            (handles CORS, TLS,          (NestJS + real-time logic)
             WebSocket upgrade,              │
             security headers)          ┌─────┴─────┐
                    │                   │           │
                    ├──────────┬────────┤           │
                    │          │        │           │
                    ▼          ▼        ▼           ▼
            Cloudflare      User API  WebSocket  PostgreSQL
            (TLS at edge,   calls     connections (Supabase)
             DDoS, DNS)                           │
                    │                             │
                    │                    Real-time game
                    │                    state, persistence,
                    ▼                    analytics
            User (browser)
                    │
        ┌───────────┼────────────┐
        │           │            │
        ▼           ▼            ▼
    Vercel CDN   Backend API   WebSocket
    (static)     (REST)        (Socket.IO)
```

### Communication Paths

#### Path 1: Static Assets (Frontend)
```
Browser → CDN (Vercel) → edge server → HTTP 200 + cached asset
```
- **Headers:** Cache-Control: max-age=31536000, immutable (for hashed files)
- **Latency:** ~10–50ms (served from nearest edge)
- **Cost:** Included in Vercel free tier

#### Path 2: REST API (Backend)
```
Browser → Backend (api.yourdomain.com) → nginx → backend:3000
           ↓
         PostgreSQL (Supabase)
```
- **Headers:** CORS validated, Authorization: Bearer token
- **Latency:** ~100–300ms (depends on geography + Oracle location)
- **Load:** REST calls, typically low volume (pagination, mutations)

#### Path 3: WebSocket (Real-Time)
```
Browser → Backend (api.yourdomain.com) → nginx → backend:3000
           ↓                              ↓
    Socket.IO upgrade request    Connection upgrade (101 Switching Protocols)
           ↓
    Persistent WebSocket connection
           ↓
    Real-time events (game state, player actions, etc.)
```
- **Latency:** ~50–100ms (persistent connection, lower overhead than REST)
- **Connection:** Stays open for the session (or until 5 min idle timeout)
- **Fallback:** Polling (if WebSocket is blocked by proxy/firewall)

### CORS Configuration

**Frontend Origin:** `https://your-app.vercel.app` (Vercel CDN)  
**Backend API:** `https://api.yourdomain.com` (Oracle + nginx + Cloudflare)

**Both are different origins** → Requires explicit CORS configuration on backend.

**Backend Config:**
```bash
# /opt/botroyale/.env.production
CORS_ORIGINS=https://your-app.vercel.app,https://yourdomain.com

# (Optional) if using custom domain for frontend
CORS_ORIGINS=https://your-app.vercel.app,https://yourdomain.com,https://app.yourdomain.com
```

**What it does:**
- Express (via `cors` middleware) checks the `Origin` header in incoming requests
- If origin is in `CORS_ORIGINS`, returns `Access-Control-Allow-Origin: <origin>` header
- Browser then allows the request to proceed

**Without CORS:**
```
Request blocked by browser (CORS policy violation)
Error in console: "Access to XMLHttpRequest blocked by CORS policy"
API call fails silently (204 No Content, or error response)
```

### TLS/HTTPS Flow

```
User types: https://your-app.vercel.app
    │
    ▼
Browser connects to Vercel CDN (TLS 1.3)
    │ (Certificate issued by Vercel/Let's Encrypt, auto-renewed)
    │
    ▼
Static assets served over HTTPS
    │
    ▼
Frontend code loaded, makes API call to: https://api.yourdomain.com
    │
    ▼
Browser connects to Cloudflare edge (TLS 1.3)
    │ (Cloudflare terminates TLS, proxies to origin)
    │
    ▼
Cloudflare → Oracle (HTTP on port 80, internal VPC)
    │ (No TLS needed, private network)
    │
    ▼
nginx listens on 0.0.0.0:80
    │
    ▼
Backend receives plain HTTP, trusts X-Forwarded-Proto: https header
    │
    ▼
Response sent back to Cloudflare → browser (over TLS)
```

**Note:** Oracle backend doesn't need a TLS certificate. Cloudflare terminates TLS at the edge, so traffic between Cloudflare and origin (Oracle) is unencrypted HTTP. This is safe because:
1. It's your infrastructure (Cloudflare ↔ your Oracle instance)
2. Cloudflare to Oracle communication doesn't traverse the public internet
3. No sensitive data is transmitted unencrypted on the public network

---

## Part 4: Deployment Strategies & Comparison

### Strategy 1: Current (Vercel + Oracle + Cloudflare) ✅

| Aspect | Details |
|---|---|
| **Frontend Hosting** | Vercel (CDN, auto-deploy) |
| **Backend Hosting** | Oracle Cloud ARM (free tier, Docker) |
| **Database** | Supabase/Neon (managed PostgreSQL) |
| **TLS/CDN** | Cloudflare (free tier) |
| **Cost** | $0/month (within free tier limits) |
| **Setup Time** | ~2–3 hours (initial), then automatic |
| **Scaling** | Backend: upgrade Oracle tier; Frontend: automatic (Vercel) |
| **Geographic Latency** | Frontend: <50ms (global CDN); Backend: 100–300ms (single region) |
| **Pros** | Zero cost, automated CI/CD, global CDN, managed DB backups |
| **Cons** | Backend latency if Oracle in distant region, manual backend scaling |

### Strategy 2: AWS Amplify (Alternative, Not Chosen)

| Aspect | Details |
|---|---|
| **Frontend Hosting** | AWS Amplify (managed) |
| **Backend Hosting** | AWS Lambda (serverless) or EC2 (IaaS) |
| **Database** | RDS PostgreSQL or DynamoDB |
| **Cost** | Free tier available, but limited |
| **Pros** | Integrated ecosystem, auto-scaling Lambda |
| **Cons** | Complexity, potential for unexpected costs, not as simple as Vercel |

### Strategy 3: Manual VPS (Not Chosen)

| Aspect | Details |
|---|---|
| **Frontend Hosting** | Manual: build + upload to VPS, serve via nginx |
| **Backend Hosting** | Same VPS (Docker containers) |
| **Database** | PostgreSQL on same VPS |
| **Cost** | ~$5–10/month (minimal VPS) |
| **Pros** | Full control, no platform vendor lock-in |
| **Cons** | Manual deployments, no CDN for frontend, manage TLS certs, backups, patches |

### Decision Matrix

| Feature | Vercel + Oracle | AWS Amplify | Manual VPS |
|---|---|---|---|
| **Cost** | ✅ $0 | ✅ Minimal | ✅ $5–10 |
| **Frontend Speed** | ✅ Global CDN | ✅ CloudFront CDN | ❌ Single origin |
| **Backend Speed** | ⚠️ Single region | ✅ Managed | ❌ Single region |
| **Auto-Deploy** | ✅ GitHub → Vercel + Oracle | ⚠️ Partial | ❌ Manual |
| **Scaling** | ⚠️ Manual for backend | ✅ Auto Lambda | ❌ Manual |
| **Complexity** | ✅ Simple | ❌ Complex | ⚠️ Moderate |
| **Ops Work** | ✅ Minimal | ⚠️ Moderate | ❌ High |

**Chosen:** Vercel + Oracle + Cloudflare (best value for free tier)

---

## Part 5: Deployment Procedures

### Backend Deployment

#### Initial Setup
1. **Provision Oracle ARM instance** (4 OCPU, 24GB RAM, Ubuntu 22.04)
2. **Install Docker** (script in `docs/DEPLOYMENT.md`)
3. **Create deploy directory** (`/opt/botroyale`)
4. **Copy files** (`docker-compose.prod.yml`, `nginx/nginx.conf`)
5. **Create `.env.production`** (database creds, JWT secret, CORS origins)
6. **Set up SSH keys** (GitHub Actions deploy keypair)
7. **Add GitHub Secrets** (`ORACLE_HOST`, `ORACLE_USER`, `ORACLE_SSH_KEY`, `GHCR_TOKEN`)
8. **Run initial migrations** (`docker compose --profile migrate run --rm migrate`)
9. **Start services** (`docker compose up -d`)

**Time:** ~1–2 hours

#### Continuous Deployment
1. Push to `main`
2. GitHub Actions: lint, test, build Docker image
3. Push image to GHCR
4. Trigger `deploy.yml`
5. SSH into Oracle, pull image, run migrations, restart backend
6. Health check validates deployment

**Time:** ~5–10 minutes per deploy

#### Manual Operations
- **Restart backend:** `docker compose -f docker-compose.prod.yml up -d --no-deps backend`
- **View logs:** `docker logs poker-backend -f`
- **Rollback:** `docker compose -f docker-compose.prod.yml down && docker compose up -d` (uses cached image)
- **Update config:** Edit `.env.production`, restart backend

### Frontend Deployment

#### Initial Setup
1. **Create Vercel account**
2. **Import GitHub repo** (Vercel → Import Project)
3. **Auto-detect build settings** (Vite, npm run build, dist)
4. **Add environment variables** (VITE_API_URL, VITE_SENTRY_DSN)
5. **Deploy** (click "Deploy" button)

**Time:** ~5 minutes

#### Continuous Deployment
1. Push to `main`
2. Vercel webhook triggered (automatic)
3. Vercel: install deps, build, inject env vars, deploy to edge
4. Live at `https://your-app.vercel.app`

**Time:** ~3–5 minutes per deploy

#### Manual Operations
- **Redeploy:** Click "Redeploy" on any previous deployment (instant)
- **Update env vars:** Vercel Settings → Environment Variables, then redeploy
- **View logs:** Vercel Dashboard → Deployments → Build tab

---

## Part 6: Monitoring & Health Checks

### Backend Health Checks

#### Application Level
```bash
curl https://api.yourdomain.com/api/v1/health
# Expected: {"status":"ok"}
```

#### Container Level
```bash
docker inspect poker-backend --format='{{.State.Health.Status}}'
# Expected: "healthy"
```

#### Database Level
```bash
docker compose -f docker-compose.prod.yml exec backend \
  npx typeorm query "SELECT 1"
# Expected: no error
```

### Frontend Health Checks

#### CDN Level
```bash
curl -I https://your-app.vercel.app/
# Expected: HTTP 200, Cache-Control header
```

#### API Connectivity
```bash
# In browser console:
fetch(import.meta.env.VITE_API_URL + '/api/v1/health')
  .then(r => r.json())
  .then(d => console.log(d))
# Expected: {status: "ok"}
```

#### WebSocket Connectivity
```javascript
// In browser console:
io(import.meta.env.VITE_API_URL + '/tournament', { auth: { token: '...' } })
// Check Network tab → socket.io → should see 101 Switching Protocols
```

### Automated Alerts

**Option 1: Uptime Monitoring Service**
- Use Pingdom, UptimeRobot, or Checkly
- Monitor `/api/v1/health` every 5 minutes
- Alert on failures

**Option 2: Vercel Alerts**
- Vercel Dashboard → Settings → Notifications
- Email alerts for deployment failures

**Option 3: Sentry Alerts**
- Sentry → Alerts → create alert for error spike
- Notifies Slack, email on high error rate

---

## Part 7: Disaster Recovery & Scaling

### Disaster Recovery

#### Backend Failure
1. **Container crashed:**
   - Docker auto-restarts (unless-stopped policy)
   - If still broken, check logs: `docker logs poker-backend`
   - Redeploy: `docker compose pull && docker compose up -d`

2. **Database failure:**
   - Supabase/Neon: use point-in-time recovery
   - Restore to `N` days ago, re-run recent migrations

3. **Disk full:**
   - `df -h` to check
   - `docker image prune -f` to clean up old images
   - `docker system prune -f` to clean up all dangling resources

#### Frontend Failure
1. **Build failed:**
   - Check Vercel build logs
   - Fix code/dependencies locally
   - Commit and push again

2. **Live bug:**
   - Rollback: Vercel Deployments → previous version → Promote to Production
   - Instant rollback, no rebuild needed

### Scaling

#### Backend (Horizontal)
1. Spin up second Oracle instance (or upgrade to paid tier)
2. Set up load balancer (nginx, Cloudflare)
3. Update `docker-compose.prod.yml` to run multiple backend containers
4. Configure Redis Pub/Sub for cross-instance communication (already supported)

#### Backend (Vertical)
1. Upgrade Oracle instance: 4 OCPU → 8 OCPU, 24GB → 48GB
2. Restart containers: `docker compose restart`
3. Capacity increases immediately

#### Frontend
- Automatic with Vercel (no action needed)
- Vercel scales globally based on traffic

#### Database
- Supabase/Neon: upgrade tier (more connections, storage, compute)
- Or migrate to larger managed service

---

## Summary

| Component | Technology | Cost | Scaling | Ops |
|---|---|---|---|---|
| **Frontend** | Vercel + React + Vite | $0 | Automatic | Minimal |
| **Backend** | Oracle ARM + Docker + NestJS | $0 | Manual | Moderate |
| **Database** | Supabase/Neon | $0 | Manual | Minimal |
| **DNS/TLS** | Cloudflare | $0 | Automatic | Minimal |
| **CI/CD** | GitHub Actions | $0 | N/A | None |
| **Monitoring** | Sentry (optional) | $0 (free tier) | Automatic | Minimal |
| **Total** | | **$0** | **Hybrid** | **Low** |

**Key Principles:**
1. **Separation of concerns:** Frontend → CDN, Backend → Compute, Database → Managed
2. **Automation:** CI/CD pipeline removes manual deployment steps
3. **Resilience:** Health checks, auto-restarts, rollback capability
4. **Cost optimization:** Free tiers, no unnecessary services
5. **Scalability:** Can upgrade any component without rewriting others

---

## Quick Reference

### Deploy Frontend
```bash
git push origin main
# Vercel detects → builds → deploys (3–5 min)
# Check: https://your-app.vercel.app
```

### Deploy Backend
```bash
git push origin main
# GitHub Actions: tests → build Docker → deploy.yml
# SSH into Oracle: pulls image → runs migrations → restarts
# Check: curl https://api.yourdomain.com/api/v1/health
```

### Update Backend Config
```bash
ssh ubuntu@YOUR_ORACLE_IP
nano /opt/botroyale/.env.production
docker compose -f docker-compose.prod.yml up -d --no-deps backend
```

### View Backend Logs
```bash
ssh ubuntu@YOUR_ORACLE_IP
docker logs poker-backend -f --tail 100
```

### Rollback Frontend
```
Vercel Dashboard → Deployments → Previous version → Promote to Production
```

### Rollback Backend
```bash
# Redeploy previous image from GHCR
ssh ubuntu@YOUR_ORACLE_IP
cd /opt/botroyale
docker compose -f docker-compose.prod.yml down
docker pull ghcr.io/<repo>:PREVIOUS_SHA
docker compose -f docker-compose.prod.yml up -d
```

---

## References

- **Backend Deployment:** `docs/DEPLOYMENT.md`
- **Frontend Deployment:** `frontend/VERCEL_DEPLOYMENT.md`
- **Environment Variables:** `frontend/ENV_VARS.md`
- **Docker Compose:** `docker-compose.prod.yml`
- **nginx Config:** `nginx/nginx.conf`
- **GitHub Actions:** `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`
