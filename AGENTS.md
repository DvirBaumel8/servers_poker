## Cursor Cloud specific instructions

### Git Workflow (IMPORTANT)

- **ALWAYS use rebase, NEVER merge commits**
- Before creating/updating a PR: `git fetch origin && git rebase origin/main`
- When merging PRs on GitHub: Use "Squash and merge" (preferred) or "Rebase and merge"
- **NEVER use "Create a merge commit"**
- All changes to `main` must go through Pull Requests
- Keep git history linear and clean

### Architecture

This is a NestJS (TypeScript) poker tournament platform with a React (Vite) frontend. See `package.json` scripts for standard commands; `docs/` for detailed documentation.

- **Backend** (NestJS): port 3000 — `npm run dev` or `node dist/src/main.js` after building
- **Frontend** (React/Vite): port 3001 — `cd frontend && npx vite --host 0.0.0.0 --port 3001`
- **Database**: PostgreSQL 16 via Docker — `sudo docker compose up -d postgres`

### Prerequisites

Docker must be running with fuse-overlayfs storage driver and iptables-legacy (required for nested Docker). PostgreSQL container must be healthy before starting the backend.

### Known issues

- **TypeScript build error**: `nest build` reports a TS2322 error in `src/modules/games/games.service.ts` (LeaderboardEntryDto mismatch). Because `noEmitOnError: false` in tsconfig, JS output is still emitted. However, `nest start --watch` (i.e. `npm run dev`) does **not** start the server when TS errors exist. Workaround: build first with `npx nest build`, then run `node dist/src/main.js` directly.
- **Migration ordering bug**: Migration timestamps are misordered — `AddEmailVerification` (1710000000003) runs before `InitialSchema` (1710864000000). To set up a fresh DB, use TypeORM `synchronize: true` to create schema from entities, then manually insert all migration records into the `migrations` table so the bundled `run.js` (which gets auto-imported by the entity glob) doesn't crash the app trying to re-run them.
- **Migration runner auto-execution**: The `src/migrations/run.js` file is caught by the TypeORM entity/migration glob patterns and auto-executed when the app starts. If migrations are not all recorded as complete, this will crash the process with `process.exit(1)`.

### Running the backend

```bash
# 1. Start PostgreSQL
sudo docker compose up -d postgres

# 2. Build (emits JS despite TS error)
npx nest build

# 3. Sync schema from entities (fresh DB only)
node -e "
const { DataSource } = require('typeorm');
require('dotenv').config();
const ds = new DataSource({
  type: 'postgres', host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'poker',
  synchronize: true,
  entities: [__dirname + '/dist/src/entities/*.entity.js'],
  logging: false,
});
ds.initialize().then(() => ds.destroy()).catch(e => { console.error(e.message); process.exit(1); });
"

# 4. Mark all migrations as run (fresh DB only)
sudo docker exec poker-postgres psql -U postgres -d poker -c "
INSERT INTO migrations (timestamp, name) VALUES
(1710000000003, 'AddEmailVerification1710000000003'),
(1710000000004, 'AddPasswordAndResetFields1710000000004'),
(1710864000000, 'InitialSchema1710864000000'),
(1710864001000, 'AddGameStateSnapshots1710864001000'),
(1710864002000, 'AddHandSeeds1710864002000')
ON CONFLICT DO NOTHING;
"

# 5. Start backend
node dist/src/main.js
```

### Tests

- **Unit tests**: `npx vitest run tests/unit` — no DB needed; some pre-existing failures
- **E2E tests**: require a running PostgreSQL (`poker_test` DB on port 5433); use `docker-compose.test.yml`
- **Lint**: `npx eslint "{src,apps,libs,test}/**/*.ts"` (backend), `cd frontend && npx eslint src --ext ts,tsx` (frontend) — pre-existing prettier formatting errors exist

### Email verification in dev mode

The `EmailService` logs verification codes to stdout instead of sending emails. Look for `[DEV MODE] Email to ...` in the backend logs for codes.

### QA Monster Framework (IMPORTANT)

**Every feature, refactor, or significant UI change MUST include QA Monster updates.**

The QA Monster is our comprehensive testing framework that finds bugs, UX issues, and design inconsistencies. When developing:

1. **Before starting**: Check `tests/qa/monster/monster-config.ts` for existing coverage
2. **During development**: Consider edge cases, error states, mobile viewports
3. **Before PR**: Update monster config with new flows/pages

**What to update:**

| Change Type | Update Location |
|-------------|-----------------|
| New page/route | Add to `PAGES` array in `monster-config.ts` |
| New user flow | Add to `FLOWS` array in `monster-config.ts` |
| New form/inputs | Add edge cases and validation scenarios |
| New component | Add to page's `interactiveElements` |
| New API endpoint | Add error scenarios |

**Quick commands:**
```bash
npm run qa:monster          # Full scan
npm run qa:monster:quick    # Quick scan (before PR)
npm run qa:monster:page X   # Test specific page
```

**Key files:**
- `tests/qa/monster/monster-config.ts` — Pages, flows, viewports, checks
- `tests/qa/monster/CONTRIBUTING.md` — Full guide for updating monster
- `docs/reports/QA-MONSTER-REPORT-V*.md` — Findings history

See `tests/qa/monster/CONTRIBUTING.md` for detailed examples.
