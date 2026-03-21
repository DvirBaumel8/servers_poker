/**
 * QA Monster - Live Tournament Test
 * ==================================
 *
 * This script creates and runs a tournament against the LIVE server
 * so we can watch the UI while it runs and test:
 * - 9-player table layouts
 * - Card/name overlaps
 * - Real-time WebSocket updates
 * - Late registration
 * - Player disconnection simulation
 * - Table consolidation
 * - Winner animations
 *
 * Run with: npx ts-node tests/qa-monster/live-tournament-test.ts
 */

import * as http from "http";
import * as WebSocket from "ws";

const API_BASE = "http://localhost:3000";
const WS_URL = "ws://localhost:3000";
const FRONTEND_URL = "http://localhost:3001";

interface TournamentConfig {
  name: string;
  playerCount: number;
  buyIn: number;
  startingChips: number;
  playersPerTable: number;
  lateRegEnabled: boolean;
  rebuysEnabled: boolean;
  turnTimeoutMs: number;
}

interface BotPersonality {
  name: string;
  style: "aggressive" | "passive" | "random" | "tight" | "loose";
  disconnectChance: number; // 0-1, probability of simulating disconnect
}

const PERSONALITIES: BotPersonality[] = [
  { name: "AggroKing", style: "aggressive", disconnectChance: 0.02 },
  { name: "TightMike", style: "tight", disconnectChance: 0.01 },
  { name: "LooseGoose", style: "loose", disconnectChance: 0.05 },
  { name: "RandomRob", style: "random", disconnectChance: 0.03 },
  { name: "PassivePat", style: "passive", disconnectChance: 0.02 },
  { name: "CallStation", style: "passive", disconnectChance: 0.01 },
  { name: "BluffMaster", style: "aggressive", disconnectChance: 0.04 },
  { name: "NittyNate", style: "tight", disconnectChance: 0.01 },
  { name: "ManiacMax", style: "loose", disconnectChance: 0.06 },
  { name: "CalculatedCal", style: "tight", disconnectChance: 0.02 },
];

class LiveTournamentTest {
  private adminToken: string = "";
  private tournamentId: string = "";
  private botIds: string[] = [];
  private wsConnections: Map<string, WebSocket> = new Map();
  private tableStates: Map<string, any> = new Map();
  private findings: any[] = [];

  constructor(private config: TournamentConfig) {}

  private log(message: string): void {
    const timestamp = new Date().toISOString().slice(11, 19);
    console.log(`[${timestamp}] ${message}`);
  }

  private async apiRequest(
    method: string,
    path: string,
    body?: any,
    token?: string,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, API_BASE);
      const options = {
        hostname: url.hostname,
        port: url.port || 3000,
        path: url.pathname,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      };

      const req = http.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      });

      req.on("error", reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async loginAsAdmin(): Promise<void> {
    this.log("Logging in as admin...");
    const result = await this.apiRequest("POST", "/api/v1/auth/login", {
      email: "admin@poker.io",
      password: "adminpass123",
    });

    if (result.access_token) {
      this.adminToken = result.access_token;
      this.log("Admin login successful");
    } else {
      throw new Error(`Admin login failed: ${JSON.stringify(result)}`);
    }
  }

  async createTournament(): Promise<void> {
    this.log(`Creating tournament: ${this.config.name}`);

    const result = await this.apiRequest(
      "POST",
      "/api/v1/tournaments",
      {
        name: this.config.name,
        type: "rolling",
        buy_in: this.config.buyIn,
        starting_chips: this.config.startingChips,
        min_players: 10,
        max_players: 50,
        players_per_table: this.config.playersPerTable,
        turn_timeout_ms: this.config.turnTimeoutMs,
        late_reg_ends_level: this.config.lateRegEnabled ? 4 : 0,
        rebuys_allowed: this.config.rebuysEnabled,
      },
      this.adminToken,
    );

    if (result.id) {
      this.tournamentId = result.id;
      this.log(`Tournament created: ${this.tournamentId}`);
    } else {
      throw new Error(`Tournament creation failed: ${JSON.stringify(result)}`);
    }
  }

  async registerBots(): Promise<void> {
    this.log(`Registering ${this.config.playerCount} bots...`);

    // Get existing bots
    const bots = await this.apiRequest("GET", "/api/v1/bots");

    if (!Array.isArray(bots) || bots.length < this.config.playerCount) {
      throw new Error(
        `Not enough bots available. Need ${this.config.playerCount}, have ${bots?.length || 0}`,
      );
    }

    // Register bots for tournament
    const botsToRegister = bots.slice(0, this.config.playerCount);
    let registered = 0;
    const lateRegCount = Math.floor(this.config.playerCount * 0.2); // 20% for late reg

    for (let i = 0; i < botsToRegister.length; i++) {
      const bot = botsToRegister[i];

      // Reserve some for late registration
      if (
        i >= this.config.playerCount - lateRegCount &&
        this.config.lateRegEnabled
      ) {
        this.botIds.push(bot.id); // Store but don't register yet
        continue;
      }

      try {
        await this.apiRequest(
          "POST",
          `/api/v1/tournaments/${this.tournamentId}/register`,
          { botId: bot.id },
          this.adminToken,
        );
        this.botIds.push(bot.id);
        registered++;
      } catch (e) {
        this.log(`Failed to register bot ${bot.name}: ${e}`);
      }
    }

    this.log(
      `Registered ${registered} bots (${lateRegCount} reserved for late reg)`,
    );
  }

  async startTournament(): Promise<void> {
    this.log("Starting tournament...");

    const result = await this.apiRequest(
      "POST",
      `/api/v1/tournaments/${this.tournamentId}/start`,
      {},
      this.adminToken,
    );

    this.log(`Tournament start result: ${JSON.stringify(result)}`);
  }

  async connectWebSocket(tableId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${WS_URL}?tableId=${tableId}`);

      ws.on("open", () => {
        this.log(`WebSocket connected to table ${tableId.slice(0, 8)}...`);
        this.wsConnections.set(tableId, ws);
        resolve();
      });

      ws.on("message", (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWsMessage(tableId, message);
        } catch (e) {
          // Non-JSON message
        }
      });

      ws.on("error", (e) => {
        this.log(
          `WebSocket error for table ${tableId.slice(0, 8)}: ${e.message}`,
        );
      });

      ws.on("close", () => {
        this.wsConnections.delete(tableId);
      });

      setTimeout(() => reject(new Error("WebSocket timeout")), 5000);
    });
  }

  private handleWsMessage(tableId: string, message: any): void {
    if (message.type === "gameState" || message.type === "state_update") {
      this.tableStates.set(tableId, message.data || message);
      this.analyzeTableState(tableId, message.data || message);
    }
  }

  private analyzeTableState(tableId: string, state: any): void {
    // Check for overlap issues
    if (state.players && state.players.length >= 6) {
      this.checkForOverlaps(tableId, state);
    }

    // Check pot/chip consistency
    if (state.pot !== undefined) {
      this.checkChipConsistency(tableId, state);
    }
  }

  private checkForOverlaps(tableId: string, state: any): void {
    // This would need frontend analysis - log for manual inspection
    if (state.players.length >= 9) {
      this.findings.push({
        type: "CHECK_NEEDED",
        severity: "HIGH",
        message: `9-player table detected - manual overlap check needed`,
        tableId,
        playerCount: state.players.length,
        players: state.players.map((p: any) => p.name),
      });
    }
  }

  private checkChipConsistency(tableId: string, state: any): void {
    const totalChips =
      state.players?.reduce(
        (sum: number, p: any) => sum + (Number(p.chips) || 0),
        0,
      ) || 0;
    const pot = Number(state.pot) || 0;
    const expectedTotal = state.players?.length * this.config.startingChips;

    if (totalChips + pot > expectedTotal * 1.1) {
      this.findings.push({
        type: "BUG",
        severity: "CRITICAL",
        message: `Chip inflation detected`,
        tableId,
        expected: expectedTotal,
        actual: totalChips + pot,
      });
    }
  }

  async watchTournament(): Promise<void> {
    this.log("Watching tournament progress...");
    this.log(
      `\n📺 Watch the tournament at: ${FRONTEND_URL}/tournaments/${this.tournamentId}\n`,
    );

    const startTime = Date.now();
    const maxDuration = 15 * 60 * 1000; // 15 minutes
    let lastHandCount = 0;
    let stuckCount = 0;
    let lateRegDone = false;

    while (Date.now() - startTime < maxDuration) {
      await this.sleep(3000);

      // Get tournament state
      const state = await this.apiRequest(
        "GET",
        `/api/v1/tournaments/${this.tournamentId}/state`,
      );

      if (state.status === "finished") {
        this.log("🏆 Tournament finished!");
        await this.logResults();
        break;
      }

      if (state.status === "cancelled") {
        this.log("❌ Tournament cancelled");
        break;
      }

      // Get table info
      const tables = state.tables || [];
      const runningTables = tables.filter((t: any) => t.status === "running");
      const totalPlayers = tables.reduce(
        (sum: number, t: any) =>
          sum + (t.playerCount || t.players?.length || 0),
        0,
      );
      const handCount = tables.reduce(
        (sum: number, t: any) => sum + (t.handNumber || 0),
        0,
      );

      // Late registration
      if (!lateRegDone && state.level && state.level <= 3 && handCount > 20) {
        await this.performLateRegistration();
        lateRegDone = true;
      }

      // Simulate disconnections occasionally
      if (Math.random() < 0.1) {
        await this.simulateDisconnection();
      }

      // Progress check
      if (handCount > lastHandCount) {
        stuckCount = 0;
        lastHandCount = handCount;

        // Connect to new tables
        for (const table of runningTables) {
          if (!this.wsConnections.has(table.tableId)) {
            try {
              await this.connectWebSocket(table.tableId);
            } catch {
              // Ignore connection failures
            }
          }
        }

        this.log(
          `Level ${state.level || "?"} | ` +
            `Hands: ${handCount} | ` +
            `Players: ${totalPlayers}/${this.config.playerCount} | ` +
            `Tables: ${runningTables.length}`,
        );
      } else {
        stuckCount++;
        if (stuckCount > 20) {
          this.log("⚠️ Tournament appears stuck");
          this.findings.push({
            type: "BUG",
            severity: "HIGH",
            message: "Tournament stuck - no progress for 60 seconds",
            handCount,
            tables: runningTables.length,
          });
          break;
        }
      }
    }
  }

  private async performLateRegistration(): Promise<void> {
    this.log("Performing late registrations...");
    const lateBots = this.botIds.slice(
      Math.floor(this.config.playerCount * 0.8),
    );

    for (const botId of lateBots) {
      try {
        await this.apiRequest(
          "POST",
          `/api/v1/tournaments/${this.tournamentId}/register`,
          { botId },
          this.adminToken,
        );
        this.log(`Late registered bot ${botId.slice(0, 8)}...`);
      } catch (e) {
        this.log(`Late reg failed for ${botId.slice(0, 8)}: ${e}`);
      }
    }
  }

  private async simulateDisconnection(): Promise<void> {
    // Close a random WebSocket to simulate disconnect
    const connections = Array.from(this.wsConnections.entries());
    if (connections.length > 0) {
      const [tableId, ws] =
        connections[Math.floor(Math.random() * connections.length)];
      this.log(`Simulating disconnect from table ${tableId.slice(0, 8)}...`);
      ws.close();

      // Reconnect after a short delay
      setTimeout(async () => {
        try {
          await this.connectWebSocket(tableId);
          this.log(`Reconnected to table ${tableId.slice(0, 8)}`);
        } catch {
          // Ignore reconnection failures
        }
      }, 5000);
    }
  }

  private async logResults(): Promise<void> {
    const results = await this.apiRequest(
      "GET",
      `/api/v1/tournaments/${this.tournamentId}/results`,
    );

    this.log("\n=== TOURNAMENT RESULTS ===");
    if (results.results) {
      for (let i = 0; i < Math.min(3, results.results.length); i++) {
        const r = results.results[i];
        this.log(
          `${i + 1}. ${r.botName || r.bot_name} - Prize: ${r.prize || 0}`,
        );
      }
    }
    this.log("========================\n");
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async cleanup(): Promise<void> {
    this.log("Cleaning up...");

    // Close all WebSocket connections
    for (const ws of this.wsConnections.values()) {
      ws.close();
    }
    this.wsConnections.clear();
  }

  getFindings(): any[] {
    return this.findings;
  }

  async run(): Promise<void> {
    try {
      await this.loginAsAdmin();
      await this.createTournament();
      await this.registerBots();
      await this.startTournament();
      await this.watchTournament();
    } finally {
      await this.cleanup();
    }

    // Print findings
    if (this.findings.length > 0) {
      this.log("\n=== QA MONSTER FINDINGS ===");
      for (const finding of this.findings) {
        this.log(`[${finding.severity}] ${finding.type}: ${finding.message}`);
      }
      this.log("===========================\n");
    }
  }
}

// Main
async function main() {
  console.log("\n🎰 QA MONSTER - Live Tournament Test\n");
  console.log("This test will:");
  console.log("  - Create a 30-player tournament");
  console.log("  - Test late registration");
  console.log("  - Test player disconnections");
  console.log("  - Monitor for UI issues\n");
  console.log("Watch the tournament at: http://localhost:3001/tournaments\n");
  console.log("Press Ctrl+C to stop\n");

  const test = new LiveTournamentTest({
    name: `QA Monster Test ${Date.now()}`,
    playerCount: 30,
    buyIn: 100,
    startingChips: 5000,
    playersPerTable: 9,
    lateRegEnabled: true,
    rebuysEnabled: true,
    turnTimeoutMs: 5000,
  });

  await test.run();

  const findings = test.getFindings();
  process.exit(findings.some((f) => f.severity === "CRITICAL") ? 1 : 0);
}

main().catch(console.error);
