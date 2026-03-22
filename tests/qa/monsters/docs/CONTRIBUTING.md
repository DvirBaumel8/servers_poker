# Contributing to QA Monster

## The Rule: No Feature Ships Without Monster Coverage

Every new feature, refactor, or significant change MUST include updates to the QA Monster framework.

## When to Update the Monster

| Change Type | Monster Update Required |
|-------------|------------------------|
| New page/route | Add to `PAGES` in `monster-config.ts` |
| New user flow | Add to `FLOWS` in `monster-config.ts` |
| New form/inputs | Add validation scenarios |
| New component | Add to relevant page's `interactiveElements` |
| New data states | Add to relevant page's `dataStates` |
| New API endpoint | Add error scenarios to `ERROR_STATES` |
| UI redesign | Update visual checks, take new baseline screenshots |
| New viewport support | Add to `VIEWPORTS` |

## Quick Reference: Where to Add What

### Adding a New Page

```typescript
// In monster-config.ts, add to PAGES array:
{
  path: '/your-new-page',
  name: 'Your New Page',
  requiresAuth: true,  // or false
  criticalFlows: ['main_action', 'secondary_action'],
  interactiveElements: ['button_x', 'form_y', 'link_z'],
  dataStates: ['loading', 'loaded', 'empty', 'error'],
}
```

### Adding a New User Flow

```typescript
// In monster-config.ts, add to FLOWS array:
{
  name: 'Your New Flow',
  description: 'What the user is trying to accomplish',
  steps: [
    'Step 1 description',
    'Step 2 description',
    // ... all steps
  ],
  expectedOutcome: 'What success looks like',
  edgeCases: [
    'What could go wrong #1',
    'What could go wrong #2',
    // Think of EVERYTHING
  ],
}
```

### Adding New Stress Inputs

```typescript
// In monster-config.ts, add to STRESS_INPUTS:
{
  yourNewInput: 'value that might break things',
}
```

## Checklist for Every PR

Before submitting a PR that touches UI or user flows:

- [ ] I added any new pages to `PAGES`
- [ ] I added any new flows to `FLOWS`
- [ ] I updated `interactiveElements` for affected pages
- [ ] I updated `dataStates` for affected pages
- [ ] I considered edge cases and added them to flows
- [ ] I ran `npm run qa:quick` to verify no regressions
- [ ] I documented any new patterns in findings format

## Running Monster Before PR

```bash
# Quick scan of affected pages
npm run qa:monster:page /your-page

# Full scan if touching shared components
npm run qa:monster

# Generate instructions for manual review
npm run qa:monster -- generate
```

## Example: Adding a "Bot Settings" Feature

Let's say you're adding a new Bot Settings page:

### 1. Add the page config

```typescript
// monster-config.ts
{
  path: '/bots/:id/settings',
  name: 'Bot Settings',
  requiresAuth: true,
  criticalFlows: ['update_endpoint', 'toggle_active', 'delete_bot'],
  interactiveElements: [
    'endpoint_input',
    'save_button',
    'active_toggle',
    'delete_button',
    'confirm_dialog',
  ],
  dataStates: ['loading', 'loaded', 'saving', 'error', 'deleted'],
}
```

### 2. Add the user flow

```typescript
// monster-config.ts
{
  name: 'Update Bot Settings',
  description: 'User modifies bot configuration',
  steps: [
    'Navigate to bots page',
    'Click on bot card',
    'Click settings button',
    'Modify endpoint URL',
    'Click save',
    'See success confirmation',
    'Verify changes persisted',
  ],
  expectedOutcome: 'Bot settings updated successfully',
  edgeCases: [
    'Invalid endpoint URL',
    'Endpoint that times out',
    'Endpoint that returns 500',
    'Empty endpoint',
    'Very long endpoint URL',
    'Back button while saving',
    'Network failure during save',
    'Concurrent edit by another session',
    'Bot deleted by admin while editing',
  ],
}
```

### 3. Think about visual states

- Loading spinner while fetching settings
- Form filled with current values
- Validation errors inline
- Save button disabled while saving
- Success toast after save
- Error toast on failure
- Delete confirmation modal
- Redirect after delete

### 4. Think about edge cases

- What if the bot doesn't exist?
- What if user loses permission while editing?
- What if endpoint validation fails on server?
- What if the save takes >5 seconds?
- What does the mobile layout look like?
- What happens at Galaxy Fold (280px)?

## Monster Philosophy Reminders

1. **Assume everything breaks** - Test the unhappy paths
2. **Think like a confused user** - What would trip them up?
3. **Think like a picky designer** - Is everything aligned?
4. **Have opinions** - "This feels wrong" is valid feedback
5. **Be relentless** - Every pixel, every interaction

## Updating Documentation

After running monster on new features:

1. Add findings to `docs/QA-MONSTER-REPORT-V*.md`
2. Track bugs in project management
3. Update `docs/KNOWLEDGE.md` with new patterns
4. Update component Storybook stories if applicable

---

Remember: **The Monster is your friend.** It finds bugs before users do.
