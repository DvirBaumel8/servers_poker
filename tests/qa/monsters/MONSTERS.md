# 🦸 Monster Army - Complete Documentation

**Last Updated:** March 2026

A comprehensive QA system with 21+ monsters that find bugs, critique quality, compare to competitors, and continuously improve.

---

## Quick Reference

```bash
# ⚡ FAST (< 5 seconds) - Run these often!
npm run monsters:quick-check     # Bugs + Quality in one shot (< 1 sec)
npm run monsters:browser:fast    # Fast bug scan (< 1 sec)
npm run monsters:quality:fast    # Fast quality score (< 1 sec)

# 📊 FULL ANALYSIS (1-10 minutes)
npm run monsters:browser-qa      # Comprehensive 14-phase UI testing
npm run monsters:quality         # Full quality critique with competitor analysis

# 🦸 SELF-IMPROVING
npm run monsters:superhero       # Run → Find → Fix → Repeat loop

# 🗂️ ISSUE TRACKING
npm run monsters:issues          # Show all issues summary
npm run monsters:issues:report   # Generate markdown report
npm run monsters:issues:clear    # Clear all issues
```

---

## Monster Categories

### 🌐 Browser Monsters (UI Testing)

| Monster | Command | Time | Purpose |
|---------|---------|------|---------|
| **Quick Check** | `monsters:quick-check` | < 1s | Combined bugs + quality score |
| **Fast Browser** | `monsters:browser:fast` | < 1s | Quick bug detection |
| **Fast Quality** | `monsters:quality:fast` | < 1s | Quick quality score |
| **Browser QA** | `monsters:browser-qa` | ~10m | Comprehensive 14-phase testing |
| **Product Quality** | `monsters:quality` | ~1m | Full critique + competitor comparison |
| **Design Critic** | - | - | Visual design analysis |
| **CSS Lint** | - | - | CSS issues detection |
| **Layout Lint** | - | - | Layout problems |

### 🔌 API & Backend Monsters

| Monster | Purpose |
|---------|---------|
| **API Monster** | API endpoint testing, contracts, auth |
| **Contract Monster** | API contract validation |
| **Invariant Monster** | Poker game rule validation |
| **E2E Monster** | End-to-end flow testing |

### 🎮 Flow Monsters

| Monster | Purpose |
|---------|---------|
| **Game Flow Monster** | Complete hand play scenarios |
| **Tournament Flow Monster** | Tournament lifecycle testing |
| **Simulation Monster** 🎰 | Professional QA - runs real games, validates invariants, compares to industry standards |

### 🔒 Security & Stability

| Monster | Purpose |
|---------|---------|
| **Guardian Monster** | Security checks (XSS, injection) |
| **Chaos Monster** | Chaos/stress testing |

### 📊 Analysis Monsters

| Monster | Purpose |
|---------|---------|
| **Code Quality Monster** | Code quality analysis |
| **Visual Monster** | Visual regression testing |

### 🛠️ Infrastructure

| Monster | Purpose |
|---------|---------|
| **Superhero Monster** | Self-improving loop |
| **Issue Tracker** | Unified issue database |

---

## Quick Check - The Daily Driver

The most important command for daily development:

```bash
npm run monsters:quick-check
```

**What it does in < 1 second:**
1. Checks home page for bugs and quality
2. Checks game interface for poker-specific issues
3. Checks mobile responsiveness
4. Saves issues to unified tracker
5. Prints summary with scores

**Output:**
```
⏱️  Completed in 0.9s

🐛 BUGS: 0 found
   ✅ No bugs detected!

🎨 QUALITY: 4/10 (C)
   Visual   ████░░░░░░ 4/10
   UX       █░░░░░░░░░ 1/10
   Game     ██░░░░░░░░ 2/10
   Polish   █████████░ 9/10
```

---

## Browser QA Monster - The Comprehensive One

```bash
npm run monsters:browser-qa
```

**14 Testing Phases:**

1. **Public Pages** - All 8 public routes
2. **Authentication Flows** - Login, register, forgot password, logout
3. **Authenticated Pages** - Profile, user-specific content
4. **Admin Pages** - Admin-only dashboards
5. **Interactive Elements** - Every button, link, input
6. **Form Testing** - Validation, submission
7. **Input Fuzzing** - SQL injection, XSS, boundaries
8. **Tournament Flows** - List, detail, creation
9. **Game View** - WebSocket, real-time UI
10. **Responsive Design** - 8 viewports (mobile to 2K)
11. **Navigation** - All links, back/forward
12. **Error States** - Offline, API errors
13. **Accessibility** - Alt text, labels, focus
14. **Performance** - Load times, DOM size

---

## Product Quality Monster - The Harsh Critic

```bash
npm run monsters:quality
```

**What it critiques:**

### Visual Design
- Typography (custom fonts vs system fonts)
- Color scheme and branding
- Animations and micro-interactions
- Poker table design
- Playing card design

### User Experience
- Navigation clarity
- Loading states
- Error message quality
- Mobile experience
- Empty states

### Game Interface
- Betting UI (slider, quick buttons)
- Pot display
- Action timer
- Player seat design

### Competitive Analysis
- Feature parity with PokerStars, GGPoker
- First impression (5-second test)
- What competitors do that we don't

**Output includes:**
- Score per category (0-10)
- Letter grade (A+ to F)
- Top priorities to fix
- Competitor gaps
- Quick wins

---

## Unified Issue Tracker

All monsters feed into one central database:

**File:** `tests/qa/monsters/shared/issues.json`

**Features:**
- Deduplication by fingerprint
- Tracks first seen, last seen, occurrences
- Status: open, in_progress, resolved, wont_fix
- Source tracking (which monster found it)
- Severity levels: critical, high, medium, low

**Commands:**
```bash
npm run monsters:issues          # Summary
npm run monsters:issues:report   # Full markdown report
npm run monsters:issues:clear    # Reset
```

---

## Speed Optimization

We have two versions of key monsters:

| Full Version | Fast Version | Speedup |
|--------------|--------------|---------|
| `browser-qa` (~10 min) | `browser:fast` (< 1s) | 600x |
| `quality` (~1 min) | `quality:fast` (< 1s) | 100x |

**How fast versions work:**
1. Batch evaluations (one `evaluate()` checks many things)
2. Parallel browser contexts
3. Smart sampling (critical paths only)
4. `domcontentloaded` instead of `networkidle`
5. Fewer viewports (2 vs 8)

---

## Simulation Monster - The Professional QA Tester 🎰

The **most important testing tool** in the project. Acts like a senior QA engineer + product manager.

```bash
npm run monsters:simulation           # Standard mode (~90s)
npm run monsters:simulation:quick     # Quick mode (~30s, CI-friendly)
npm run monsters:simulation:thorough  # Thorough mode (~5-10min)
```

**7 Simulation Scenarios:**

| Scenario | Players | Purpose | Duration |
|----------|---------|---------|----------|
| Heads-Up | 2 | Basic cash game validation | ~10s |
| Single-Table | 6 | Core tournament mechanics | ~30s |
| Multi-Table | 18 | Table balancing, breaks | ~60s |
| Chaos | 4 | Failures, disconnects, timeouts | ~30s |
| Edge-Cases | 3 | Poker edge cases | ~15s |
| All-In Showdown | 2 | Showdown logic | ~10s |
| Split-Pot | 4 | Side pot logic | ~20s |

**Run Modes:**

| Mode | Scenarios | Duration | Use Case |
|------|-----------|----------|----------|
| `--quick` | heads-up, all-in | ~30s | CI, quick validation |
| Standard | + single-table, edge-cases | ~90s | Daily, PR validation |
| `--thorough` | All 7 scenarios | ~5-10min | Release, nightly |

**What it validates:**
- **19,000+ invariants** per run (money, cards, actions, state)
- **Performance metrics** vs industry standards (PokerStars, GGPoker)
- **UX observations** (timing, short stacks, flow)
- **Stage transitions** (preflop → flop → turn → river)

**Bot Personalities:**
- `tight-passive`, `tight-aggressive`, `loose-passive`, `loose-aggressive`
- `all-in-maniac`, `timeout-bot`, `disconnect-bot` (chaos testing)

**Output:**
```
══════════════════════════════════════════════════════════════
                 PROFESSIONAL QA SIMULATION REPORT
══════════════════════════════════════════════════════════════

📋 EXECUTIVE SUMMARY
────────────────────────────────────────
Mode: STANDARD
Total Runtime: 87.3s
Scenarios Run: 4
Total Hands Played: 95
Total States Validated: 1247
Invariants Checked: 18705
Invariant Violations: 0

📊 SCENARIO RESULTS
────────────────────────────────────────
✅ Heads-Up Cash Game: 20 hands, 0 violations (12.1s)
✅ Single Table Tournament: 45 hands, 0 violations (42.3s)
✅ Edge Case Testing: 15 hands, 0 violations (15.8s)
✅ All-In Showdown: 10 hands, 0 violations (8.1s)

⏱️  PERFORMANCE METRICS
────────────────────────────────────────
Avg Hand Duration: 892ms
Max Hand Duration: 2341ms

📈 COMPETITIVE ANALYSIS (vs Industry Standards)
────────────────────────────────────────
Turn Timeout: 15000ms recommended
Max Players/Table: 10 (industry standard)
Error Rate Target: < 0.1%
```

---

## Superhero Monster - Self-Improving Loop

```bash
npm run monsters:superhero
```

**The Loop:**
1. **Run** Browser QA Monster
2. **Analyze** findings (new vs recurring vs regression)
3. **Auto-fix** what it can
4. **Learn** from the run
5. **Repeat** up to 5 iterations

**Auto-Fix Capabilities:**
- Add aria-labels to inputs/buttons
- Fix horizontal overflow
- Add required validation
- Generate fix suggestions for complex issues

---

## When to Run What

| Situation | Command | Time |
|-----------|---------|------|
| Before every commit | `monsters:quick-check` | < 1s |
| During development | `monsters:quick-check` | < 1s |
| Before PR | `monsters:simulation:quick` | ~30s |
| Code review | `monsters:quality:fast` | < 1s |
| Game logic changes | `monsters:simulation` | ~90s |
| Weekly deep check | `monsters:simulation:thorough` | ~5-10m |
| UI redesign | `monsters:quality` | ~1m |
| After fixing bugs | `monsters:quick-check` | < 1s |

---

## CI Integration

Add to your CI pipeline:

```yaml
# Fast check on every push
- name: Quick Monster Check
  run: npm run monsters:quick-check

# Full check on PRs
- name: Full Monster Check  
  run: npm run monsters:browser-qa
```

Exit codes:
- `0` - Passed
- `1` - Failed (critical/high issues found)

---

## File Structure

```
tests/qa/monsters/
├── browser-monster/
│   ├── browser-qa-monster.ts      # Comprehensive UI testing
│   ├── fast-browser-monster.ts    # Fast bug detection
│   ├── product-quality-monster.ts # Quality critique
│   ├── fast-quality-monster.ts    # Fast quality score
│   ├── quick-check.ts             # Combined quick check
│   ├── superhero-monster.ts       # Self-improving loop
│   ├── auto-fixer.ts              # Auto-fix logic
│   └── reports/                   # Generated reports
├── shared/
│   ├── issue-tracker.ts           # Unified issue database
│   ├── issues.json                # Issue database
│   ├── ISSUES-REPORT.md           # Generated report
│   ├── base-monster.ts            # Base class
│   ├── types.ts                   # Type definitions
│   └── reporter.ts                # Report generation
├── api-monster/                   # API testing
├── invariant-monster/             # Poker rules
├── flow-monster/                  # User flows
├── chaos-monster/                 # Stress testing
├── guardian-monster/              # Security
└── README.md                      # This file
```

---

## Best Practices

1. **Run `quick-check` constantly** - It's < 1 second, use it!
2. **Check issues daily** - `npm run monsters:issues`
3. **Fix critical/high first** - They block quality
4. **Use quality monster for design decisions** - It compares to competitors
5. **Run full browser-qa weekly** - Catches edge cases
6. **Keep the issue database clean** - Resolve fixed issues

---

## Adding New Checks

To add a new check to the quick-check:

1. Edit `quick-check.ts`
2. Add to the `MEGA_CHECK` evaluation script
3. Add scoring logic
4. Map to issue tracker category

To create a new monster:

1. Create `new-monster.ts` in appropriate folder
2. Extend `BaseMonster` or create standalone class
3. Implement `run()` method returning findings
4. Add `addIssue()` calls to feed tracker
5. Add npm script to `package.json`

---

*Zero bugs. Always improving. Beat the competition.*
