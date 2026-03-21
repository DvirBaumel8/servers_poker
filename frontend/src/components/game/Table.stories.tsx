import type { Meta, StoryObj } from "@storybook/react";
import { Table } from "./Table";
import type { GameState, Player, Card } from "../../types";

/**
 * Visual regression stories for the Poker Table component.
 * 
 * These stories test various player counts and game states
 * to catch visual issues like element overlaps.
 */

const meta: Meta<typeof Table> = {
  title: "Game/Table",
  component: Table,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: "The main poker table component showing players, cards, and pot.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="w-[1200px] h-[800px] bg-slate-900 flex items-center justify-center p-8">
        <Story />
      </div>
    ),
  ],
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Table>;

// Helper to create mock players
function createPlayer(id: string, name: string, chips: number, options: Partial<Player> = {}): Player {
  return {
    id,
    name,
    chips,
    bet: 0,
    folded: false,
    allIn: false,
    disconnected: false,
    holeCards: [],
    ...options,
  };
}

// Helper to create mock game state
function createGameState(players: Player[], overrides: Partial<GameState> = {}): GameState {
  return {
    tableId: "test-table",
    gameId: "test-game",
    status: "running",
    stage: "flop",
    handNumber: 1,
    pot: 150,
    communityCards: [
      { suit: "diamonds", rank: "A" } as Card,
      { suit: "clubs", rank: "K" } as Card,
      { suit: "hearts", rank: "Q" } as Card,
    ],
    players,
    dealerPosition: 0,
    currentPlayerId: players[1]?.id || "",
    smallBlind: 1,
    bigBlind: 2,
    ...overrides,
  };
}

/**
 * 2 Players - Heads Up
 * 
 * Basic heads-up configuration. Players at top and bottom positions.
 */
export const TwoPlayers: Story = {
  args: {
    gameState: createGameState([
      createPlayer("p1", "Hero Player", 1000, { holeCards: [{ suit: "spades", rank: "A" }, { suit: "hearts", rank: "K" }] as Card[] }),
      createPlayer("p2", "Opponent", 980),
    ]),
  },
};

/**
 * 6 Players - 6-Max Table
 * 
 * Standard 6-max configuration.
 */
export const SixPlayers: Story = {
  args: {
    gameState: createGameState([
      createPlayer("p1", "Player One", 1200, { bet: 50 }),
      createPlayer("p2", "Player Two", 850, { bet: 50 }),
      createPlayer("p3", "Player Three With Long Name", 1500),
      createPlayer("p4", "Player Four", 2000),
      createPlayer("p5", "P5", 500, { allIn: true }),
      createPlayer("p6", "Player Six", 750, { folded: true }),
    ]),
  },
};

/**
 * 9 Players - Full Ring
 * 
 * CRITICAL: This is where overlap bugs are most likely.
 * Pay attention to cards overlapping adjacent player names.
 */
export const NinePlayers: Story = {
  args: {
    gameState: createGameState([
      createPlayer("p1", "ReallyLongPlayerName", 1000, { bet: 100 }),
      createPlayer("p2", "AnotherLongName", 980, { bet: 100 }),
      createPlayer("p3", "ThirdPlayerName", 1200),
      createPlayer("p4", "FourthPlayer", 1500, { bet: 200 }),
      createPlayer("p5", "FifthPlayer", 800),
      createPlayer("p6", "SixthLongNameHere", 2000, { folded: true }),
      createPlayer("p7", "SeventhPlayer", 1100),
      createPlayer("p8", "EighthWithName", 900, { allIn: true }),
      createPlayer("p9", "NinthPlayer", 750),
    ]),
  },
  parameters: {
    docs: {
      description: {
        story: "⚠️ VISUAL OVERLAP TEST: Check that no player cards overlap other player names.",
      },
    },
  },
};

/**
 * 9 Players with Maximum Name Length
 * 
 * Stress test with very long names to find truncation/overlap issues.
 */
export const NinePlayersLongNames: Story = {
  name: "9 Players - Long Names (Stress Test)",
  args: {
    gameState: createGameState([
      createPlayer("p1", "VeryLongPlayerNameThatShouldTruncate", 1000),
      createPlayer("p2", "AnotherExtremelyLongPlayerName", 980),
      createPlayer("p3", "ThisNameIsWayTooLongForDisplay", 1200),
      createPlayer("p4", "SuperDuperLongNameHere", 1500),
      createPlayer("p5", "MassiveNameThatNeedsCutting", 800),
      createPlayer("p6", "ExtendedNameWithManyChars", 2000),
      createPlayer("p7", "ProlongedPlayerIdentifier", 1100),
      createPlayer("p8", "ExcessivelyLongNameHere", 900),
      createPlayer("p9", "FinalLongNameForTesting", 750),
    ]),
  },
  parameters: {
    docs: {
      description: {
        story: "Stress test with maximum length names. Check truncation works correctly.",
      },
    },
  },
};

/**
 * Pre-Flop Stage
 * 
 * No community cards visible yet.
 */
export const PreFlop: Story = {
  args: {
    gameState: createGameState(
      [
        createPlayer("p1", "Hero", 1000, { bet: 2 }),
        createPlayer("p2", "Villain", 998, { bet: 1 }),
      ],
      {
        stage: "pre-flop",
        communityCards: [],
        pot: 3,
      }
    ),
  },
};

/**
 * Showdown Stage
 * 
 * All cards revealed, checking winner display.
 */
export const Showdown: Story = {
  args: {
    gameState: createGameState(
      [
        createPlayer("p1", "Winner", 1500, { 
          holeCards: [{ suit: "spades", rank: "A" }, { suit: "hearts", rank: "A" }] as Card[]
        }),
        createPlayer("p2", "Runner Up", 500, { 
          holeCards: [{ suit: "clubs", rank: "K" }, { suit: "diamonds", rank: "K" }] as Card[]
        }),
      ],
      {
        stage: "showdown",
        communityCards: [
          { suit: "spades", rank: "K" },
          { suit: "hearts", rank: "Q" },
          { suit: "diamonds", rank: "J" },
          { suit: "clubs", rank: "10" },
          { suit: "hearts", rank: "2" },
        ] as Card[],
        pot: 2000,
      }
    ),
  },
};

/**
 * All-In Situation
 * 
 * Multiple players all-in with large pot.
 */
export const AllInMultiway: Story = {
  name: "Multi-way All-In",
  args: {
    gameState: createGameState(
      [
        createPlayer("p1", "AllIn1", 0, { allIn: true, bet: 1000 }),
        createPlayer("p2", "AllIn2", 0, { allIn: true, bet: 800 }),
        createPlayer("p3", "AllIn3", 0, { allIn: true, bet: 1200 }),
        createPlayer("p4", "BigStack", 5000),
      ],
      {
        pot: 4000,
        stage: "turn",
        communityCards: [
          { suit: "hearts", rank: "A" },
          { suit: "diamonds", rank: "K" },
          { suit: "clubs", rank: "Q" },
          { suit: "spades", rank: "J" },
        ] as Card[],
      }
    ),
  },
};

/**
 * Mixed States
 * 
 * Players in various states: folded, all-in, active, disconnected.
 */
export const MixedPlayerStates: Story = {
  args: {
    gameState: createGameState([
      createPlayer("p1", "Active Player", 1000, { bet: 100 }),
      createPlayer("p2", "Folded Player", 900, { folded: true }),
      createPlayer("p3", "All-In Player", 0, { allIn: true, bet: 500 }),
      createPlayer("p4", "Disconnected", 800, { disconnected: true }),
      createPlayer("p5", "Waiting", 1200),
      createPlayer("p6", "Also Folded", 750, { folded: true }),
    ]),
  },
};

/**
 * Large Pot Display
 * 
 * Test pot number formatting with large amounts.
 */
export const LargePot: Story = {
  args: {
    gameState: createGameState(
      [
        createPlayer("p1", "HighRoller1", 50000, { bet: 10000 }),
        createPlayer("p2", "HighRoller2", 45000, { bet: 10000 }),
      ],
      {
        pot: 250000,
      }
    ),
  },
  parameters: {
    docs: {
      description: {
        story: "Tests large number formatting (should show 250K not 250000).",
      },
    },
  },
};

/**
 * Waiting for Players
 * 
 * Initial state before game starts.
 */
export const WaitingForPlayers: Story = {
  args: {
    gameState: createGameState(
      [createPlayer("p1", "OnlyPlayer", 1000)],
      {
        status: "waiting",
        stage: "waiting",
        pot: 0,
        communityCards: [],
        handNumber: 0,
      }
    ),
  },
};

/**
 * With Action Badges
 * 
 * Players with recent action badges visible.
 */
export const WithActionBadges: Story = {
  args: {
    gameState: createGameState([
      createPlayer("p1", "Raiser", 900, { bet: 100 }),
      createPlayer("p2", "Caller", 900),
      createPlayer("p3", "Folder", 1000, { folded: true }),
      createPlayer("p4", "Checker", 1000),
    ]),
    playerActions: {
      p1: { type: "raise", amount: 100, timestamp: Date.now() },
      p2: { type: "call", timestamp: Date.now() - 1000 },
      p3: { type: "fold", timestamp: Date.now() - 2000 },
      p4: { type: "check", timestamp: Date.now() - 3000 },
    },
  },
};
