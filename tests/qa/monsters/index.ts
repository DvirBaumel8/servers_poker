/**
 * Monster Army
 *
 * A self-improving QA system for zero-bug poker development.
 *
 * Monsters:
 * - API Monster: Backend endpoint validation
 * - Visual Monster: Frontend visual testing
 * - Invariant Monster: Poker game rule validation
 * - Chaos Monster: Resilience testing (planned)
 * - Perf Monster: Performance testing (planned)
 * - Guardian Monster: Security + a11y (planned)
 *
 * Evolution Agent: Analyzes runs and suggests improvements
 * Memory Store: Tracks findings and trends over time
 */

// Shared
export * from "./shared/types";
export * from "./shared/base-monster";
export * from "./shared/reporter";

// Memory
export * from "./memory/memory-store";

// Monsters
export * from "./api-monster";
export * from "./visual-monster";
export * from "./invariant-monster";

// Evolution
export * from "./evolution/evolution-agent";
