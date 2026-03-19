import db from "./db";
import logger from "./logger";
import { PokerGame } from "./game";

interface RecorderOptions {
  game: PokerGame;
  gameDbId: string;
  tableId: string;
  botIdMap: { [playerName: string]: string };
  tournamentId?: string;
}

export class GameRecorder {
  private game: PokerGame;
  private gameDbId: string;
  private tableId: string;
  private botIdMap: { [playerName: string]: string };
  private tournamentId: string | null;

  private currentHandId: string | null = null;
  private handStartMs: number | null = null;
  private actionSeq = 0;
  private handStartChips: { [botDbId: string]: number } = {};
  private handPlayers = new Set<string>();
  private foldedStreet: { [botDbId: string]: string } = {};
  private sawFlop = new Set<string>();
  private _actionStats: { [botDbId: string]: any } = {};

  constructor({
    game,
    gameDbId,
    tableId,
    botIdMap,
    tournamentId,
  }: RecorderOptions) {
    this.game = game;
    this.gameDbId = gameDbId;
    this.tableId = tableId;
    this.botIdMap = botIdMap;
    this.tournamentId = tournamentId || null;
  }

  attach() {
    const originalOnHandComplete = this.game.onHandComplete.bind(this.game);
    this.game.onHandComplete = (results: any) => {
      originalOnHandComplete(results);
      this._onHandComplete(results);
    };

    const originalPlayHand = this.game.playHand.bind(this.game);
    this.game.playHand = async () => {
      await this._beforeHand();
      await originalPlayHand();
    };

    const originalBettingRound = this.game._bettingRound.bind(this.game);
    this.game._bettingRound = async (
      stageName: string,
      startIndex: number,
      options: any,
    ) => {
      if (stageName === "flop") {
        for (const p of this.game.players) {
          if (!p.folded && !p.disconnected) {
            const botId = this.botIdMap[p.name];
            if (botId) {
              this.sawFlop.add(botId);
              db.getDb()
                .prepare(
                  "UPDATE hand_players SET saw_flop = 1 WHERE hand_id = ? AND bot_id = ?",
                )
                .run(this.currentHandId, botId);
            }
          }
        }
      }

      const originalGetPlayerAction = this.game._getPlayerAction.bind(
        this.game,
      );
      this.game._getPlayerAction = async (player: any, botPayload: any) => {
        const startMs = Date.now();
        const action = await originalGetPlayerAction(player, botPayload);
        const responseMs = Date.now() - startMs;
        this._recordVoluntaryAction(
          player,
          action,
          stageName,
          botPayload,
          responseMs,
          false,
        );
        return action;
      };

      const originalSafe = this.game._getPlayerActionSafe.bind(this.game);
      this.game._getPlayerActionSafe = async (player: any, botPayload: any) => {
        const startMs = Date.now();
        let action,
          isPenalty = false;
        try {
          action = await originalSafe(player, botPayload);
        } catch (_) {
          action = { type: "fold" };
          isPenalty = true;
        }
        const responseMs = Date.now() - startMs;
        this._recordVoluntaryAction(
          player,
          action,
          stageName,
          botPayload,
          responseMs,
          isPenalty,
        );
        return action;
      };

      await originalBettingRound(stageName, startIndex, options);

      this.game._getPlayerAction = originalGetPlayerAction;
      this.game._getPlayerActionSafe = originalSafe;
    };

    const originalStartGame = this.game.startGame.bind(this.game);
    this.game.startGame = async () => {
      await originalStartGame();
      this._finalizeGame();
    };
  }

  private async _beforeHand() {
    const game = this.game;
    const handNumber = game.handNumber + 1;

    this.handStartMs = Date.now();
    this.handStartChips = {};
    this.handPlayers = new Set();
    this.foldedStreet = {};
    this.sawFlop = new Set();
    this._actionStats = {};

    for (const p of game.players) {
      const botId = this.botIdMap[p.name];
      if (botId) this.handStartChips[botId] = p.chips;
    }

    const activePlayers = game.players.filter(
      (p) => p.chips > 0 && !p.disconnected,
    );
    const dealerPlayer = game.players[game.dealerIndex];
    const dealerBotId = dealerPlayer ? this.botIdMap[dealerPlayer.name] : null;

    const hand = db.createHand({
      game_id: this.gameDbId,
      tournament_id: this.tournamentId,
      hand_number: handNumber,
      dealer_bot_id: dealerBotId || null,
      small_blind: game.smallBlind,
      big_blind: game.bigBlind,
      ante: game.ante || 0,
      players_in_hand: activePlayers.length,
    });

    this.currentHandId = hand.id;
    this.actionSeq = 0;

    for (const p of activePlayers) {
      const botId = this.botIdMap[p.name];
      if (!botId) continue;
      this.handPlayers.add(botId);
      db.ensureBotStats(botId);

      try {
        db.addHandPlayer({
          hand_id: this.currentHandId,
          bot_id: botId,
          position: this._getPosition(p.name) || "Unknown",
          hole_cards: [],
          start_chips: this.handStartChips[botId] ?? p.chips,
        });
        db.incrementHandsPlayed(this.gameDbId, botId);
      } catch (_) {}

      this._actionStats[botId] = {
        vpip: false,
        pfr: false,
        isPenalty: false,
        postflop: 0,
        aggressive: 0,
        respMs: 0,
        respCount: 0,
        penaltyFolds: 0,
      };
    }

    if (game.ante > 0) {
      for (const p of activePlayers) {
        const botId = this.botIdMap[p.name];
        if (!botId) continue;
        const anteAmt = Math.min(game.ante, this.handStartChips[botId] || 0);
        db.recordAction({
          hand_id: this.currentHandId,
          bot_id: botId,
          action_seq: this.actionSeq++,
          stage: "pre-flop",
          type: "ante",
          amount: anteAmt,
          pot_before: 0,
          pot_after: 0,
          chips_before: this.handStartChips[botId] || 0,
          chips_after: (this.handStartChips[botId] || 0) - anteAmt,
        });
      }
    }
  }

  private _getPosition(playerName: string): string | null {
    const state = this.game.getPublicState?.();
    if (!state) return null;
    return (
      state.players?.find((p: any) => p.name === playerName)?.position || null
    );
  }

  private _recordVoluntaryAction(
    player: any,
    action: any,
    stage: string,
    botPayload: any,
    responseMs: number,
    isPenalty: boolean,
  ) {
    if (!this.currentHandId) return;
    const botId = this.botIdMap[player.name];
    if (!botId) return;

    const toCall = botPayload.action?.toCall || 0;
    const pot = botPayload.table?.pot || 0;
    const chipsBefore = player.chips;

    let amountAdded = 0,
      raiseBy = 0;
    if (action.type === "raise") {
      raiseBy = action.amount || 0;
      amountAdded = raiseBy + toCall;
    } else if (action.type === "call") {
      amountAdded = toCall;
    }

    const chipsAfter = chipsBefore - amountAdded;
    const potAfter = pot + amountAdded;

    db.recordAction({
      hand_id: this.currentHandId,
      bot_id: botId,
      action_seq: this.actionSeq++,
      stage,
      type: action.type,
      amount: amountAdded,
      raise_by: raiseBy,
      pot_before: pot,
      pot_after: potAfter,
      chips_before: chipsBefore,
      chips_after: chipsAfter,
      is_penalty: isPenalty,
      response_ms: responseMs,
    });

    if (action.type === "fold") {
      this.foldedStreet[botId] = stage;
    }

    const stats = this._actionStats[botId];
    if (!stats) return;

    if (stage === "pre-flop") {
      if (amountAdded > 0 && !isPenalty) stats.vpip = true;
      if (action.type === "raise" && !isPenalty) stats.pfr = true;
    } else {
      stats.postflop++;
      if (action.type === "raise") stats.aggressive++;
    }

    if (!isPenalty) {
      stats.respMs += responseMs;
      stats.respCount += 1;
    }
    if (isPenalty) stats.penaltyFolds++;
  }

  private _onHandComplete(results: any) {
    if (!this.currentHandId) return;
    const game = this.game;
    const wentToShowdown = game.stage === "river" || results.atShowdown;

    const winnerBotIds = new Set(
      (results.winners || [])
        .map((w: any) => {
          const p = game.players.find((gp: any) => gp.id === w.playerId);
          return p ? this.botIdMap[p.name] : null;
        })
        .filter(Boolean),
    );

    const showdownPlayers: { [botId: string]: any } = {};
    if (wentToShowdown) {
      for (const p of game.players.filter(
        (p) => !p.folded && p.holeCards?.length,
      )) {
        const botId = this.botIdMap[p.name];
        if (botId) {
          showdownPlayers[botId] = {
            holeCards: p.holeCards.map((c: any) => `${c.rank}${c.suit}`),
          };
        }
      }
      for (const w of results.winners || []) {
        const p = game.players.find((gp: any) => gp.id === w.playerId);
        if (!p) continue;
        const botId = this.botIdMap[p.name];
        if (botId && showdownPlayers[botId]) {
          showdownPlayers[botId].bestHand = w.hand?.name || null;
          showdownPlayers[botId].bestHandCards =
            w.hand?.cards?.map((c: any) => `${c.rank}${c.suit}`) || null;
        }
      }
    }

    for (const p of game.players) {
      const botId = this.botIdMap[p.name];
      if (!botId || !this.handPlayers.has(botId)) continue;

      const winResult = (results.winners || []).find((w: any) => {
        const wp = game.players.find((gp: any) => gp.id === w.playerId);
        return wp && this.botIdMap[wp.name] === botId;
      });

      const won = winnerBotIds.has(botId);
      const showdownData = showdownPlayers[botId] || {};
      const sawShowdown = wentToShowdown && !p.folded;

      try {
        db.finalizeHandPlayer(this.currentHandId, botId, {
          end_chips: p.chips,
          won,
          win_amount: winResult?.amount || 0,
          best_hand:
            showdownData.bestHand || (won ? winResult?.hand?.name : null),
          best_hand_cards: showdownData.bestHandCards || null,
          hole_cards: showdownData.holeCards || null,
          folded: p.folded && !won,
          folded_street: this.foldedStreet[botId] || null,
          went_all_in: p.allIn,
          saw_showdown: sawShowdown,
        });

        if (won)
          db.incrementHandsWon(this.gameDbId, botId, winResult?.amount || 0);
      } catch (e: any) {
        logger.error(
          "recorder",
          "finalizeHandPlayer error",
          { handId: this.currentHandId, botId },
          e,
        );
      }

      const aStat = this._actionStats[botId] || {};
      try {
        db.updateBotStats(botId, {
          won,
          saw_flop: this.sawFlop.has(botId),
          saw_showdown: sawShowdown,
          won_at_showdown: won && sawShowdown,
          put_chips_in_voluntarily: aStat.vpip || false,
          raised_preflop: aStat.pfr || false,
          postflop_actions: aStat.postflop || 0,
          aggressive_actions: aStat.aggressive || 0,
          response_ms_total: aStat.respMs || 0,
          response_count: aStat.respCount || 0,
          penalty_fold: (aStat.penaltyFolds || 0) > 0,
        });
      } catch (e: any) {
        logger.error("recorder", "updateBotStats error", { botId }, e);
      }
    }

    this._recordBlinds();

    db.finalizeHand(this.currentHandId, {
      community_cards: game.communityCards.map(
        (c: any) => `${c.rank}${c.suit}`,
      ),
      pot: game.potManager?.getTotalPot() || 0,
      stage_reached: game.stage,
      went_to_showdown: wentToShowdown,
      started_at_ms: this.handStartMs,
    });

    this.currentHandId = null;
  }

  private _recordBlinds() {
    const db_instance = db.getDb();
    const rows: any[] = db_instance
      .prepare(
        `SELECT bot_id, position, start_chips FROM hand_players WHERE hand_id = ?`,
      )
      .all(this.currentHandId);

    for (const row of rows) {
      const isSB = row.position === "SB" || row.position === "BTN/SB";
      const isBB = row.position === "BB";
      if (!isSB && !isBB) continue;

      const game = this.game;
      const amount = isSB ? game.smallBlind : game.bigBlind;
      const actual = Math.min(amount, row.start_chips);

      db.recordAction({
        hand_id: this.currentHandId,
        bot_id: row.bot_id,
        action_seq: this.actionSeq++,
        stage: "pre-flop",
        type: "blind",
        amount: actual,
        pot_before: 0,
        pot_after: 0,
        chips_before: row.start_chips,
        chips_after: row.start_chips - actual,
      });
    }
  }

  private _finalizeGame() {
    const game = this.game;
    const ranked = [...game.players].sort((a, b) => b.chips - a.chips);
    ranked.forEach((p, i) => {
      const botId = this.botIdMap[p.name];
      if (!botId) return;
      db.finalizeGamePlayer(this.gameDbId, botId, p.chips, i + 1);
    });
    db.finishGame(this.gameDbId, game.handNumber);
    db.updateTableStatus(this.tableId, "finished");
    logger.info(
      "recorder",
      `Game ${this.gameDbId} finalized after ${game.handNumber} hands`,
    );
  }
}
