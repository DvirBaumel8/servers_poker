/**
 * POKER GAME SERVER
 * =================
 * Run with: node server.js [port]
 *
 * Public endpoints:
 *   POST /users/register         — create account
 *   GET  /bots                   — list all active bots
 *   GET  /bots/:id               — bot profile + stats
 *   GET  /games                  — list all tables
 *   GET  /games/:id/state        — full live state for one table [public]
 *   GET  /leaderboard            — all-time rankings
 *   GET  /health
 *
 * Auth required (Authorization: Bearer <api_key>):
 *   GET    /users/me
 *   POST   /bots
 *   PATCH  /bots/:id
 *   DELETE /bots/:id
 *   POST   /games/:id/join
 *   GET    /games/:id/history
 *
 * WebSocket: ws://host:port/ws?table=<tableId>
 *   — pushes full game state on every update, no auth required
 *   — client sends: { type: 'subscribe', tableId } to change subscription
 */

import * as http from "http";
import { URL } from "url";
import { createWsServer } from "./ws.js";
import { validateBot } from "./botValidator";
import { getIp, applyLimit, limiters } from "./rateLimit";
import * as tournamentRoutes from "./routes/tournaments";
import { TOURNAMENT_CONFIGS } from "../tournaments.config.js";
import { PokerGame } from "./game";
import { GameRecorder } from "./recorder";
import { requireAuth } from "./auth";
import * as userRoutes from "./routes/users";
import * as botRoutes from "./routes/bots";
import * as db from "./db";

const PORT = process.argv[2] || 3000;

db.migrate();
TOURNAMENT_CONFIGS.forEach((t) => db.createTournament(t));
console.log(
  "[server] Tournaments provisioned:",
  TOURNAMENT_CONFIGS.map((t) => t.name).join(", "),
);

const liveGames = {}; // tableId -> { game, gameDbId, botIdMap, recorderAttached }
const gameStates = {}; // tableId -> latest public state
const liveDirectors = new Map(); // tournamentId -> TournamentDirector
const tournamentStates = new Map(); // tournamentId -> latest state

// ── Scheduled tournament starter ──────────────────────────────
// Checks every 30 seconds for scheduled tournaments whose start time has passed
function checkScheduledTournaments() {
  const now = Math.floor(Date.now() / 1000);
  const tournaments = db.getAllTournaments();
  for (const t of tournaments) {
    if (
      t.type === "scheduled" &&
      t.status === "registering" &&
      t.scheduled_start_at !== null &&
      t.scheduled_start_at <= now &&
      !liveDirectors.has(t.id)
    ) {
      const entries = db
        .getEntries(t.id)
        .filter((e) => e.finish_position === null);
      if (entries.length < t.min_players) {
        console.log(
          `[scheduler] ${t.name}: scheduled start time passed but only ${entries.length}/${t.min_players} players — cancelling`,
        );
        db.getDb()
          .prepare("UPDATE tournaments SET status = 'cancelled' WHERE id = ?")
          .run(t.id);
        continue;
      }
      console.log(
        `[scheduler] Starting scheduled tournament: ${t.name} (${entries.length} players)`,
      );
      tournamentRoutes._startTournament(t.id, liveDirectors, {
        callBot,
        onStateUpdate: (tournamentId, state) => {
          tournamentStates.set(tournamentId, state);
          if (typeof wss !== "undefined") {
            wss.broadcast(tournamentId, {
              type: "tournament_state",
              tournamentId,
              state,
            });
          }
        },
        onFinished: (tournamentId, results) => {
          console.log(`[Tournament ${tournamentId}] Finished.`);
        },
      });
    }
  }
}

setInterval(checkScheduledTournaments, 30_000).unref();

// WebSocket helpers — wss created after server, used inline below

// ── Bot caller ────────────────────────────────────────────────
async function callBot(endpoint, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const url = new URL(endpoint);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            res.destroy();
            reject(new Error("Bot response too large (max 64 KB)"));
            return;
          }
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error("Bot returned invalid JSON"));
          }
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── HTTP helpers ──────────────────────────────────────────────
function sendJSON(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data, null, 2));
}

const MAX_BODY_BYTES = 64 * 1024; // 64 KB — SEC-006

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        reject(
          Object.assign(new Error("Request body too large (max 64 KB)"), {
            status: 413,
          }),
        );
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });
  });
}

// ── HTTP server ───────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url, "http://localhost");
  const path = parsedUrl.pathname;

  try {
    // SEC-002: global rate limit — 300 req/min per IP
    if (applyLimit(limiters.global, req, res, getIp(req))) return;

    const userResult = await userRoutes.handle(
      req,
      res,
      parsedUrl,
      parseBody,
      sendJSON,
    );
    if (userResult !== null) return;

    const botResult = await botRoutes.handle(
      req,
      res,
      parsedUrl,
      parseBody,
      sendJSON,
    );
    if (botResult !== null) return;

    const tournResult = await tournamentRoutes.handle(
      req,
      res,
      parsedUrl,
      parseBody,
      sendJSON,
      liveDirectors,
      {
        callBot,
        onStateUpdate: (tournamentId, state) => {
          tournamentStates.set(tournamentId, state);
          if (typeof wss !== "undefined") {
            wss.broadcast(tournamentId, {
              type: "tournament_state",
              tournamentId,
              state,
            });
          }
        },
        onFinished: (tournamentId, results) => {
          console.log(
            `[Tournament ${tournamentId}] Finished. Results:`,
            results
              .slice(0, 3)
              .map((r) => r.bot_name)
              .join(", "),
          );
        },
      },
    );
    if (tournResult !== null) return;

    // ── GET /games/:id/state [public] ─────────────────────
    const stateMatch = path.match(/^\/games\/([^/]+)\/state$/);
    if (req.method === "GET" && stateMatch) {
      const tableId = stateMatch[1];
      const state = gameStates[tableId];
      if (!state) {
        const table = db.getTableById(tableId);
        if (!table) return sendJSON(res, 404, { error: "Table not found" });
        return sendJSON(res, 200, {
          status: table.status,
          players: [],
          stage: null,
        });
      }
      return sendJSON(res, 200, state);
    }

    // ── POST /games/:id/join [auth required] ──────────────
    const joinMatch = path.match(/^\/games\/([^/]+)\/join$/);
    if (req.method === "POST" && joinMatch) {
      let user;
      try {
        user = requireAuth(req);
      } catch (e) {
        return sendJSON(res, e.status, { error: e.message });
      }

      // SEC-002: 10 joins per user per minute
      if (applyLimit(limiters.joinTable, req, res, user.id)) return;

      const tableId = joinMatch[1];
      const table = db.getTableById(tableId);
      if (!table) return sendJSON(res, 404, { error: "Table not found" });
      if (table.status === "finished")
        return sendJSON(res, 409, { error: "This game has already finished" });

      const { bot_id } = await parseBody(req);
      if (!bot_id) return sendJSON(res, 400, { error: "Required: { bot_id }" });

      const bot = db.getBotById(bot_id);
      if (!bot) return sendJSON(res, 404, { error: "Bot not found" });
      if (bot.user_id !== user.id)
        return sendJSON(res, 403, { error: "You do not own this bot" });
      if (!bot.active)
        return sendJSON(res, 409, { error: "Bot is deactivated" });

      // SEC-008: atomic seat check + insert — prevents race condition on concurrent joins
      const joinResult = db.atomicJoinTable(tableId, bot.id, table.max_players);
      if (!joinResult.ok)
        return sendJSON(res, 409, { error: joinResult.error });

      let liveEntry = liveGames[tableId];
      if (!liveEntry) {
        const gameRow = db.createGame(tableId);
        const game = new PokerGame({
          gameId: tableId,
          smallBlind: table.small_blind,
          bigBlind: table.big_blind,
          startingChips: table.starting_chips,
          turnTimeoutMs: table.turn_timeout_ms,
          botCaller: callBot,
          onStateUpdate: (state) => {
            gameStates[tableId] = state;
            if (typeof wss !== "undefined")
              wss.broadcast(tableId, { type: "state", tableId, state });
          },
          onHandComplete: () => {},
          onPlayerRemoved: (player) => {
            console.log(
              `[${tableId}] ${player.name} disconnected after ${player.strikes} strikes`,
            );
            db.getDb()
              .prepare(
                "UPDATE table_seats SET disconnected = 1, disconnected_at = unixepoch() WHERE table_id = ? AND bot_id = ?",
              )
              .run(tableId, player.id);
          },
        });
        liveEntry = {
          game,
          gameDbId: gameRow.id,
          botIdMap: {},
          recorderAttached: false,
        };
        liveGames[tableId] = liveEntry;
        gameStates[tableId] = game.getPublicState();
      }

      const { game, gameDbId, botIdMap } = liveEntry;
      botIdMap[bot.name] = bot.id;
      db.addGamePlayer(gameDbId, bot.id, table.starting_chips);

      if (!liveEntry.recorderAttached) {
        const recorder = new GameRecorder({
          game,
          gameDbId,
          tableId,
          botIdMap,
        });
        recorder.attach();
        liveEntry.recorderAttached = true;
      }

      db.getDb()
        .prepare(
          "UPDATE table_seats SET disconnected = 0, disconnected_at = NULL WHERE table_id = ? AND bot_id = ?",
        )
        .run(tableId, bot.id);

      try {
        game.addPlayer({ id: bot.id, name: bot.name, endpoint: bot.endpoint });
      } catch (e) {
        return sendJSON(res, 409, { error: e.message });
      }

      db.updateTableStatus(
        tableId,
        game.players.length >= 2 ? "running" : "waiting",
      );

      return sendJSON(res, 200, {
        message:
          game.players.length >= 2
            ? `${bot.name} joined. Game is now running!`
            : `${bot.name} joined. Waiting for more players.`,
        tableId,
        botId: bot.id,
        playerCount: game.players.length,
      });
    }

    // ── GET /games [public] ───────────────────────────────
    if (req.method === "GET" && path === "/games") {
      const tables = db.getAllTables();
      return sendJSON(
        res,
        200,
        tables.map((t) => ({
          gameId: t.id,
          name: t.name,
          status: t.status,
          config: {
            small_blind: t.small_blind,
            big_blind: t.big_blind,
            starting_chips: t.starting_chips,
          },
          players: (liveGames[t.id]?.game.players || []).map((p) => ({
            name: p.name,
            chips: p.chips,
            disconnected: p.disconnected,
          })),
        })),
      );
    }

    // ── GET /games/:id/history [auth required] ────────────
    const historyMatch = path.match(/^\/games\/([^/]+)\/history$/);
    if (req.method === "GET" && historyMatch) {
      try {
        requireAuth(req);
      } catch (e) {
        return sendJSON(res, e.status, { error: e.message });
      }
      const tableId = historyMatch[1];
      const limit = parseInt(parsedUrl.searchParams.get("limit") || "50");
      const offset = parseInt(parsedUrl.searchParams.get("offset") || "0");
      const games = db.getGamesByTable(tableId);
      if (!games.length)
        return sendJSON(res, 404, { error: "No games found for this table" });
      const latestGame = games[0];
      const hands = db.getHandHistory(latestGame.id, limit, offset);
      return sendJSON(res, 200, {
        gameId: latestGame.id,
        tableId,
        totalHands: latestGame.total_hands,
        hands: hands.map((h) => ({
          ...h,
          community_cards: JSON.parse(h.community_cards || "[]"),
          players: JSON.parse(h.players || "[]").map((p) => ({
            ...p,
            hole_cards: JSON.parse(p.hole_cards || "[]"),
          })),
        })),
      });
    }

    // ── POST /bots/:id/validate [auth required] ─────────────
    const validateMatch = path.match(/^\/bots\/([^/]+)\/validate$/);
    if (req.method === "POST" && validateMatch) {
      let user;
      try {
        user = requireAuth(req);
      } catch (e) {
        return sendJSON(res, e.status, { error: e.message });
      }

      const bot = db.getBotById(validateMatch[1]);
      if (!bot) return sendJSON(res, 404, { error: "Bot not found" });
      if (bot.user_id !== user.id)
        return sendJSON(res, 403, { error: "You do not own this bot" });

      console.log(`[validate] Running against ${bot.name} at ${bot.endpoint}`);
      const result = await validateBot(bot.endpoint);
      const score = Math.round((result.passed / result.total) * 100);

      db.getDb()
        .prepare(
          "UPDATE bots SET last_validation = ?, last_validation_score = ?, updated_at = unixepoch() WHERE id = ?",
        )
        .run(JSON.stringify(result), score, bot.id);

      return sendJSON(res, 200, {
        message: result.success
          ? "All scenarios passed!"
          : result.failed + "/" + result.total + " scenarios failed.",
        score,
        ...result,
      });
    }

    // ── GET /bots/:id/validate — fetch last validation result [public] ─
    const validateGetMatch = path.match(/^\/bots\/([^/]+)\/validate$/);
    if (req.method === "GET" && validateGetMatch) {
      const bot = db.getBotById(validateGetMatch[1]);
      if (!bot) return sendJSON(res, 404, { error: "Bot not found" });
      if (!bot.last_validation) {
        return sendJSON(res, 404, {
          error:
            "No validation report yet. POST /bots/:id/validate to run one.",
        });
      }
      const result = JSON.parse(bot.last_validation);
      return sendJSON(res, 200, {
        score: bot.last_validation_score,
        ...result,
      });
    }

    // ── GET /leaderboard [public] ─────────────────────────
    if (req.method === "GET" && path === "/leaderboard") {
      return sendJSON(
        res,
        200,
        db.getLeaderboard(
          parseInt(parsedUrl.searchParams.get("limit") || "20"),
        ),
      );
    }

    // ── GET /health ───────────────────────────────────────
    if (req.method === "GET" && path === "/health") {
      const wsConns = typeof wss !== "undefined" ? wss.totalClients() : 0;
      return sendJSON(res, 200, {
        status: "ok",
        liveGames: Object.keys(liveGames).length,
        wsConnections: wsConns,
      });
    }

    sendJSON(res, 404, { error: "Not found" });
  } catch (e) {
    const status = e.status || 500;
    if (status !== 500) {
      return sendJSON(res, status, { error: e.message });
    }
    console.error("Server error:", e);
    sendJSON(res, 500, { error: e.message });
  }
});

// ── WebSocket server ──────────────────────────────────────────
const wss = createWsServer(server);

wss.on("connection", (ws, tableId) => {
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === "subscribe" && msg.tableId) {
        ws.subscribe(msg.tableId);
        if (gameStates[msg.tableId]) {
          ws.send({
            type: "state",
            tableId: msg.tableId,
            state: gameStates[msg.tableId],
          });
        }
      }
    } catch (_) {}
  });

  // Send current state immediately if subscribed via query param
  if (tableId && gameStates[tableId]) {
    ws.send({ type: "state", tableId, state: gameStates[tableId] });
  }

  ws.send({ type: "connected", tableId: tableId || null });
});

server.listen(PORT, () => {
  console.log(`
♠ ♥ ♦ ♣  POKER GAME SERVER  ♣ ♦ ♥ ♠
=====================================
Listening on  http://localhost:${PORT}
WebSocket:     ws://localhost:${PORT}/ws?table=<tableId>
Database:      poker.db

── Public ──────────────────────────
  POST /users/register
  GET  /bots  |  GET /bots/:id
  GET  /tournaments
  GET  /tournaments/:id
  GET  /tournaments/:id/results
  GET  /leaderboard
  GET  /health
  WS   /ws?table=<tableId>

── Auth required (Bearer <api_key>) ─
  GET    /users/me
  POST   /bots
  PATCH  /bots/:id
  DELETE /bots/:id
  POST   /tournaments/:id/register
`);
});
