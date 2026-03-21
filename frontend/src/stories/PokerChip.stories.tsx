import type { Meta, StoryObj } from "@storybook/react";
import {
  PokerChipStack,
  SingleChip,
} from "../components/common/PokerChipStack";

const meta: Meta<typeof PokerChipStack> = {
  title: "Poker/PokerChipStack",
  component: PokerChipStack,
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
    showValue: {
      control: "boolean",
    },
    maxChips: {
      control: { type: "range", min: 1, max: 10 },
    },
  },
};

export default meta;
type Story = StoryObj<typeof PokerChipStack>;

export const SmallStack: Story = {
  args: {
    amount: 100,
    size: "md",
  },
};

export const MediumStack: Story = {
  args: {
    amount: 2500,
    size: "md",
  },
};

export const LargeStack: Story = {
  args: {
    amount: 15000,
    size: "md",
  },
};

export const MassiveStack: Story = {
  args: {
    amount: 1250000,
    size: "md",
  },
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-end gap-8">
      <div className="flex flex-col items-center">
        <PokerChipStack amount={5000} size="xs" />
        <span className="text-white text-xs mt-2">XS</span>
      </div>
      <div className="flex flex-col items-center">
        <PokerChipStack amount={5000} size="sm" />
        <span className="text-white text-xs mt-2">SM</span>
      </div>
      <div className="flex flex-col items-center">
        <PokerChipStack amount={5000} size="md" />
        <span className="text-white text-xs mt-2">MD</span>
      </div>
      <div className="flex flex-col items-center">
        <PokerChipStack amount={5000} size="lg" />
        <span className="text-white text-xs mt-2">LG</span>
      </div>
    </div>
  ),
};

export const ChipDenominations: Story = {
  render: () => (
    <div className="flex gap-4">
      <SingleChip value={1} size="lg" />
      <SingleChip value={5} size="lg" />
      <SingleChip value={25} size="lg" />
      <SingleChip value={100} size="lg" />
      <SingleChip value={500} size="lg" />
      <SingleChip value={1000} size="lg" />
      <SingleChip value={5000} size="lg" />
      <SingleChip value={10000} size="lg" />
    </div>
  ),
};

export const PlayerChipCounts: Story = {
  render: () => (
    <div className="flex gap-12">
      <div className="flex flex-col items-center gap-2">
        <span className="text-gray-400 text-xs">Short Stack</span>
        <PokerChipStack amount={1200} size="sm" />
      </div>
      <div className="flex flex-col items-center gap-2">
        <span className="text-gray-400 text-xs">Average</span>
        <PokerChipStack amount={15000} size="sm" />
      </div>
      <div className="flex flex-col items-center gap-2">
        <span className="text-gray-400 text-xs">Chip Leader</span>
        <PokerChipStack amount={85000} size="sm" />
      </div>
    </div>
  ),
};

export const BettingChips: Story = {
  render: () => (
    <div className="flex flex-col items-center gap-6">
      <div className="text-white text-sm">Current Bets</div>
      <div className="flex gap-16">
        <div className="flex flex-col items-center gap-2">
          <span className="text-gray-400 text-xs">Player 1</span>
          <PokerChipStack amount={200} size="sm" showValue />
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="text-gray-400 text-xs">Player 2</span>
          <PokerChipStack amount={600} size="sm" showValue />
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="text-gray-400 text-xs">Player 3</span>
          <PokerChipStack amount={600} size="sm" showValue />
        </div>
      </div>
    </div>
  ),
};

export const PotDisplay: Story = {
  render: () => (
    <div className="flex flex-col items-center gap-4 p-8 rounded-lg bg-black/30">
      <span className="text-gray-400 text-sm">Main Pot</span>
      <PokerChipStack amount={4200} size="md" />
    </div>
  ),
};

export const WithoutValue: Story = {
  args: {
    amount: 5000,
    size: "md",
    showValue: false,
  },
};
