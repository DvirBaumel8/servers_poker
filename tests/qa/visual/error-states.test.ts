/**
 * Error State UI Tests
 * ====================
 *
 * Tests that verify error states are displayed correctly:
 * - API error responses
 * - Network failures
 * - Form validation errors
 * - 404 pages
 * - WebSocket disconnection
 * - Session expiration
 */

export interface ErrorStateConfig {
  baseUrl: string;
  backendUrl: string;
}

/**
 * Error states to test
 */
export const ERROR_STATES = {
  // API Errors
  API_404: {
    name: "API 404 - Resource Not Found",
    description: "When requesting a non-existent resource",
    triggerMethod: "Navigate to /game/non-existent-id",
    expectedUI: [
      "Error message displayed",
      "No crash or blank screen",
      "Back/home button available",
      "Clear explanation of what went wrong",
    ],
    severity: "major",
  },

  API_500: {
    name: "API 500 - Server Error",
    description: "When backend returns 500 error",
    triggerMethod: "Intercept API call and return 500",
    expectedUI: [
      "User-friendly error message (not technical)",
      "Retry button available",
      "No sensitive info exposed",
      "Option to report issue",
    ],
    severity: "major",
  },

  API_401: {
    name: "API 401 - Unauthorized",
    description: "When user's session expires",
    triggerMethod: "Clear auth token, make authenticated request",
    expectedUI: [
      "Redirect to login OR",
      "Session expired message",
      "Re-authentication prompt",
      "No data loss message if applicable",
    ],
    severity: "major",
  },

  API_403: {
    name: "API 403 - Forbidden",
    description: "When user lacks permissions",
    triggerMethod: "Access admin-only route as regular user",
    expectedUI: [
      "Access denied message",
      "Explanation of required permissions",
      "No technical error details",
      "Link to appropriate area",
    ],
    severity: "major",
  },

  API_429: {
    name: "API 429 - Rate Limited",
    description: "When user hits rate limit",
    triggerMethod: "Make many rapid requests",
    expectedUI: [
      "Rate limit message",
      "Indication of when to retry",
      "No service degradation",
    ],
    severity: "minor",
  },

  // Network Errors
  NETWORK_OFFLINE: {
    name: "Network Offline",
    description: "When device loses network connectivity",
    triggerMethod: "Disable network in browser devtools",
    expectedUI: [
      "Offline indicator",
      "Cached data still visible if available",
      "Auto-reconnect when online",
      "No silent failures",
    ],
    severity: "critical",
  },

  NETWORK_TIMEOUT: {
    name: "Network Timeout",
    description: "When request takes too long",
    triggerMethod: "Add network throttling to simulate slow connection",
    expectedUI: [
      "Loading indicator",
      "Timeout message after threshold",
      "Retry option",
      "Not stuck in infinite loading",
    ],
    severity: "major",
  },

  // WebSocket Errors
  WS_DISCONNECT: {
    name: "WebSocket Disconnected",
    description: "When WebSocket connection drops",
    triggerMethod: "Close WS connection server-side",
    expectedUI: [
      "Disconnection indicator",
      "Auto-reconnect attempt",
      "Reconnection status shown",
      "Game state preserved",
    ],
    severity: "critical",
  },

  WS_RECONNECTING: {
    name: "WebSocket Reconnecting",
    description: "During reconnection attempts",
    triggerMethod: "Simulate flaky connection",
    expectedUI: [
      "Reconnecting indicator",
      "Attempt count or progress",
      "Game still visible (cached state)",
      "Not blocking user interaction",
    ],
    severity: "major",
  },

  // Form Validation
  FORM_VALIDATION: {
    name: "Form Validation Errors",
    description: "When form has invalid input",
    triggerMethod: "Submit form with invalid data",
    expectedUI: [
      "Error messages near invalid fields",
      "Fields highlighted in red",
      "Clear explanation of what's wrong",
      "Focus moved to first error",
    ],
    severity: "major",
  },

  // Game-specific Errors
  GAME_FULL: {
    name: "Game Table Full",
    description: "When trying to join a full table",
    triggerMethod: "Attempt to join 9-player full table",
    expectedUI: [
      "Table full message",
      "Waitlist option if available",
      "Link to other tables",
    ],
    severity: "minor",
  },

  INSUFFICIENT_CHIPS: {
    name: "Insufficient Chips",
    description: "When player can't afford action",
    triggerMethod: "Try to raise more than chip stack",
    expectedUI: [
      "Insufficient chips message",
      "Show available balance",
      "All-in option highlighted",
    ],
    severity: "minor",
  },

  GAME_ENDED: {
    name: "Game Ended",
    description: "When accessing a completed game",
    triggerMethod: "Navigate to finished game",
    expectedUI: [
      "Game completed message",
      "Final results displayed",
      "Link to new games",
      "History preserved",
    ],
    severity: "minor",
  },

  // Loading States (not errors, but important)
  LOADING_INITIAL: {
    name: "Initial Page Load",
    description: "Loading state when page first loads",
    triggerMethod: "Navigate to page with slow connection",
    expectedUI: [
      "Skeleton loaders or spinners",
      "No content flash",
      "Proper loading hierarchy",
    ],
    severity: "minor",
  },

  LOADING_ACTION: {
    name: "Action Loading",
    description: "Loading state during user action",
    triggerMethod: "Submit form with slow backend",
    expectedUI: [
      "Button shows loading state",
      "Prevents double-submission",
      "Cancellable if long",
    ],
    severity: "minor",
  },
};

/**
 * AI Instructions for Error State Testing
 */
export function generateErrorTestInstructions(
  config: ErrorStateConfig = {
    baseUrl: "http://localhost:3001",
    backendUrl: "http://localhost:3000",
  },
): string {
  return `
# Error State UI Test Instructions

## Purpose
Verify that error states are handled gracefully and users see helpful messages.

## Setup
- Frontend: ${config.baseUrl}
- Backend: ${config.backendUrl}

## Test Categories

### 1. API Error Responses

#### Test 404 - Resource Not Found
1. Navigate to: ${config.baseUrl}/game/fake-id-that-does-not-exist
2. Take screenshot: error-404.png
3. Verify:
   - Error message is displayed (not blank screen)
   - Message is user-friendly
   - Navigation is still available

#### Test Session Expiration (401)
1. Navigate to a protected page while logged in
2. Clear localStorage/cookies to invalidate session
3. Trigger an API call (e.g., refresh the page)
4. Take screenshot: error-401.png
5. Verify:
   - Redirect to login OR session expired message
   - No jarring experience

### 2. Network Errors

#### Test Offline Mode
1. Navigate to any page
2. In DevTools, set network to Offline
3. Try to perform an action
4. Take screenshot: error-offline.png
5. Verify:
   - Offline indicator appears
   - Graceful handling (no crash)
   
#### Test Slow Network
1. In DevTools, throttle network to "Slow 3G"
2. Navigate to game table
3. Take screenshot during loading
4. Verify:
   - Loading indicators appear
   - Timeout handling if applicable

### 3. WebSocket Disconnection

#### Test WS Disconnect During Game
1. Navigate to active game table
2. Take screenshot: game-before-disconnect.png
3. Disconnect WebSocket (can simulate via DevTools)
4. Take screenshot: game-after-disconnect.png
5. Verify:
   - Disconnection indicator shown
   - Game state preserved
   - Reconnection attempted

### 4. Form Validation

#### Test Login Form Validation
1. Navigate to login page
2. Submit with empty fields
3. Take screenshot: validation-empty.png
4. Submit with invalid email format
5. Take screenshot: validation-invalid-email.png
6. Verify:
   - Error messages appear near fields
   - Fields are highlighted
   - Submit button behavior correct

#### Test Registration Form
1. Navigate to registration
2. Test various invalid inputs:
   - Password too short
   - Email already exists
   - Mismatched passwords
3. Screenshot each state
4. Verify all errors are clear and helpful

### 5. Game-Specific Errors

#### Test Full Table
1. Find or create a 9-player full table
2. Attempt to join
3. Take screenshot: error-table-full.png
4. Verify: Clear message and alternatives offered

#### Test Ended Game
1. Navigate to a completed game/tournament
2. Take screenshot: error-game-ended.png
3. Verify: Results shown, appropriate messaging

## Verification Checklist

For EACH error state, verify:

1. **Visibility**
   - [ ] Error is clearly visible
   - [ ] Not hidden in console only
   - [ ] Appropriate visual styling (color, icons)

2. **Clarity**
   - [ ] Message explains what happened
   - [ ] No technical jargon (no "500", "NaN", "undefined")
   - [ ] Actionable guidance provided

3. **Recovery**
   - [ ] User can recover (retry, go back, etc.)
   - [ ] Navigation still works
   - [ ] No stuck states

4. **Security**
   - [ ] No sensitive info in error messages
   - [ ] No stack traces visible
   - [ ] Auth errors don't leak info

5. **Accessibility**
   - [ ] Error messages are screen-reader friendly
   - [ ] Focus management correct
   - [ ] Color is not only indicator

## Common Issues to Find

1. **Blank/White Screen**: Page crashes and shows nothing
2. **Technical Messages**: "Error: Cannot read property 'x' of undefined"
3. **No Recovery Path**: User stuck with no way to proceed
4. **Infinite Loading**: Spinner that never resolves
5. **Silent Failure**: Action fails but no feedback given
6. **Console-Only Errors**: Errors logged but not shown to user
7. **Unstyled Errors**: Browser default error page shown

## Report Format

\`\`\`markdown
## Error State Test Report

### Critical Issues
[Errors that leave user completely stuck]

### Major Issues  
[Errors with poor messaging or recovery]

### Minor Issues
[Cosmetic or edge case issues]

### All Error States Tested
| Error | Status | Issues |
|-------|--------|--------|
| 404   | ✅/❌   | ...    |
| ...   | ...    | ...    |

### Screenshots
[List of screenshots taken]
\`\`\`
`;
}

/**
 * Specific test scenarios for AI
 */
export const ERROR_TEST_SCENARIOS = [
  {
    name: "Complete 404 Test",
    steps: [
      "Navigate to /game/xxxxx-fake-id",
      "Screenshot the result",
      "Check for: error message, navigation, no crash",
      "Navigate to /tournament/xxxxx-fake-id",
      "Screenshot the result",
      "Navigate to /user/xxxxx-fake-id",
      "Screenshot the result",
    ],
  },
  {
    name: "Network Resilience",
    steps: [
      "Navigate to game table",
      "Set network to offline in DevTools",
      "Try to perform an action (fold, bet)",
      "Screenshot the result",
      "Re-enable network",
      "Verify state recovers",
    ],
  },
  {
    name: "Form Validation Suite",
    steps: [
      "Go to login page",
      "Submit empty form - screenshot",
      "Enter invalid email - screenshot",
      "Enter short password - screenshot",
      "Go to registration",
      "Test password mismatch - screenshot",
      "Test existing email - screenshot",
    ],
  },
];

if (require.main === module) {
  console.log(generateErrorTestInstructions());
}
