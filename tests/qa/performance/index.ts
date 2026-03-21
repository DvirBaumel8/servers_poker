/**
 * Performance Testing Framework - Exports
 * ========================================
 *
 * Comprehensive performance and load testing for the poker platform.
 *
 * Quick Start:
 *   npm run load:quick      # Fast CI validation (~2 min)
 *   npm run load:baseline   # Establish baseline metrics
 *   npm run load:sustained  # Full load test (100 tournaments)
 *
 * See tests/qa/performance/README.md for detailed documentation.
 */

// Legacy load test utilities
export * from "./load-test";
export * from "./network-resilience.test";

// New load simulation framework
export * from "./load-config";
export * from "./metrics-collector";
export * from "./virtual-tournament";
export * from "./load-controller";
