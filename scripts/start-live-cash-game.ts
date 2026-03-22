#!/usr/bin/env npx ts-node
/**
 * Start a live cash game with mock bots
 *
 * This script:
 * 1. Starts multiple mock bot servers
 * 2. Creates bots in the database pointing to those servers
 * 3. Creates a cash game table
 * 4. Joins all bots to the table
 * 5. The game automatically starts when enough bots join
 */

import * as http from "http";
import "dotenv/config";

const API_BASE = process.env.API_BASE || "http://localhost:3000/api/v1";
const NUM_BOTS = parseInt(process.env.NUM_BOTS || "6", 10);
const BASE_PORT = parseInt(process.env.BASE_PORT || "4100", 10);

interface BotPayload {
  gameId: string;
  handNumber: number;
  stage: string;
  you: {
    name: string;
    chips: number;
    holeCards: string[];
    bet: number;
    position: string;
    bestHand?: { name: string; cards: string[] };
  };
  action: {
    canCheck: boolean;
    toCall: number;
    minRaise: number;
    maxRaise: number;
  };
  table: {
    pot: number;
    currentBet: number;
    communityCards: string[];
    smallBlind: number;
    bigBlind: number;
    ante: number;
  };
  players: Array<{
    name: string;
    chips: number;
    bet: number;
    folded: boolean;
    allIn: boolean;
    disconnected: boolean;
    position: string;
  }>;
}

function decideAction(payload: BotPayload): { type: string; amount?: number } {
  const { you, action, table } = payload;
  const { canCheck, toCall, minRaise, maxRaise } = action;
  const random = Math.random();

  // Faster decisions for demo - reduced think time happens in server delay
  
  if (canCheck) {
    if (random < 0.6) return { type: "check" };
    if (minRaise > 0 && random < 0.8) {
      const betAmount = Math.min(minRaise, you.chips);
      if (betAmount > 0) return { type: "bet", amount: betAmount };
    }
    return { type: "check" };
  }

  if (toCall > 0) {
    const potOdds = toCall / (table.pot + toCall);
    
    // Usually call small bets
    if (potOdds < 0.3 || random < 0.75) return { type: "call" };
    
    // Sometimes raise
    if (random < 0.15 && maxRaise > minRaise) {
      const raiseAmount = Math.min(minRaise * 2, maxRaise);
      return { type: "raise", amount: raiseAmount };
    }
    
    // Fold expensive bets sometimes
    if (toCall > you.chips * 0.4 && random > 0.4) return { type: "fold" };
    
    return { type: "call" };
  }

  return canCheck ? { type: "check" } : { type: "fold" };
}

async function startBotServer(port: number, botName: string): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk.toString(); });
        req.on("end", () => {
          try {
            const payload: BotPayload = JSON.parse(body);
            const decision = decideAction(payload);
            
            // Add small delay for natural pacing (500-1500ms)
            const delay = 500 + Math.random() * 1000;
            setTimeout(() => {
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify(decision));
            }, delay);
          } catch {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ type: "fold" }));
          }
        });
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", name: botName }));
      }
    });

    server.listen(port, () => {
      console.log(`  Bot ${botName} listening on port ${port}`);
      resolve(server);
    });
  });
}

async function apiRequest(
  method: string,
  path: string,
  body?: object,
  token?: string
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) return { ok: false, error: data.message || res.statusText };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

async function main() {
  const timestamp = Date.now();
  console.log("\n🎰 Starting Live Cash Game Demo\n");

  // Step 1: Register/login as admin
  console.log("1️⃣ Authenticating...");
  let token: string;
  
  const loginRes = await apiRequest("POST", "/auth/login", {
    email: "admin@poker.com",
    password: "admin123",
  });
  
  if (!loginRes.ok) {
    // Try to register first
    const registerRes = await apiRequest("POST", "/auth/register", {
      email: "admin@poker.com",
      password: "admin123",
      name: "Admin",
    });
    const errMsg = registerRes.error || "";
    if (!registerRes.ok && !errMsg.includes("already")) {
      console.error("Failed to authenticate:", registerRes.error);
      process.exit(1);
    }
    // Try login again
    const retryLogin = await apiRequest("POST", "/auth/login", {
      email: "admin@poker.com",
      password: "admin123",
    });
    if (!retryLogin.ok) {
      console.error("Failed to login:", retryLogin.error);
      process.exit(1);
    }
    token = retryLogin.data.accessToken;
  } else {
    token = loginRes.data.accessToken;
  }
  console.log("  ✓ Authenticated\n");

  // Step 2: Start mock bot servers
  console.log("2️⃣ Starting mock bot servers...");
  const servers: http.Server[] = [];
  const botInfos: { name: string; endpoint: string; id?: string }[] = [];
  
  for (let i = 0; i < NUM_BOTS; i++) {
    const port = BASE_PORT + i;
    const name = `LiveBot${i + 1}_${timestamp}`;
    const server = await startBotServer(port, name);
    servers.push(server);
    botInfos.push({ name, endpoint: `http://localhost:${port}/action` });
  }
  console.log("");

  // Step 3: Register bots in database
  console.log("3️⃣ Registering bots...");
  for (const bot of botInfos) {
    const res = await apiRequest("POST", "/bots", {
      name: bot.name,
      endpoint: bot.endpoint,
    }, token);
    
    if (!res.ok) {
      console.error(`  Failed to create bot ${bot.name}:`, res.error);
      continue;
    }
    bot.id = res.data.id;
    console.log(`  ✓ Created ${bot.name}`);
  }
  console.log("");

  // Step 4: Create table
  console.log("4️⃣ Creating cash game table...");
  const tableName = `LIVE CASH GAME ${timestamp}`;
  const tableRes = await apiRequest("POST", "/games/tables", {
    name: tableName,
    small_blind: 25,
    big_blind: 50,
    max_players: 6,
    starting_chips: 5000,
  }, token);
  
  if (!tableRes.ok) {
    console.error("Failed to create table:", tableRes.error);
    cleanup(servers);
    process.exit(1);
  }
  const tableId = tableRes.data.id;
  console.log(`  ✓ Table created: ${tableName}`);
  console.log(`  Table ID: ${tableId}\n`);

  // Step 5: Join bots to table
  console.log("5️⃣ Joining bots to table...");
  for (const bot of botInfos) {
    if (!bot.id) continue;
    
    const joinRes = await apiRequest("POST", `/games/${tableId}/join`, {
      bot_id: bot.id,
    }, token);
    
    if (!joinRes.ok) {
      console.error(`  Failed to join ${bot.name}:`, joinRes.error);
      continue;
    }
    console.log(`  ✓ ${bot.name} joined`);
  }
  console.log("");

  // Done!
  const watchUrl = `http://localhost:3001/game/${tableId}`;
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");
  console.log(`🎮 LIVE CASH GAME READY!`);
  console.log("");
  console.log(`📺 Watch the game: ${watchUrl}`);
  console.log("");
  console.log(`Table: ${tableName}`);
  console.log(`Players: ${botInfos.filter(b => b.id).length}`);
  console.log(`Blinds: 25/50`);
  console.log(`Starting chips: 5,000`);
  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");
  console.log("Press Ctrl+C to stop the bots and exit.");
  console.log("");

  // Keep running
  process.on("SIGINT", () => {
    console.log("\n\n🛑 Stopping bot servers...");
    cleanup(servers);
    process.exit(0);
  });
}

function cleanup(servers: http.Server[]) {
  for (const server of servers) {
    server.close();
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
