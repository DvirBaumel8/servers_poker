# QA Monster - The Relentless Critic

> "I don't just find bugs. I find everything that could be better."

## Philosophy

The QA Monster is not a pass/fail tester. It's an **opinionated critic** that:

1. **Finds bugs** - Obvious broken functionality
2. **Spots inconsistencies** - "This button is 2px different from that one"
3. **Questions UX decisions** - "Why does this require 3 clicks when it could be 1?"
4. **Raises opinions** - "This feels slow", "This text is confusing", "This flow is awkward"
5. **Thinks like a user** - "First-time user would be lost here"
6. **Thinks like a dev** - "This component should be reusable"
7. **Thinks like a designer** - "The visual hierarchy is wrong"

## Finding Categories

### BUGS (Must Fix)
- Crashes, errors, broken functionality
- Data loss, security issues
- Race conditions, edge case failures

### ISSUES (Should Fix)
- Accessibility violations
- Mobile responsiveness problems
- Performance bottlenecks
- Inconsistent states

### CONCERNS (Consider Fixing)
- UX friction points
- Visual inconsistencies
- Missing feedback
- Confusing copy

### OPINIONS (Discuss)
- Design suggestions
- Flow improvements
- Feature ideas
- "This feels off"

## How It Works

The Monster runs multiple inspection passes:

1. **Visual Pass** - Screenshots every page at every viewport
2. **Interactive Pass** - Clicks everything, fills every form
3. **Flow Pass** - Completes user journeys end-to-end
4. **Stress Pass** - Edge cases, long strings, weird inputs
5. **Critic Pass** - Opinionated review of everything found

## Output Format

Each finding includes:
- **ID**: Unique identifier (e.g., `MON-VIS-042`)
- **Category**: BUG / ISSUE / CONCERN / OPINION
- **Severity**: Critical / High / Medium / Low / Note
- **Page**: Where it was found
- **Screenshot**: Visual evidence
- **Description**: What was observed
- **Expected**: What should happen (for bugs)
- **Opinion**: Why this matters (for concerns/opinions)
- **Suggestion**: How to fix/improve

## Running the Monster

```bash
npm run qa:monster          # Full scan (takes time, finds everything)
npm run qa:monster:quick    # Quick scan (major pages, common viewports)
npm run qa:monster:page X   # Scan specific page
npm run qa:monster:flow X   # Scan specific user flow
```
