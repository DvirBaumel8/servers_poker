import type { Meta, StoryObj } from "@storybook/react";
import { PlayerSeat } from "./PlayerSeat";
import type { Player, Card } from "../../types";

/**
 * Visual regression stories for the PlayerSeat component.
 *
 * Tests various player states and visual configurations.
 */

const meta: Meta<typeof PlayerSeat> = {
  title: "Game/PlayerSeat",
  component: PlayerSeat,
  parameters: {
    layout: "centered",
    backgrounds: {
      default: "poker-felt",
      values: [
        { name: "poker-felt", value: "#145536" },
        { name: "dark", value: "#1a1a2e" },
      ],
    },
  },
  decorators: [
    (Story) => (
      <div className="p-16">
        <Story />
      </div>
    ),
  ],
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof PlayerSeat>;

// Base player for stories
const basePlayer: Player = {
  id: "player-1",
  name: "TestPlayer",
  chips: 1000,
  bet: 0,
  folded: false,
  allIn: false,
  disconnected: false,
  holeCards: [],
};

/**
 * Default Player State
 *
 * Normal player waiting for their turn.
 */
export const Default: Story = {
  args: {
    player: basePlayer,
    seatIndex: 0,
  },
};

/**
 * Active Player
 *
 * Player whose turn it is - should show highlight and timer.
 */
export const Active: Story = {
  args: {
    player: basePlayer,
    isActive: true,
    seatIndex: 0,
    turnStartTime: Date.now(),
    turnTimeoutMs: 30000,
  },
};

/**
 * Dealer Position
 *
 * Player with dealer button.
 */
export const Dealer: Story = {
  args: {
    player: basePlayer,
    isDealer: true,
    seatIndex: 2,
  },
};

/**
 * Active Dealer
 *
 * Dealer whose turn it is.
 */
export const ActiveDealer: Story = {
  args: {
    player: basePlayer,
    isActive: true,
    isDealer: true,
    seatIndex: 0,
    turnStartTime: Date.now(),
    turnTimeoutMs: 30000,
  },
};

/**
 * Folded Player
 *
 * Player who has folded - should be dimmed.
 */
export const Folded: Story = {
  args: {
    player: { ...basePlayer, folded: true },
    seatIndex: 1,
  },
};

/**
 * All-In Player
 *
 * Player who is all-in - should show ALL IN badge.
 */
export const AllIn: Story = {
  args: {
    player: { ...basePlayer, allIn: true, chips: 0 },
    seatIndex: 0,
  },
};

/**
 * Disconnected Player
 *
 * Player who has disconnected - should be grayed out.
 */
export const Disconnected: Story = {
  args: {
    player: { ...basePlayer, disconnected: true },
    seatIndex: 0,
  },
};

/**
 * With Hole Cards Shown
 *
 * Player's cards visible (showdown or hero).
 */
export const WithHoleCards: Story = {
  args: {
    player: {
      ...basePlayer,
      holeCards: [
        { suit: "spades", rank: "A" } as Card,
        { suit: "hearts", rank: "K" } as Card,
      ],
    },
    showCards: true,
    seatIndex: 0,
  },
};

/**
 * With Hidden Cards
 *
 * Player's cards face down (normal view).
 */
export const WithHiddenCards: Story = {
  args: {
    player: basePlayer,
    showCards: false,
    seatIndex: 0,
  },
};

/**
 * Low Chips
 *
 * Player with very few chips.
 */
export const LowChips: Story = {
  args: {
    player: { ...basePlayer, chips: 15 },
    seatIndex: 3,
  },
};

/**
 * High Chips
 *
 * Player with many chips (test formatting).
 */
export const HighChips: Story = {
  args: {
    player: { ...basePlayer, chips: 1234567 },
    seatIndex: 0,
  },
  parameters: {
    docs: {
      description: {
        story: "Tests chip formatting - should show 1.2M not 1234567.",
      },
    },
  },
};

/**
 * Long Name
 *
 * Player with very long name (test truncation).
 */
export const LongName: Story = {
  args: {
    player: {
      ...basePlayer,
      name: "ThisIsAnExtremelyLongPlayerNameThatShouldBeTruncated",
    },
    seatIndex: 0,
  },
  parameters: {
    docs: {
      description: {
        story:
          "⚠️ TRUNCATION TEST: Name should be truncated cleanly without breaking layout.",
      },
    },
  },
};

/**
 * Short Name
 *
 * Player with single character name.
 */
export const ShortName: Story = {
  args: {
    player: { ...basePlayer, name: "X" },
    seatIndex: 0,
  },
};

/**
 * With Bet Action
 *
 * Player who just bet.
 */
export const WithBetAction: Story = {
  args: {
    player: { ...basePlayer, bet: 100 },
    lastAction: { type: "bet", amount: 100, timestamp: Date.now() },
    seatIndex: 0,
  },
};

/**
 * With Call Action
 */
export const WithCallAction: Story = {
  args: {
    player: { ...basePlayer, bet: 50 },
    lastAction: { type: "call", timestamp: Date.now() },
    seatIndex: 1,
  },
};

/**
 * With Raise Action
 */
export const WithRaiseAction: Story = {
  args: {
    player: { ...basePlayer, bet: 200 },
    lastAction: { type: "raise", amount: 200, timestamp: Date.now() },
    seatIndex: 2,
  },
};

/**
 * With Check Action
 */
export const WithCheckAction: Story = {
  args: {
    player: basePlayer,
    lastAction: { type: "check", timestamp: Date.now() },
    seatIndex: 3,
  },
};

/**
 * Different Seat Colors
 *
 * Test different seat index avatar colors.
 */
export const SeatColors: Story = {
  render: () => (
    <div className="flex gap-4 flex-wrap">
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => (
        <PlayerSeat
          key={index}
          player={{ ...basePlayer, name: `Seat ${index + 1}` }}
          seatIndex={index}
        />
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Shows all 9 seat color variations.",
      },
    },
  },
};

/**
 * Timer Almost Out
 *
 * Active player with timer nearly expired.
 */
export const TimerAlmostOut: Story = {
  args: {
    player: basePlayer,
    isActive: true,
    seatIndex: 0,
    turnStartTime: Date.now() - 27000, // 27 seconds ago
    turnTimeoutMs: 30000,
  },
  parameters: {
    docs: {
      description: {
        story: "⚠️ Timer should be red and showing ~3 seconds remaining.",
      },
    },
  },
};

/**
 * All States Combined
 *
 * Multiple players in different states for comparison.
 */
export const AllStatesCombined: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex gap-4">
        <div className="text-white text-xs text-center">Active</div>
        <div className="text-white text-xs text-center">Folded</div>
        <div className="text-white text-xs text-center">All-In</div>
        <div className="text-white text-xs text-center">Disconnected</div>
        <div className="text-white text-xs text-center">Dealer</div>
      </div>
      <div className="flex gap-4">
        <PlayerSeat
          player={basePlayer}
          isActive={true}
          seatIndex={0}
          turnStartTime={Date.now()}
          turnTimeoutMs={30000}
        />
        <PlayerSeat player={{ ...basePlayer, folded: true }} seatIndex={1} />
        <PlayerSeat
          player={{ ...basePlayer, allIn: true, chips: 0 }}
          seatIndex={2}
        />
        <PlayerSeat
          player={{ ...basePlayer, disconnected: true }}
          seatIndex={3}
        />
        <PlayerSeat player={basePlayer} isDealer={true} seatIndex={4} />
      </div>
    </div>
  ),
  parameters: {
    layout: "padded",
  },
};
