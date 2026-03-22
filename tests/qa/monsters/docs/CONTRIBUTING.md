# How to Add a New Monster

This is the step-by-step checklist for adding a new monster to the Monster Army.
Every step is mandatory — skip one and the monster won't integrate properly.

---

## Step 1: Add the MonsterType

**File:** `tests/qa/monsters/shared/types.ts`

Add your type to the `MonsterType` union:

```typescript
export type MonsterType =
  | "api"
  | "visual"
  // ...existing types...
  | "your-monster"  // <-- add here
  | "e2e";
```

---

## Step 2: Add the Reporter Icon

**File:** `tests/qa/monsters/shared/reporter.ts`

Add an icon to the `MONSTER_ICONS` record. Must include every `MonsterType` or TypeScript will error:

```typescript
const MONSTER_ICONS: Record<MonsterType, string> = {
  // ...existing icons...
  "your-monster": "🔮",
};
```

---

## Step 3: Create the Monster File

**Directory:** `tests/qa/monsters/your-monster/your-monster.ts`

Every monster follows the same pattern — extend `BaseMonster`, implement three methods:

```typescript
import { BaseMonster } from "../shared/base-monster";
import { RunConfig } from "../shared/types";
import { runMonsterCli } from "../shared/cli-runner";

class YourMonster extends BaseMonster {
  constructor() {
    super({
      name: "Your Monster",
      type: "your-monster",
      timeout: 60000,    // max runtime in ms
      verbose: true,
      // needsServer: true,   // if it hits localhost:3000
      // needsBrowser: true,  // if it needs Playwright
    });
  }

  protected async setup(_runConfig: RunConfig): Promise<void> {
    // Load config, connect to services, etc.
  }

  protected async execute(_runConfig: RunConfig): Promise<void> {
    // Your checks go here — see "Writing Checks" below
  }

  protected async teardown(): Promise<void> {
    // Cleanup connections, temp files, etc.
  }
}

runMonsterCli(new YourMonster(), "your-monster");
```

### Writing Checks

Use `recordCheck()` to count every verification. Use `recordTest(pass)` for pass/fail tracking. Use `addFinding()` when something is wrong:

```typescript
protected async execute(_runConfig: RunConfig): Promise<void> {
  this.recordCheck();
  const isValid = somethingToCheck();

  if (!isValid) {
    this.addFinding({
      category: "BUG",           // BUG | REGRESSION | SECURITY | CODE_QUALITY | CONCERN | etc.
      severity: "high",          // critical | high | medium | low
      title: "Short description",
      description: "Detailed explanation of what's wrong and why it matters.",
      location: { file: "src/path/to/file.ts" },
      reproducible: true,
      tags: ["your-monster", "relevant-tag"],
    });
    this.recordTest(false);
  } else {
    this.recordTest(true);
  }
}
```

### Dependency Flags

| Flag | When to set | Effect if unavailable |
|------|-------------|----------------------|
| `needsServer: true` | Monster calls `localhost:3000` | Auto-skips with reason |
| `needsBrowser: true` | Monster uses Playwright | Auto-skips with reason |
| Neither | Pure static analysis | Always runs |

---

## Step 4: Register in ALL_MONSTERS

**File:** `tests/qa/monsters/run-all.ts`

Add your monster to the `ALL_MONSTERS` array. Pick the right category:

```typescript
{
  id: "your-monster",
  name: "Your Monster",
  command: "npx ts-node tests/qa/monsters/your-monster/your-monster.ts",
  category: "medium",  // fast (<2s) | medium (<30s) | slow (>30s)
  description: "What it checks in 5 words",
  // needsServer: true,   // matches your BaseMonster config
  // needsBrowser: true,
},
```

**Categories:**
- `fast` — runs in pre-commit hook, must be <2s
- `medium` — runs in CI on every PR
- `slow` — runs in full/nightly suite only

Also update the comment at the top: `// MONSTER DEFINITIONS - ALL N MONSTERS` and the display strings `"all N monsters"`.

---

## Step 5: Add the npm Script

**File:** `package.json`

```json
"monsters:your-monster": "npx ts-node tests/qa/monsters/your-monster/your-monster.ts",
```

---

## Step 6: Update Documentation

### Required (every monster):

| File | What to add |
|------|-------------|
| `tests/qa/monsters/MONSTERS.md` | Row in the appropriate category table |
| `tests/qa/monsters/README.md` | Command in the quick-reference section + entry in the directory tree |

### Required (if applicable):

| File | When |
|------|------|
| `AGENTS.md` | Update the monster count + add to the "What to update" table |
| `.cursor/rules/docs-sync.mdc` | If your monster should be updated when certain code changes |

---

## Summary Checklist

Copy this into your PR description:

```
- [ ] Added type to `shared/types.ts` (MonsterType union)
- [ ] Added icon to `shared/reporter.ts` (MONSTER_ICONS record)
- [ ] Created monster file in `your-monster/your-monster.ts`
- [ ] Uses `recordCheck()` and `recordTest()` for every verification
- [ ] Uses `addFinding()` for every issue found
- [ ] Set `needsServer`/`needsBrowser` if required
- [ ] Added to `ALL_MONSTERS` in `run-all.ts` with correct category
- [ ] Updated monster count in `run-all.ts` comments and display strings
- [ ] Added npm script in `package.json`
- [ ] Added to `MONSTERS.md`
- [ ] Added to `README.md` (command + directory tree)
- [ ] Updated `AGENTS.md` monster count and update table
- [ ] Ran the monster standalone and verified it works
- [ ] Ran `npm run monsters:all --fast --static` to verify integration
```

---

## Common Patterns

### Static analysis monster (most common)

Reads source files, checks for patterns. No server or browser needed. Examples: `code-quality-monster`, `data-integrity-monster`, `css-lint-monster`.

### Server-dependent monster

Hits API endpoints. Set `needsServer: true`. Auto-skips if server is down. Examples: `api-monster`, `invariant-monster`, `guardian-monster`.

### Browser-dependent monster

Uses Playwright for UI testing. Set `needsBrowser: true`. Auto-skips if no browser available. Examples: `visual-monster`, `browser-monster`, `explorer-monster`.

### Hybrid monster

Does static checks first, then live checks if server is available. Don't set `needsServer` — handle the fallback yourself. Example: `contract-monster`.

---

## Anti-Patterns

- **Don't use `as any` for the monster type.** Add it to `MonsterType` properly.
- **Don't forget `recordCheck()`/`recordTest()`.** Without them, the monster shows "0 checks" in dead-weight analysis and gets flagged for removal.
- **Don't swallow errors silently.** If a check throws, let `BaseMonster` handle it — it will report the error as a finding.
- **Don't write to `issues.json` directly.** Use `addFinding()` from `BaseMonster` — it handles deduplication and persistence automatically.
- **Don't call `generateReport()` from your monster.** The `cli-runner` does this automatically after every run.
