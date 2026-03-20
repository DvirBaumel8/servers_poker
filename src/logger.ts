import * as fs from "fs";
import * as path from "path";

const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, "..", "logs");
const LOG_FILE = path.join(LOG_DIR, "errors.log");
const SILENT = process.env.NODE_ENV === "test";

try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (_) {}

type LogLevel = "debug" | "info" | "warn" | "error" | "critical";

const LEVELS: { [key in LogLevel]: number } = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  critical: 4,
};
const MIN_CONSOLE_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) || "info";
const MIN_FILE_LEVEL: LogLevel = "warn";

class AssertionError extends Error {
  context?: any;
}

function log(
  level: LogLevel,
  component: string,
  message: string,
  context: any = {},
  err: Error | null = null,
) {
  if (SILENT && level !== "critical") return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    component,
    message,
    ...(Object.keys(context).length ? { context } : {}),
    ...(err ? { error: { message: err.message, stack: err.stack } } : {}),
  };

  const line = JSON.stringify(entry);

  if (LEVELS[level] >= LEVELS[MIN_CONSOLE_LEVEL]) {
    const prefix = `[${entry.ts}] [${level.toUpperCase().padEnd(8)}] [${component}]`;
    if (level === "error" || level === "critical") {
      console.error(`${prefix} ${message}`);
      if (Object.keys(context).length)
        console.error("  context:", JSON.stringify(context, null, 2));
      if (err?.stack) console.error("  stack:", err.stack);
    } else if (level === "warn") {
      console.warn(`${prefix} ${message}`);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }

  if (LEVELS[level] >= LEVELS[MIN_FILE_LEVEL]) {
    try {
      fs.appendFileSync(LOG_FILE, line + "\n");
    } catch (_) {}
  }
}

const logger = {
  debug: (component: string, msg: string, ctx?: any) =>
    log("debug", component, msg, ctx),
  info: (component: string, msg: string, ctx?: any) =>
    log("info", component, msg, ctx),
  warn: (component: string, msg: string, ctx?: any, err?: Error) =>
    log("warn", component, msg, ctx, err),
  error: (component: string, msg: string, ctx?: any, err?: Error) =>
    log("error", component, msg, ctx, err),
  critical: (component: string, msg: string, ctx?: any, err?: Error) =>
    log("critical", component, msg, ctx, err),

  gameError(
    component: string,
    message: string,
    game: any,
    extraContext: any = {},
    err: Error | null = null,
  ) {
    const context = {
      gameId: game?.gameId,
      handNumber: game?.handNumber,
      stage: game?.stage,
      ante: game?.ante,
      smallBlind: game?.smallBlind,
      bigBlind: game?.bigBlind,
      totalPot: game?.potManager?.getTotalPot?.(),
      players: game?.players?.map((p: any) => ({
        name: p.name,
        chips: p.chips,
        bet: p.bet,
        folded: p.folded,
        allIn: p.allIn,
        disconnected: p.disconnected,
        strikes: p.strikes,
        holeCards: p.holeCards?.map((c: any) => `${c.rank}${c.suit}`) || [],
      })),
      communityCards:
        game?.communityCards?.map((c: any) => `${c.rank}${c.suit}`) || [],
      ...extraContext,
    };
    log("error", component, message, context, err);
  },

  tournamentError(
    component: string,
    message: string,
    director: any,
    extraContext: any = {},
    err: Error | null = null,
  ) {
    const context = {
      tournamentId: director?.tournamentId,
      currentLevel: director?.currentLevel,
      handsThisLevel: director?.handsThisLevel,
      activeBots: director?.activeBots?.size,
      tables: director?.tables?.size,
      bustOrder: director?.bustOrder,
      ...extraContext,
    };
    log("error", component, message, context, err);
  },

  assert(
    condition: any,
    component: string,
    message: string,
    context: any = {},
    shouldThrow = true,
  ): boolean {
    if (!condition) {
      log("critical", component, `ASSERTION FAILED: ${message}`, context);
      if (shouldThrow) {
        const err = new AssertionError(`Assertion failed: ${message}`);
        err.context = context;
        throw err;
      }
    }
    return !!condition;
  },

  getRecentErrors(n = 50): any[] {
    try {
      const content = fs.readFileSync(LOG_FILE, "utf8");
      return content
        .trim()
        .split("\n")
        .slice(-n)
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch (_) {
            return { raw: l };
          }
        });
    } catch (_) {
      return [];
    }
  },
};

export default logger;
