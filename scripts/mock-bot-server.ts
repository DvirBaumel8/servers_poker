import * as http from "http";

const PORT = 4000;

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
  const { you, action, table, stage } = payload;
  const { canCheck, toCall, minRaise, maxRaise } = action;
  
  console.log(`\n[${you.name}] Hand #${payload.handNumber} - ${stage}`);
  console.log(`  Cards: ${you.holeCards.join(", ")}`);
  console.log(`  Community: ${table.communityCards.length > 0 ? table.communityCards.join(", ") : "none"}`);
  console.log(`  Pot: ${table.pot}, ToCall: ${toCall}, Chips: ${you.chips}`);
  console.log(`  CanCheck: ${canCheck}, MinRaise: ${minRaise}, MaxRaise: ${maxRaise}`);
  if (you.bestHand) {
    console.log(`  Best hand: ${you.bestHand.name}`);
  }

  const random = Math.random();

  // If we can check, usually check (80%), sometimes bet (20%)
  if (canCheck) {
    if (random < 0.8) {
      console.log(`  -> CHECK`);
      return { type: "check" };
    }
    // Make a small bet
    const betAmount = Math.min(minRaise, you.chips);
    if (betAmount > 0) {
      console.log(`  -> BET ${betAmount}`);
      return { type: "bet", amount: betAmount };
    }
    console.log(`  -> CHECK (can't bet)`);
    return { type: "check" };
  }

  // We need to call
  if (toCall > 0) {
    const potOdds = toCall / (table.pot + toCall);
    
    // If it's a small call relative to pot, usually call
    if (potOdds < 0.3 || random < 0.7) {
      console.log(`  -> CALL ${toCall}`);
      return { type: "call" };
    }
    
    // Sometimes raise (20% chance)
    if (random < 0.2 && maxRaise > minRaise) {
      const raiseAmount = Math.min(minRaise * 2, maxRaise);
      console.log(`  -> RAISE ${raiseAmount}`);
      return { type: "raise", amount: raiseAmount };
    }
    
    // Fold if call is too expensive (> 50% of chips)
    if (toCall > you.chips * 0.5 && random > 0.3) {
      console.log(`  -> FOLD (too expensive)`);
      return { type: "fold" };
    }
    
    console.log(`  -> CALL ${toCall}`);
    return { type: "call" };
  }

  // Default: check if possible, otherwise fold
  if (canCheck) {
    console.log(`  -> CHECK (default)`);
    return { type: "check" };
  }
  
  console.log(`  -> FOLD (default)`);
  return { type: "fold" };
}

const server = http.createServer((req, res) => {
  if (req.method === "POST") {
    let body = "";
    
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    
    req.on("end", () => {
      try {
        const payload: BotPayload = JSON.parse(body);
        
        // Add delay to simulate thinking (2-4 seconds for more natural pace)
        const thinkTime = 2000 + Math.random() * 2000;
        console.log(`  (thinking for ${Math.round(thinkTime)}ms...)`);
        setTimeout(() => {
          const decision = decideAction(payload);
          
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(decision));
        }, thinkTime);
        
      } catch (error) {
        console.error("Error parsing request:", error);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ type: "fold" }));
      }
    });
  } else {
    // Health check endpoint
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", message: "Mock Bot Server" }));
  }
});

server.listen(PORT, () => {
  console.log(`\n🤖 Mock Bot Server running on http://localhost:${PORT}`);
  console.log(`This server simulates bot responses for poker games.\n`);
});
