import * as fs from "fs";
import * as path from "path";
import type { BugReport } from "./validators";

/**
 * Shared utility for writing bug reports with smart tracking.
 * Used by both NestJS service and CLI script.
 */

interface BugRegistry {
  [signature: string]: {
    firstSeen: string;
    lastSeen: string;
    fixed: boolean;
  };
}

export function writeBugReportsWithTracking(
  bugs: BugReport[],
  projectRoot: string = process.cwd(),
): { bugsFile: string; registryFile: string } {
  const bugsFile = path.join(projectRoot, "POKER_BUGS.md");
  const registryPath = path.join(projectRoot, ".poker-bug-registry.json");

  // Load existing registry
  let registry: BugRegistry = {};
  if (fs.existsSync(registryPath)) {
    try {
      registry = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
    } catch {
      console.warn("Failed to load bug registry, starting fresh");
    }
  }

  // Create bug signatures
  const newBugSignatures = new Set(
    bugs.map((b) => `${b.invariant}:${JSON.stringify(b.errorDetails)}`),
  );

  // Track which bugs are now resolved
  const resolvedBugs: string[] = [];
  for (const sig of Object.keys(registry)) {
    if (!newBugSignatures.has(sig) && !registry[sig].fixed) {
      registry[sig].fixed = true;
      resolvedBugs.push(sig);
    }
  }

  // Update registry with new bugs
  bugs.forEach((bug) => {
    const sig = `${bug.invariant}:${JSON.stringify(bug.errorDetails)}`;
    if (!registry[sig]) {
      registry[sig] = {
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        fixed: false,
      };
    } else {
      registry[sig].lastSeen = new Date().toISOString();
    }
  });

  // Save updated registry
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), "utf-8");

  // Generate report
  let content = "# Poker Game Bugs - Auto-Generated\n\n";
  content += `Last updated: ${new Date().toISOString()}\n`;
  content += `Active bugs: ${bugs.length}\n\n`;

  if (bugs.length === 0) {
    content += "✅ **No active bugs found!**\n\n";
  } else {
    content += "## 🔴 Active Bugs\n\n";
    bugs.forEach((bug, index) => {
      const sig = `${bug.invariant}:${JSON.stringify(bug.errorDetails)}`;
      const regData = registry[sig];
      content += `### Bug #${index + 1} - ${bug.invariant}\n`;
      content += `**Severity**: ${bug.severity}  \n`;
      content += `**First seen**: ${regData?.firstSeen || bug.timestamp}\n`;
      content += `**Last seen**: ${bug.timestamp}\n\n`;

      content += `**Details**:\n`;
      content += "```json\n";
      content += JSON.stringify(bug.errorDetails, null, 2);
      content += "\n```\n\n";

      content += "---\n\n";
    });
  }

  fs.writeFileSync(bugsFile, content, "utf-8");

  return { bugsFile, registryFile: registryPath };
}
