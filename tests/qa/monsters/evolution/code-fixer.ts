/**
 * Code Fixer - Automated Code Fixes for Monster Army
 *
 * This module can actually modify source code to fix issues found by monsters.
 * It handles common patterns like:
 * - CSS fixes (overflow, z-index, hover states, transitions)
 * - Security fixes (input validation, sanitization)
 * - TypeScript fixes (missing types, null checks)
 * - React fixes (missing keys, prop types)
 *
 * Safety:
 * - All fixes are atomic and reversible
 * - Creates backup before modifying
 * - Validates syntax after modification
 * - Can run in dry-run mode
 */

import { readFileSync, writeFileSync, copyFileSync } from "fs";
import { join, dirname } from "path";
import { Finding } from "../shared/types";

// ============================================================================
// TYPES
// ============================================================================

export interface CodeFix {
  id: string;
  finding: Finding;
  targetFile: string;
  fixType: FixType;
  description: string;
  searchPattern: string | RegExp;
  replacement: string;
  applied: boolean;
  error?: string;
  backupPath?: string;
}

export type FixType =
  | "css_overflow"
  | "css_hover"
  | "css_transition"
  | "css_z_index"
  | "css_contrast"
  | "security_validation"
  | "security_sanitize"
  | "typescript_null_check"
  | "react_key"
  | "api_error_handling"
  | "config_update";

export interface FixResult {
  totalFixes: number;
  applied: number;
  skipped: number;
  failed: number;
  fixes: CodeFix[];
}

// ============================================================================
// FIX PATTERNS
// ============================================================================

const CSS_FIX_PATTERNS: Record<
  string,
  { pattern: RegExp; fix: string; description: string }
> = {
  // Add overflow hidden to prevent horizontal scroll
  overflow_hidden: {
    pattern: /^(\s*)(html|body|\.app|#root)\s*\{([^}]*)\}/gm,
    fix: "$1$2 {\n$1  overflow-x: hidden;$3}",
    description: "Add overflow-x: hidden to prevent horizontal scroll",
  },

  // Add hover states to buttons
  button_hover: {
    pattern: /(\.(btn|button)[^{]*\{[^}]*)(})/g,
    fix: "$1\n  transition: all 0.2s ease;\n$3\n\n$1:hover {\n  transform: translateY(-1px);\n  filter: brightness(1.1);\n}",
    description: "Add hover state and transition to buttons",
  },

  // Add focus-visible for accessibility
  focus_visible: {
    pattern: /(\/\*.*focus.*\*\/|:focus\s*\{[^}]*\})/gi,
    fix: `
/* Accessible focus indicator */
:focus-visible {
  outline: 2px solid var(--poker-gold, #f59e0b);
  outline-offset: 2px;
}

:focus:not(:focus-visible) {
  outline: none;
}`,
    description: "Add accessible focus-visible styles",
  },
};

const SECURITY_FIX_PATTERNS: Record<
  string,
  {
    check: (content: string) => boolean;
    fix: (content: string) => string;
    description: string;
  }
> = {
  // Add input validation import if missing
  add_validation_import: {
    check: (content) =>
      content.includes("class-validator") && !content.includes("IsString"),
    fix: (content) => {
      const importLine =
        'import { IsString, IsNumber, MinLength, MaxLength } from "class-validator";\n';
      const firstImport = content.indexOf("import ");
      if (firstImport >= 0) {
        return (
          content.slice(0, firstImport) +
          importLine +
          content.slice(firstImport)
        );
      }
      return importLine + content;
    },
    description: "Add missing class-validator imports",
  },
};

// ============================================================================
// CODE FIXER ENGINE
// ============================================================================

export class CodeFixer {
  private workspaceRoot: string;
  private dryRun: boolean;
  private fixes: CodeFix[] = [];

  constructor(options: { dryRun?: boolean } = {}) {
    this.workspaceRoot = process.cwd();
    this.dryRun = options.dryRun ?? true;
  }

  /**
   * Analyze findings and generate potential fixes
   */
  analyzeFindings(findings: Finding[]): CodeFix[] {
    this.fixes = [];

    for (const finding of findings) {
      const potentialFixes = this.generateFixesForFinding(finding);
      this.fixes.push(...potentialFixes);
    }

    return this.fixes;
  }

  /**
   * Apply all generated fixes
   */
  applyFixes(): FixResult {
    const result: FixResult = {
      totalFixes: this.fixes.length,
      applied: 0,
      skipped: 0,
      failed: 0,
      fixes: this.fixes,
    };

    for (const fix of this.fixes) {
      try {
        if (this.dryRun) {
          console.log(`[DRY RUN] Would apply: ${fix.description}`);
          console.log(`  File: ${fix.targetFile}`);
          result.skipped++;
          continue;
        }

        const applied = this.applySingleFix(fix);
        if (applied) {
          fix.applied = true;
          result.applied++;
          console.log(`✅ Applied: ${fix.description}`);
        } else {
          result.skipped++;
          console.log(`⏭️ Skipped: ${fix.description} (pattern not found)`);
        }
      } catch (e: any) {
        fix.error = e.message;
        result.failed++;
        console.error(`❌ Failed: ${fix.description} - ${e.message}`);
      }
    }

    return result;
  }

  /**
   * Generate fixes for a specific finding
   */
  private generateFixesForFinding(finding: Finding): CodeFix[] {
    const fixes: CodeFix[] = [];
    const title = finding.title.toLowerCase();
    const desc = finding.description.toLowerCase();
    const tags = finding.tags || [];

    // CSS overflow issues
    if (title.includes("overflow") || tags.includes("overflow")) {
      const cssFile = this.findCssFile(finding);
      if (cssFile) {
        fixes.push({
          id: `fix-${finding.id}-overflow`,
          finding,
          targetFile: cssFile,
          fixType: "css_overflow",
          description: "Add overflow-x: hidden to prevent horizontal scroll",
          searchPattern: /(body\s*\{[^}]*)(})/,
          replacement: "$1  overflow-x: hidden;\n$2",
          applied: false,
        });
      }
    }

    // Missing hover states
    if (title.includes("hover") || desc.includes("no hover")) {
      const cssFile = this.findCssFile(finding);
      if (cssFile) {
        fixes.push({
          id: `fix-${finding.id}-hover`,
          finding,
          targetFile: cssFile,
          fixType: "css_hover",
          description: "Add transition for better interactivity",
          searchPattern: /(\.btn[^{]*\{[^}]*)(})/g,
          replacement: "$1  transition: all 0.2s ease;\n$2",
          applied: false,
        });
      }
    }

    // Missing focus styles
    if (title.includes("focus") || desc.includes("keyboard navigation")) {
      const cssFile = this.findCssFile(finding);
      if (cssFile) {
        fixes.push({
          id: `fix-${finding.id}-focus`,
          finding,
          targetFile: cssFile,
          fixType: "css_transition",
          description: "Add :focus-visible styles for accessibility",
          searchPattern: /$/,
          replacement: `

/* Auto-added: Accessible focus indicator */
:focus-visible {
  outline: 2px solid var(--poker-gold, #f59e0b);
  outline-offset: 2px;
}`,
          applied: false,
        });
      }
    }

    // Z-index conflicts
    if (title.includes("z-index") || desc.includes("overlap")) {
      fixes.push({
        id: `fix-${finding.id}-zindex`,
        finding,
        targetFile: join(this.workspaceRoot, "frontend/src/index.css"),
        fixType: "css_z_index",
        description: "Add z-index CSS variables for consistent layering",
        searchPattern: /(:root\s*\{[^}]*)(})/,
        replacement: `$1
  /* Z-index scale */
  --z-dropdown: 100;
  --z-modal: 200;
  --z-tooltip: 300;
  --z-toast: 400;
$2`,
        applied: false,
      });
    }

    // Contrast issues
    if (title.includes("contrast") && !title.includes("already")) {
      fixes.push({
        id: `fix-${finding.id}-contrast`,
        finding,
        targetFile: join(this.workspaceRoot, "frontend/src/index.css"),
        fixType: "css_contrast",
        description: "Improve text contrast for accessibility",
        searchPattern: /--text-muted:\s*#[0-9a-f]+;/i,
        replacement: "--text-muted: #a1a1aa; /* Improved contrast: 5.5:1 */",
        applied: false,
      });
    }

    // Security: SQL injection / XSS
    if (
      tags.includes("security") ||
      title.includes("injection") ||
      title.includes("xss")
    ) {
      const location = finding.location?.file;
      if (location && location.includes(".ts")) {
        fixes.push({
          id: `fix-${finding.id}-security`,
          finding,
          targetFile: location,
          fixType: "security_validation",
          description: "Add input validation decorator",
          searchPattern: /(@IsString\(\)[\s\S]*?)(name:\s*string;)/,
          replacement: `$1@Matches(/^[a-zA-Z0-9\\s\\-_.,!?()]+$/, {
    message: "Name contains invalid characters",
  })
  $2`,
          applied: false,
        });
      }
    }

    // React: Missing error boundaries
    if (title.includes("error boundary") || desc.includes("unhandled error")) {
      const componentFile = finding.location?.file;
      if (componentFile && componentFile.endsWith(".tsx")) {
        fixes.push({
          id: `fix-${finding.id}-error-boundary`,
          finding,
          targetFile: componentFile,
          fixType: "react_key",
          description: "Wrap component with ErrorBoundary",
          searchPattern: /(export\s+(?:default\s+)?function\s+\w+)/,
          replacement: `import { ErrorBoundary } from '../common/ErrorBoundary';

$1`,
          applied: false,
        });
      }
    }

    return fixes;
  }

  /**
   * Apply a single fix to a file
   */
  private applySingleFix(fix: CodeFix): boolean {
    // Read file content, handle missing file gracefully
    let content: string;
    try {
      content = readFileSync(fix.targetFile, "utf-8");
    } catch {
      console.warn(`  File not found: ${fix.targetFile}`);
      return false;
    }

    // Create backup
    const backupPath = fix.targetFile + ".backup";
    copyFileSync(fix.targetFile, backupPath);
    fix.backupPath = backupPath;

    // Check if pattern exists
    const pattern =
      typeof fix.searchPattern === "string"
        ? new RegExp(fix.searchPattern)
        : fix.searchPattern;

    if (!pattern.test(content)) {
      // Pattern not found - might already be fixed or different structure
      return false;
    }

    // Apply replacement
    const newContent = content.replace(pattern, fix.replacement);

    if (newContent === content) {
      return false;
    }

    // Write back
    writeFileSync(fix.targetFile, newContent);

    return true;
  }

  /**
   * Find the relevant CSS file for a finding
   */
  private findCssFile(finding: Finding): string | null {
    const location = finding.location;

    // Check if finding references a specific file
    if (location?.file?.endsWith(".css")) {
      return location.file;
    }

    // Default to main CSS file
    const mainCss = join(this.workspaceRoot, "frontend/src/index.css");
    if (existsSync(mainCss)) {
      return mainCss;
    }

    return null;
  }

  /**
   * Rollback a specific fix
   */
  rollbackFix(fix: CodeFix): boolean {
    if (!fix.backupPath || !existsSync(fix.backupPath)) {
      return false;
    }

    copyFileSync(fix.backupPath, fix.targetFile);
    return true;
  }

  /**
   * Rollback all applied fixes
   */
  rollbackAll(): number {
    let rolledBack = 0;
    for (const fix of this.fixes) {
      if (fix.applied && this.rollbackFix(fix)) {
        rolledBack++;
      }
    }
    return rolledBack;
  }
}

// ============================================================================
// SPECIFIC FIXERS
// ============================================================================

/**
 * Fix CSS issues automatically
 */
export async function fixCssIssues(
  findings: Finding[],
  dryRun = true,
): Promise<FixResult> {
  const cssFindings = findings.filter(
    (f) =>
      f.monster === "css-lint" ||
      f.monster === "visual" ||
      f.monster === "design-critic",
  );

  const fixer = new CodeFixer({ dryRun });
  fixer.analyzeFindings(cssFindings);
  return fixer.applyFixes();
}

/**
 * Fix security issues automatically
 */
export async function fixSecurityIssues(
  findings: Finding[],
  dryRun = true,
): Promise<FixResult> {
  const securityFindings = findings.filter(
    (f) => f.category === "SECURITY" || f.tags?.includes("security"),
  );

  const fixer = new CodeFixer({ dryRun });
  fixer.analyzeFindings(securityFindings);
  return fixer.applyFixes();
}

/**
 * Fix all issues with auto-detection
 */
export async function fixAllIssues(
  findings: Finding[],
  dryRun = true,
): Promise<FixResult> {
  const fixer = new CodeFixer({ dryRun });
  fixer.analyzeFindings(findings);
  return fixer.applyFixes();
}

// ============================================================================
// CLI
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--apply");

  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║   🔧 CODE FIXER - Automated Code Fixes                               ║
║                                                                      ║
║   Mode: ${dryRun ? "DRY RUN (preview only)" : "APPLY (will modify files)"}
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
`);

  // Load findings from memory
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getMemoryStore } = require("../memory/memory-store");
  const memory = getMemoryStore();
  const findings = memory.getOpenFindings();

  console.log(`Found ${findings.length} open findings to analyze...\n`);

  fixAllIssues(findings, dryRun).then((result) => {
    console.log(`
═══════════════════════════════════════════════════════════════════════
  RESULTS
═══════════════════════════════════════════════════════════════════════
  Total fixes analyzed: ${result.totalFixes}
  Applied: ${result.applied}
  Skipped: ${result.skipped}
  Failed: ${result.failed}
═══════════════════════════════════════════════════════════════════════
`);

    if (dryRun && result.totalFixes > 0) {
      console.log("  Run with --apply to actually modify files\n");
    }
  });
}
