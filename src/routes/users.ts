import { IncomingMessage, ServerResponse } from "http";
import db from "../db";
import { requireAuth, AuthError } from "../auth";
import { getIp, applyLimit, limiters } from "../rateLimit";

export function handle(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  parseBody: (req: IncomingMessage) => Promise<any>,
  sendJSON: (res: ServerResponse, status: number, data: any) => void,
): Promise<any> | null {
  const path = parsedUrl.pathname;

  if (req.method === "POST" && path === "/users/register") {
    if (applyLimit(limiters.register, req, res, getIp(req)))
      return Promise.resolve("handled");
    return parseBody(req).then((body) => {
      const { username, email } = body;

      if (!username || username.trim().length < 2) {
        return sendJSON(res, 400, {
          error: "username must be at least 2 characters",
        });
      }

      const existing = db
        .getDb()
        .prepare(
          "SELECT id FROM users WHERE username = ? OR (email IS NOT NULL AND email = ?)",
        )
        .get(username.trim(), email || "___none___");

      if (existing) {
        return sendJSON(res, 409, { error: "Username or email already taken" });
      }

      const user = db.createUser({
        username: username.trim(),
        email: email?.trim() || null,
      });

      return sendJSON(res, 201, {
        message: "Account created. Save your api_key — it is shown only once.",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          api_key: user.api_key,
          created_at: user.created_at,
        },
      });
    });
  }

  if (req.method === "GET" && path === "/users/me") {
    if (applyLimit(limiters.login, req, res, getIp(req)))
      return Promise.resolve("handled");
    let user;
    try {
      user = requireAuth(req);
    } catch (e: any) {
      if (e instanceof AuthError) {
        return sendJSON(res, e.status, { error: e.message });
      }
      return sendJSON(res, 500, { error: "Internal Server Error" });
    }

    const bots = db.getBotsByUser(user.id);
    return Promise.resolve(
      sendJSON(res, 200, {
        id: user.id,
        username: user.username,
        email: user.email,
        created_at: user.created_at,
        bots: bots.map((b) => ({
          id: b.id,
          name: b.name,
          endpoint: b.endpoint,
          description: b.description,
          active: !!b.active,
          created_at: b.created_at,
        })),
      }),
    );
  }

  return null;
}
