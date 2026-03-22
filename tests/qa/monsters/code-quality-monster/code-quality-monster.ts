/**
 * Code Quality Monster
 *
 * Detects code quality issues that other monsters miss:
 * - React hooks dependency issues (stale closures)
 * - Unsafe error handling patterns
 * - Missing loading states
 * - Empty catch blocks
 * - Hardcoded values that should be constants
 * - Console.log in production code
 * - Missing accessibility attributes
 * - Missing TypeScript strict checks
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { BaseMonster, RunConfig, Severity, runMonsterCli } from "../shared";

interface CodeIssue {
  file: string;
  line: number;
  column?: number;
  rule: string;
  severity: Severity;
  message: string;
  code?: string;
}

interface CodeQualityRule {
  id: string;
  name: string;
  description: string;
  severity: Severity;
  filePattern: RegExp;
  check: (content: string, filePath: string) => CodeIssue[];
}

export class CodeQualityMonster extends BaseMonster {
  private rules: CodeQualityRule[] = [];
  private workspaceRoot: string;

  constructor() {
    super({ name: "Code Quality Monster", type: "code-quality" });
    this.workspaceRoot = process.cwd();
    this.initializeRules();
  }

  private initializeRules(): void {
    this.rules = [
      // ========================================================================
      // REACT HOOKS RULES
      // ========================================================================
      {
        id: "stale-closure",
        name: "Stale Closure in useCallback/useMemo",
        description:
          "Detects missing dependencies in React hooks that could cause stale closures",
        severity: "high",
        filePattern: /\.(tsx|jsx)$/,
        check: (content, filePath) => {
          const issues: CodeIssue[] = [];

          // Find useCallback/useMemo with dependency arrays
          const hookPattern =
            /use(Callback|Memo)\s*\(\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\},\s*\[([^\]]*)\]\s*\)/g;

          let match;
          while ((match = hookPattern.exec(content)) !== null) {
            const hookBody = match[0];
            const deps = match[2]
              .split(",")
              .map((d) => d.trim())
              .filter(Boolean);
            const lineNum = content.slice(0, match.index).split("\n").length;

            // Find variables used in the callback body that aren't in deps
            const bodyMatch = hookBody.match(/=>\s*\{([\s\S]*?)\},\s*\[/);
            if (bodyMatch) {
              const body = bodyMatch[1];

              // Look for state variables accessed but not in deps
              const potentialMissing: string[] = [];

              // Common variables to ignore (loop vars, event handlers, etc.)
              const ignoreVars = [
                "event",
                "e",
                "i",
                "j",
                "k",
                "index",
                "item",
                "el",
                "key",
                "value",
                "result",
                "Math",
                "Date",
                "Array",
                "Object",
                "JSON",
                "console",
                "window",
                "document",
                "null",
                "undefined",
                "true",
                "false",
              ];

              // Check for object property access patterns like obj[key] or obj.prop
              const propAccessMatches = body.match(/(\w+)\[\w+\]/g) || [];
              for (const propAccess of propAccessMatches) {
                const objName = propAccess.match(/^(\w+)\[/)?.[1];
                if (objName && !ignoreVars.includes(objName)) {
                  // Check if this object is accessed through a dep (e.g., handResult.winners)
                  // If any dep contains objName as a property access, it's covered
                  const isPropertyOfDep = deps.some((dep) => {
                    // Check if objName is accessed via a dep: dep.objName or dep?.objName
                    // Also check for chained access like dep.prop.objName
                    const propAccessPattern = new RegExp(
                      `\\b${dep}\\b[.?]+[\\w.?]*\\b${objName}\\b`,
                      "i",
                    );
                    return propAccessPattern.test(body);
                  });

                  // Also check if objName itself is directly in deps
                  if (!isPropertyOfDep && !deps.includes(objName)) {
                    potentialMissing.push(objName);
                  }
                }
              }

              // Deduplicate and filter
              const uniqueMissing = [...new Set(potentialMissing)];

              if (uniqueMissing.length > 0) {
                issues.push({
                  file: filePath,
                  line: lineNum,
                  rule: "stale-closure",
                  severity: "high",
                  message: `Potential stale closure: ${uniqueMissing.join(", ")} used in callback but not in dependency array`,
                  code: hookBody.slice(0, 100) + "...",
                });
              }
            }
          }

          return issues;
        },
      },

      // ========================================================================
      // ERROR HANDLING RULES
      // ========================================================================
      {
        id: "unsafe-error-access",
        name: "Unsafe Error Property Access",
        description:
          "Accessing .message on unknown error type without type check",
        severity: "medium",
        filePattern: /\.(ts|tsx)$/,
        check: (content, filePath) => {
          const issues: CodeIssue[] = [];

          // Skip monster/QA files
          if (filePath.includes("monster") || filePath.includes("/qa/")) {
            return issues;
          }

          // Pattern: .catch((err) => ... err.message without instanceof check
          const catchPattern =
            /\.catch\s*\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*[^{]*\1\.message/g;

          let match;
          while ((match = catchPattern.exec(content)) !== null) {
            const lineNum = content.slice(0, match.index).split("\n").length;

            // Check the match itself and surrounding context for proper type handling
            // Include the full match text plus some context before/after
            const fullContext = content.slice(
              Math.max(0, match.index - 20),
              match.index + match[0].length + 50,
            );

            // Check if there's a proper type check either in:
            // 1. The match itself (ternary with instanceof)
            // 2. The surrounding code
            const matchText = match[0];
            const hasTypeCheck =
              matchText.includes("instanceof Error") ||
              matchText.includes("as Error") ||
              fullContext.includes("instanceof Error") ||
              fullContext.includes("as Error") ||
              // Also check for String(err) fallback pattern which is safe
              fullContext.includes(": String(");

            if (!hasTypeCheck) {
              issues.push({
                file: filePath,
                line: lineNum,
                rule: "unsafe-error-access",
                severity: "medium",
                message:
                  "Unsafe access to error.message without instanceof Error check",
                code: match[0],
              });
            }
          }

          return issues;
        },
      },
      {
        id: "empty-catch",
        name: "Empty Catch Block",
        description: "Catch blocks that silently swallow errors",
        severity: "medium",
        filePattern: /\.(ts|tsx|js|jsx)$/,
        check: (content, filePath) => {
          const issues: CodeIssue[] = [];

          // Skip monster files - they have intentional empty catches for expected errors
          if (filePath.includes("monster") || filePath.includes("/qa/")) {
            return issues;
          }

          // Pattern: catch { } or catch (e) { } - truly empty, no content at all
          // This matches catch blocks with NO content, not even comments
          const emptyCatchPattern = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g;

          let match;
          while ((match = emptyCatchPattern.exec(content)) !== null) {
            const lineNum = content.slice(0, match.index).split("\n").length;
            issues.push({
              file: filePath,
              line: lineNum,
              rule: "empty-catch",
              severity: "medium",
              message: "Empty catch block silently swallows errors",
              code: match[0],
            });
          }

          return issues;
        },
      },

      {
        id: "exception-filter-masks-messages",
        name: "Exception Filter Masks Business Error Messages",
        description:
          "Exception filter unconditionally replaces error messages with generic text, hiding useful business-logic messages from users",
        severity: "high",
        filePattern: /filter\.(ts|js)$/,
        check: (content, filePath) => {
          const issues: CodeIssue[] = [];

          if (
            filePath.includes("monster") ||
            filePath.includes("/qa/") ||
            filePath.includes("node_modules")
          ) {
            return issues;
          }

          if (!content.includes("ExceptionFilter")) return issues;

          const messageMapPattern =
            /(?:USER_FRIENDLY_MESSAGES|FRIENDLY_MESSAGES|MESSAGE_MAP)\s*\[/g;
          let match;
          while ((match = messageMapPattern.exec(content)) !== null) {
            const surroundingStart = Math.max(0, match.index - 200);
            const surroundingEnd = Math.min(
              content.length,
              match.index + match[0].length + 200,
            );
            const surrounding = content.slice(surroundingStart, surroundingEnd);

            const preservesOriginal =
              surrounding.includes("originalMessage") ||
              surrounding.includes("original_message") ||
              surrounding.includes("isGenericOrValidation") ||
              surrounding.includes("|| message") ||
              surrounding.includes("?? message") ||
              surrounding.includes("keepOriginal") ||
              surrounding.includes("isValidation") ||
              surrounding.includes("isBusinessLogic") ||
              surrounding.includes('"An unexpected error');

            if (!preservesOriginal) {
              const lineNum = content.slice(0, match.index).split("\n").length;
              issues.push({
                file: filePath,
                line: lineNum,
                rule: "exception-filter-masks-messages",
                severity: "high",
                message:
                  "Exception filter unconditionally replaces all error messages with generic text. " +
                  "Business-logic errors (e.g. 'Maximum 10 bots per account') will be hidden from users. " +
                  "Preserve original message for non-validation exceptions.",
                code: match[0],
              });
            }
          }

          return issues;
        },
      },

      {
        id: "numeric-value-overflow-risk",
        name: "Large Dynamic Values Without Overflow Protection",
        description:
          "Card components displaying dynamic numeric values (prices, counts, scores) " +
          "without CSS overflow protection risk breaking layout when values are large",
        severity: "medium",
        filePattern: /Card\.(tsx|jsx)$/,
        check: (content, filePath) => {
          const issues: CodeIssue[] = [];

          if (
            filePath.includes("monster") ||
            filePath.includes("/qa/") ||
            filePath.includes("node_modules") ||
            filePath.includes("Skeleton")
          ) {
            return issues;
          }

          const dynamicValuePattern =
            /className="[^"]*text-(xl|2xl|3xl|lg)[^"]*"[^>]*>\s*\n?\s*\{[^}]*(?:toLocaleString|\.toFixed|count|amount|pool|buy|price|chips|total|balance)/gi;
          let match;
          while ((match = dynamicValuePattern.exec(content)) !== null) {
            const lineNum = content.slice(0, match.index).split("\n").length;

            const contextStart = Math.max(0, match.index - 300);
            const contextEnd = Math.min(
              content.length,
              match.index + match[0].length + 100,
            );
            const context = content.slice(contextStart, contextEnd);

            const hasOverflowProtection =
              context.includes("truncate") ||
              context.includes("overflow-hidden") ||
              context.includes("overflow-ellipsis") ||
              context.includes("text-ellipsis") ||
              context.includes("min-w-0") ||
              context.includes("break-all") ||
              context.includes("max-w-") ||
              context.includes("formatCompact") ||
              context.includes("abbreviate");

            if (!hasOverflowProtection) {
              issues.push({
                file: filePath,
                line: lineNum,
                rule: "numeric-value-overflow-risk",
                severity: "medium",
                message:
                  "Dynamic numeric value displayed in large text without overflow protection. " +
                  "Add CSS truncation (truncate, overflow-hidden, text-ellipsis) or " +
                  "number formatting (compact notation) to prevent layout breakage.",
                code: match[0].slice(0, 80),
              });
            }
          }

          return issues;
        },
      },

      // ========================================================================
      // LOADING STATE RULES
      // ========================================================================
      {
        id: "missing-loading-state",
        name: "Missing Loading State",
        description: "Async data fetching without proper loading indicator",
        severity: "low",
        filePattern: /\.(tsx|jsx)$/,
        check: (content, filePath) => {
          const issues: CodeIssue[] = [];

          // Check for useEffect with fetch/api calls but no isLoading state
          if (
            content.includes("useEffect") &&
            (content.includes("fetch(") ||
              content.includes("Api.") ||
              content.includes("api."))
          ) {
            if (
              !content.includes("isLoading") &&
              !content.includes("loading") &&
              !content.includes("Loading")
            ) {
              const lineNum = content.indexOf("useEffect");
              issues.push({
                file: filePath,
                line: content.slice(0, lineNum).split("\n").length,
                rule: "missing-loading-state",
                severity: "low",
                message:
                  "Component fetches data but has no loading state indicator",
              });
            }
          }

          return issues;
        },
      },

      // ========================================================================
      // HARDCODED VALUES RULES
      // ========================================================================
      {
        id: "hardcoded-timeout",
        name: "Hardcoded Timeout Value",
        description: "Timeout values should be configurable constants",
        severity: "low",
        filePattern: /\.(ts|tsx)$/,
        check: (content, filePath) => {
          const issues: CodeIssue[] = [];

          // Skip test files, QA monsters, simulation code, and frontend (timeouts are expected/intentional)
          if (
            filePath.includes(".spec.") ||
            filePath.includes(".test.") ||
            filePath.includes("/tests/") ||
            filePath.includes("/qa/") ||
            filePath.includes("simulation") ||
            filePath.includes("monster") ||
            filePath.includes("frontend/") ||
            filePath.includes("metrics") ||
            filePath.includes("worker")
          ) {
            return issues;
          }

          // Pattern: setTimeout/setInterval with hardcoded number
          const timeoutPattern =
            /set(Timeout|Interval)\s*\([^,]+,\s*(\d{4,})\s*\)/g;

          let match;
          while ((match = timeoutPattern.exec(content)) !== null) {
            const lineNum = content.slice(0, match.index).split("\n").length;
            const timeout = match[2];

            issues.push({
              file: filePath,
              line: lineNum,
              rule: "hardcoded-timeout",
              severity: "low",
              message: `Hardcoded timeout value: ${timeout}ms. Consider using a named constant.`,
              code: match[0],
            });
          }

          return issues;
        },
      },
      {
        id: "hardcoded-url",
        name: "Hardcoded URL",
        description: "URLs should come from configuration",
        severity: "medium",
        filePattern: /\.(ts|tsx)$/,
        check: (content, filePath) => {
          const issues: CodeIssue[] = [];

          // Pattern: hardcoded localhost or IP addresses
          const urlPattern =
            /(["'`])(https?:\/\/(?:localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)[^"'`]*)\1/g;

          let match;
          while ((match = urlPattern.exec(content)) !== null) {
            const lineNum = content.slice(0, match.index).split("\n").length;

            // Skip test files
            if (
              filePath.includes(".spec.") ||
              filePath.includes(".test.") ||
              filePath.includes("/tests/")
            ) {
              continue;
            }

            // Skip config files that define default values (these are intentional)
            if (filePath.includes("config/") || filePath.includes(".config.")) {
              continue;
            }

            // Check context: skip if it's used as a fallback with process.env
            // Pattern: process.env.VAR || "url" or process.env.VAR?.split(",") || [...urls]
            const lineStart = content.lastIndexOf("\n", match.index) + 1;
            const lineEnd = content.indexOf(
              "\n",
              match.index + match[0].length,
            );
            const lineContent = content.slice(lineStart, lineEnd);

            // Skip if line contains process.env fallback pattern
            if (
              lineContent.includes("process.env") &&
              lineContent.includes("||")
            ) {
              continue;
            }

            // Skip if it's in a DEFAULT_* constant definition (development defaults)
            if (lineContent.includes("DEFAULT_") && lineContent.includes("=")) {
              continue;
            }

            issues.push({
              file: filePath,
              line: lineNum,
              rule: "hardcoded-url",
              severity: "medium",
              message: `Hardcoded URL: ${match[2]}. Use environment variables.`,
              code: match[0],
            });
          }

          return issues;
        },
      },

      // ========================================================================
      // STATE MANAGEMENT RULES
      // ========================================================================
      {
        id: "polling-without-diff",
        name: "Polling Store Update Without Data Comparison",
        description:
          "Zustand stores used from polling intervals that replace array " +
          "state without comparing to previous values cause unnecessary " +
          "re-renders and UI flicker on every poll cycle",
        severity: "high",
        filePattern: /Store\.(ts|tsx)$/,
        check: (content, filePath) => {
          const issues: CodeIssue[] = [];

          if (
            filePath.includes("monster") ||
            filePath.includes("/qa/") ||
            filePath.includes("node_modules") ||
            filePath.includes(".spec.") ||
            filePath.includes(".test.")
          ) {
            return issues;
          }

          if (!content.includes("create<") && !content.includes("create("))
            return issues;

          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            const setMatch = line.match(
              /set\(\s*\{\s*(\w+)\s*,\s*loading\s*:\s*false/,
            );
            if (!setMatch) continue;

            const stateKey = setMatch[1];
            if (
              stateKey === "loading" ||
              stateKey === "error" ||
              stateKey === "null"
            )
              continue;

            const blockStart = Math.max(0, i - 20);
            const blockEnd = Math.min(lines.length, i + 5);
            const block = lines.slice(blockStart, blockEnd).join("\n");

            const getStateUsages = block.match(
              new RegExp(`getState\\(\\)\\.${stateKey}(?!\\s*\\.length)`, "g"),
            );
            const hasDiffCheck =
              block.includes("JSON.stringify") ||
              block.includes("isEqual") ||
              block.includes("deepEqual") ||
              (getStateUsages && getStateUsages.length > 0) ||
              block.includes("previous") ||
              block.includes("shouldUpdate");

            if (!hasDiffCheck) {
              issues.push({
                file: filePath,
                line: i + 1,
                rule: "polling-without-diff",
                severity: "high",
                message:
                  `Store replaces '${stateKey}' state without comparing to previous value. ` +
                  "When called from a polling interval, this causes unnecessary re-renders " +
                  "and UI flicker. Compare new data with getState() before calling set().",
                code: line.slice(0, 80),
              });
            }
          }

          return issues;
        },
      },

      // ========================================================================
      // UX CONSISTENCY RULES
      // ========================================================================
      {
        id: "bot-action-without-guard",
        name: "Bot-Dependent Action Missing Disabled Guard",
        description:
          "Pages with modals showing 'no bots' empty states should also " +
          "disable the button that opens the modal when myBots is empty, " +
          "to prevent users from opening a modal only to find an error",
        severity: "high",
        filePattern: /\.(tsx)$/,
        check: (content, filePath) => {
          const issues: CodeIssue[] = [];

          if (
            filePath.includes(".spec.") ||
            filePath.includes(".test.") ||
            filePath.includes("monster") ||
            filePath.includes("/qa/")
          ) {
            return issues;
          }

          const hasNoBotEmptyState =
            content.includes("myBots.length === 0") &&
            (content.includes("EmptyState") || content.includes("No active"));

          if (!hasNoBotEmptyState) return issues;

          const openModalPattern =
            /(?:onRegister|onJoin|onDeploy)\s*=\s*\{[^}]*?\b(?:open\w*Modal|set\w*Modal)\b/g;
          let match;
          while ((match = openModalPattern.exec(content)) !== null) {
            const blockStart = Math.max(0, match.index - 300);
            const blockEnd = Math.min(
              content.length,
              match.index + match[0].length + 300,
            );
            const surrounding = content.slice(blockStart, blockEnd);

            const hasBotsGuard =
              surrounding.includes("myBots.length === 0") ||
              surrounding.includes("myBots.length > 0") ||
              surrounding.includes("myBots.length < 1") ||
              surrounding.includes("!myBots.length") ||
              surrounding.includes("disabled={myBots") ||
              surrounding.includes("hasBots={") ||
              surrounding.includes("hasBots=");

            if (!hasBotsGuard) {
              const lineNum = content.slice(0, match.index).split("\n").length;
              issues.push({
                file: filePath,
                line: lineNum,
                rule: "bot-action-without-guard",
                severity: "high",
                message:
                  "This bot-dependent action opens a modal but does not check " +
                  "if the user has bots before showing the button/action. " +
                  "The trigger should be disabled when myBots is empty, or " +
                  "pass a hasBots prop to the child component to match the " +
                  "pattern used on other pages (e.g., Tables).",
                code: match[0].slice(0, 60),
              });
            }
          }

          return issues;
        },
      },

      {
        id: "inconsistent-empty-state-fallback",
        name: "Metric Shows Fallback Data While Tab Shows Empty State",
        description:
          "When a data source (e.g. leaderboard) is empty, metric cards " +
          "must not show fallback values that contradict an empty state " +
          "displayed in the same component",
        severity: "high",
        filePattern: /\.(tsx)$/,
        check: (content, filePath) => {
          const issues: CodeIssue[] = [];

          if (
            filePath.includes(".spec.") ||
            filePath.includes(".test.") ||
            filePath.includes("monster") ||
            filePath.includes("/qa/")
          ) {
            return issues;
          }

          if (!content.includes("useMemo") || !content.includes("EmptyState"))
            return issues;

          const memoPattern =
            /const\s+(\w+)\s*=\s*useMemo\(\s*\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[([^\]]*)\]\s*\)/g;
          const memos: {
            name: string;
            body: string;
            deps: string;
            index: number;
          }[] = [];
          let match;
          while ((match = memoPattern.exec(content)) !== null) {
            memos.push({
              name: match[1],
              body: match[2],
              deps: match[3],
              index: match.index,
            });
          }

          for (let i = 0; i < memos.length; i++) {
            const memo = memos[i];
            const emptyCheck =
              memo.body.match(
                /(?:\.length\s*===?\s*0|!\w+\s*\|\||\.length\s*<\s*1)/,
              ) !== null;
            const hasFallback =
              emptyCheck &&
              (memo.body.includes("|| 0") ||
                memo.body.includes("|| ''") ||
                memo.body.includes("entriesCount") ||
                memo.body.includes("registeredPlayers") ||
                memo.body.match(/return\s+\w+\?\.\w+\s*\|\|/) !== null);

            if (!hasFallback) continue;

            const sharedDeps = memo.deps
              .split(",")
              .map((d) => d.trim())
              .filter(Boolean);

            for (let j = 0; j < memos.length; j++) {
              if (i === j) continue;
              const other = memos[j];

              const sharesData = sharedDeps.some((dep) =>
                other.deps.includes(dep),
              );
              if (!sharesData) continue;

              const otherReturnsEmpty =
                (other.body.includes("return []") ||
                  other.body.includes(".length === 0")) &&
                !other.body.includes("entriesCount") &&
                !other.body.includes("registeredPlayers");

              if (otherReturnsEmpty) {
                const lineNum = content.slice(0, memo.index).split("\n").length;
                issues.push({
                  file: filePath,
                  line: lineNum,
                  rule: "inconsistent-empty-state-fallback",
                  severity: "high",
                  message:
                    `'${memo.name}' uses a fallback value when data is empty, but ` +
                    `'${other.name}' returns empty/shows empty state for the same data source. ` +
                    `This creates a contradiction: a metric card shows data while the ` +
                    `detail view says 'no data'. Both must handle empty state consistently.`,
                  code: `${memo.name} fallback vs ${other.name} empty state`,
                });
              }
            }
          }

          return issues;
        },
      },

      {
        id: "number-input-missing-max",
        name: "Number Input Without Max Attribute",
        description:
          "Number inputs without a max attribute allow users to enter " +
          "arbitrarily large values that may break UI layout or backend " +
          "validation",
        severity: "medium",
        filePattern: /\.(tsx)$/,
        check: (content, filePath) => {
          const issues: CodeIssue[] = [];

          if (
            filePath.includes(".spec.") ||
            filePath.includes(".test.") ||
            filePath.includes("monster") ||
            filePath.includes("/qa/") ||
            filePath.includes("stories")
          ) {
            return issues;
          }

          const numberInputPattern =
            /(<(?:TextField|input)\b[\s\S]*?type=["']number["'][\s\S]*?\/>|<(?:TextField|input)\b[\s\S]*?type=["']number["'][\s\S]*?>)/g;
          let match;
          while ((match = numberInputPattern.exec(content)) !== null) {
            const tag = match[0];
            if (!tag.includes("max=") && !tag.includes("max={")) {
              if (
                tag.includes('label="Max') ||
                tag.includes('label="Max') ||
                tag.includes("placeholder=")
              ) {
                continue;
              }
              const lineNum = content.slice(0, match.index).split("\n").length;
              issues.push({
                file: filePath,
                line: lineNum,
                rule: "number-input-missing-max",
                severity: "medium",
                message:
                  "Number input is missing a max attribute. Users can enter " +
                  "arbitrarily large values that may overflow the UI or fail " +
                  "backend validation.",
                code: tag.replace(/\s+/g, " ").slice(0, 60),
              });
            }
          }

          return issues;
        },
      },
      {
        id: "stale-data-on-navigation",
        name: "Store Shows Stale Entity When Navigating",
        description:
          "Store fetch functions that use isInitial checks based on " +
          "current state being null will fail to reset when navigating " +
          "between entities, briefly showing stale data",
        severity: "high",
        filePattern: /Store\.(ts|tsx)$/,
        check: (content, filePath) => {
          const issues: CodeIssue[] = [];

          if (
            filePath.includes(".spec.") ||
            filePath.includes(".test.") ||
            filePath.includes("monster") ||
            filePath.includes("/qa/")
          ) {
            return issues;
          }

          if (!content.includes("create<") && !content.includes("create("))
            return issues;

          const stalePattern = /const\s+isInitial\s*=\s*[^;]*===\s*null\s*;/g;
          let match;
          while ((match = stalePattern.exec(content)) !== null) {
            const surrounding = content.slice(
              Math.max(0, match.index - 100),
              Math.min(content.length, match.index + 300),
            );

            const checksId =
              surrounding.includes(".id !== ") ||
              surrounding.includes(".id === ") ||
              surrounding.includes("isNewBot") ||
              surrounding.includes("isNewTournament") ||
              surrounding.includes("isNewGame") ||
              surrounding.includes("current.id");

            if (!checksId) {
              const lineNum = content.slice(0, match.index).split("\n").length;
              issues.push({
                file: filePath,
                line: lineNum,
                rule: "stale-data-on-navigation",
                severity: "high",
                message:
                  "Fetch function uses `isInitial = state === null` to decide " +
                  "whether to show loading, but does not check if the entity " +
                  "ID changed. When navigating between entities, stale data " +
                  "from the previous entity is briefly displayed.",
                code: match[0].slice(0, 60),
              });
            }
          }

          return issues;
        },
      },

      // ========================================================================
      // CONSOLE.LOG RULES
      // ========================================================================
      {
        id: "console-log",
        name: "Console.log in Production Code",
        description: "console.log should not be in production code",
        severity: "low",
        filePattern: /\.(ts|tsx)$/,
        check: (content, filePath) => {
          const issues: CodeIssue[] = [];

          // Skip test files, logger utility, CLI scripts, and migrations
          if (
            filePath.includes(".spec.") ||
            filePath.includes(".test.") ||
            filePath.includes("/tests/") ||
            filePath.includes("logger") ||
            filePath.includes("/scripts/") ||
            filePath.includes("/migrations/") ||
            filePath.includes("/simulation/") ||
            filePath.includes("cli") ||
            filePath.includes("runner")
          ) {
            return issues;
          }

          const consolePattern = /console\.(log|debug|info)\s*\(/g;

          let match;
          while ((match = consolePattern.exec(content)) !== null) {
            const lineNum = content.slice(0, match.index).split("\n").length;
            issues.push({
              file: filePath,
              line: lineNum,
              rule: "console-log",
              severity: "low",
              message: `console.${match[1]} found in production code. Use the logger utility instead.`,
            });
          }

          return issues;
        },
      },

      // ========================================================================
      // ACCESSIBILITY RULES
      // ========================================================================
      {
        id: "missing-aria-label",
        name: "Interactive Element Missing ARIA Label",
        description: "Buttons and links without text content need aria-label",
        severity: "medium",
        filePattern: /\.(tsx|jsx)$/,
        check: (content, filePath) => {
          const issues: CodeIssue[] = [];

          // Pattern: button/a with only icon children and no aria-label
          const iconButtonPattern =
            /<(button|a)[^>]*>\s*<(Icon|svg|img)[^>]*\/?>\s*<\/\1>/g;

          let match;
          while ((match = iconButtonPattern.exec(content)) !== null) {
            const element = match[0];
            if (
              !element.includes("aria-label") &&
              !element.includes("aria-labelledby")
            ) {
              const lineNum = content.slice(0, match.index).split("\n").length;
              issues.push({
                file: filePath,
                line: lineNum,
                rule: "missing-aria-label",
                severity: "medium",
                message: `Icon-only ${match[1]} missing aria-label for accessibility`,
                code: element,
              });
            }
          }

          return issues;
        },
      },
      {
        id: "missing-alt-text",
        name: "Image Missing Alt Text",
        description: "Images should have alt text for accessibility",
        severity: "medium",
        filePattern: /\.(tsx|jsx)$/,
        check: (content, filePath) => {
          const issues: CodeIssue[] = [];

          // Pattern: <img without alt
          const imgPattern = /<img\s+[^>]*>/g;

          let match;
          while ((match = imgPattern.exec(content)) !== null) {
            const imgTag = match[0];
            if (!imgTag.includes("alt=") && !imgTag.includes("alt={")) {
              const lineNum = content.slice(0, match.index).split("\n").length;
              issues.push({
                file: filePath,
                line: lineNum,
                rule: "missing-alt-text",
                severity: "medium",
                message: "Image missing alt attribute",
                code: imgTag,
              });
            }
          }

          return issues;
        },
      },

      // ========================================================================
      // VALIDATION RULES
      // ========================================================================
      {
        id: "missing-uuid-validation",
        name: "Missing UUID Validation on Route Param",
        description: "Route params that are IDs should use ParseUUIDPipe",
        severity: "medium",
        filePattern: /\.controller\.ts$/,
        check: (content, filePath) => {
          const issues: CodeIssue[] = [];

          // Pattern: @Param("...Id") WITHOUT ParseUUIDPipe
          // This regex captures @Param decorators with ID-like names that don't use ParseUUIDPipe
          // Match: @Param("botId") param: string  (missing pipe)
          // Skip:  @Param("botId", ParseUUIDPipe) param: string  (has pipe)
          const paramPattern =
            /@Param\s*\(\s*["'](\w*[Ii]d)["']\s*\)\s+(\w+):\s*string/g;

          let match;
          while ((match = paramPattern.exec(content)) !== null) {
            // Check the context AFTER the match - if ParseUUIDPipe is part of the same @Param call, it's fine
            // The pattern already only matches @Param("id") NOT @Param("id", ParseUUIDPipe)
            const lineNum = content.slice(0, match.index).split("\n").length;
            issues.push({
              file: filePath,
              line: lineNum,
              rule: "missing-uuid-validation",
              severity: "medium",
              message: `Route parameter "${match[1]}" should use ParseUUIDPipe for validation`,
              code: match[0],
            });
          }

          return issues;
        },
      },

      // ========================================================================
      // MEMORY LEAK RULES
      // ========================================================================
      {
        id: "missing-cleanup",
        name: "Missing useEffect Cleanup",
        description: "useEffect with timers/subscriptions should have cleanup",
        severity: "high",
        filePattern: /\.(tsx|jsx)$/,
        check: (content, filePath) => {
          const issues: CodeIssue[] = [];

          // Find useEffect blocks with setInterval but no cleanup
          const useEffectPattern =
            /useEffect\s*\(\s*\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[/g;

          let match;
          while ((match = useEffectPattern.exec(content)) !== null) {
            const effectBody = match[1];

            // Check for timers/subscriptions that need cleanup
            const needsCleanup =
              effectBody.includes("setInterval") ||
              effectBody.includes("addEventListener") ||
              effectBody.includes(".subscribe(") ||
              effectBody.includes("socket.on");

            const hasCleanup =
              effectBody.includes("return ()") ||
              effectBody.includes("return function") ||
              effectBody.includes("clearInterval") ||
              effectBody.includes("removeEventListener");

            if (needsCleanup && !hasCleanup) {
              const lineNum = content.slice(0, match.index).split("\n").length;
              issues.push({
                file: filePath,
                line: lineNum,
                rule: "missing-cleanup",
                severity: "high",
                message:
                  "useEffect with timer/subscription missing cleanup function",
                code: effectBody.slice(0, 100) + "...",
              });
            }
          }

          return issues;
        },
      },
    ];
  }

  async setup(): Promise<void> {
    this.log("Setting up Code Quality Monster...");
    this.log(`Loaded ${this.rules.length} code quality rules`);
  }

  async execute(_runConfig: RunConfig): Promise<void> {
    const frontendSrc = join(this.workspaceRoot, "frontend/src");
    const backendSrc = join(this.workspaceRoot, "src");
    const testsSrc = join(this.workspaceRoot, "tests");

    this.log("\n📋 Scanning frontend code...");
    await this.scanDirectory(frontendSrc);

    this.log("\n📋 Scanning backend code...");
    await this.scanDirectory(backendSrc);

    this.log("\n📋 Scanning test code...");
    await this.scanDirectory(testsSrc);

    this.log("\n📋 Checking entity-migration sync...");
    this.checkEntityMigrationSync();
  }

  private checkEntityMigrationSync(): void {
    const entitiesDir = join(this.workspaceRoot, "src/entities");
    const migrationsDir = join(this.workspaceRoot, "src/migrations");

    if (!this.fileExists(entitiesDir) || !this.fileExists(migrationsDir)) {
      this.log("  Skipping: entities or migrations directory not found");
      return;
    }

    const entityFiles = this.getFilesRecursively(entitiesDir).filter(
      (f) => f.endsWith(".entity.ts") && !f.includes("base.entity"),
    );
    const migrationFiles = this.getFilesRecursively(migrationsDir).filter(
      (f) => f.endsWith(".ts") && !f.includes("run.ts"),
    );

    const allMigrationContent = migrationFiles
      .map((f) => {
        try {
          return readFileSync(f, "utf-8");
        } catch {
          return "";
        }
      })
      .join("\n");

    let issuesFound = 0;

    for (const entityFile of entityFiles) {
      try {
        const content = readFileSync(entityFile, "utf-8");
        const tableName = this.extractTableName(content);
        if (!tableName) continue;

        const entityColumns = this.extractColumns(content);
        const migrationColumns = this.extractMigrationColumns(
          allMigrationContent,
          tableName,
        );

        for (const col of entityColumns) {
          const inMigration =
            migrationColumns.has(col) ||
            allMigrationContent.includes(`"${col}"`) ||
            allMigrationContent.includes(`'${col}'`);

          if (!inMigration) {
            issuesFound++;
            this.log(
              `  🔴 Column "${col}" on table "${tableName}" has no migration`,
            );
            this.addFinding({
              category: "BUG",
              severity: "critical",
              title: `Entity column "${col}" on "${tableName}" has no migration`,
              description:
                `Column "${col}" is defined in the entity but never appears in any migration file. ` +
                `This will cause "column does not exist" errors at runtime unless the DB was created with synchronize:true.`,
              location: {
                file: relative(this.workspaceRoot, entityFile),
              },
              evidence: {
                raw: { column: col, table: tableName },
              },
              reproducible: true,
              tags: ["schema-sync", "entity-migration", "runtime-crash"],
            });
          }

          this.recordTest(inMigration);
        }
      } catch {
        // Skip files that can't be read
      }
    }

    this.log(
      `  Checked ${entityFiles.length} entities, found ${issuesFound} sync issues`,
    );
  }

  private extractTableName(content: string): string | null {
    const match = content.match(/@Entity\(\s*["']([^"']+)["']\s*\)/);
    return match ? match[1] : null;
  }

  private extractColumns(content: string): string[] {
    const columns: string[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      if (
        lines[i].includes("@Column") ||
        lines[i].includes("@CreateDateColumn") ||
        lines[i].includes("@UpdateDateColumn") ||
        lines[i].includes("@PrimaryColumn")
      ) {
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const propMatch = lines[j].match(/^\s+(\w+)\s*[?:!]/);
          if (propMatch) {
            columns.push(propMatch[1]);
            break;
          }
        }
      }
    }

    return columns;
  }

  private extractMigrationColumns(
    migrationContent: string,
    tableName: string,
  ): Set<string> {
    const columns = new Set<string>();

    const createTableRegex = new RegExp(
      `CREATE TABLE.*["']?${tableName}["']?.*?\\(([^)]+)\\)`,
      "gis",
    );
    const alterTableRegex = new RegExp(
      `ALTER TABLE.*["']?${tableName}["']?.*?ADD.*?["']?(\\w+)["']?`,
      "gi",
    );

    let match;
    while ((match = createTableRegex.exec(migrationContent)) !== null) {
      const columnDefs = match[1];
      const colMatches = columnDefs.match(/"(\w+)"/g);
      if (colMatches) {
        colMatches.forEach((c) => columns.add(c.replace(/"/g, "")));
      }
    }

    while ((match = alterTableRegex.exec(migrationContent)) !== null) {
      columns.add(match[1]);
    }

    return columns;
  }

  private async scanDirectory(dir: string): Promise<void> {
    if (!this.fileExists(dir)) {
      this.log(`  Directory not found: ${dir}`);
      return;
    }

    const files = this.getFilesRecursively(dir);
    let issuesFound = 0;

    for (const file of files) {
      const issues = await this.analyzeFile(file);
      issuesFound += issues.length;

      for (const issue of issues) {
        this.addFinding({
          category: "CODE_QUALITY",
          severity: issue.severity,
          title: `${issue.rule}: ${issue.message.slice(0, 60)}...`,
          description: issue.message,
          location: {
            file: relative(this.workspaceRoot, issue.file),
            line: issue.line,
          },
          evidence: issue.code ? { raw: issue.code } : undefined,
          reproducible: true,
          tags: ["code-quality", issue.rule],
        });
      }
    }

    this.log(`  Scanned ${files.length} files, found ${issuesFound} issues`);
  }

  private async analyzeFile(filePath: string): Promise<CodeIssue[]> {
    const issues: CodeIssue[] = [];

    try {
      const content = readFileSync(filePath, "utf-8");

      for (const rule of this.rules) {
        if (rule.filePattern.test(filePath)) {
          const ruleIssues = rule.check(content, filePath);
          issues.push(...ruleIssues);

          this.recordTest(ruleIssues.length === 0);
        }
      }
    } catch (_err) {
      // File read errors are expected for some paths (e.g., broken symlinks)
    }

    return issues;
  }

  private fileExists(path: string): boolean {
    try {
      statSync(path);
      return true;
    } catch (_err) {
      return false; // File doesn't exist - this is expected, not an error
    }
  }

  private getFilesRecursively(dir: string): string[] {
    const files: string[] = [];

    try {
      const entries = readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip node_modules, dist, etc.
          if (
            !["node_modules", "dist", "build", ".git", "coverage"].includes(
              entry.name,
            )
          ) {
            files.push(...this.getFilesRecursively(fullPath));
          }
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    } catch (_err) {
      // Directory access errors are expected for permission-restricted paths
    }

    return files;
  }

  async teardown(): Promise<void> {
    this.log("\nCode Quality Monster complete");
  }
}

// CLI Entry Point
if (require.main === module) {
  runMonsterCli(new CodeQualityMonster(), "code-quality");
}
