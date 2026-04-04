import { useEffect, useState, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '../store/authStore'
import api from '../lib/axios'

// ─── Types ────────────────────────────────────────────────────────────────

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

interface TournamentInfo {
  name: string
  level: number
  handsThisLevel: number
  handsPerLevel: number
  blinds: { small: number; big: number }
}

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

export interface GameState {
  gameId: string
  tournamentName: string
  currentLevel: number
  timeUntilNextLevel: string
  playersRemaining: number
  totalPlayers: number
  blinds: { small: number; big: number }
  communityCards: Card[]
  pot: number
  players: PlayerAtTable[]
  activePlayerIndex: number | null
  lastActions: string[]
  showBotStrategy: boolean
  stage: 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown' | 'waiting'
  isShowdown: boolean
  handResult: HandResultInfo | null
  myBotIds: string[]
}

interface BackendGameState {
  tableId: string
  gameId: string
  tournamentId?: string
  status: string
  handNumber: number
  stage: string
  pot: number
  currentBet: number
  communityCards: string[]
  activePlayerId: string | null
  smallBlind: number
  bigBlind: number
  ante: number
  players: Array<{
    id: string
    name: string
    chips: number
    folded: boolean
    allIn: boolean
    disconnected: boolean
    strikes: number
    position: string | number | null
    bet: number
    holeCards?: string[]
  }>
  blinds?: { small: number; big: number; ante: number }
}

const AVATAR_COLORS = [
  '#00e5ff', '#8b5cf6', '#ef4444', '#10b981', '#f59e0b',
  '#ec4899', '#06b6d4', '#fbbf24',
]

// ─── Utilities ────────────────────────────────────────────────────────────

function parseCard(card: string | { rank: string; suit: string }): Card | null {
  // Handle card objects from backend
  if (typeof card === 'object' && card !== null) {
    return {
      rank: card.rank as Card['rank'],
      suit: card.suit as Card['suit'],
    }
  }

  // Treat unknown/hidden card placeholders as null → rendered as card back
  if (typeof card === 'string' && (card === '??' || card.startsWith('?'))) {
    return null
  }

  // Handle card strings like "Ah"
  const str = card as string
  const chars = [...str]
  const suitChar = chars.pop()?.toLowerCase()
  const rank = chars.join('') as Card['rank']

  const suitMap: Record<string, Card['suit']> = {
    h: 'hearts',
    d: 'diamonds',
    c: 'clubs',
    s: 'spades',
  }

  return {
    rank,
    suit: (suitMap[suitChar ?? ''] || 'spades') as Card['suit'],
  }
}

function mapBackendToGameState(
  snapshot: BackendGameState,
  gameId: string,
  lastActions: string[],
  tournamentInfo: TournamentInfo | null,
): GameState {
  const activePlayerIndex = snapshot.players.findIndex(
    (p) => p.id === snapshot.activePlayerId,
  )

  const players: PlayerAtTable[] = snapshot.players.map((p, index) => ({
    id: p.id,
    name: p.name,
    cards: (p.holeCards || []).map(parseCard),
    chipStack: p.chips,
    isBot: true,
    position: typeof p.position === 'number' ? p.position : index,
    status: p.folded ? 'folded' : p.allIn ? 'all_in' : 'playing',
    betAmount: p.bet,
    isDealer: p.position === 'BTN' || p.position === 'Dealer' || p.position === 'BTN/SB',
    isSmallBlind: p.position === 'SB' || p.position === 'BTN/SB',
    isBigBlind: p.position === 'BB',
    avatarColor: AVATAR_COLORS[index % AVATAR_COLORS.length],
  }))

  // Count players still in the game (not eliminated): those with chips > 0
  const playersStillInGame = players.filter((p) => p.chipStack > 0).length
  // Count players still in current hand (not folded): excluding folded and eliminated
  const playersInCurrentHand = players.filter((p) => p.status !== 'folded' && p.chipStack > 0).length

  return {
    gameId,
    tournamentName: tournamentInfo?.name ?? 'Live Game',
    currentLevel: tournamentInfo?.level ?? 1,
    timeUntilNextLevel: tournamentInfo
      ? `${tournamentInfo.handsThisLevel}/${tournamentInfo.handsPerLevel} hands`
      : '--:--',
    playersRemaining: playersInCurrentHand,
    totalPlayers: playersStillInGame,
    blinds: {
      small: snapshot.smallBlind || 0,
      big: snapshot.bigBlind || 0,
    },
    communityCards: (snapshot.communityCards || []).map(parseCard).filter((c): c is Card => c !== null),
    pot: snapshot.pot,
    players,
    activePlayerIndex: activePlayerIndex >= 0 ? activePlayerIndex : null,
    lastActions,
    showBotStrategy: false,
    stage: (snapshot.stage || 'waiting') as GameState['stage'],
    isShowdown: snapshot.stage === 'showdown',
    handResult: null,
    myBotIds: [],
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────

export function useGameSocket(gameId: string): {
  gameState: GameState | null
  connectionStatus: ConnectionStatus
  socket: Socket | null
} {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting')
  const [tournamentInfo, setTournamentInfo] = useState<TournamentInfo | null>(null)
  const tournamentInfoRef = useRef<TournamentInfo | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const lastActionsRef = useRef<string[]>([])
  const lastSnapshotRef = useRef<BackendGameState | null>(null)
  const tournamentIdRef = useRef<string | null>(null)
  const handResultRef = useRef<HandResultInfo | null>(null)
  const [myBotIds, setMyBotIds] = useState<string[]>([])
  const token = useAuthStore((s) => s.token)
  const userId = useAuthStore((s) => s.user?.id)

  // Fetch tournament info from REST API
  const fetchTournamentInfo = async (tournamentId: string) => {
    try {
      const response = await api.get(`/tournaments/${tournamentId}/state`)
      const data = response.data
      const info: TournamentInfo = {
        name: data.name || 'Live Game',
        level: data.level || 1,
        handsThisLevel: data.handsThisLevel || 0,
        handsPerLevel: data.handsPerLevel || 1,
        blinds: data.blinds || { small: 0, big: 0 },
      }
      tournamentInfoRef.current = info
      setTournamentInfo(info)
    } catch {
      // Keep default/existing tournament info on error
    }
  }

  // Fetch user's bots for proper "my bot" detection
  useEffect(() => {
    if (!token || !userId) return
    const fetchMyBots = async () => {
      try {
        const response = await api.get('/bots')
        const bots = Array.isArray(response.data) ? response.data : (response.data?.data || [])
        setMyBotIds(bots.map((b: any) => b.id))
      } catch {
        // ignore — myBotIds stays empty if fetch fails
      }
    }
    fetchMyBots()
  }, [token, userId])

  useEffect(() => {
    if (!gameId) return

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'
    const wsUrl = apiUrl.replace(/^https?:/, 'ws:').replace(/\/$/, '')

    const socket = io(`${wsUrl}/game`, {
      auth: token
        ? { token: `Bearer ${token}` }
        : undefined,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    })

    socketRef.current = socket

    // Connection events
    socket.on('connect', () => {
      setConnectionStatus('connected')
      socket.emit('subscribe', { tableId: gameId })
    })

    socket.on('disconnect', (_reason: string) => {
      setConnectionStatus('disconnected')
    })

    socket.on('connect_error', (error: Error) => {
      console.error('⚠️ [useGameSocket] WebSocket connection error:', error.message, error)
      setConnectionStatus('error')
    })

    socket.on('error', (error: any) => {
      console.error('⚠️ [useGameSocket] Socket error event:', error)
    })

    // Game events
    socket.on('gameState', (payload: BackendGameState) => {
      // Fetch tournament info if we have a tournamentId and haven't fetched yet
      if (payload.tournamentId && !tournamentIdRef.current) {
        tournamentIdRef.current = payload.tournamentId
        fetchTournamentInfo(payload.tournamentId)
      }
      lastSnapshotRef.current = payload
      const mapped = mapBackendToGameState(payload, gameId, lastActionsRef.current, tournamentInfoRef.current)
      setGameState({
        ...mapped,
        handResult: handResultRef.current,
        myBotIds,
      })
    })

    socket.on('handStarted', () => {
      // Re-fetch tournament info on hand start to catch blind level changes
      if (tournamentIdRef.current) {
        fetchTournamentInfo(tournamentIdRef.current)
      }
      // Clear hand result and showdown state for new hand
      handResultRef.current = null
      setGameState(prev => prev ? { ...prev, handResult: null, isShowdown: false } : prev)
    })

    socket.on('playerAction', (action: { botId: string; action: string; amount?: number }) => {
      lastActionsRef.current = [
        `${action.botId} ${action.action}${action.amount ? ` ${action.amount}` : ''}`,
        ...lastActionsRef.current.slice(0, 4),
      ]
    })

    socket.on('handResult', (result: {
      winners?: Array<{ playerName: string; amount: number; handName: string }>,
      pot?: number,
      handNumber?: number
    }) => {
      if (result.winners && result.winners.length > 0) {
        // Store structured hand result data
        handResultRef.current = {
          winners: result.winners,
          pot: result.pot || 0,
          handNumber: result.handNumber || 0,
          timestamp: Date.now(),
        }
        // Also update the text action log
        const winnerTexts = result.winners.map(w =>
          `${w.playerName} wins ${w.amount}${w.handName !== 'Winner' ? ` (${w.handName})` : ''}`
        ).join(', ')
        lastActionsRef.current = [
          winnerTexts,
          ...lastActionsRef.current.slice(0, 4),
        ]
        // Update game state with hand result
        if (lastSnapshotRef.current) {
          const mapped = mapBackendToGameState(lastSnapshotRef.current, gameId, lastActionsRef.current, tournamentInfoRef.current)
          setGameState({
            ...mapped,
            handResult: handResultRef.current,
            myBotIds,
          })
        }
      }
    })

    socket.on('gameFinished', (result: { winnerId?: string; winnerName?: string }) => {
      if (result.winnerName) {
        lastActionsRef.current = [
          `Game finished: ${result.winnerName} wins`,
          ...lastActionsRef.current.slice(0, 4),
        ]
      }
    })

    socket.on('playerLeft', (data: { playerName?: string }) => {
      if (data.playerName) {
        lastActionsRef.current = [
          `${data.playerName} left the table`,
          ...lastActionsRef.current.slice(0, 4),
        ]
      }
    })

    return () => {
      if (socket && socket.connected) {
        socket.emit('unsubscribe', { tableId: gameId })
      }
      socket.disconnect()
      socketRef.current = null
    }
  }, [gameId, token])

  // Update gameState when tournament info arrives
  useEffect(() => {
    if (lastSnapshotRef.current && tournamentInfo) {
      setGameState(
        mapBackendToGameState(
          lastSnapshotRef.current,
          gameId,
          lastActionsRef.current,
          tournamentInfo,
        ),
      )
    }
  }, [tournamentInfo, gameId])

  return {
    gameState,
    connectionStatus,
    // eslint-disable-next-line react-hooks/refs
    socket: socketRef.current,
  }
}
