/**
 * Monster Army - Filesystem Utilities
 *
 * Shared file traversal and reading functions used across multiple monsters.
 * Replaces duplicated implementations in code-quality, data-integrity,
 * data-analytics, log-analyzer, design-critic, and contract monsters.
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================================
// SAFE FILE READING
// ============================================================================

/**
 * Read a text file, returning null on any error (not found, permission, etc.).
 */
export function readTextSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Read and parse a JSON file, returning null on any error.
 */
export function readJsonSafe<T = unknown>(filePath: string): T | null {
  const text = readTextSafe(filePath);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ============================================================================
// FILE TRAVERSAL
// ============================================================================

const DEFAULT_SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "coverage",
  ".next",
  ".turbo",
  "build",
  "__snapshots__",
]);

/**
 * Recursively find files matching an extension filter.
 *
 * @param dir - Root directory to search
 * @param extension - File extension to match (e.g., ".ts")
 * @param skipDirs - Set of directory names to skip (defaults to common build dirs)
 */
export function findFiles(
  dir: string,
  extension: string,
  skipDirs: Set<string> = DEFAULT_SKIP_DIRS,
): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (skipDirs.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, extension, skipDirs));
    } else if (entry.name.endsWith(extension)) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Recursively find files matching multiple extensions.
 */
export function findFilesByExtensions(
  dir: string,
  extensions: string[],
  skipDirs: Set<string> = DEFAULT_SKIP_DIRS,
): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (skipDirs.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFilesByExtensions(fullPath, extensions, skipDirs));
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Recursively find files matching a regex pattern.
 */
export function findFilesByPattern(
  dir: string,
  pattern: RegExp,
  skipDirs: Set<string> = DEFAULT_SKIP_DIRS,
): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (skipDirs.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFilesByPattern(fullPath, pattern, skipDirs));
    } else if (pattern.test(entry.name)) {
      results.push(fullPath);
    }
  }

  return results;
}
