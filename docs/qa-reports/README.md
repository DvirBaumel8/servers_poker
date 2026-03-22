# QA Monster Army Reports

This folder contains the **latest** QA Monster Army report.

## Files

| File | Description |
|------|-------------|
| `LATEST-REPORT.md` | Human-readable report from the most recent monster run |
| `LATEST-REPORT.json` | Machine-readable JSON data for tooling/CI |

## How It Works

Every time you run the Monster Army, these files are **overwritten** with the latest results. This ensures you always see the current state of the codebase without hunting through timestamped folders.

## Quick Commands

```bash
# Run quick validation (API + Invariant + Contract + CSS)
npm run monsters:quick

# Run all monsters
npm run monsters:all

# Run specific monsters
npm run monsters -- api design-critic css-lint

# Run design critique only
npm run monsters:design-critic
```

## Archive

Historical reports are still saved in `tests/qa/monsters/reports/<run-id>/` for debugging purposes, but the primary report is always here.

## Report Sections

The report includes:
- **Summary** - Overall pass/fail and severity counts
- **Monster Results** - Per-monster breakdown
- **Changes from Previous Run** - New findings, regressions, and fixes
- **Detailed Findings** - Full descriptions with reproduction steps
