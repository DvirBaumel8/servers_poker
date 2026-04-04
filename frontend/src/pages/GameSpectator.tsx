import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useGameSocket, type GameState } from '../hooks/useGameSocket'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Card {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades'
  rank: 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'
}

interface PlayerAtTable {
  id: string
  name: string
  cards: (Card | null)[]
  chipStack: number
  isBot: boolean
  position: number
  status: 'folded' | 'all_in' | 'checking' | 'thinking' | 'playing'
  betAmount: number
  isDealer: boolean
  isSmallBlind: boolean
  isBigBlind: boolean
  avatarColor: string
}

// ─── Design Tokens ────────────────────────────────────────────────────────────

const C = {
  bg: '#0a0805',
  table: '#0d3d1f',
  tableBorder: '#051509',
  card: '#13132a',
  cardHover: '#161630',
  border: '#1e1e3f',
  accent: '#00e5ff',
  accentDim: 'rgba(0,229,255,0.08)',
  text: '#ffffff',
  muted: '#9ca3af',
  gold: '#ffd700',
  goldDark: '#cc9900',
  danger: '#e24b4a',
  success: '#1d9e75',
  font: "'Trebuchet MS', sans-serif",
  botHighlight: '#00e5ff',
  opponentHighlight: '#ffffff',
}

// ─── Helper: Ellipse Player Positions ──────────────────────────────────────────

function getEllipsePosition(seatIndex: number): { x: number; y: number } {
  const angle = (2 * Math.PI * seatIndex / 8) - Math.PI / 2
  return {
    x: 50 + 38 * Math.cos(angle),
    y: 50 + 34 * Math.sin(angle),
  }
}

// Remap seat indices for small tables so players sit across from each other
function getDisplayPosition(seatIndex: number, totalPlayers: number): number {
  if (totalPlayers === 2) return seatIndex === 0 ? 0 : 4
  if (totalPlayers === 3) return [0, 3, 5][seatIndex] ?? seatIndex
  return seatIndex
}

function lerpPos(a: { x: number; y: number }, b: { x: number; y: number }, t: number): { x: number; y: number } {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  }
}

// ─── CardDisplay: True 3D with Backface ────────────────────────────────────────

function CardDisplay({
  card,
  rotate = 0,
  revealed = true,
  animationDelay = 0,
  isActive = false,
  width = 72,
  height = 104,
  noEntryAnimation = false,
}: {
  card: Card | null
  rotate?: number
  revealed?: boolean
  animationDelay?: number
  isActive?: boolean
  width?: number
  height?: number
  noEntryAnimation?: boolean
}) {
  const suitSymbol: Record<Card['suit'], string> = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠',
  }

  const suitColor: Record<Card['suit'], string> = {
    hearts: '#e24b4a',
    diamonds: '#e24b4a',
    clubs: '#1a1a2e',
    spades: '#1a1a2e',
  }

  // Guard against undefined card - render card back
  if (!card || !card.rank) {
    return (
      <div
        style={{
          width,
          height,
          perspective: 600,
          perspectiveOrigin: '50% 50%',
          transformStyle: 'preserve-3d',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width,
            height,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            borderRadius: Math.floor(width * 0.1),
            overflow: 'hidden',
            background: `linear-gradient(145deg, #9eaab6 0%, #6e7f8d 40%, #4a5a68 100%)`,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.3)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: Math.floor(width * 0.05),
              borderRadius: Math.floor(width * 0.08),
              border: `1px solid rgba(255,255,255,0.25)`,
              background: `
                repeating-linear-gradient(45deg, rgba(255,255,255,0.18) 0px, rgba(255,255,255,0.18) 1px, transparent 1px, transparent 6px),
                repeating-linear-gradient(-45deg, rgba(255,255,255,0.18) 0px, rgba(255,255,255,0.18) 1px, transparent 1px, transparent 6px)
              `,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: Math.floor(width * 0.24),
              color: 'rgba(255,255,255,0.4)',
              fontWeight: '900',
              letterSpacing: '2px',
            }}
          >
            BR
          </div>
        </div>
      </div>
    )
  }

  const rankSize = card.rank === '10' ? Math.floor(width * 0.24) : Math.floor(width * 0.28)

  return (
    <div
      style={{
        width,
        height,
        perspective: 600,
        perspectiveOrigin: '50% 50%',
        transformStyle: 'preserve-3d',
        position: 'relative',
        animation: noEntryAnimation ? undefined : `cardDeal3d 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) ${animationDelay}s both`,
      }}
    >
      {/* Card inner: rotates on Y axis */}
      <div
        style={{
          width: '100%',
          height: '100%',
          transformStyle: 'preserve-3d',
          transform: revealed ? 'rotateY(0deg)' : 'rotateY(180deg)',
          transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative',
          animation: isActive ? 'cardFloat 3s ease-in-out infinite' : undefined,
        }}
      >
        {/* FRONT FACE */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width,
            height,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            background: `linear-gradient(160deg, #ffffff 0%, #f4f4f4 60%, #eeeeee 100%)`,
            border: '1px solid rgba(0,0,0,0.15)',
            borderRadius: Math.floor(width * 0.1),
            boxShadow: '0 6px 18px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.9)',
            transform: `perspective(600px) rotateY(2deg) rotateZ(${rotate}deg)`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: suitColor[card.suit],
          }}
        >
          {/* Top-left corner */}
          <div
            style={{
              position: 'absolute',
              top: 5,
              left: 5,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              lineHeight: 1,
            }}
          >
            <div style={{ fontSize: rankSize, fontWeight: 900, marginBottom: -3 }}>{card.rank}</div>
            <div style={{ fontSize: Math.floor(width * 0.2) }}>{suitSymbol[card.suit]}</div>
          </div>

          {/* Center suit */}
          <div style={{ fontSize: Math.floor(width * 0.38), lineHeight: 1, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' }}>
            {suitSymbol[card.suit]}
          </div>

          {/* Bottom-right corner (inverted) */}
          <div
            style={{
              position: 'absolute',
              bottom: 5,
              right: 5,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              lineHeight: 1,
              transform: 'rotate(180deg)',
            }}
          >
            <div style={{ fontSize: rankSize, fontWeight: 900, marginBottom: -3 }}>{card.rank}</div>
            <div style={{ fontSize: Math.floor(width * 0.2) }}>{suitSymbol[card.suit]}</div>
          </div>
        </div>

        {/* BACK FACE - Gray Metallic Crosshatch */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width,
            height,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            borderRadius: Math.floor(width * 0.1),
            overflow: 'hidden',
            background: `linear-gradient(145deg, #9eaab6 0%, #6e7f8d 40%, #4a5a68 100%)`,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.3)',
          }}
        >
          {/* Metallic crosshatch pattern on back */}
          <div
            style={{
              position: 'absolute',
              inset: Math.floor(width * 0.05),
              borderRadius: Math.floor(width * 0.08),
              border: `1px solid rgba(255,255,255,0.25)`,
              background: `
                repeating-linear-gradient(45deg, rgba(255,255,255,0.18) 0px, rgba(255,255,255,0.18) 1px, transparent 1px, transparent 6px),
                repeating-linear-gradient(-45deg, rgba(255,255,255,0.18) 0px, rgba(255,255,255,0.18) 1px, transparent 1px, transparent 6px)
              `,
            }}
          />

          {/* Center logo - BR */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: Math.floor(width * 0.24),
              color: 'rgba(255,255,255,0.4)',
              fontWeight: '900',
              letterSpacing: '2px',
            }}
          >
            BR
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── BlindBadge Helper ─────────────────────────────────────────────────────────

function BlindBadge({ label }: { label: string }) {
  const bgColor = label === 'D' ? '#1a1a1a' : label === 'SB' ? '#1565c0' : '#b71c1c'

  return (
    <div
      style={{
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: bgColor,
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 9,
        fontWeight: 900,
        boxShadow: `0 2px 6px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.2)`,
        border: '1.5px solid rgba(255,255,255,0.3)',
      }}
    >
      {label}
    </div>
  )
}

// ─── ActionBadge Component ────────────────────────────────────────────────────

const ACTION_COLORS: Record<string, string> = {
  FOLD: '#6b7280',
  RAISE: '#f59e0b',
  CALL: '#1565c0',
  CHECK: '#1d9e75',
  'ALL-IN': '#ffd700',
}

function ActionBadge({ action }: { action: string | null }) {
  if (!action) return null

  const baseAction = action.split(' ')[0].toUpperCase()
  const color = ACTION_COLORS[baseAction] || C.text

  return (
    <div
      style={{
        position: 'absolute',
        top: -10,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 25,
        background: `rgba(0,0,0,0.85)`,
        border: `1px solid ${color}`,
        borderRadius: 20,
        padding: '4px 12px',
        fontSize: 11,
        fontWeight: 'bold',
        color,
        letterSpacing: '1px',
        whiteSpace: 'nowrap',
        animation: 'actionFloat 1.5s ease-out forwards',
        textTransform: 'uppercase',
        boxShadow: `0 0 12px ${color}66`,
      }}
    >
      {action}
    </div>
  )
}

// ─── BotAvatar: Hexagonal ─────────────────────────────────────────────────────

function BotAvatar({
  name,
  color,
  isActive,
  isFolded = false,
  size = 40,
}: {
  name: string
  color: string
  isActive: boolean
  isFolded?: boolean
  size?: number
}) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div style={{ position: 'relative', width: size, height: size, zIndex: 15 }}>
      {/* Active player timer arc overlay */}
      {isActive && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: `conic-gradient(rgba(0,229,255,0.6) 0%, transparent 0%)`,
            animation: 'timerArc 15s linear infinite',
          }}
        />
      )}

      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${color} 0%, ${color}99 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.35,
          fontWeight: 'bold',
          color: '#ffffff',
          boxShadow: isActive
            ? `0 0 0 3px ${C.accent}, 0 0 20px rgba(0,229,255,0.5), 0 4px 12px rgba(0,0,0,0.5)`
            : `0 0 0 2px rgba(255,255,255,0.2), 0 4px 12px rgba(0,0,0,0.5)`,
          opacity: isFolded ? 0.5 : 1,
          filter: isFolded ? 'grayscale(0.7)' : 'none',
          transition: 'all 0.3s ease',
          letterSpacing: '0.5px',
          position: 'relative',
          zIndex: 2,
        }}
      >
        {initials}
      </div>

      {/* Blind badges - overlaid on top-right */}
      {/* Will be handled separately in PlayerNamePlate */}
    </div>
  )
}

// ─── BetChip: Small chip on felt between player and center ──────────────────────

function BetChip({ amount }: { amount: number }) {
  const chipCount = amount > 500 ? 3 : amount > 100 ? 2 : 1
  const color = amount > 500 ? '#212121' : amount > 100 ? '#e53935' : '#00bcd4'
  const darkerColor = amount > 500 ? '#0a0a0a' : amount > 100 ? '#c62828' : '#0097a7'
  const lighterColor = amount > 500 ? '#424242' : amount > 100 ? '#ef5350' : '#26c6da'

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {/* Stacked chips */}
      <div style={{ position: 'relative', width: 32, height: 32 + (chipCount - 1) * 4 }}>
        {Array.from({ length: chipCount }, (_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: `radial-gradient(circle at 32% 28%, ${lighterColor} 0%, ${color} 50%, ${darkerColor} 100%)`,
              border: `2px solid rgba(255,255,255,0.4)`,
              boxShadow: `0 3px 8px rgba(0,0,0,0.6), inset 0 -2px 4px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.25)`,
              top: i * 4,
              left: 0,
            }}
          >
            {/* Segmented edge - simplified */}
            <div
              style={{
                position: 'absolute',
                inset: 2,
                borderRadius: '50%',
                background: `conic-gradient(transparent 0deg 25deg, rgba(255,255,255,0.3) 25deg 30deg, transparent 30deg 65deg, rgba(255,255,255,0.3) 65deg 70deg, transparent 70deg)`,
                pointerEvents: 'none',
              }}
            />
          </div>
        ))}
      </div>

      {/* Amount label below */}
      <div
        style={{
          fontSize: 12,
          fontWeight: 'bold',
          color: '#ffffff',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {amount}
      </div>
    </div>
  )
}

// ─── PlayerNamePlate: Compact horizontal info pill ────────────────────────────

function PlayerNamePlate({
  player,
  isMyBot,
  isActive,
}: {
  player: PlayerAtTable
  isMyBot: boolean
  isActive: boolean
}) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        background: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(10px)',
        borderRadius: 10,
        padding: '8px 12px',
        border: isActive ? `1px solid ${C.accent}` : isMyBot ? `1px solid rgba(0, 229, 255, 0.6)` : `1px solid rgba(255, 255, 255, 0.1)`,
        boxShadow: isActive ? `0 0 12px rgba(0, 229, 255, 0.3)` : 'none',
        minWidth: 110,
        zIndex: 20,
      }}
    >
      <BotAvatar name={player.name} color={player.avatarColor} isActive={isActive} isFolded={player.status === 'folded'} size={40} />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <div
          style={{
            fontSize: 13,
            color: '#d4dae4',
            fontWeight: '600',
            maxWidth: 75,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            letterSpacing: '0.3px',
          }}
        >
          {player.name}
        </div>
        <div
          style={{
            fontSize: 17,
            fontWeight: '700',
            color: isMyBot ? C.accent : '#f0f0f0',
            fontVariantNumeric: 'tabular-nums',
            fontFamily: "'Courier New', monospace",
            letterSpacing: '0.1px',
          }}
        >
          {player.chipStack.toLocaleString()}
        </div>
      </div>
    </div>
  )
}

// ─── PlayerPosition (Rewritten) ────────────────────────────────────────────────

function PlayerPosition({
  player,
  isMyBot,
  isActive,
  lastAction,
  isShowdown = false,
  cardWidth = 72,
  cardHeight = 104,
}: {
  player: PlayerAtTable
  isMyBot: boolean
  isActive: boolean
  lastAction?: string
  isShowdown?: boolean
  cardWidth?: number
  cardHeight?: number
}) {
  const isFolded = player.status === 'folded'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        filter: isFolded ? 'grayscale(1) brightness(0.6)' : 'none',
        transition: 'filter 0.3s ease',
        position: 'relative',
        zIndex: 1,
      }}
    >
      {/* Status badges container - only show one at a time */}
      {(lastAction || isFolded || player.chipStack === 0 || player.status === 'all_in') && (
        <div style={{ height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {lastAction && <ActionBadge action={lastAction} />}
        </div>
      )}

      {/* Compact horizontal nameplate */}
      <PlayerNamePlate player={player} isMyBot={isMyBot} isActive={isActive} />

      {/* Blind badges - properly centered below nameplate */}
      {(player.isDealer || player.isSmallBlind || player.isBigBlind) && (
        <div
          style={{
            display: 'flex',
            gap: 4,
            marginTop: 2,
            justifyContent: 'center',
            position: 'relative',
            zIndex: 15,
          }}
        >
          {player.isDealer && <BlindBadge label="D" />}
          {player.isSmallBlind && <BlindBadge label="SB" />}
          {player.isBigBlind && <BlindBadge label="BB" />}
        </div>
      )}

      {/* Hole cards - float below nameplate, with active glow border */}
      {/* Always show card area when player has cards (backs visible until showdown) */}
      {player.cards.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 4,
            opacity: isFolded ? 0.35 : 1,
            animation: isFolded ? 'cardFold 0.5s ease-in forwards' : undefined,
            transition: 'opacity 0.3s',
            position: 'relative',
            zIndex: 10,
            ...(isActive ? {
              boxShadow: '0 0 20px rgba(0,229,255,0.4), 0 0 40px rgba(0,229,255,0.2)',
              border: '1px solid rgba(0,229,255,0.4)',
              borderRadius: 8,
              padding: 4,
              background: 'rgba(0,229,255,0.05)',
              animation: 'cardAreaGlow 2s ease-in-out infinite',
            } : {}),
          }}
        >
          <CardDisplay
            card={player.cards[0]}
            rotate={0}
            revealed={(isMyBot || isShowdown) && !isFolded}
            isActive={isActive}
            width={cardWidth}
            height={cardHeight}
            animationDelay={0}
          />
          <CardDisplay
            card={player.cards[1]}
            rotate={0}
            revealed={(isMyBot || isShowdown) && !isFolded}
            isActive={isActive}
            width={cardWidth}
            height={cardHeight}
            animationDelay={0.1}
          />
        </div>
      )}

      {/* Out badge takes precedence - if player has 0 chips */}
      {player.chipStack === 0 && (
        <div
          style={{
            fontSize: 10,
            fontWeight: 'bold',
            color: '#ffffff',
            background: 'rgba(100, 100, 100, 0.85)',
            padding: '3px 8px',
            borderRadius: 12,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            border: '1px solid #666666',
          }}
        >
          ⊘ OUT
        </div>
      )}

      {/* All-in badge - if applicable (only if has chips) */}
      {player.chipStack > 0 && player.status === 'all_in' && (
        <div
          style={{
            fontSize: 10,
            fontWeight: 'bold',
            color: '#ffffff',
            background: 'rgba(226, 75, 74, 0.85)',
            padding: '3px 8px',
            borderRadius: 12,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            border: '1px solid #e24b4a',
          }}
        >
          🔴 ALL IN
        </div>
      )}

      {/* Folded badge - if applicable (only show if has chips and not all-in) */}
      {isFolded && player.chipStack > 0 && player.status !== 'all_in' && (
        <div
          style={{
            fontSize: 10,
            fontWeight: 'bold',
            color: '#ffffff',
            background: 'rgba(107, 114, 128, 0.85)',
            padding: '3px 8px',
            borderRadius: 12,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            border: '1px solid #9ca3af',
          }}
        >
          ✕ FOLDED
        </div>
      )}
    </div>
  )
}

// ─── CommunityCards (Rewritten) ────────────────────────────────────────────────

function CommunityCards({
  cards,
  cardWidth = 76,
  cardHeight = 110,
}: {
  cards: Card[]
  cardWidth?: number
  cardHeight?: number
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
        justifyContent: 'center',
      }}
    >
      {cards.map((card, i) => (
        <div
          key={card ? `${card.suit}-${card.rank}` : i}
          style={{
            animation: `communityFlip 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 0.18}s both`,
            perspective: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CardDisplay
            card={card}
            revealed={true}
            width={cardWidth}
            height={cardHeight}
            animationDelay={0}
            noEntryAnimation={true}
          />
        </div>
      ))}
    </div>
  )
}

// ─── Tournament Info Bar ───────────────────────────────────────────────────────

interface TournamentInfoBarProps {
  gameState: GameState
}

function TournamentInfoBar({ gameState }: TournamentInfoBarProps) {
  const isGameActive = gameState.playersRemaining > 0
  const displayTitle = isGameActive ? gameState.tournamentName : '⏳ Waiting for Players'

  return (
    <div
      style={{
        background: 'rgba(19,19,42,0.8)',
        backdropFilter: 'blur(10px)',
        border: `1px solid rgba(30,30,63,0.6)`,
        borderRadius: 8,
        padding: '16px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
        fontFamily: C.font,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}
    >
      <div>
        <div style={{ fontSize: 16, fontWeight: 'bold', color: isGameActive ? C.text : C.muted, letterSpacing: '0.5px' }}>
          {displayTitle}
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 4, display: 'flex', gap: 12 }}>
          {isGameActive && (
            <>
              <span>📊 Level {gameState.currentLevel}</span>
              <span>⏱ Next in {gameState.timeUntilNextLevel}</span>
            </>
          )}
          {!isGameActive && (
            <span>⏰ Waiting to start...</span>
          )}
        </div>
      </div>

      <div style={{ textAlign: 'center', paddingLeft: 20, paddingRight: 20 }}>
        <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>
          👥 Players Left
        </div>
        <div
          style={{
            fontSize: 24,
            fontWeight: 'bold',
            color: C.accent,
            background: 'rgba(0, 229, 255, 0.1)',
            padding: '6px 12px',
            borderRadius: 6,
            border: `1px solid ${C.accent}`,
          }}
        >
          {gameState.playersRemaining}/{gameState.totalPlayers}
        </div>
      </div>

      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>
          💰 Blinds
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 'bold',
            color: C.text,
            background: 'rgba(255, 255, 255, 0.05)',
            padding: '6px 12px',
            borderRadius: 6,
            border: `1px solid ${C.border}`,
          }}
        >
          {gameState.blinds.small.toFixed(2)}/{gameState.blinds.big.toFixed(2)}
        </div>
      </div>
    </div>
  )
}

// ─── Pot Display ──────────────────────────────────────────────────────────────

function PotDisplay({ pot }: { pot: number }) {
  const [displayPot, setDisplayPot] = useState(pot)
  const prevPotRef = useRef(pot)
  const rafRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)

  useEffect(() => {
    const from = prevPotRef.current
    const to = pot
    if (from === to) return

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    startTimeRef.current = null
    const duration = 600

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp
      const progress = Math.min((timestamp - startTimeRef.current) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayPot(from + (to - from) * eased)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        prevPotRef.current = to
        rafRef.current = null
      }
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, [pot])

  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          fontSize: 11,
          color: '#6b7280',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          fontWeight: '600',
          marginBottom: 4,
        }}
      >
        Total Pot
      </div>
      <div
        style={{
          fontSize: 52,
          fontWeight: '900',
          color: '#ffd700',
          textShadow: '0 0 20px rgba(255,215,0,0.6), 0 0 40px rgba(255,215,0,0.3), 0 2px 4px rgba(0,0,0,0.8)',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-1px',
          lineHeight: 1,
          animation: 'pulse-gold 3s ease-in-out infinite',
        }}
      >
        {displayPot.toFixed(2)}
      </div>
    </div>
  )
}

// ─── Stage Indicator ──────────────────────────────────────────────────────────

function StageIndicator({ stage }: { stage: string }) {
  const stageLabels: Record<string, string> = {
    'pre-flop': 'Pre-Flop',
    'flop': 'Flop',
    'turn': 'Turn',
    'river': 'River',
    'showdown': 'Showdown',
    'waiting': 'Waiting',
  }

  const stageColors: Record<string, string> = {
    'pre-flop': '#9ca3af',
    'flop': '#10b981',
    'turn': '#f59e0b',
    'river': '#ef4444',
    'showdown': '#ffd700',
    'waiting': '#6b7280',
  }

  const label = stageLabels[stage] || stage
  const color = stageColors[stage] || '#9ca3af'

  return (
    <div
      style={{
        height: 24,
        padding: '4px 12px',
        background: 'rgba(0,0,0,0.6)',
        border: `1px solid ${color}`,
        borderRadius: 12,
        fontSize: 10,
        fontWeight: 'bold',
        color,
        textTransform: 'uppercase',
        letterSpacing: '1px',
        display: 'inline-block',
        marginBottom: 8,
      }}
    >
      {label}
    </div>
  )
}

// ─── Winner Announcement ──────────────────────────────────────────────────────

function formatHandName(name: string): string {
  const mapping: Record<string, string> = {
    'ROYAL_FLUSH': 'Royal Flush',
    'STRAIGHT_FLUSH': 'Straight Flush',
    'FOUR_OF_A_KIND': 'Four of a Kind',
    'FULL_HOUSE': 'Full House',
    'FLUSH': 'Flush',
    'STRAIGHT': 'Straight',
    'THREE_OF_A_KIND': 'Three of a Kind',
    'TWO_PAIR': 'Two Pair',
    'ONE_PAIR': 'One Pair',
    'HIGH_CARD': 'High Card',
    'Winner': 'Winner',
  }
  return mapping[name] || name
}

interface HandResultInfo {
  winners: Array<{
    playerName: string
    amount: number
    handName: string
  }>
  pot: number
  handNumber: number
  timestamp: number
}

function WinnerAnnouncement({ handResult }: { handResult: HandResultInfo }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 30,
        maxWidth: 400,
        padding: 24,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(12px)',
        border: '2px solid #ffd700',
        borderRadius: 16,
        boxShadow: '0 0 40px rgba(255, 215, 0, 0.4)',
        animation: 'winnerReveal 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        {handResult.winners.map((winner, idx) => (
          <div key={idx} style={{ marginBottom: idx === handResult.winners.length - 1 ? 0 : 12 }}>
            <div style={{ fontSize: 18, fontWeight: 'bold', color: '#ffffff', marginBottom: 4 }}>
              {winner.playerName}
            </div>
            <div style={{ fontSize: 14, color: '#ffd700', marginBottom: 2 }}>
              {formatHandName(winner.handName)}
            </div>
            <div style={{ fontSize: 20, fontWeight: 'bold', color: '#00e5ff', fontFamily: "'Courier New', monospace" }}>
              +{winner.amount.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Control Button Component ──────────────────────────────────────────────────

function ControlButton({
  onClick,
  children,
  variant = 'default',
  active = false,
}: {
  onClick?: () => void
  children: React.ReactNode
  variant?: 'primary' | 'default' | 'danger'
  active?: boolean
}) {
  const colors = {
    primary: { bg: C.accent, hover: '#00d4ea', text: '#000000' },
    default: { bg: 'rgba(255, 255, 255, 0.1)', hover: 'rgba(255, 255, 255, 0.15)', text: C.text },
    danger: { bg: C.danger, hover: '#d63d39', text: C.text },
  }

  const color = colors[variant]

  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 16px',
        background: active ? C.accent : color.bg,
        color: active ? '#000000' : color.text,
        border: '1px solid rgba(0, 0, 0, 0.2)',
        borderRadius: 6,
        cursor: 'pointer',
        fontWeight: active ? 'bold' : '600',
        fontSize: 13,
        fontFamily: C.font,
        transition: 'all 0.2s ease',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        transform: 'translateY(0)',
      }}
      onMouseEnter={(e) => {
        const target = e.currentTarget as HTMLButtonElement
        target.style.transform = 'translateY(-2px)'
        target.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.4)'
        if (!active) target.style.background = color.hover
      }}
      onMouseLeave={(e) => {
        const target = e.currentTarget as HTMLButtonElement
        target.style.transform = 'translateY(0)'
        target.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)'
        if (!active) target.style.background = color.bg
      }}
    >
      {children}
    </button>
  )
}

// ─── Spectator Controls ────────────────────────────────────────────────────────

function SpectatorControls({
  onPlayPause,
  onSpeedChange,
  onSkipHand,
  onShowStrategy,
  onLeave,
  showStrategy,
  isPlaying,
}: {
  onPlayPause: () => void
  onSpeedChange: (speed: number) => void
  onSkipHand: () => void
  onShowStrategy: (show: boolean) => void
  onLeave: () => void
  showStrategy: boolean
  isPlaying: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(19, 19, 42, 0.8)',
        backdropFilter: 'blur(10px)',
        border: `1px solid rgba(30, 30, 63, 0.6)`,
        borderRadius: 8,
        padding: '16px 24px',
        marginTop: 24,
        fontFamily: C.font,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        flexWrap: 'wrap',
        gap: 8,
      }}
    >
      {/* Left Controls */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <ControlButton onClick={onPlayPause} variant="primary">
          {isPlaying ? '⏸ Pause' : '▶ Play'}
        </ControlButton>

        <div style={{ display: 'flex', gap: 6, marginLeft: 8, paddingLeft: 12, borderLeft: `1px solid ${C.border}` }}>
          {[0.5, 1, 2, 4].map((speed) => (
            <ControlButton key={speed} onClick={() => onSpeedChange(speed)} variant="default">
              {speed}x
            </ControlButton>
          ))}
        </div>

        <ControlButton onClick={onSkipHand} variant="default">
          ⏭ Skip
        </ControlButton>
      </div>

      {/* Right Controls */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <ControlButton onClick={() => onShowStrategy(!showStrategy)} variant="default" active={showStrategy}>
          🧠 {showStrategy ? 'Strategy On' : 'Strategy Off'}
        </ControlButton>

        <ControlButton variant="default">📋 History</ControlButton>

        <ControlButton onClick={onLeave} variant="danger">
          ✕ Leave
        </ControlButton>
      </div>
    </div>
  )
}

// ─── Hand History Sidebar ──────────────────────────────────────────────────────

function HandHistorySidebar({ actions, isOpen }: { actions: string[]; isOpen: boolean }) {
  return (
    <div
      style={{
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
        width: 280,
        background: C.card,
        borderLeft: `1px solid ${C.border}`,
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s ease',
        zIndex: 100,
        overflowY: 'auto',
        padding: 16,
        fontFamily: C.font,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 'bold', color: C.text, marginBottom: 16 }}>Hand History</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {actions.map((action, i) => (
          <div
            key={i}
            style={{
              fontSize: 12,
              color: C.muted,
              padding: 8,
              background: 'rgba(0, 229, 255, 0.04)',
              borderLeft: `2px solid ${C.accent}`,
              paddingLeft: 12,
              borderRadius: 2,
            }}
          >
            {action}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main GameSpectator Component ──────────────────────────────────────────────

interface GameSpectatorProps {
  gameId?: string
}

export default function GameSpectator({ gameId: propGameId }: GameSpectatorProps = {}) {
  const { gameId: paramGameId } = useParams<{ gameId: string }>()
  const gameId = propGameId || paramGameId
  const navigate = useNavigate()
  const tableRef = useRef<HTMLDivElement>(null)

  const [showStrategy] = useState(false)
  const [isPlaying, setIsPlaying] = useState(true)
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')

  // Reactive viewport + table size
  useEffect(() => {
    const measure = () => {
      const w = window.innerWidth
      if (w >= 1200) setViewport('desktop')
      else if (w >= 768) setViewport('tablet')
      else setViewport('mobile')

      // Table size measurement not currently used
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(document.documentElement)
    return () => ro.disconnect()
  }, [])

  // Load real-time game state from Socket.IO
  const { gameState: socketGameState, connectionStatus } = useGameSocket(gameId || '')

  // Use socket game state directly
  const displayGameState = socketGameState

  if (!displayGameState) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: C.bg,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: C.muted,
          fontFamily: C.font,
          gap: 20,
        }}
      >
        <div>Loading game...</div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background:
                connectionStatus === 'connected'
                  ? '#10b981'
                  : connectionStatus === 'error'
                    ? '#ef4444'
                    : '#f59e0b',
              animation: connectionStatus === 'connecting' ? 'pulse 1s infinite' : 'none',
            }}
          />
          {connectionStatus === 'connected' && '🟢 Live'}
          {connectionStatus === 'connecting' && '🟡 Connecting...'}
          {connectionStatus === 'disconnected' && '🔴 Disconnected'}
          {connectionStatus === 'error' && '🔴 Connection Error'}
        </div>
      </div>
    )
  }

  // Compute derived values (10-15% larger cards for visual impact)
  const tableScale = viewport === 'tablet' ? 0.8 : 1
  const isPortrait = viewport === 'mobile'
  const cardW = viewport === 'desktop' ? 82 : viewport === 'tablet' ? 66 : 54
  const cardH = viewport === 'desktop' ? 118 : viewport === 'tablet' ? 95 : 78
  const communityCardW = viewport === 'desktop' ? 88 : viewport === 'tablet' ? 70 : 62
  const communityCardH = viewport === 'desktop' ? 127 : viewport === 'tablet' ? 102 : 90

  // Compute last actions map
  const playerLastActions = new Map<string, string>()
  displayGameState.lastActions.forEach((s: string) => {
    const parts = s.split(' ')
    const name = parts[0]
    const verb = parts[1]?.toUpperCase()
    const amount = parts[2]
    playerLastActions.set(name, amount ? `${verb} ${amount}` : verb)
  })

  return (
    <div
      style={{
        minHeight: '100vh',
        background: C.bg,
        padding: viewport === 'mobile' ? '10px' : '20px',
        fontFamily: C.font,
        overflow: 'hidden',
      }}
    >
      {/* Main content */}
      <div
        style={{
          maxWidth: 1400,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Tournament Info Bar with Connection Status */}
        <div style={{ position: 'relative' }}>
          <TournamentInfoBar gameState={displayGameState} />
          <div
            style={{
              position: 'absolute',
              top: 16,
              right: 24,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: C.muted,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background:
                  connectionStatus === 'connected'
                    ? '#10b981'
                    : connectionStatus === 'error'
                      ? '#ef4444'
                      : '#f59e0b',
                animation: connectionStatus === 'connecting' ? 'pulse 1s infinite' : 'none',
              }}
            />
            {connectionStatus === 'connected' && 'Live'}
            {connectionStatus === 'connecting' && 'Connecting...'}
            {connectionStatus === 'disconnected' && 'Offline'}
            {connectionStatus === 'error' && 'Error'}
          </div>
        </div>

        {isPortrait ? (
          // MOBILE PORTRAIT LAYOUT
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: '0 4px',
              position: 'relative',
            }}
          >
            {/* Stage indicator */}
            <div style={{ textAlign: 'center' }}>
              <StageIndicator stage={displayGameState.stage} />
            </div>

            {/* Compact community cards */}
            <CommunityCards cards={displayGameState.communityCards} cardWidth={communityCardW} cardHeight={communityCardH} />

            {/* Pot display */}
            <div style={{ textAlign: 'center', color: C.gold, fontSize: 20, fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>
              Pot: {displayGameState.pot.toFixed(2)}
            </div>

            {/* 2-column grid of players */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 6,
              }}
            >
              {displayGameState.players.map((player: PlayerAtTable) => (
                <PlayerPosition
                  key={player.id}
                  player={player}
                  isMyBot={displayGameState.myBotIds.includes(player.id)}
                  isActive={displayGameState.activePlayerIndex === player.position}
                  cardWidth={cardW}
                  cardHeight={cardH}
                  lastAction={playerLastActions.get(player.name)}
                  isShowdown={displayGameState.isShowdown}
                />
              ))}
            </div>
          </div>
        ) : (
          // DESKTOP/TABLET OVAL TABLE LAYOUT
          <div
            ref={tableRef}
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '16 / 9',
              background: C.bg,
              marginBottom: viewport === 'tablet' ? `${(tableScale - 1) * -50}%` : 24,
              transform: `scale(${tableScale})`,
              transformOrigin: 'top center',
            }}
          >
            {/* Wood rail */}
            <div
              style={{
                position: 'absolute',
                inset: '2% 3%',
                borderRadius: '50%',
                background: `
                  radial-gradient(ellipse at 50% 10%, #a0714f 0%, #7a4a2a 15%, #3d1f0a 50%, #6b3a1f 80%, #4a2510 100%),
                  repeating-linear-gradient(92deg, transparent 0px, transparent 12px, rgba(0,0,0,0.08) 12px, rgba(0,0,0,0.08) 14px)
                `,
                boxShadow: `
                  inset 0 8px 16px rgba(255, 255, 255, 0.14),
                  inset 0 -6px 12px rgba(0, 0, 0, 0.7),
                  inset 4px 0 8px rgba(0, 0, 0, 0.3),
                  inset -4px 0 8px rgba(0, 0, 0, 0.3),
                  0 0 50px rgba(0, 0, 0, 0.9),
                  0 24px 80px rgba(0, 0, 0, 0.6)
                `,
              }}
            />

            {/* Felt oval */}
            <div
              style={{
                position: 'absolute',
                inset: '6% 8%',
                borderRadius: '50%',
                background: `
                  radial-gradient(ellipse at 50% 45%, #256b40 0%, #1a5232 30%, #0e3d22 60%, #062010 100%),
                  repeating-linear-gradient(30deg, transparent 0px, transparent 2px, rgba(255,255,255,0.015) 2px, rgba(255,255,255,0.015) 3px),
                  repeating-linear-gradient(60deg, transparent 0px, transparent 2px, rgba(255,255,255,0.015) 2px, rgba(255,255,255,0.015) 3px),
                  repeating-linear-gradient(90deg, transparent 0px, transparent 2px, rgba(255,255,255,0.01) 2px, rgba(255,255,255,0.01) 3px)
                `,
                boxShadow: `
                  inset 0 0 120px rgba(0,0,0,0.7),
                  inset 0 0 60px rgba(0,0,0,0.5),
                  inset 0 0 30px rgba(0,0,0,0.3)
                `,
                overflow: 'hidden',
              }}
            >
              {/* Center watermark */}
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  fontSize: 110,
                  color: 'rgba(255,255,255,0.025)',
                  fontWeight: '900',
                  letterSpacing: '3px',
                  pointerEvents: 'none',
                  zIndex: 0,
                }}
              >
                BR
              </div>

              {/* Center dealer zone overlay */}
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '50%',
                  height: '40%',
                  borderRadius: '50%',
                  background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.25) 0%, transparent 70%)',
                  pointerEvents: 'none',
                  zIndex: 0,
                }}
              />

              {/* Player positions */}
              {displayGameState.players.map((player: PlayerAtTable, playerIdx: number) => {
                const displaySeat = getDisplayPosition(playerIdx, displayGameState.players.length)
                const pos = getEllipsePosition(displaySeat)
                const isMyBot = displayGameState.myBotIds.includes(player.id)
                const isActive = displayGameState.activePlayerIndex === player.position

                return (
                  <div
                    key={player.id}
                    style={{
                      position: 'absolute',
                      left: `${pos.x}%`,
                      top: `${pos.y}%`,
                      transform: 'translate(-50%, -50%)',
                      zIndex: 1,
                    }}
                  >
                    <PlayerPosition
                      player={player}
                      isMyBot={isMyBot}
                      isActive={isActive}
                      cardWidth={cardW}
                      cardHeight={cardH}
                      lastAction={playerLastActions.get(player.name)}
                      isShowdown={displayGameState.isShowdown}
                    />
                  </div>
                )
              })}

              {/* Bet chips on felt - rendered before players so they don't overlap */}
              {displayGameState.players.map((player: PlayerAtTable, playerIdx: number) => {
                if (player.betAmount === 0) return null
                const displaySeat = getDisplayPosition(playerIdx, displayGameState.players.length)
                const playerPos = getEllipsePosition(displaySeat)
                const betChipPos = lerpPos(playerPos, { x: 50, y: 50 }, 0.4)

                return (
                  <div
                    key={`bet-${player.id}`}
                    style={{
                      position: 'absolute',
                      left: `${betChipPos.x}%`,
                      top: `${betChipPos.y}%`,
                      transform: 'translate(-50%, -50%)',
                      zIndex: 1,
                      pointerEvents: 'none',
                    }}
                  >
                    <BetChip amount={player.betAmount} />
                  </div>
                )
              })}

              {/* Center: Pot + Community Cards */}
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <StageIndicator stage={displayGameState.stage} />
                <PotDisplay pot={displayGameState.pot} />
                <div style={{ marginTop: 8 }}>
                  <CommunityCards cards={displayGameState.communityCards} cardWidth={communityCardW} cardHeight={communityCardH} />
                </div>
              </div>

              {/* Winner Announcement Overlay */}
              {displayGameState.handResult && (
                <WinnerAnnouncement handResult={displayGameState.handResult} />
              )}
            </div>
          </div>
        )}

        {/* Spectator Controls */}
        <SpectatorControls
          onPlayPause={() => setIsPlaying(!isPlaying)}
          onSpeedChange={() => {}}
          onSkipHand={() => {}}
          onShowStrategy={() => {}}
          onLeave={() => navigate('/games')}
          showStrategy={showStrategy}
          isPlaying={isPlaying}
        />
      </div>

      {/* Hand History Sidebar */}
      <HandHistorySidebar actions={displayGameState.lastActions} isOpen={false} />

      {/* CSS Animations */}
      <style>{`
        @keyframes cardDeal3d {
          0% {
            opacity: 0;
            transform: translate3d(0, -80px, 60px) rotateY(-60deg) rotateZ(15deg) scale(0.6);
          }
          60% {
            opacity: 1;
            transform: translate3d(0, 4px, 0) rotateY(8deg) rotateZ(-2deg) scale(1.04);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) rotateY(0deg) rotateZ(0deg) scale(1);
          }
        }

        @keyframes communityFlip {
          0%   { transform: rotateY(90deg) scale(0.85); opacity: 0; }
          40%  { opacity: 1; }
          100% { transform: rotateY(0deg) scale(1); opacity: 1; }
        }

        @keyframes cardFloat {
          0%, 100% { transform: translateY(0px) rotateZ(0deg); }
          50%       { transform: translateY(-6px) rotateZ(0.5deg); }
        }

        @keyframes cardFold {
          0%   { transform: translate3d(0, 0, 0) rotateZ(0deg); opacity: 1; }
          100% { transform: translate3d(0, -220px, 0) rotateZ(35deg); opacity: 0; }
        }

        @keyframes actionFloat {
          0%   { transform: translateY(0);   opacity: 1; }
          70%  { opacity: 1; }
          100% { transform: translateY(-64px); opacity: 0; }
        }

        @keyframes chipToCenter {
          0%   { transform: translate(0, 0) scale(1); opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translate(var(--dx), var(--dy)) scale(0.7); opacity: 0; }
        }

        @keyframes allInRing {
          0%   { transform: scale(0.8); opacity: 1; box-shadow: 0 0 0 0 rgba(231, 76, 60, 0.9); }
          100% { transform: scale(2.2); opacity: 0; box-shadow: 0 0 0 24px rgba(231, 76, 60, 0); }
        }

        @keyframes winnerGlow {
          0%, 100% { box-shadow: 0 0 16px rgba(255, 215, 0, 0.4); }
          50%       { box-shadow: 0 0 48px rgba(255, 215, 0, 1), 0 0 80px rgba(255, 215, 0, 0.5); }
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.5; }
        }

        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(0, 229, 255, 0.7); }
          50%       { box-shadow: 0 0 0 12px rgba(0, 229, 255, 0); }
        }

        @keyframes pulse-gold {
          0%, 100% { text-shadow: 0 0 30px rgba(255, 215, 0, 0.8), 0 0 60px rgba(255, 215, 0, 0.4); }
          50%       { text-shadow: 0 0 10px rgba(255, 215, 0, 0.4), 0 0 30px rgba(255, 215, 0, 0.2); }
        }

        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-4px); }
        }

        @keyframes timerArc {
          0%   { background: conic-gradient(rgba(0,229,255,0.6) 0%, transparent 0%); }
          100% { background: conic-gradient(rgba(0,229,255,0.6) 100%, transparent 0%); }
        }

        @keyframes cardAreaGlow {
          0%, 100% { box-shadow: 0 0 12px rgba(0,229,255,0.3), 0 0 24px rgba(0,229,255,0.15); }
          50%       { box-shadow: 0 0 24px rgba(0,229,255,0.6), 0 0 48px rgba(0,229,255,0.3); }
        }

        @keyframes winnerReveal {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
          50% { opacity: 1; transform: translate(-50%, -50%) scale(1.05); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }

        @keyframes stagePulse {
          0%, 100% { opacity: 0.9; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
