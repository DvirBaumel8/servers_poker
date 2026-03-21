import * as http from "http";

const TIMEOUT_MS = 8000;

interface ApiResponse {
  status: number;
  body: any;
}

function callEndpoint(endpoint: string, payload: any): Promise<ApiResponse> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    let url;
    try {
      url = new URL(endpoint);
    } catch (_) {
      return reject(new Error("Invalid endpoint URL"));
    }
    const timer = setTimeout(() => reject(new Error("Timeout")), TIMEOUT_MS);
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
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          clearTimeout(timer);
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (_) {
            reject(new Error("Bot returned invalid JSON"));
          }
        });
      },
    );
    req.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    req.write(body);
    req.end();
  });
}

function callHealth(endpoint: string): Promise<boolean> {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(endpoint.replace(/\/action$/, "/health"));
    } catch (_) {
      return resolve(false);
    }
    const timer = setTimeout(() => resolve(false), TIMEOUT_MS);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname,
        method: "GET",
      },
      (res) => {
        clearTimeout(timer);
        resolve(res.statusCode === 200);
      },
    );
    req.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    req.end();
  });
}

function base(overrides: any = {}): any {
  return {
    gameId: "tourn_validate",
    handNumber: 1,
    stage: "pre-flop",
    you: {
      name: "TestBot",
      chips: 5000,
      holeCards: ["A♠", "K♥"],
      bet: 0,
      position: "BTN",
      ...overrides.you,
    },
    action: {
      canCheck: false,
      toCall: 50,
      minRaise: 100,
      maxRaise: 4950,
      ...overrides.action,
    },
    table: {
      pot: 75,
      currentBet: 50,
      communityCards: [],
      smallBlind: 25,
      bigBlind: 50,
      ante: 10,
      ...overrides.table,
    },
    players: overrides.players || [
      {
        name: "TestBot",
        chips: 5000,
        bet: 0,
        folded: false,
        allIn: false,
        position: "BTN",
        disconnected: false,
      },
      {
        name: "Opponent",
        chips: 5000,
        bet: 50,
        folded: false,
        allIn: false,
        position: "BB",
        disconnected: false,
      },
    ],
    ...overrides.root,
  };
}

function check(res: ApiResponse, opts: any): string[] {
  const { body } = res;
  const errors: string[] = [];
  if (!body || typeof body !== "object") {
    return ["Response must be a JSON object"];
  }
  if (!["fold", "check", "call", "raise"].includes(body.type)) {
    errors.push(`Invalid action type "${body.type}"`);
  }
  if (body.type === "raise") {
    if (typeof body.amount !== "number") {
      errors.push('Raise must include numeric "amount"');
    } else if (opts.minRaise && body.amount < opts.minRaise) {
      errors.push(`Raise ${body.amount} below min ${opts.minRaise}`);
    } else if (opts.maxRaise && body.amount > opts.maxRaise) {
      errors.push(`Raise ${body.amount} above max ${opts.maxRaise}`);
    }
  }
  if (body.type === "check" && !opts.canCheck) {
    errors.push('Returned "check" but canCheck is false');
  }
  return errors;
}

const SCENARIOS = [
  {
    id: "connectivity",
    name: "Health check",
    description: "GET /health returns 200",
    type: "health",
  },
  {
    id: "preflop_call",
    name: "Pre-flop: call or fold",
    description: "Standard pre-flop situation returns valid action",
    payload: base(),
    validate: (r: ApiResponse) =>
      check(r, { canCheck: false, minRaise: 100, maxRaise: 4950 }),
  },
  {
    id: "preflop_check",
    name: "Pre-flop: check when allowed",
    description: "Bot can check when toCall=0",
    payload: base({
      action: { canCheck: true, toCall: 0, minRaise: 50, maxRaise: 5000 },
      table: {
        pot: 20,
        currentBet: 0,
        communityCards: [],
        smallBlind: 10,
        bigBlind: 20,
        ante: 5,
      },
    }),
    validate: (r: ApiResponse) =>
      check(r, { canCheck: true, minRaise: 50, maxRaise: 5000 }),
  },
  {
    id: "preflop_raise",
    name: "Pre-flop: valid raise amount",
    description: "If bot raises, amount must be within minRaise/maxRaise",
    payload: base({
      you: {
        name: "TestBot",
        chips: 5000,
        holeCards: ["A♠", "A♥"],
        bet: 0,
        position: "BTN",
      },
    }),
    validate: (r: ApiResponse) =>
      check(r, { canCheck: false, minRaise: 100, maxRaise: 4950 }),
  },
  {
    id: "flop_besthand",
    name: "Flop: bestHand provided",
    description: "Bot handles bestHand object correctly on the flop",
    payload: base({
      root: { stage: "flop" },
      you: {
        name: "TestBot",
        chips: 4500,
        holeCards: ["A♠", "K♥"],
        bet: 0,
        position: "CO",
        bestHand: {
          name: "ONE_PAIR",
          cards: ["A♠", "K♥", "A♦", "7♣", "2♠"],
        },
      },
      action: { canCheck: true, toCall: 0, minRaise: 50, maxRaise: 4500 },
      table: {
        pot: 200,
        currentBet: 0,
        communityCards: ["A♦", "7♣", "2♠"],
        smallBlind: 25,
        bigBlind: 50,
        ante: 10,
      },
    }),
    validate: (r: ApiResponse) =>
      check(r, { canCheck: true, minRaise: 50, maxRaise: 4500 }),
  },
  {
    id: "river_large_bet",
    name: "River: facing pot-sized bet",
    description: "Bot handles large bet on the river",
    payload: base({
      root: { stage: "river" },
      you: {
        name: "TestBot",
        chips: 2000,
        holeCards: ["2♣", "7♦"],
        bet: 0,
        position: "BB",
        bestHand: {
          name: "HIGH_CARD",
          cards: ["A♠", "K♦", "Q♣", "J♥", "9♠"],
        },
      },
      action: { canCheck: false, toCall: 1500, minRaise: 3000, maxRaise: 500 },
      table: {
        pot: 3000,
        currentBet: 1500,
        communityCards: ["A♠", "K♦", "Q♣", "J♥", "9♠"],
        smallBlind: 25,
        bigBlind: 50,
        ante: 10,
      },
    }),
    validate: (r: ApiResponse) =>
      check(r, { canCheck: false, minRaise: 3000, maxRaise: 500 }),
  },
  {
    id: "short_stack",
    name: "Short stack: less than 1BB",
    description: "Bot handles near-zero chip count correctly",
    payload: base({
      you: {
        name: "TestBot",
        chips: 30,
        holeCards: ["J♠", "10♥"],
        bet: 0,
        position: "SB",
      },
      action: { canCheck: false, toCall: 50, minRaise: 50, maxRaise: 0 },
      table: {
        pot: 60,
        currentBet: 50,
        communityCards: [],
        smallBlind: 25,
        bigBlind: 50,
        ante: 10,
      },
    }),
    validate: (r: ApiResponse) =>
      check(r, { canCheck: false, minRaise: 50, maxRaise: 0 }),
  },
  {
    id: "multiway",
    name: "Multi-way pot (4 players)",
    description: "Bot handles a 4-player table with one all-in player",
    payload: base({
      root: { stage: "flop", handNumber: 5 },
      you: {
        name: "TestBot",
        chips: 3800,
        holeCards: ["K♠", "Q♠"],
        bet: 0,
        position: "CO",
        bestHand: {
          name: "FLUSH",
          cards: ["K♠", "Q♠", "J♠", "8♠", "3♠"],
        },
      },
      action: { canCheck: false, toCall: 200, minRaise: 400, maxRaise: 3600 },
      table: {
        pot: 600,
        currentBet: 200,
        communityCards: ["J♠", "8♠", "3♠"],
        smallBlind: 50,
        bigBlind: 100,
        ante: 15,
      },
      players: [
        {
          name: "TestBot",
          chips: 3800,
          bet: 0,
          folded: false,
          allIn: false,
          position: "CO",
          disconnected: false,
        },
        {
          name: "P2",
          chips: 2500,
          bet: 200,
          folded: false,
          allIn: false,
          position: "BTN",
          disconnected: false,
        },
        {
          name: "P3",
          chips: 800,
          bet: 200,
          folded: false,
          allIn: false,
          position: "SB",
          disconnected: false,
        },
        {
          name: "P4",
          chips: 0,
          bet: 200,
          folded: false,
          allIn: true,
          position: "BB",
          disconnected: false,
        },
      ],
    }),
    validate: (r: ApiResponse) =>
      check(r, { canCheck: false, minRaise: 400, maxRaise: 3600 }),
  },
  {
    id: "heads_up",
    name: "Heads-up: BTN/SB position",
    description: "Bot handles heads-up BTN/SB position",
    payload: base({
      you: {
        name: "TestBot",
        chips: 8000,
        holeCards: ["Q♥", "J♥"],
        bet: 25,
        position: "BTN/SB",
      },
      action: { canCheck: false, toCall: 25, minRaise: 50, maxRaise: 7975 },
      table: {
        pot: 75,
        currentBet: 50,
        communityCards: [],
        smallBlind: 25,
        bigBlind: 50,
        ante: 10,
      },
      players: [
        {
          name: "TestBot",
          chips: 8000,
          bet: 25,
          folded: false,
          allIn: false,
          position: "BTN/SB",
          disconnected: false,
        },
        {
          name: "Opponent",
          chips: 2000,
          bet: 50,
          folded: false,
          allIn: false,
          position: "BB",
          disconnected: false,
        },
      ],
    }),
    validate: (r: ApiResponse) =>
      check(r, { canCheck: false, minRaise: 50, maxRaise: 7975 }),
  },
  {
    id: "response_time",
    name: "Response time < 5 seconds",
    description: "Bot responds well within the 10-second tournament timeout",
    payload: base(),
    maxMs: 5000,
    validate: (r: ApiResponse) =>
      check(r, { canCheck: false, minRaise: 100, maxRaise: 4950 }),
  },
];

export async function validateBot(endpoint: string): Promise<any> {
  const results: any[] = [];
  let passed = 0,
    failed = 0;

  for (const scenario of SCENARIOS) {
    const result: any = {
      id: scenario.id,
      name: scenario.name,
      description: scenario.description,
    };
    try {
      const start = Date.now();
      if ((scenario as any).type === "health") {
        const ok = await callHealth(endpoint);
        result.passed = ok;
        result.error = ok ? null : "GET /health did not return 200";
      } else {
        const response = await callEndpoint(endpoint, scenario.payload);
        const elapsed = Date.now() - start;
        if ((scenario as any).maxMs && elapsed > (scenario as any).maxMs) {
          result.passed = false;
          result.error = `Response took ${elapsed}ms, exceeding ${
            (scenario as any).maxMs
          }ms limit`;
        } else {
          const errors = (scenario as any).validate(response);
          result.passed = errors.length === 0;
          result.error = errors.length > 0 ? errors.join("; ") : null;
          result.response = response.body;
          result.elapsedMs = elapsed;
        }
      }
    } catch (err) {
      result.passed = false;
      result.error = (err as Error).message;
    }
    if (result.passed) passed++;
    else failed++;
    results.push(result);
  }

  return {
    endpoint,
    passed,
    failed,
    total: results.length,
    success: failed === 0,
    results,
    runAt: Math.floor(Date.now() / 1000),
  };
}
