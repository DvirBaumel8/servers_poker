# Poker Engine

A No-Limit Texas Hold'em tournament platform where users build bots via the BotBuilder UI. Bots use in-process strategy evaluation — no external servers required. The game engine evaluates each bot's strategy JSON directly during gameplay.

```
┌─────────────────────────────────────────────────────┐
│                  NestJS Game Server (:3000)          │
│  POST /auth/register-developer  — create account    │
│  POST /bots                     — register a bot    │
│  POST /games/:id/join           — join a table      │
│  GET  /games/:id/state          — live game state   │
│  WS   /game                     — real-time push    │
│                                                      │
│  StrategyEngineService — in-process bot evaluation  │
└─────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 22, NestJS, TypeORM, PostgreSQL 16 |
| Frontend | React 19, Vite, Tailwind CSS v4, Zustand |
| Auth | JWT (users & bot ownership) |
| Real-time | Socket.IO via @nestjs/websockets |
| Testing | Vitest |
| CI/CD | GitHub Actions, CodeQL, Lighthouse CI |

## Quick Start

### Prerequisites

- Node.js 22+
- PostgreSQL 16

### Setup

```bash
# Install dependencies
npm install
cd frontend && npm install && cd ..

# Copy environment config
cp .env.example .env

# Create database
createdb poker

# Run migrations
npm run migration:run

# Start development
npm run dev:all
```

This starts the backend on `http://localhost:3000` and frontend on `http://localhost:3001`.

### Create Your First Bot

**Option 1: BotBuilder UI**
1. Navigate to `http://localhost:3001/register` and create an account
2. Go to `/bots/build` to open the BotBuilder wizard
3. Choose a tier (Quick Bot, Strategy Builder, or Pro Builder)
4. Configure your bot's personality and strategy
5. Submit to create your bot

**Option 2: API**
```bash
curl -X POST http://localhost:3000/api/v1/auth/register-developer \
  -H "Content-Type: application/json" \
  -d '{
    "email": "you@example.com",
    "name": "YourName",
    "password": "SecurePassword123",
    "botName": "MyBot"
  }'
```

This creates an account and bot with a default strategy. Customize it later via the BotBuilder UI.

See [docs/QUICKSTART.md](docs/QUICKSTART.md) for a full getting-started guide.

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start backend in watch mode |
| `npm run dev:frontend` | Start frontend Vite dev server |
| `npm run dev:all` | Start both backend and frontend |
| `npm run build` | Compile backend TypeScript |
| `npm run build:frontend` | Build frontend for production |
| `npm run lint` | Run ESLint on backend |
| `npm test` | Run unit and integration tests |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run typecheck` | TypeScript type checking |
| `npm run migration:run` | Run database migrations |
| `npm run ci:local` | **Run local CI simulation before PRs** |
| `npm run ci:local:quick` | Quick local CI (lint + types + unit tests) |
| `npm run ci:local:fix` | Auto-fix lint/format issues |
| `bash scripts/db-backup.sh` | Database backup with retention pruning |
| `npm run monsters:quick` | Quick QA validation (API + Invariant) |
| `npm run monsters:pr` | PR validation (Layers 1+2) |
| `npm run monsters:nightly` | Full QA coverage |

## Strategy Engine

Bots are powered by a strategy JSON definition that is evaluated in-process by `StrategyEngineService`. Strategies are created via the BotBuilder UI with three tiers of complexity:

- **Quick Bot** — Personality sliders (aggression, bluff frequency, risk tolerance)
- **Strategy Builder** — Visual IF/THEN rule builder
- **Pro Builder** — Full range chart editor with per-position control

The game engine calls `evaluateStrategy(strategy, gameState)` for each bot's turn, returning an action (fold, check, call, raise, all_in) without any external HTTP calls.

## Project Structure

```
src/
├── config/          # App and database configuration
├── entities/        # TypeORM entities (22 tables)
├── migrations/      # Database migrations
├── modules/
│   ├── auth/        # Registration, login, JWT, email verification
│   ├── bots/        # Bot CRUD, strategy management, subscriptions
│   ├── games/       # Game tables, hand history, leaderboard
│   ├── tournaments/ # Tournament lifecycle, blind levels, payouts
│   └── users/       # User management
├── repositories/    # Data access layer
├── services/        # Game persistence, provably fair, bot activity
├── game/            # Core poker engine (invariants, state)
├── betting.ts       # Pot manager and betting round logic
└── main.ts          # Application entry point

frontend/
├── src/
│   ├── api/         # Backend API client
│   ├── components/  # React components
│   ├── pages/       # Route pages (Home, Tables, Game, Bots, etc.)
│   └── stores/      # Zustand state management
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — system design and module structure
- [API Reference](docs/API.md) — REST API endpoints
- [Bot Developer Guide](docs/guides/BOT_DEVELOPER_GUIDE.md) — build your bot
- [Quick Start](docs/guides/QUICKSTART.md) — get playing in 5 minutes
- [Game Rules](docs/GAME_RULES.md) — No-Limit Hold'em rules
- [Tournament Rules](docs/TOURNAMENT_RULES.md) — tournament format and payouts
- [Testing](docs/TESTING.md) — test strategy and running tests
- [Deployment](docs/guides/DEPLOYMENT.md) — production deployment guide
- [Security](docs/guides/SECURITY.md) — security measures and best practices
- [Monitoring](docs/MONITORING.md) — observability and metrics
- [QA Monster Army](tests/qa/monsters/README.md) — comprehensive QA system

## Docker

```bash
# Production
docker compose up -d

# Development (with hot reload)
docker compose --profile dev up

# Run migrations
docker compose --profile migrate up
```

## Monitoring

The platform includes a full observability stack:

- **Prometheus** — metrics collection (`/metrics` endpoint)
- **Grafana** — dashboards and visualization
- **Alertmanager** — alerting and notifications

Configuration files are in the `monitoring/` directory. See [docs/MONITORING.md](docs/MONITORING.md) for setup details.

## QA Testing

The Monster Army is a comprehensive, self-improving QA system:

```bash
npm run monsters:quick    # Fast validation before commits
npm run monsters:pr       # Full PR validation
npm run monsters:nightly  # Comprehensive nightly tests
```

See [tests/qa/monsters/README.md](tests/qa/monsters/README.md) for the complete QA architecture.

## License

MIT
