#!/usr/bin/env npx ts-node
/**
 * Generate report from issue tracker data.
 *
 * Usage:
 *   npx ts-node tests/qa/monsters/generate-report.ts
 *   npm run monsters:report
 */

import { generateReport } from "./shared/issue-tracker";

generateReport();

console.log("✅ Generated docs/MONSTERS_ISSUES.md");
