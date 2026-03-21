# Poker UI Component Upgrade Plan

## Overview

Replace custom card/chip rendering with battle-tested open-source libraries to improve visual quality and reduce maintenance burden.

## Current State

Your frontend already has:
- **Framer Motion** for animations
- **Tailwind CSS** for styling
- **React 19** + **TypeScript 5.5**
- Custom components: `Card.tsx`, `ChipStack.tsx`, `PlayerSeat.tsx`, `Table.tsx`

The existing components work but use simple CSS gradients and Unicode symbols for cards. Open-source libraries offer professional SVG card designs with proper pip patterns.

---

## Recommended Libraries

### 1. Cards: `@heruka_urgyen/react-playing-cards`

**Why this one:**
- TypeScript compatible (works out of the box)
- High-quality SVG cards with traditional designs
- Multiple deck styles (two-color, four-color, normal/big faces)
- Tree-shakeable (import only what you need)
- MIT License
- 13 GitHub stars, actively maintained

**Install:**
```bash
npm install @heruka_urgyen/react-playing-cards
```

**Usage:**
```tsx
import Card from "@heruka_urgyen/react-playing-cards/lib/TcN"; // Two-color, Normal faces

// Card format: rank (2-9, T, J, Q, K, A) + suit (c, d, h, s)
<Card card="As" height="120px" />      // Ace of Spades
<Card card="Kh" height="120px" />      // King of Hearts  
<Card card="2c" height="120px" back /> // Card back
```

**Deck imports for bundle optimization:**
- `TcN` = Two-color, Normal faces (recommended)
- `TcB` = Two-color, Big faces
- `FcN` = Four-color, Normal faces
- `FcB` = Four-color, Big faces

### 2. Chips: `react-pokerchip`

**Why this one:**
- Zero dependencies
- Customizable colors, values, currencies
- Click handlers built-in
- Clean CSS-based design
- MIT License

**Install:**
```bash
npm install react-pokerchip
```

**Usage:**
```tsx
import PokerChip from 'react-pokerchip';

<PokerChip value={100} color="#E53935" />
<PokerChip value={500} color="#1E88E5" />
<PokerChip value={1000} color="#000" currency="$" />
<PokerChip value={5000} color="#9C27B0" />
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `value` | number | Chip value (max 3 significant digits displayed) |
| `text` | string | Override text (max 6 chars) |
| `color` | string | Hex/RGB/HSL color |
| `lineColor` | string | Edge spots color |
| `currency` | string | Currency symbol (1 char) |
| `size` | number | Size in pixels (default: 151) |
| `onClick` | function | Click handler |
| `disabled` | boolean | Disabled state |

### 3. TypeScript Types (if needed)

For `react-pokerchip`, create a simple declaration file:

```typescript
// frontend/src/types/react-pokerchip.d.ts
declare module 'react-pokerchip' {
  interface PokerChipProps {
    value?: number;
    text?: string;
    currency?: string;
    color?: string;
    lineColor?: string;
    size?: number;
    onClick?: () => void;
    disabled?: boolean;
  }
  
  const PokerChip: React.FC<PokerChipProps>;
  export default PokerChip;
}
```

---

## Integration Strategy

### Phase 1: Install & Create Wrapper Components

Create wrapper components that maintain your existing API but use the new libraries internally. This allows gradual migration without breaking changes.

#### Step 1.1: Install dependencies
```bash
cd frontend
npm install @heruka_urgyen/react-playing-cards react-pokerchip
```

#### Step 1.2: Create `PlayingCard.tsx` wrapper
```tsx
// frontend/src/components/common/PlayingCard.tsx
import { motion } from "framer-motion";
import clsx from "clsx";
import SvgCard from "@heruka_urgyen/react-playing-cards/lib/TcN";
import type { Card as CardType } from "../../types";

interface PlayingCardProps {
  card?: CardType;
  hidden?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  animate?: boolean;
}

const SIZES = {
  sm: "56px",
  md: "80px", 
  lg: "112px",
};

// Convert your card format to library format
function toLibraryFormat(card: CardType): string {
  const rankMap: Record<string, string> = {
    "10": "T", "J": "J", "Q": "Q", "K": "K", "A": "A",
    "2": "2", "3": "3", "4": "4", "5": "5", 
    "6": "6", "7": "7", "8": "8", "9": "9",
  };
  const suitMap: Record<string, string> = {
    "hearts": "h", "♥": "h",
    "diamonds": "d", "♦": "d", 
    "clubs": "c", "♣": "c",
    "spades": "s", "♠": "s",
  };
  
  const rank = rankMap[card.rank] || card.rank;
  const suit = suitMap[card.suit] || card.suit;
  return `${rank}${suit}`;
}

export function PlayingCard({
  card,
  hidden = false,
  size = "md",
  className,
  animate = true,
}: PlayingCardProps) {
  const height = SIZES[size];

  return (
    <motion.div
      initial={animate ? { rotateY: 90, scale: 0.8 } : false}
      animate={{ rotateY: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className={clsx("inline-block", className)}
      style={{ 
        filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.3))",
      }}
    >
      {hidden || !card ? (
        <SvgCard card="As" height={height} back />
      ) : (
        <SvgCard card={toLibraryFormat(card)} height={height} />
      )}
    </motion.div>
  );
}
```

#### Step 1.3: Create `PokerChipStack.tsx` wrapper
```tsx
// frontend/src/components/common/PokerChipStack.tsx
import { motion } from "framer-motion";
import clsx from "clsx";
import PokerChip from "react-pokerchip";

interface PokerChipStackProps {
  amount: number;
  size?: "sm" | "md" | "lg";
  className?: string;
  showValue?: boolean;
}

const CHIP_DENOMINATIONS = [
  { value: 10000, color: "#FFD700" },  // Gold
  { value: 5000, color: "#9C27B0" },   // Purple
  { value: 1000, color: "#212121" },   // Black
  { value: 500, color: "#1E88E5" },    // Blue
  { value: 100, color: "#43A047" },    // Green
  { value: 25, color: "#E53935" },     // Red
  { value: 5, color: "#FFFFFF" },      // White
];

const SIZES = {
  sm: 32,
  md: 48,
  lg: 64,
};

export function PokerChipStack({ 
  amount, 
  size = "md", 
  className,
  showValue = true,
}: PokerChipStackProps) {
  const chipSize = SIZES[size];
  
  // Calculate chip breakdown (visual only, max 3 stacks)
  const chips: Array<{ value: number; color: string; count: number }> = [];
  let remaining = amount;
  
  for (const denom of CHIP_DENOMINATIONS) {
    const count = Math.floor(remaining / denom.value);
    if (count > 0) {
      chips.push({ ...denom, count: Math.min(count, 4) });
      remaining -= count * denom.value;
      if (chips.length >= 3) break;
    }
  }

  return (
    <div className={clsx("flex flex-col items-center gap-1", className)}>
      <div className="flex gap-1">
        {chips.map((chip, i) => (
          <motion.div
            key={chip.value}
            initial={{ scale: 0, y: -10 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="relative"
            style={{ 
              marginTop: i * -4,
              zIndex: chips.length - i,
            }}
          >
            <PokerChip 
              value={chip.value} 
              color={chip.color} 
              size={chipSize}
            />
          </motion.div>
        ))}
      </div>
      {showValue && (
        <span className="text-white font-bold text-sm">
          {formatAmount(amount)}
        </span>
      )}
    </div>
  );
}

function formatAmount(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
  return amount.toLocaleString();
}
```

### Phase 2: Gradual Component Replacement

1. **Test new components in Storybook** (you already have it set up)
2. **Replace `Card.tsx`** imports with `PlayingCard.tsx` one file at a time
3. **Replace `ChipStack.tsx`** usage with `PokerChipStack.tsx`
4. **Update `PlayerSeat.tsx`** mini cards to use the new library
5. **Deprecate old components** once fully migrated

### Phase 3: Enhanced Animations

Leverage Framer Motion (already installed) for:
- Card dealing animations with staggered delays
- Chip sliding to pot animations
- Winner celebration effects
- Card flip reveals

---

## Files to Modify

| File | Change |
|------|--------|
| `frontend/package.json` | Add new dependencies |
| `frontend/src/components/common/PlayingCard.tsx` | New wrapper component |
| `frontend/src/components/common/PokerChipStack.tsx` | New wrapper component |
| `frontend/src/types/react-pokerchip.d.ts` | TypeScript declarations |
| `frontend/src/components/game/CommunityCards.tsx` | Use new PlayingCard |
| `frontend/src/components/game/PlayerSeat.tsx` | Use new PlayingCard for hole cards |
| `frontend/src/components/game/Table.tsx` | Use new PokerChipStack |

---

## Bundle Size Impact

| Package | Size (gzipped) |
|---------|----------------|
| `@heruka_urgyen/react-playing-cards` | ~50KB (single deck import) |
| `react-pokerchip` | ~3KB |

**Net impact:** Minimal increase, but you can remove your custom card CSS/gradients.

---

## Reference Projects to Study

For layout and animation inspiration:

1. **[poker_playhouse](https://github.com/byronsha/poker_playhouse)** - React + Redux + Socket.IO (very similar to your stack)
2. **[flex-poker](https://github.com/cwoolner/flex-poker)** - Clean React table layout

---

## Progress

- [x] Install the two libraries (`@letele/playing-cards`, `react-pokerchip`)
- [x] Create the wrapper components with TypeScript types
- [x] Add Storybook stories to preview cards/chips
- [x] Replace components in `CommunityCards.tsx`
- [x] Replace in `PlayerSeat.tsx` hole cards
- [ ] Update `Table.tsx` chips (optional - current ChipStack works)
- [ ] Remove old `Card.tsx` and `ChipStack.tsx` (after testing)

---

## Alternative: SVG-cards (Manual Integration)

If you prefer more control, the `svg-cards` npm package provides raw SVG files you can wrap yourself:

```bash
npm install svg-cards
```

Then reference SVGs directly:
```tsx
import cardsSvg from 'svg-cards/svg-cards.svg';

// Use as sprite sheet with <use> element
<svg viewBox="0 0 169.075 244.64">
  <use href={`${cardsSvg}#ace_of_spades`} />
</svg>
```

This gives maximum flexibility but requires more manual work.
