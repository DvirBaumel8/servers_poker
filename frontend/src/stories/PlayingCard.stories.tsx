import type { Meta, StoryObj } from "@storybook/react";
import { PlayingCard, MiniPlayingCard } from "../components/common/PlayingCard";

const meta: Meta<typeof PlayingCard> = {
  title: "Poker/PlayingCard",
  component: PlayingCard,
  parameters: {
    layout: "centered",
    backgrounds: {
      default: "felt",
      values: [
        { name: "felt", value: "#0e4129" },
        { name: "dark", value: "#1a1a2e" },
      ],
    },
  },
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: "select",
      options: ["xs", "sm", "md", "lg"],
    },
    hidden: {
      control: "boolean",
    },
    animate: {
      control: "boolean",
    },
  },
};

export default meta;
type Story = StoryObj<typeof PlayingCard>;

export const AceOfSpades: Story = {
  args: {
    card: { rank: "A", suit: "spades" },
    size: "lg",
  },
};

export const KingOfHearts: Story = {
  args: {
    card: { rank: "K", suit: "hearts" },
    size: "lg",
  },
};

export const QueenOfDiamonds: Story = {
  args: {
    card: { rank: "Q", suit: "diamonds" },
    size: "lg",
  },
};

export const JackOfClubs: Story = {
  args: {
    card: { rank: "J", suit: "clubs" },
    size: "lg",
  },
};

export const NumberCard: Story = {
  args: {
    card: { rank: "7", suit: "hearts" },
    size: "lg",
  },
};

export const TenCard: Story = {
  args: {
    card: { rank: "10", suit: "spades" },
    size: "lg",
  },
};

export const CardBack: Story = {
  args: {
    hidden: true,
    size: "lg",
  },
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-end gap-4">
      <PlayingCard card={{ rank: "A", suit: "spades" }} size="xs" />
      <PlayingCard card={{ rank: "A", suit: "spades" }} size="sm" />
      <PlayingCard card={{ rank: "A", suit: "spades" }} size="md" />
      <PlayingCard card={{ rank: "A", suit: "spades" }} size="lg" />
    </div>
  ),
};

export const AllSuits: Story = {
  render: () => (
    <div className="flex gap-2">
      <PlayingCard card={{ rank: "A", suit: "spades" }} size="lg" />
      <PlayingCard card={{ rank: "A", suit: "hearts" }} size="lg" />
      <PlayingCard card={{ rank: "A", suit: "diamonds" }} size="lg" />
      <PlayingCard card={{ rank: "A", suit: "clubs" }} size="lg" />
    </div>
  ),
};

export const TexasHoldemHand: Story = {
  render: () => (
    <div className="flex flex-col items-center gap-6">
      <div className="text-white text-sm mb-2">Community Cards</div>
      <div className="flex gap-2">
        <PlayingCard card={{ rank: "A", suit: "hearts" }} size="md" />
        <PlayingCard card={{ rank: "K", suit: "hearts" }} size="md" />
        <PlayingCard card={{ rank: "Q", suit: "hearts" }} size="md" />
        <PlayingCard card={{ rank: "J", suit: "hearts" }} size="md" />
        <PlayingCard card={{ rank: "10", suit: "hearts" }} size="md" />
      </div>
      <div className="text-white text-sm mt-4 mb-2">Hole Cards</div>
      <div className="flex gap-1">
        <PlayingCard card={{ rank: "9", suit: "hearts" }} size="sm" />
        <PlayingCard card={{ rank: "8", suit: "hearts" }} size="sm" />
      </div>
    </div>
  ),
};

export const MiniCards: Story = {
  render: () => (
    <div className="flex gap-1">
      <MiniPlayingCard card={{ rank: "A", suit: "spades" }} />
      <MiniPlayingCard card={{ rank: "K", suit: "spades" }} />
    </div>
  ),
};

export const HiddenHoleCards: Story = {
  render: () => (
    <div className="flex gap-1">
      <MiniPlayingCard hidden />
      <MiniPlayingCard hidden />
    </div>
  ),
};
