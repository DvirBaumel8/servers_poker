# 🗂️ Monster Issues Report

**Last Updated:** 3/22/2026, 12:15:00 AM
**Database Version:** 1

## Summary

| Metric | Count |
|--------|-------|
| Total Issues Found | 53 |
| Open Issues | 44 |
| Resolved Issues | 9 |

### By Severity (Open Only)

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 3 |
| 🟡 Medium | 17 |
| 🟢 Low | 18 |

### By Source Monster

| Monster | Issues Found |
|---------|--------------|
| code-quality | 27 |
| browser-qa | 13 |
| quick-check | 7 |
| invariant | 4 |
| api | 2 |

---

## 🔴 Critical Issues

*All critical issues have been resolved!*

---

## 🟠 High Priority Issues

- **ISS-94C74582** [QUALITY] Low firstImpression score — /
- **ISS-312106BD** [QUALITY] Low cards score — /
- **ISS-FF47B1E0** [QUALITY] Low bettingUI score — /

---

## 🟡 Medium Priority Issues

- **ISS-C77C2D12** [CODE_QUALITY] unsafe-error-access: Unsafe access to error.message without instanceof Error chec...
- **ISS-279F5C17** [QUALITY] Low typography score
- **ISS-4AB8D848** [QUALITY] Low navigation score — /
- **ISS-20D8E09B** [QUALITY] Low playerSeats score — /
- **ISS-04EF5268** [QUALITY] Low timer score — /
- **ISS-64C6591B** [NAV] Missing 404 page — /invalid-url

---

## 🟢 Low Priority Issues

- hardcoded-timeout: Hardcoded timeout value: 5000ms. Consider using a named cons...
- console-log: console.log found in production code. Use the logger utility...
- hardcoded-timeout: Hardcoded timeout value: 5000ms. Consider using a named cons...
- hardcoded-timeout: Hardcoded timeout value: 2000ms. Consider using a named cons...
- console-log: console.log found in production code. Use the logger utility...
- hardcoded-timeout: Hardcoded timeout value: 5000ms. Consider using a named cons...
- hardcoded-timeout: Hardcoded timeout value: 2000ms. Consider using a named cons...
- hardcoded-timeout: Hardcoded timeout value: 1000ms. Consider using a named cons...
- hardcoded-timeout: Hardcoded timeout value: 8000ms. Consider using a named cons...
- hardcoded-timeout: Hardcoded timeout value: 3000ms. Consider using a named cons...

---

## ✅ Recently Resolved

### Critical Fixes (2026-03-22)

| Issue ID | Title | Resolution |
|----------|-------|------------|
| ISS-F35AF37B | INVARIANT VIOLATION: unique_cards_in_play | Fixed cardToString to handle strings and objects with missing rank. Added parseCard to properly parse cards from snapshots. Updated invariant monster to normalize card formats. |
| ISS-C2F1A018 | INVARIANT VIOLATION: valid_card_format | Fixed cardToString to handle strings and objects with missing rank. Added parseCard to properly parse cards from snapshots. Updated invariant monster to normalize card formats. |
| ISS-DA8E3A13 | INVARIANT VIOLATION: unique_cards_in_play | Fixed cardToString to handle strings and objects with missing rank. Added parseCard to properly parse cards from snapshots. Updated invariant monster to normalize card formats. |
| ISS-11C264C3 | INVARIANT VIOLATION: valid_card_format | Fixed cardToString to handle strings and objects with missing rank. Added parseCard to properly parse cards from snapshots. Updated invariant monster to normalize card formats. |
| ISS-7097EB0F | FLOW INVARIANT VIOLATION: unique_cards_in_play | Fixed cardToString to handle strings and objects with missing rank. Added parseCard to properly parse cards from snapshots. Updated game-flow-monster to normalize card formats. |
| ISS-245A4ECB | FLOW INVARIANT VIOLATION: valid_card_format | Fixed cardToString to handle strings and objects with missing rank. Added parseCard to properly parse cards from snapshots. Updated game-flow-monster to normalize card formats. |
| ISS-26711413 | React Crash: Admin Tournaments | Fixed Zustand selector in RequireAdmin component to use separate selectors instead of object selector causing getSnapshot infinite loop. |
| ISS-9A2BA228 | React Crash: Admin Analytics | Fixed Zustand selector in RequireAdmin component to use separate selectors instead of object selector causing getSnapshot infinite loop. |

### High Priority Fixes (2026-03-22)

| Issue ID | Title | Resolution |
|----------|-------|------------|
| ISS-C3D20C7F | Login Flow Crashed | Added name and autoComplete attributes to form inputs for proper Playwright identification. |
| ISS-031C96A1 | Registration Flow Crashed | Added name and autoComplete attributes to form inputs for proper Playwright identification. |
| ISS-0C206A7F | Admin Not Accessible: Admin Tournaments | Fixed by resolving React crash in RequireAdmin component. |
| ISS-1955275D | Admin Not Accessible: Admin Analytics | Fixed by resolving React crash in RequireAdmin component. |

### Medium Priority Fixes (2026-03-22)

| Issue ID | Title | Resolution |
|----------|-------|------------|
| ISS-5B9205AF | empty-catch: Empty catch block silently swallows errors | Added comments explaining intentional error swallowing during cleanup operations. |
| ISS-4F54B3F7 - ISS-DD12E7AD | Multiple empty-catch issues in E2E tests | Added comments explaining intentional error swallowing during cleanup operations. |

---

*Generated by Monster Issue Tracker*
