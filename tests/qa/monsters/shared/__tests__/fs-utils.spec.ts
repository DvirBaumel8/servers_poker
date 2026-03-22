import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  findFiles,
  findFilesByExtensions,
  findFilesByPattern,
} from "../fs-utils";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "monster-fs-test-"));

  fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "src/sub"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "node_modules/dep"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "dist"), { recursive: true });

  fs.writeFileSync(path.join(tmpDir, "src/app.ts"), "export {}");
  fs.writeFileSync(path.join(tmpDir, "src/app.js"), "module.exports = {}");
  fs.writeFileSync(path.join(tmpDir, "src/sub/util.ts"), "export {}");
  fs.writeFileSync(path.join(tmpDir, "src/style.css"), "body {}");
  fs.writeFileSync(path.join(tmpDir, "node_modules/dep/index.ts"), "export {}");
  fs.writeFileSync(path.join(tmpDir, "dist/app.ts"), "export {}");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("findFiles", () => {
  it("finds files by extension recursively", () => {
    const tsFiles = findFiles(tmpDir, ".ts");
    const names = tsFiles.map((f) => path.relative(tmpDir, f)).sort();
    expect(names).toEqual(["src/app.ts", "src/sub/util.ts"]);
  });

  it("skips node_modules and dist by default", () => {
    const allTs = findFiles(tmpDir, ".ts");
    expect(allTs.every((f) => !f.includes("node_modules"))).toBe(true);
    expect(allTs.every((f) => !f.includes("dist"))).toBe(true);
  });

  it("returns empty array for non-existent directory", () => {
    expect(findFiles("/does/not/exist", ".ts")).toEqual([]);
  });

  it("supports custom skip dirs", () => {
    const files = findFiles(tmpDir, ".ts", new Set(["sub"]));
    const names = files.map((f) => path.relative(tmpDir, f));
    expect(names).toContain("src/app.ts");
    expect(names).toContain("node_modules/dep/index.ts");
    expect(names).toContain("dist/app.ts");
    expect(names).not.toContain("src/sub/util.ts");
  });
});

describe("findFilesByExtensions", () => {
  it("finds files matching multiple extensions", () => {
    const files = findFilesByExtensions(tmpDir, [".ts", ".css"]);
    const names = files.map((f) => path.relative(tmpDir, f)).sort();
    expect(names).toEqual(["src/app.ts", "src/style.css", "src/sub/util.ts"]);
  });
});

describe("findFilesByPattern", () => {
  it("finds files matching a regex", () => {
    const files = findFilesByPattern(tmpDir, /\.css$/);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain("style.css");
  });

  it("finds files with complex patterns", () => {
    const files = findFilesByPattern(tmpDir, /^app\.(ts|js)$/);
    expect(files).toHaveLength(2);
  });
});
