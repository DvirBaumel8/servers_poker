/**
 * routes/bots.js
 *
 * POST   /bots              — register a new bot            [auth required]
 * GET    /bots              — list all bots (public)
 * GET    /bots/:id          — get bot profile + stats       [public]
 * PATCH  /bots/:id          — update endpoint/description   [auth + owner]
 * DELETE /bots/:id          — deactivate bot                [auth + owner]
 */

import * as http from 'http';
import { URL } from 'url';
import * as db from '../db';
import { requireAuth, requireBotOwnership } from '../auth';
import { applyLimit, limiters } from '../rateLimit';
import { validateBot } from '../botValidator';

// Using 'any' for now, but for a full migration, these should be properly typed.
type Bot = any;
type User = any;

type SendJsonFunction = (res: http.ServerResponse, status: number, data: any) => void;
type ParseBodyFunction = (req: http.IncomingMessage) => Promise<any>;

export function handle(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  parsedUrl: URL,
  parseBody: ParseBodyFunction,
  sendJSON: SendJsonFunction
): Promise<any> | null {
  const path = parsedUrl.pathname;

  // ── POST /bots ────────────────────────────────────────────
  if (req.method === 'POST' && path === '/bots') {
    let user: User;
    try {
      user = requireAuth(req);
    } catch (e: any) {
      sendJSON(res, e.status, { error: e.message });
      return Promise.resolve();
    }

    // SEC-002: 20 bots per user per day
    if (applyLimit(limiters.createBot, req, res, user.id)) return Promise.resolve();

    return parseBody(req).then(body => {
      const { name, endpoint, description } = body;

      if (!name || name.trim().length < 2) {
        return sendJSON(res, 400, { error: 'name must be at least 2 characters' });
      }
      if (!endpoint) {
        return sendJSON(res, 400, { error: 'endpoint is required (e.g. http://myserver.com/action)' });
      }
      try {
        new URL(endpoint);
      } catch (_) {
        return sendJSON(res, 400, { error: 'endpoint must be a valid URL' });
      }

      // Check name uniqueness
      const existing = db.getBotByName(name.trim());
      if (existing) return sendJSON(res, 409, { error: `Bot name "${name}" is already taken` });

      const bot = db.createBot({
        user_id: user.id,
        name: name.trim(),
        endpoint: endpoint.trim(),
        description: description?.trim() || null,
      });

      // Run validation async — don't block the registration response
      setImmediate(async () => {
        try {
          const report = await validateBot(bot.endpoint);
          const score = Math.round(report.passed / report.total * 100);
          db.getDb()
            .prepare(
              'UPDATE bots SET last_validation = ?, last_validation_score = ?, updated_at = unixepoch() WHERE id = ?'
            )
            .run(JSON.stringify(report), score, bot.id);
          console.log(`[validate] ${bot.name}: ${score}% (${report.passed}/${report.total} passed)`);
        } catch (e: any) {
          console.error(`[validate] Failed for ${bot.name}:`, e.message);
        }
      });

      return sendJSON(res, 201, {
        message: 'Bot registered. Validation running in background — check GET /bots/:id/validate for results.',
        bot: sanitizeBot(bot),
      });
    });
  }

  // ── GET /bots ─────────────────────────────────────────────
  if (req.method === 'GET' && path === '/bots') {
    const bots = db
      .getDb()
      .prepare(
        `
      SELECT b.id, b.name, b.description, b.active, b.created_at,
             u.username as owner
      FROM bots b
      JOIN users u ON u.id = b.user_id
      WHERE b.active = 1
      ORDER BY b.created_at DESC
    `
      )
      .all();

    sendJSON(res, 200, bots);
    return Promise.resolve();
  }

  // ── GET /bots/:id ─────────────────────────────────────────
  const singleMatch = path.match(/^\/bots\/([^/]+)$/);
  if (req.method === 'GET' && singleMatch) {
    const bot = db.getBotById(singleMatch[1]);
    if (!bot || !bot.active) {
      sendJSON(res, 404, { error: 'Bot not found' });
      return Promise.resolve();
    }

    // Fetch lifetime stats
    const stats = db
      .getDb()
      .prepare(
        `
      SELECT
        COUNT(DISTINCT gp.game_id)   AS games_played,
        SUM(gp.hands_played)         AS total_hands,
        SUM(gp.hands_won)            AS total_wins,
        SUM(gp.total_winnings)       AS total_winnings,
        ROUND(100.0 * SUM(gp.hands_won) / NULLIF(SUM(gp.hands_played), 0), 1) AS win_rate_pct
      FROM game_players gp
      WHERE gp.bot_id = ?
    `
      )
      .get(bot.id);

    const owner = db.getUserById(bot.user_id);

    sendJSON(res, 200, {
      id: bot.id,
      name: bot.name,
      description: bot.description,
      owner: owner?.username,
      active: !!bot.active,
      created_at: bot.created_at,
      stats: stats || {},
    });
    return Promise.resolve();
  }

  // ── PATCH /bots/:id ───────────────────────────────────────
  const patchMatch = path.match(/^\/bots\/([^/]+)$/);
  if (req.method === 'PATCH' && patchMatch) {
    let user: User;
    try {
      user = requireAuth(req);
    } catch (e: any) {
      sendJSON(res, e.status, { error: e.message });
      return Promise.resolve();
    }

    let bot: Bot;
    try {
      bot = requireBotOwnership(user, patchMatch[1]);
    } catch (e: any) {
      sendJSON(res, e.status, { error: e.message });
      return Promise.resolve();
    }

    return parseBody(req).then(body => {
      const updates: { [key: string]: string | null } = {};
      if (body.endpoint !== undefined) {
        try {
          new URL(body.endpoint);
        } catch (_) {
          return sendJSON(res, 400, { error: 'endpoint must be a valid URL' });
        }
        updates.endpoint = body.endpoint.trim();
      }
      if (body.description !== undefined) updates.description = body.description?.trim() || null;
      if (body.name !== undefined) {
        if (body.name.trim().length < 2) return sendJSON(res, 400, { error: 'name must be at least 2 characters' });
        const taken = db.getBotByName(body.name.trim());
        if (taken && taken.id !== bot.id) return sendJSON(res, 409, { error: `Bot name "${body.name}" is already taken` });
        updates.name = body.name.trim();
      }

      if (Object.keys(updates).length === 0) {
        return sendJSON(res, 400, { error: 'Nothing to update. Provide: name, endpoint, or description' });
      }

      const setClauses = Object.keys(updates)
        .map(k => `${k} = ?`)
        .join(', ');
      db.getDb()
        .prepare(
          `
        UPDATE bots SET ${setClauses}, updated_at = unixepoch() WHERE id = ?
      `
        )
        .run(...Object.values(updates), bot.id);
      
      return sendJSON(res, 200, { message: 'Bot updated.', bot: sanitizeBot(db.getBotById(bot.id)) });
    });
  }

  // ── POST /bots/:id/validate ──────────────────────────────
  const valMatch = path.match(/^\/bots\/([^/]+)\/validate$/);
  if (req.method === 'POST' && valMatch) {
    let user: User;
    try {
      user = requireAuth(req);
    } catch (e: any) {
      sendJSON(res, e.status, { error: e.message });
      return Promise.resolve();
    }
    let bot: Bot;
    try {
      bot = requireBotOwnership(user, valMatch[1]);
    } catch (e: any) {
      sendJSON(res, e.status, { error: e.message });
      return Promise.resolve();
    }
    if (applyLimit(limiters.register, req, res, 'validate:' + user.id)) return Promise.resolve();
    return validateBot(bot.endpoint)
      .then(result => {
        const score = Math.round((result.passed / result.total) * 100);
        db.getDb()
          .prepare('UPDATE bots SET last_validation = ?, last_validation_score = ?, updated_at = unixepoch() WHERE id = ?')
          .run(JSON.stringify(result), score, bot.id);
        return sendJSON(res, 200, {
          message: result.success ? 'All scenarios passed!' : `${result.failed}/${result.total} scenarios failed.`,
          score,
          ...result,
        });
      })
      .catch(e => sendJSON(res, 500, { error: e.message }));
  }

  // ── DELETE /bots/:id ──────────────────────────────────────
  const deleteMatch = path.match(/^\/bots\/([^/]+)$/);
  if (req.method === 'DELETE' && deleteMatch) {
    let user: User;
    try {
      user = requireAuth(req);
    } catch (e: any) {
      sendJSON(res, e.status, { error: e.message });
      return Promise.resolve();
    }

    let bot: Bot;
    try {
      bot = requireBotOwnership(user, deleteMatch[1]);
    } catch (e: any) {
      sendJSON(res, e.status, { error: e.message });
      return Promise.resolve();
    }

    // Soft delete — preserve all historical data
    db.getDb().prepare('UPDATE bots SET active = 0, updated_at = unixepoch() WHERE id = ?').run(bot.id);

    sendJSON(res, 200, { message: `Bot "${bot.name}" deactivated. All historical data preserved.` });
    return Promise.resolve();
  }

  return null; // not handled
}

function sanitizeBot(bot: Bot) {
  if (!bot) return null; // Guard against null bot
  return {
    id: bot.id,
    name: bot.name,
    endpoint: bot.endpoint,
    description: bot.description,
    active: !!bot.active,
    validation_score: bot.last_validation_score ?? null,
    validation_ready: bot.last_validation_score === 100,
    created_at: bot.created_at,
    updated_at: bot.updated_at,
  };
}
