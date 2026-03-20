# AGENTS.md

## Cursor Cloud specific instructions

### Services overview

| Service | Port | Start command |
|---------|------|---------------|
| NestJS backend | 3000 | `node dist/src/main.js` (after `npx tsc`) |
| React frontend (Vite) | 3001 | `cd frontend && npx vite --port 3001` |
| PostgreSQL | 5432 | `docker compose up -d postgres` |

### Pre-existing issues

- **TypeScript build error**: `src/modules/games/games.service.ts` has a type mismatch (`LeaderboardEntryDto` expects `total_winnings` but `game.repository.ts` returns `net_profit`). The `nest build` command will fail, but `npx tsc` emits output because `noEmitOnError` is set to `false` in `tsconfig.json`. Use `npx tsc` to build instead of `npm run build`.
- **Migration ordering bug**: Migrations `1710000000003-AddEmailVerification` and `1710000000004-AddPasswordAndResetFields` have timestamps lower than `1710864000000-InitialSchema`, so `npm run migration:run` fails (tries to alter `users` table before it exists). To set up the DB from scratch, run migrations manually in the correct order: InitialSchema first, then the email/password migrations, then game state snapshots, then hand seeds.
- **ESLint**: Both backend and frontend have pre-existing prettier/formatting warnings. The lint command exits non-zero due to these.
- **Tests**: Some unit tests fail (44 of 310) due to pre-existing test/implementation mismatches. 13 of 18 test files pass.

### Running the application

1. Ensure PostgreSQL is running: `docker compose up -d postgres`
2. Build backend: `npx tsc` (from repo root)
3. Start backend: `node dist/src/main.js` (runs on port 3000)
4. Start frontend: `cd frontend && npx vite --port 3001`
5. The `.env` file is created from `.env.example`; defaults work for local dev

### Developer tooling

| Tool | Check command | Auto-fix command |
|------|--------------|-----------------|
| ESLint (backend) | `npm run lint:check` | `npm run lint` |
| ESLint (frontend) | `npm run lint:frontend` | — |
| Prettier | `npm run format:check` | `npm run format` |
| TypeScript | `npm run typecheck` | — |
| Tests + coverage | `npm run test:cov` | — |
| All checks | `npm run validate` | — |

- **Coverage thresholds** (enforced in `vitest.config.ts`): 30% statements, 25% branches, 25% functions, 30% lines
- **Pre-commit hooks**: Husky + lint-staged auto-lint and format staged `.ts` files on commit
- **CI pipeline**: `.github/workflows/ci.yml` runs typecheck, lint, format, tests with coverage, security scan, and Docker build
- **Cursor PR review rules**: `.cursor/rules/` contains review checklists for code quality, security, testing, and game engine integrity

### Key development notes

- The backend uses NestJS with TypeORM. The `nest start --watch` dev command fails due to the TS error; use `npx tsc` + `node dist/src/main.js` or fix the type error first.
- The frontend Vite dev server proxies `/api` and `/socket.io` to the backend on port 3000 (see `frontend/vite.config.ts`).
- Email verification is required for user registration. In dev mode, emails are logged (not sent). Retrieve verification codes directly from the database: `docker exec -i poker-postgres psql -U postgres -d poker -c "SELECT verification_code FROM users WHERE email='...'"`.
- Bot creation requires a reachable endpoint. Start a mock bot server or use the scripts in `scripts/mock-bot-server.ts`.
- Standard commands for lint/test/build are in `package.json` scripts (see README for reference).

### Docker in Cloud Agent VMs

Docker is installed with `fuse-overlayfs` storage driver and `iptables-legacy` for compatibility. After Docker install, run `sudo chmod 666 /var/run/docker.sock` if permission errors occur. The dockerd is started via `sudo dockerd` in the background.
