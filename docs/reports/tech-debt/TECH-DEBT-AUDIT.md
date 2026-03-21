# Technical Debt Audit Report

**Date:** 2026-03-21  
**Last Updated:** 2026-03-21  
**Goal:** Bring the project to professional, modern, edge-technology standards

---

## P3 - LOW (Backlog)

### Infrastructure

#### 1. Consider Monorepo Tooling
- **Issue:** Manual dependency management between backend/frontend
- **Fix:** Evaluate Turborepo, Nx, or pnpm workspaces

#### 2. Add OpenTelemetry for Tracing
- **Issue:** No distributed tracing
- **Fix:** Add `@opentelemetry/sdk-node` for request tracing

#### 3. Upgrade to Biome (Replace ESLint + Prettier)
- **Issue:** Two tools for linting/formatting
- **Fix:** Consider Biome for unified, faster tooling

### Frontend

#### 4. Split Large Primitives File
- **Issue:** `components/ui/primitives.tsx` is very large
- **Fix:** Split into individual component files

#### 5. Add React Query / TanStack Query
- **Issue:** Manual data fetching with `useState`/`useEffect`
- **Fix:** Use React Query for caching, loading states, refetching

### Testing

#### 6. Add Contract/API Schema Tests
- **Issue:** No backend API contract tests
- **Fix:** Add OpenAPI schema validation or contract tests

#### 7. Add Snapshot Tests
- **Issue:** No snapshot tests for UI components
- **Fix:** Add vitest snapshots or Storybook snapshot addon

#### 8. Add Port Allocation Helper for Tests
- **Issue:** E2E specs use ad-hoc port counters
- **Fix:** Create `getAvailablePort()` utility

---

## Modern Technology Upgrades to Consider

| Current | Modern Alternative | Benefit |
|---------|-------------------|---------|
| Manual fetch + useState | TanStack Query (React Query) | Caching, loading/error states, refetching |
| ESLint + Prettier | Biome | 10-100x faster, single tool |
| Manual API clients | tRPC or GraphQL | Type-safe end-to-end |
| No distributed tracing | OpenTelemetry | Request tracing across services |
| Manual WebSocket | Socket.IO rooms with Redis adapter | Horizontal scaling |
| No feature flags | LaunchDarkly, Unleash, or Flagsmith | Safe rollouts |
| No A/B testing | PostHog, Statsig | Data-driven decisions |
