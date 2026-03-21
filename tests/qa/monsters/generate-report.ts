#!/usr/bin/env npx ts-node
/**
 * Generate REPORT.md from memory store data.
 *
 * Usage:
 *   npx ts-node tests/qa/monsters/generate-report.ts
 *   npm run monsters:report
 */

import { getMemoryStore } from "./memory/memory-store";

const store = getMemoryStore();
store.generateReport();

console.log("✅ Generated tests/qa/monsters/REPORT.md");
