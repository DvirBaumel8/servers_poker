# QA Monster - Bug Ownership & Accountability

## The Problem You Identified

> "Warnings accumulate and no one will fix them"

This is a real risk. Here's how we prevent it.

---

## Ownership Rules

### Critical Issues (🔴)
**Owner:** PR author
**Rule:** MERGE BLOCKED until fixed
**Timeline:** Must fix before merge

### High Issues (🟠)
**Owner:** PR author (if they introduced it) OR assigned during sprint planning
**Rule:** Creates GitHub issue automatically, labeled `qa-monster:high`
**Timeline:** Must be in current sprint backlog

### Medium Issues (🟡)
**Owner:** Assigned during weekly QA review
**Rule:** Creates GitHub issue, labeled `qa-monster:medium`
**Timeline:** Must be addressed within 2 sprints

### Low Issues (🟢) & Opinions (💭)
**Owner:** Whoever picks it up
**Rule:** Added to backlog, triaged monthly
**Timeline:** No hard deadline, but tracked

---

## Automatic Issue Creation

When the monster finds issues, GitHub issues are created automatically:

```
Title: [QA-Monster] {severity}: {title}
Labels: qa-monster, qa-monster:{severity}, needs-triage
Assignee: (PR author for critical/high, unassigned for medium/low)
Body: Full details from monster report
```

---

## Weekly QA Review Meeting (15 min)

Every Monday:
1. Review new monster issues from past week
2. Assign owners to unassigned issues
3. Check progress on existing issues
4. Celebrate closed issues

**Attendees:** 1 dev per team rotation (not the whole team)

---

## Metrics We Track

| Metric | Target | Alert If |
|--------|--------|----------|
| Open critical issues | 0 | Any > 0 |
| Open high issues | < 5 | > 10 |
| Issues > 2 weeks old | < 10 | > 20 |
| Issues closed this week | > 0 | 0 for 2 weeks |

---

## Preventing Accumulation

### 1. Issue Aging Alerts
Issues older than 2 weeks get:
- Slack notification to owner
- Label `stale`
- CC to tech lead

### 2. Sprint Planning Integration
Before sprint planning:
- Bot posts summary of open QA issues
- Forces discussion of tech debt

### 3. Monthly QA Debt Budget
Reserve 10% of sprint capacity for QA debt:
- 2 days per 2-week sprint
- Non-negotiable
- Prioritize oldest/highest severity

### 4. Ownership Escalation
```
Week 1: Issue assigned → Owner notified
Week 2: No progress → Owner reminded
Week 3: No progress → Tech lead notified
Week 4: No progress → Blocking future PRs from owner
```

---

## Who Fixes What

| Found During | Severity | Who Fixes |
|--------------|----------|-----------|
| PR check | Critical | PR author (blocks merge) |
| PR check | High | PR author (should fix) |
| PR check | Medium/Low | Goes to backlog |
| Nightly scan | Any | Assigned in weekly review |
| Manual run | Any | Whoever ran it triages |

---

## Definition of "Fixed"

An issue is fixed when:
1. Code change merged
2. Monster re-run passes
3. Issue closed with PR link

NOT fixed by:
- "Won't fix" without discussion
- Closing without PR
- Ignoring

---

## Exceptions Process

Sometimes we ship with known issues. That's OK if:

1. Issue is documented in PR description
2. Tech lead approves in writing
3. Follow-up issue created with deadline
4. Issue labeled `accepted-risk`

---

## Gamification (Optional)

Make it fun:
- 🏆 "Monster Slayer" badge for most issues fixed
- 📊 Weekly leaderboard
- 🎉 Celebration when backlog hits 0
