#!/usr/bin/env npx ts-node
/**
 * Start a live cash game with internal strategy bots
 *
 * This script:
 * 1. Creates bots with strategy JSON in the database
 * 2. Creates a cash game table
 * 3. Joins all bots to the table
 * 4. The game automatically starts when enough bots join
 */

import "dotenv/config";

const API_BASE = process.env.API_BASE || "http://localhost:3000/api/v1";
const NUM_BOTS = parseInt(process.env.NUM_BOTS || "6", 10);

const BOT_STRATEGIES = [
  { version: 1, tier: "quick", personality: { aggression: 55, bluffFrequency: 25, riskTolerance: 45, tightness: 55 } },
  { version: 1, tier: "quick", personality: { aggression: 10, bluffFrequency: 5, riskTolerance: 20, tightness: 20 } },
  { version: 1, tier: "quick", personality: { aggression: 90, bluffFrequency: 60, riskTolerance: 80, tightness: 30 } },
  { version: 1, tier: "quick", personality: { aggression: 50, bluffFrequency: 50, riskTolerance: 50, tightness: 50 } },
  { version: 1, tier: "quick", personality: { aggression: 5, bluffFrequency: 0, riskTolerance: 5, tightness: 95 } },
  { version: 1, tier: "quick", personality: { aggression: 70, bluffFrequency: 40, riskTolerance: 60, tightness: 35 } },
];

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

  console.log("1️⃣ Authenticating...");
  let token: string;
  
  const loginRes = await apiRequest("POST", "/auth/login", {
    email: "admin@poker.com",
    password: "admin123",
  });
  
  if (!loginRes.ok) {
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

  console.log("2️⃣ Creating strategy bots...");
  const botInfos: { name: string; id?: string }[] = [];
  
  for (let i = 0; i < NUM_BOTS; i++) {
    const name = `LiveBot${i + 1}_${timestamp}`;
    const strategy = BOT_STRATEGIES[i % BOT_STRATEGIES.length];
    const res = await apiRequest("POST", "/bots/internal", {
      name,
      strategy,
    }, token);
    
    if (!res.ok) {
      console.error(`  Failed to create bot ${name}:`, res.error);
      continue;
    }
    botInfos.push({ name, id: res.data.id });
    console.log(`  ✓ Created ${name}`);
  }
  console.log("");

  console.log("3️⃣ Creating cash game table...");
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
    process.exit(1);
  }
  const tableId = tableRes.data.id;
  console.log(`  ✓ Table created: ${tableName}`);
  console.log(`  Table ID: ${tableId}\n`);

  console.log("4️⃣ Joining bots to table...");
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
  console.log("Press Ctrl+C to exit.");
  console.log("");

  process.on("SIGINT", () => {
    console.log("\n\n🛑 Exiting...");
    process.exit(0);
  });

  // Keep running to allow monitoring
  setInterval(() => {}, 60000);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
