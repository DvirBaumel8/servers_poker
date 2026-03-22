/**
 * Auto-Fixer - Intelligent Code Fix System
 *
 * This module contains auto-fix logic for common UI bugs.
 * Each fixer targets a specific category of issues and knows how to fix them.
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const WORKSPACE_ROOT = process.cwd();
const FRONTEND_SRC = path.join(WORKSPACE_ROOT, "frontend/src");

// ============================================================================
// TYPES
// ============================================================================

interface Finding {
  id: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  location: string;
  element?: string;
}

interface FixResult {
  success: boolean;
  message: string;
  filesModified: string[];
}

interface Fixer {
  name: string;
  canFix: (finding: Finding) => boolean;
  fix: (finding: Finding) => Promise<FixResult>;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function findFileByPath(searchPath: string): string | null {
  // Try to find the actual file from a URL path
  const cleanPath = searchPath.replace(/^\//, "").replace(/\?.*$/, "");

  // Common mappings
  const mappings: Record<string, string[]> = {
    login: ["pages/Login.tsx"],
    register: ["pages/Register.tsx"],
    tournaments: ["pages/Tournaments.tsx", "pages/TournamentDetail.tsx"],
    bots: ["pages/Bots.tsx", "pages/BotProfile.tsx"],
    "admin/tournaments": ["pages/AdminTournaments.tsx"],
    "admin/analytics": ["pages/AdminAnalytics.tsx"],
    profile: ["pages/Profile.tsx"],
    leaderboard: ["pages/Leaderboard.tsx"],
    tables: ["pages/Tables.tsx"],
  };

  for (const [route, files] of Object.entries(mappings)) {
    if (cleanPath.includes(route)) {
      for (const file of files) {
        const fullPath = path.join(FRONTEND_SRC, file);
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      }
    }
  }

  return null;
}

function readFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function writeFile(filePath: string, content: string): boolean {
  try {
    fs.writeFileSync(filePath, content);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// FIXERS
// ============================================================================

const fixers: Fixer[] = [
  // -------------------------------------------------------------------------
  // FIX: Inputs without labels (A11Y)
  // -------------------------------------------------------------------------
  {
    name: "InputLabelFixer",
    canFix: (finding) =>
      finding.category === "A11Y" &&
      finding.title.toLowerCase().includes("input") &&
      finding.title.toLowerCase().includes("label"),
    fix: async (finding) => {
      const filePath = findFileByPath(finding.location);
      if (!filePath) {
        return {
          success: false,
          message: "Could not find source file",
          filesModified: [],
        };
      }

      const content = readFile(filePath);
      if (!content) {
        return {
          success: false,
          message: "Could not read file",
          filesModified: [],
        };
      }

      // Find inputs without aria-label
      const inputPattern =
        /<input\s+([^>]*?)(?<!\baria-label\s*=\s*"[^"]*")\s*\/>/g;
      let fixCount = 0;

      const modified = content.replace(inputPattern, (match, attrs) => {
        if (!attrs.includes("aria-label")) {
          // Extract name or placeholder for label
          const nameMatch = attrs.match(/name\s*=\s*"([^"]+)"/);
          const placeholderMatch = attrs.match(/placeholder\s*=\s*"([^"]+)"/);
          const label =
            nameMatch?.[1] || placeholderMatch?.[1] || "Input field";

          fixCount++;
          return `<input ${attrs} aria-label="${label}" />`;
        }
        return match;
      });

      if (fixCount > 0) {
        writeFile(filePath, modified);
        return {
          success: true,
          message: `Added aria-label to ${fixCount} input(s)`,
          filesModified: [filePath],
        };
      }

      return {
        success: false,
        message: "No inputs needed fixing",
        filesModified: [],
      };
    },
  },

  // -------------------------------------------------------------------------
  // FIX: Buttons without accessible names (A11Y)
  // -------------------------------------------------------------------------
  {
    name: "ButtonLabelFixer",
    canFix: (finding) =>
      finding.category === "A11Y" &&
      finding.title.toLowerCase().includes("button") &&
      finding.title.toLowerCase().includes("label"),
    fix: async (finding) => {
      const filePath = findFileByPath(finding.location);
      if (!filePath) {
        return {
          success: false,
          message: "Could not find source file",
          filesModified: [],
        };
      }

      const content = readFile(filePath);
      if (!content) {
        return {
          success: false,
          message: "Could not read file",
          filesModified: [],
        };
      }

      // Find icon-only buttons without aria-label
      const buttonPattern =
        /<button\s+([^>]*?)>(\s*<[^/][^>]*\/>\s*)<\/button>/g;
      let fixCount = 0;

      const modified = content.replace(
        buttonPattern,
        (match, attrs, children) => {
          if (!attrs.includes("aria-label")) {
            // Try to infer label from icon or class
            let label = "Button";
            if (children.includes("Close") || children.includes("X"))
              label = "Close";
            else if (children.includes("Menu")) label = "Menu";
            else if (children.includes("Search")) label = "Search";
            else if (children.includes("Plus") || children.includes("Add"))
              label = "Add";

            fixCount++;
            return `<button ${attrs} aria-label="${label}">${children}</button>`;
          }
          return match;
        },
      );

      if (fixCount > 0) {
        writeFile(filePath, modified);
        return {
          success: true,
          message: `Added aria-label to ${fixCount} button(s)`,
          filesModified: [filePath],
        };
      }

      return {
        success: false,
        message: "No buttons needed fixing",
        filesModified: [],
      };
    },
  },

  // -------------------------------------------------------------------------
  // FIX: React infinite loop (useEffect missing deps)
  // -------------------------------------------------------------------------
  {
    name: "ReactInfiniteLoopFixer",
    canFix: (finding) =>
      finding.category === "CONSOLE" &&
      (finding.description.includes("Maximum update depth") ||
        finding.description.includes("infinite loop")),
    fix: async (finding) => {
      // This is a complex fix - we'll identify the file and suggest the fix
      const filePath = findFileByPath(finding.location);

      // Create a fix suggestion file
      const suggestionPath = path.join(
        WORKSPACE_ROOT,
        "tests/qa/monsters/browser-monster/reports",
        "fix-suggestions.md",
      );

      const suggestion = `
## React Infinite Loop Fix Needed

**Location:** ${finding.location}
**File:** ${filePath || "Unknown"}

### Likely Causes:
1. \`useEffect\` with a function that updates state used in its dependency array
2. \`useMemo\` or \`useCallback\` with wrong dependencies
3. State update in render phase (not in useEffect/callback)

### Suggested Fix Pattern:
\`\`\`typescript
// WRONG - causes infinite loop
useEffect(() => {
  setData(fetchData()); // setData changes, triggers re-render, runs effect again
}, [data]); // data is in deps AND being set

// RIGHT - stable reference
useEffect(() => {
  const loadData = async () => {
    const result = await fetchData();
    setData(result);
  };
  loadData();
}, []); // Empty deps - only run once

// OR use useCallback for stable function reference
const stableCallback = useCallback(() => {
  // your logic
}, []); // Only recreate when specific deps change
\`\`\`

### Files to Check:
- ${filePath || finding.location}
- Look for useEffect, useMemo, useCallback hooks
- Check if any state setters are called in render phase
`;

      const dir = path.dirname(suggestionPath);
      // Use recursive:true which handles race condition safely
      fs.mkdirSync(dir, { recursive: true });

      // Read existing content if any, handle missing file gracefully
      let existing = "";
      try {
        existing = fs.readFileSync(suggestionPath, "utf-8");
      } catch {
        // File doesn't exist yet, that's fine
      }

      fs.writeFileSync(suggestionPath, existing + suggestion);

      return {
        success: false, // We didn't auto-fix, but we helped
        message: `Fix suggestion written to ${suggestionPath}`,
        filesModified: [suggestionPath],
      };
    },
  },

  // -------------------------------------------------------------------------
  // FIX: Missing form validation
  // -------------------------------------------------------------------------
  {
    name: "FormValidationFixer",
    canFix: (finding) =>
      finding.category === "VALIDATION" &&
      finding.title.toLowerCase().includes("validation"),
    fix: async (finding) => {
      const filePath = findFileByPath(finding.location);
      if (!filePath) {
        return {
          success: false,
          message: "Could not find source file",
          filesModified: [],
        };
      }

      const content = readFile(filePath);
      if (!content) {
        return {
          success: false,
          message: "Could not read file",
          filesModified: [],
        };
      }

      // Add required attribute to inputs that should be required
      let modified = content;
      let fixCount = 0;

      // Pattern: inputs with name="email" or name="password" without required
      const requiredInputs = ["email", "password", "username", "name"];

      for (const inputName of requiredInputs) {
        const pattern = new RegExp(
          `<input\\s+([^>]*name\\s*=\\s*"${inputName}"[^>]*)(?<!required)\\s*\\/>`,
          "g",
        );

        modified = modified.replace(pattern, (match, attrs) => {
          if (!attrs.includes("required")) {
            fixCount++;
            return `<input ${attrs} required />`;
          }
          return match;
        });
      }

      if (fixCount > 0) {
        writeFile(filePath, modified);
        return {
          success: true,
          message: `Added required to ${fixCount} input(s)`,
          filesModified: [filePath],
        };
      }

      return {
        success: false,
        message: "No validation fixes needed",
        filesModified: [],
      };
    },
  },

  // -------------------------------------------------------------------------
  // FIX: Horizontal overflow on mobile
  // -------------------------------------------------------------------------
  {
    name: "OverflowFixer",
    canFix: (finding) =>
      finding.category === "RESPONSIVE" &&
      finding.title.toLowerCase().includes("overflow"),
    fix: async (finding) => {
      // Check if there's a global overflow fix we can add
      const indexCssPath = path.join(FRONTEND_SRC, "index.css");

      if (!fs.existsSync(indexCssPath)) {
        return {
          success: false,
          message: "Could not find index.css",
          filesModified: [],
        };
      }

      const content = readFile(indexCssPath);
      if (!content) {
        return {
          success: false,
          message: "Could not read index.css",
          filesModified: [],
        };
      }

      // Check if we already have overflow-x: hidden on body
      if (
        content.includes("overflow-x: hidden") ||
        content.includes("overflow-x:hidden")
      ) {
        return {
          success: false,
          message: "Overflow fix already present",
          filesModified: [],
        };
      }

      // Add overflow fix to body
      const fixCss = `
/* Prevent horizontal overflow on mobile */
body {
  overflow-x: hidden;
}

.page-shell,
.app-shell {
  overflow-x: hidden;
  max-width: 100vw;
}
`;

      // Append to the end of the file
      const modified = content + "\n" + fixCss;
      writeFile(indexCssPath, modified);

      return {
        success: true,
        message: "Added overflow-x fix to index.css",
        filesModified: [indexCssPath],
      };
    },
  },
];

// ============================================================================
// MAIN FIX FUNCTION
// ============================================================================

export async function attemptFix(finding: Finding): Promise<FixResult> {
  for (const fixer of fixers) {
    if (fixer.canFix(finding)) {
      console.log(`    🔧 Trying ${fixer.name}...`);
      try {
        const result = await fixer.fix(finding);
        if (result.success) {
          console.log(`    ✅ ${result.message}`);
        } else {
          console.log(`    ℹ️  ${result.message}`);
        }
        return result;
      } catch (err) {
        console.log(`    ❌ Fixer crashed: ${err}`);
        return { success: false, message: String(err), filesModified: [] };
      }
    }
  }

  return {
    success: false,
    message: "No fixer available for this issue",
    filesModified: [],
  };
}

export async function attemptAllFixes(findings: Finding[]): Promise<{
  fixed: Finding[];
  unfixed: Finding[];
  filesModified: string[];
}> {
  const fixed: Finding[] = [];
  const unfixed: Finding[] = [];
  const allFilesModified: Set<string> = new Set();

  for (const finding of findings) {
    const result = await attemptFix(finding);

    if (result.success) {
      fixed.push(finding);
      result.filesModified.forEach((f) => allFilesModified.add(f));
    } else {
      unfixed.push(finding);
    }
  }

  return {
    fixed,
    unfixed,
    filesModified: Array.from(allFilesModified),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { fixers, findFileByPath };
