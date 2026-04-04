## Cursor Cloud specific instructions

### Git Workflow (IMPORTANT)

- **ALWAYS use rebase, NEVER merge commits**
- Before creating/updating a PR: `git fetch origin && git rebase origin/main`
- When merging PRs on GitHub: Use "Squash and merge" (preferred) or "Rebase and merge"
- **NEVER use "Create a merge commit"**
- All changes to `main` must go through Pull Requests
- Keep git history linear and clean

### PR Workflow (CRITICAL)

**Before creating any PR, ALWAYS run the local CI simulation:**

```bash
npm run ci:local
# or for quick checks:
npm run ci:local:quick
```

This catches lint, format, type, and test failures locally. The goal is **100% green PRs on first push**.

**When a PR build fails:**
1. Fix the immediate issue
2. Update `scripts/ci-local.sh` to catch this failure type in the future
3. The script should evolve to mirror CI exactly

### Architecture

This is a NestJS (TypeScript) poker tournament platform with a React (Vite) frontend. See `package.json` scripts for standard commands; `docs/` for detailed documentation.

- **Backend** (NestJS): port 3000 — `npm run dev` or `node dist/src/main.js` after building
- **Frontend** (React/Vite): port 3001 — `cd frontend && npx vite --host 0.0.0.0 --port 3001`
- **Database**: PostgreSQL 16 via Docker — `sudo docker compose up -d postgres`

### Prerequisites

Docker must be running with fuse-overlayfs storage driver and iptables-legacy (required for nested Docker). PostgreSQL container must be healthy before starting the backend.

### Known issues

- **TypeScript build error**: `nest build` reports a TS2322 error in `src/modules/games/games.service.ts` (LeaderboardEntryDto mismatch). Fix TS errors before building (tsconfig has `noEmitOnError: true`).

### Running the backend

```bash
# 1. Start PostgreSQL
sudo docker compose up -d postgres

# 2. Build
npx nest build

# 3. Run migrations (creates all tables on fresh DB)
npx typeorm migration:run -d dist/src/config/typeorm.config.js

# 4. Start backend
node dist/src/main.js
```

### Tests

**ONE COMMAND TO RUN ALL TESTS:**
```bash
npm run test:all   # Unit + Integration + E2E
```

**Individual test suites:**
- **Unit tests**: `npm run test:unit` — no DB needed (~10s)
- **Integration tests**: `npm run test:integration` — no DB needed (~1s)
- **E2E tests**: `npm run test:e2e` — requires PostgreSQL (~118s)
- **Lint**: `npx eslint "{src,apps,libs,test}/**/*.ts"` (backend)

### Email verification in dev mode

The `EmailService` logs verification codes to stdout instead of sending emails. Look for `[DEV MODE] Email to ...` in the backend logs for codes.
