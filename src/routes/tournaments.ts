/**
 * routes/tournaments.js
 *
 * GET  /tournaments              — list all tournaments [public]
 * GET  /tournaments/:id          — tournament detail + state [public]
 * POST /tournaments/:id/register — bot registers for a tournament [auth]
 * GET  /tournaments/:id/results  — final results [public]
 */

import * as http from 'http';
import { URL } from 'url';
import * as db from '../db';
import { requireAuth } from '../auth';
import { applyLimit, limiters } from '../rateLimit';
import { calculatePayouts } from '../../tournaments.config.js';
import { TournamentDirector } from '../tournament';

// Using 'any' for now, but for a full migration, these should be properly typed.
type Tournament = any;
type User = any;
type Bot = any;
type Entry = any;

type SendJsonFunction = (res: http.ServerResponse, status: number, data: any) => void;
type ParseBodyFunction = (req: http.IncomingMessage) => Promise<any>;
type LiveDirectorsMap = Map<string, any>; // Should be Map<string, TournamentDirector>

interface ServerConfig {
  callBot?: (endpoint: string, payload: any) => Promise<any>;
  onStateUpdate?: (tournamentId: string, state: any) => void;
  onFinished?: (tournamentId: string, results: any) => void;
}

export function handle(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  parsedUrl: URL,
  parseBody: ParseBodyFunction,
  sendJSON: SendJsonFunction,
  liveDirectors: LiveDirectorsMap,
  serverConfig: ServerConfig = {}
): Promise<any> | null {
  const path = parsedUrl.pathname;

  // ── GET /tournaments ─────────────────────────────────────────
  if (req.method === 'GET' && path === '/tournaments') {
    const tournaments = db.getAllTournaments();
    sendJSON(
      res,
      200,
      tournaments.map(t => {
        const entries = db.getEntries(t.id);
        const prizePool = entries.length * t.buy_in;
        const payouts = calculatePayouts(prizePool, entries.length);
        return {
          id: t.id,
          name: t.name,
          status: t.status,
          type: t.type,
          buy_in: t.buy_in,
          starting_chips: t.starting_chips,
          min_players: t.min_players,
          max_players: t.max_players,
          rebuys_allowed: !!t.rebuys_allowed,
          late_reg_ends_level: t.late_reg_ends_level,
          scheduled_start_at: t.scheduled_start_at,
          entrants: entries.length,
          prize_pool: prizePool,
          places_paid: payouts.length,
          live: liveDirectors.has(t.id)
            ? {
                level: liveDirectors.get(t.id).currentLevel,
                players_remaining: liveDirectors.get(t.id).activeBots.size,
                tables: liveDirectors.get(t.id).tables.size,
              }
            : null,
        };
      })
    );
    return Promise.resolve();
  }

  // ── GET /tournaments/:id ─────────────────────────────────────
  const detailMatch = path.match(/^\/tournaments\/([^/]+)$/);
  if (req.method === 'GET' && detailMatch) {
    const id = detailMatch[1];
    const tourn = db.getTournamentById(id);
    if (!tourn) {
      sendJSON(res, 404, { error: 'Tournament not found' });
      return Promise.resolve();
    }

    const entries = db.getEntries(id);
    const prizePool = entries.length * tourn.buy_in;
    const payouts = calculatePayouts(prizePool, entries.length);

    const director = liveDirectors.get(id);
    const liveState = director ? director._buildState() : null;

    sendJSON(res, 200, {
      id: tourn.id,
      name: tourn.name,
      status: tourn.status,
      type: tourn.type,
      buy_in: tourn.buy_in,
      starting_chips: tourn.starting_chips,
      min_players: tourn.min_players,
      max_players: tourn.max_players,
      players_per_table: tourn.players_per_table,
      rebuys_allowed: !!tourn.rebuys_allowed,
      late_reg_ends_level: tourn.late_reg_ends_level,
      scheduled_start_at: tourn.scheduled_start_at,
      started_at: tourn.started_at,
      finished_at: tourn.finished_at,
      prize_pool: prizePool,
      payout_structure: payouts,
      entrants: entries.map((e: Entry) => ({
        bot_name: e.bot_name,
        entry_type: e.entry_type,
        entered_at: e.entered_at,
        finish_position: e.finish_position,
        payout: e.payout,
      })),
      live: liveState,
    });
    return Promise.resolve();
  }

  // ── POST /tournaments/:id/register ───────────────────────────
  const regMatch = path.match(/^\/tournaments\/([^/]+)\/register$/);
  if (req.method === 'POST' && regMatch) {
    let user: User;
    try {
      user = requireAuth(req);
    } catch (e: any) {
      sendJSON(res, e.status, { error: e.message });
      return Promise.resolve();
    }

    // Rate limit: 5 tournament registrations per user per hour
    if (applyLimit(limiters.joinTable, req, res, user.id)) return Promise.resolve();

    return parseBody(req).then(body => {
      const { bot_id } = body;
      if (!bot_id) return sendJSON(res, 400, { error: 'Required: { bot_id }' });

      const bot: Bot = db.getBotById(bot_id);
      if (!bot) return sendJSON(res, 404, { error: 'Bot not found' });
      if (bot.user_id !== user.id) return sendJSON(res, 403, { error: 'You do not own this bot' });
      if (!bot.active) return sendJSON(res, 409, { error: 'Bot is deactivated' });

      const id = regMatch[1];
      const tourn: Tournament = db.getTournamentById(id);
      if (!tourn) return sendJSON(res, 404, { error: 'Tournament not found' });

      // Check registration is open
      if (tourn.status === 'finished' || tourn.status === 'cancelled') {
        return sendJSON(res, 409, { error: 'Tournament is no longer accepting entries' });
      }

      // Check late registration rules if tournament already running
      const director = liveDirectors.get(id);
      if (director && tourn.status === 'running') {
        if (director.currentLevel > tourn.late_reg_ends_level) {
          return sendJSON(res, 409, {
            error: `Late registration closed. Tournament is past level ${tourn.late_reg_ends_level}.`,
          });
        }
      }

      // Check capacity
      const entries: Entry[] = db.getEntries(id);
      const activeEntry = entries.find(e => e.bot_id === bot_id && e.finish_position === null);
      if (activeEntry) {
        return sendJSON(res, 409, { error: 'This bot is already registered and still active' });
      }
      const existing = entries.find(e => e.bot_id === bot_id);

      if (tourn.status === 'registering' && entries.filter(e => e.finish_position === null).length >= tourn.max_players) {
        return sendJSON(res, 409, { error: `Tournament is full (max ${tourn.max_players} players)` });
      }

      const entryType = existing ? 'rebuy' : 'initial';
      if (entryType === 'rebuy' && !tourn.rebuys_allowed) {
        return sendJSON(res, 409, { error: 'Rebuys are not allowed in this tournament' });
      }

      db.createEntry({
        tournament_id: id,
        bot_id,
        chips_at_entry: tourn.starting_chips,
        entry_type: entryType,
      });

      if (director && (tourn.status === 'running' || tourn.status === 'final_table')) {
        try {
          director.addLateEntry({ botId: bot.id, name: bot.name, endpoint: bot.endpoint });
        } catch (e: any) {
          return sendJSON(res, 409, { error: e.message });
        }
      }

      if (tourn.status === 'registering' && tourn.type === 'rolling') {
        const activeEntries = db.getEntries(id).filter(e => e.finish_position === null);
        if (activeEntries.length >= tourn.min_players) {
          _startTournament(id, liveDirectors, serverConfig);
        }
      }

      return sendJSON(res, 201, {
        message: `${bot.name} registered for ${tourn.name}`,
        entry_type: entryType,
        tournament_id: id,
        status: db.getTournamentById(id).status,
      });
    });
  }

  // ── GET /tournaments/:id/history [auth required] ────────────
  const historyMatch = path.match(/^\/tournaments\/([^/]+)\/history$/);
  if (req.method === 'GET' && historyMatch) {
    let user: User;
    try {
      user = requireAuth(req);
    } catch (e: any) {
      sendJSON(res, e.status, { error: e.message });
      return Promise.resolve();
    }

    const id = historyMatch[1];
    const tourn = db.getTournamentById(id);
    if (!tourn) {
      sendJSON(res, 404, { error: 'Tournament not found' });
      return Promise.resolve();
    }

    const limit = parseInt(parsedUrl.searchParams.get('limit') || '50');
    const offset = parseInt(parsedUrl.searchParams.get('offset') || '0');

    const hands = db.getTournamentHandHistory(id, limit, offset);

    sendJSON(res, 200, {
      tournamentId: id,
      name: tourn.name,
      hands: hands.map((h: any) => ({
        ...h,
        community_cards: JSON.parse(h.community_cards || '[]'),
        players: JSON.parse(h.players || '[]').map((p: any) => ({
          ...p,
          hole_cards: p.hole_cards ? JSON.parse(p.hole_cards) : [],
          best_hand_cards: p.best_hand_cards ? JSON.parse(p.best_hand_cards) : null,
        })),
      })),
    });
    return Promise.resolve();
  }

  // ── GET /tournaments/:id/results ─────────────────────────────
  const resultsMatch = path.match(/^\/tournaments\/([^/]+)\/results$/);
  if (req.method === 'GET' && resultsMatch) {
    const id = resultsMatch[1];
    const tourn = db.getTournamentById(id);
    if (!tourn) {
        sendJSON(res, 404, { error: 'Tournament not found' });
        return Promise.resolve();
    }

    const results = db.getTournamentResults(id);
    const prizePool = results.length * tourn.buy_in;

    sendJSON(res, 200, {
      tournament_id: id,
      name: tourn.name,
      status: tourn.status,
      prize_pool: prizePool,
      entrants: results.length,
      results,
    });
    return Promise.resolve();
  }

  return null;
}

export function _startTournament(
  tournamentId: string,
  liveDirectors: LiveDirectorsMap,
  {
    callBot = () => Promise.reject(new Error('No callBot provided')),
    onStateUpdate = () => {},
    onFinished = () => {},
  }: ServerConfig = {}
) {
  if (liveDirectors.has(tournamentId)) return; // already started

  const director = new TournamentDirector({
    tournamentId,
    callBot,
    onStateUpdate,
    onFinished,
  });

  liveDirectors.set(tournamentId, director);
  director.start().catch((e: Error) => console.error(`[Tournament ${tournamentId}] Error:`, e));
}
