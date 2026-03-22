/**
 * Network Resilience Tests
 * ========================
 *
 * Tests for handling:
 * - Bot timeouts
 * - Slow responses
 * - Connection drops
 * - Partial failures
 * - Recovery scenarios
 */

import http from "http";

export interface ResilienceTestConfig {
  backendUrl: string;
  botServerPort: number;
  timeoutMs: number;
}

export const DEFAULT_RESILIENCE_CONFIG: ResilienceTestConfig = {
  backendUrl: "http://localhost:3000",
  botServerPort: 4100,
  timeoutMs: 10000,
};

/**
 * Fault injection modes for bot behavior
 */
export const FAULT_MODES = {
  NORMAL: "normal",
  SLOW_RESPONSE: "slow_response",
  TIMEOUT: "timeout",
  DISCONNECT: "disconnect",
  INVALID_RESPONSE: "invalid_response",
  RANDOM_FAILURE: "random_failure",
  INTERMITTENT: "intermittent",
};

/**
 * Creates a fault-injecting bot server
 */
export function createFaultInjectingBotServer(
  port: number,
  faultMode: string,
  config: { delayMs?: number; failureRate?: number } = {},
): http.Server {
  const { delayMs = 5000, failureRate = 0.3 } = config;
  let requestCount = 0;

  const server = http.createServer(async (req, res) => {
    requestCount++;
    let body = "";

    req.on("data", (chunk) => (body += chunk));

    req.on("end", async () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        console.log(
          `[FaultBot:${port}] Request #${requestCount}, mode: ${faultMode}`,
        );

        switch (faultMode) {
          case FAULT_MODES.SLOW_RESPONSE:
            // Respond, but slowly
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ action: "call" }));
            break;

          case FAULT_MODES.TIMEOUT:
            // Never respond (timeout)
            // Don't write anything, don't end response
            break;

          case FAULT_MODES.DISCONNECT:
            // Abruptly close connection
            res.socket?.destroy();
            break;

          case FAULT_MODES.INVALID_RESPONSE:
            // Return malformed response
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end("not valid json {{{");
            break;

          case FAULT_MODES.RANDOM_FAILURE:
            // Randomly fail
            if (Math.random() < failureRate) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Random failure" }));
            } else {
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ action: "call" }));
            }
            break;

          case FAULT_MODES.INTERMITTENT:
            // Works sometimes, fails sometimes with various errors
            const errorType = Math.floor(Math.random() * 4);
            if (Math.random() < failureRate) {
              switch (errorType) {
                case 0:
                  await new Promise((r) => setTimeout(r, delayMs * 2));
                  res.writeHead(200, { "Content-Type": "application/json" });
                  res.end(JSON.stringify({ action: "fold" }));
                  break;
                case 1:
                  res.socket?.destroy();
                  break;
                case 2:
                  res.writeHead(500);
                  res.end();
                  break;
                default:
                  // Timeout
                  break;
              }
            } else {
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ action: "call" }));
            }
            break;

          case FAULT_MODES.NORMAL:
          default:
            // Normal behavior
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ action: "call" }));
            break;
        }
      } catch (err) {
        console.error(`[FaultBot:${port}] Error:`, err);
        res.writeHead(500, { "Content-Type": "application/json" });
        // Only expose error message, not stack trace
        const message =
          err instanceof Error ? err.message : "Internal server error";
        res.end(JSON.stringify({ error: message }));
      }
    });
  });

  return server;
}

/**
 * Test scenarios for resilience testing
 */
export const RESILIENCE_SCENARIOS = [
  {
    name: "Single Bot Timeout",
    description: "One bot times out, game should continue",
    setup: {
      totalBots: 6,
      faultBots: [{ position: 2, mode: FAULT_MODES.TIMEOUT }],
    },
    expectedBehavior: [
      "Game doesn't hang",
      "Timed out bot is folded or skipped",
      "Other bots continue playing",
      "Hand completes normally",
    ],
    maxDuration: 30000,
  },
  {
    name: "Multiple Slow Bots",
    description: "Several bots respond slowly but within timeout",
    setup: {
      totalBots: 9,
      faultBots: [
        { position: 1, mode: FAULT_MODES.SLOW_RESPONSE, delayMs: 3000 },
        { position: 4, mode: FAULT_MODES.SLOW_RESPONSE, delayMs: 4000 },
        { position: 7, mode: FAULT_MODES.SLOW_RESPONSE, delayMs: 2000 },
      ],
    },
    expectedBehavior: [
      "Game runs slower but completes",
      "No premature timeouts",
      "Turn order maintained",
    ],
    maxDuration: 120000,
  },
  {
    name: "Bot Disconnect Mid-Hand",
    description: "Bot disconnects during their turn",
    setup: {
      totalBots: 4,
      faultBots: [{ position: 0, mode: FAULT_MODES.DISCONNECT }],
    },
    expectedBehavior: [
      "Disconnected bot handled gracefully",
      "Game continues with remaining players",
      "No stuck state",
    ],
    maxDuration: 30000,
  },
  {
    name: "Intermittent Network",
    description: "Simulates flaky network conditions",
    setup: {
      totalBots: 6,
      faultBots: [
        { position: 0, mode: FAULT_MODES.INTERMITTENT, failureRate: 0.3 },
        { position: 1, mode: FAULT_MODES.INTERMITTENT, failureRate: 0.3 },
        { position: 2, mode: FAULT_MODES.INTERMITTENT, failureRate: 0.3 },
      ],
    },
    expectedBehavior: [
      "Game recovers from failures",
      "Successful responses processed",
      "Failures handled with fallback actions",
    ],
    maxDuration: 60000,
  },
  {
    name: "All Bots Timeout",
    description: "Worst case - all bots stop responding",
    setup: {
      totalBots: 4,
      faultBots: [
        { position: 0, mode: FAULT_MODES.TIMEOUT },
        { position: 1, mode: FAULT_MODES.TIMEOUT },
        { position: 2, mode: FAULT_MODES.TIMEOUT },
        { position: 3, mode: FAULT_MODES.TIMEOUT },
      ],
    },
    expectedBehavior: [
      "Game doesn't hang indefinitely",
      "Error state or game end triggered",
      "Resources cleaned up",
    ],
    maxDuration: 60000,
  },
  {
    name: "Invalid Response Handling",
    description: "Bots return malformed responses",
    setup: {
      totalBots: 6,
      faultBots: [
        { position: 1, mode: FAULT_MODES.INVALID_RESPONSE },
        { position: 3, mode: FAULT_MODES.INVALID_RESPONSE },
      ],
    },
    expectedBehavior: [
      "Invalid responses rejected",
      "Default action applied (fold)",
      "No crash or undefined behavior",
    ],
    maxDuration: 30000,
  },
  {
    name: "Recovery After Failure",
    description: "Bot fails once then recovers",
    setup: {
      totalBots: 4,
      faultBots: [
        { position: 0, mode: FAULT_MODES.RANDOM_FAILURE, failureRate: 0.5 },
      ],
    },
    expectedBehavior: [
      "Failed attempts handled",
      "Successful retries processed",
      "Game state remains consistent",
    ],
    maxDuration: 60000,
  },
];

/**
 * AI Instructions for Resilience Testing
 */
export function generateResilienceTestInstructions(
  config = DEFAULT_RESILIENCE_CONFIG,
): string {
  return `
# Network Resilience Test Instructions

## Purpose
Test that the poker system handles network failures gracefully:
- Bot timeouts
- Slow responses
- Disconnections
- Invalid responses

## Manual Testing Approach

### Scenario 1: Bot Timeout
1. Create a game with bots
2. One bot server stops responding
3. Observe: Does the game hang? Does it skip/fold the bot?
4. Expected: Game continues within timeout period

### Scenario 2: Slow Bot
1. Create a game
2. One bot responds after 3-4 seconds (but under timeout)
3. Observe: Does the game wait appropriately?
4. Expected: Action accepted, game continues

### Scenario 3: Invalid Response
1. Create a game
2. Bot returns malformed JSON
3. Observe: How is it handled?
4. Expected: Default action (fold), game continues

## Automated Test Setup

### Step 1: Start Fault-Injecting Bot Servers

Start multiple bot servers with different fault modes:

\`\`\`typescript
// Normal bot on port 4100
createFaultInjectingBotServer(4100, 'normal');

// Slow bot on port 4101 (3 second delay)
createFaultInjectingBotServer(4101, 'slow_response', { delayMs: 3000 });

// Timeout bot on port 4102
createFaultInjectingBotServer(4102, 'timeout');

// Disconnect bot on port 4103
createFaultInjectingBotServer(4103, 'disconnect');
\`\`\`

### Step 2: Create Bots in Database

Register bots pointing to these servers:
- bot_normal -> http://localhost:4100
- bot_slow -> http://localhost:4101
- bot_timeout -> http://localhost:4102
- bot_disconnect -> http://localhost:4103

### Step 3: Create Game/Tournament

Create a tournament with these bots registered

### Step 4: Start and Monitor

Start the tournament and observe behavior:
- Use browser to watch game table
- Monitor backend logs for errors
- Check game state API

## Expected Behaviors

### Timeout Handling
- Bot should be folded after X seconds
- Turn should move to next player
- Log should indicate timeout

### Slow Response Handling
- Action accepted if within timeout
- No premature skipping
- UI shows waiting indicator

### Disconnection Handling
- Connection error logged
- Bot marked as disconnected
- Fold action applied

### Invalid Response Handling
- Parse error logged
- Default action (fold) applied
- Game continues normally

## Metrics to Capture

1. **Recovery Time**: How long to handle failure and continue
2. **Error Rate**: Percentage of hands affected
3. **State Consistency**: No orphaned games or invalid states
4. **Resource Cleanup**: Memory/connections released

## Test Scenarios

${RESILIENCE_SCENARIOS.map(
  (s, i) => `
### ${i + 1}. ${s.name}
${s.description}

Setup: ${s.setup.totalBots} bots, ${s.setup.faultBots.length} with faults

Expected:
${s.expectedBehavior.map((b) => `- ${b}`).join("\n")}

Max duration: ${s.maxDuration}ms
`,
).join("")}

## Report Format

\`\`\`markdown
## Network Resilience Test Report

### Scenario Results
| Scenario | Status | Recovery Time | Notes |
|----------|--------|---------------|-------|
| Bot Timeout | ✅/❌ | Xms | ... |

### Failures Observed
- [List any unexpected behaviors]

### Recommendations
- [Suggested improvements]
\`\`\`
`;
}

/**
 * Run resilience test scenario
 */
export async function runResilienceScenario(
  scenario: (typeof RESILIENCE_SCENARIOS)[0],
  config = DEFAULT_RESILIENCE_CONFIG,
): Promise<{
  success: boolean;
  duration: number;
  errors: string[];
  observations: string[];
}> {
  const errors: string[] = [];
  const observations: string[] = [];
  const startTime = Date.now();

  console.log(`\n=== Running: ${scenario.name} ===`);
  console.log(scenario.description);

  const servers: http.Server[] = [];

  try {
    // Start fault-injecting bot servers
    for (let i = 0; i < scenario.setup.totalBots; i++) {
      const faultBot = scenario.setup.faultBots.find((f) => f.position === i);
      const port = config.botServerPort + i;
      const mode = faultBot?.mode || FAULT_MODES.NORMAL;
      const serverConfig = {
        delayMs: (faultBot as any)?.delayMs,
        failureRate: (faultBot as any)?.failureRate,
      };

      const server = createFaultInjectingBotServer(port, mode, serverConfig);
      server.listen(port);
      servers.push(server);
      observations.push(
        `Started bot server on port ${port} with mode: ${mode}`,
      );
    }

    // Wait for servers to be ready
    await new Promise((r) => setTimeout(r, 500));

    // Here you would:
    // 1. Create bots in database pointing to these ports
    // 2. Create a game/tournament
    // 3. Start the game
    // 4. Monitor for the expected behaviors

    observations.push("Bot servers running, ready for game creation");

    // Simulate waiting for game completion
    const maxWait = Math.min(scenario.maxDuration, 30000);
    await new Promise((r) => setTimeout(r, maxWait));
  } catch (err) {
    errors.push(`Scenario error: ${err}`);
  } finally {
    // Cleanup
    for (const server of servers) {
      server.close();
    }
  }

  const duration = Date.now() - startTime;
  const success = errors.length === 0;

  return { success, duration, errors, observations };
}

if (require.main === module) {
  console.log(generateResilienceTestInstructions());
}
