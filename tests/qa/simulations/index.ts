/**
 * Simulation Test Framework - Entry Point
 *
 * Export all simulation classes and types for programmatic use.
 */

export {
  SimulationRunner,
  SimulationConfig,
  SimulationResult,
} from "./simulation-runner";
export { BasicSimulation, BASIC_CONFIG } from "./basic.simulation";
export {
  SingleTableSimulation,
  SINGLE_TABLE_CONFIG,
} from "./single-table.simulation";
export {
  MultiTableSimulation,
  MULTI_TABLE_CONFIG,
} from "./multi-table.simulation";
