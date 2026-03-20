## Cursor Cloud specific instructions

### Product overview
This is a **Poker Engine** — a No-Limit Texas Hold'em tournament platform where bot HTTP servers compete. It has a NestJS backend (port 3000) and React/Vite frontend (port 3001). See `docs/ARCHITECTURE.md` for full details.

### Services

| Service | Port | How to start |
|---------|------|--------------|
| PostgreSQL 16 | 5432 | `docker run -d --name poker-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=poker -p 5432:5432 postgres:16-alpine` |
| Backend (NestJS) | 3000 | `npm run build && node dist/src/main.js` |
| Frontend (Vite) | 3001 | `cd frontend && npx vite --port 3001 --host` |

### Known gotchas

- **`nest start --watch` fails**: There is a pre-existing TypeScript error in `src/modules/games/games.service.ts` (`LeaderboardEntryDto` missing `total_winnings`). Since `tsconfig.json` has `noEmitOnError: false`, the build still emits JS. Use `npm run build && node dist/src/main.js` instead of `npm run dev`.
- **Migration ordering bug**: The `src/migrations/run.ts` file gets matched by TypeORM's migration glob (`/../migrations/*{.ts,.js}`), causing it to execute at import time. Additionally, migration timestamps for `AddEmailVerification` (1710000000003) and `AddPasswordAndResetFields` (1710000000004) precede the `InitialSchema` migration (1710864000000). Workaround: use entity-driven sync for dev databases, then mark all migrations as applied in the `migrations` table.
- **Database schema setup for dev**: Instead of `npm run migration:run`, sync the schema from entities by running:
  ```
  node -e "const{DataSource}=require('typeorm');const d=require('dotenv');d.config();new DataSource({type:'postgres',host:process.env.DB_HOST||'localhost',port:parseInt(process.env.DB_PORT||'5432'),username:process.env.DB_USERNAME||'postgres',password:process.env.DB_PASSWORD||'postgres',database:process.env.DB_NAME||'poker',entities:[__dirname+'/dist/src/entities/*.entity.js'],synchronize:true,logging:false}).initialize().then(ds=>{console.log('Synced');return ds.destroy()}).catch(e=>{console.error(e);process.exit(1)})"
  ```
  Then insert all migration names into the `migrations` table so they're marked as done.
- **E2E tests use `synchronize: true`** and create their own test database, so they don't need migrations.
- **Email verification in dev**: The `EmailService` logs verification codes to stdout instead of sending email. Check backend logs for the code after registration.

### Standard commands
- **Lint (backend)**: `npx eslint "{src,apps,libs,test}/**/*.ts"` — pre-existing prettier formatting errors exist
- **Lint (frontend)**: `cd frontend && npx eslint src --ext ts,tsx` — pre-existing prettier errors exist
- **Unit + integration tests**: `npm test` (excludes e2e)
- **E2E tests**: `npm run test:e2e` (requires PostgreSQL on port 5432)
- **Build backend**: `npm run build`
- **Build frontend**: `cd frontend && npm run build`
- **Type check**: `npm run typecheck` (will show the pre-existing TS error)

### Docker requirements
Docker must be installed and running for PostgreSQL. In Cloud Agent VMs, use `fuse-overlayfs` storage driver and `iptables-legacy`.

### Environment
Copy `.env.example` to `.env` for local development. Default values connect to `localhost:5432` with `postgres/postgres` credentials.
