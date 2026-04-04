import { useEffect, useState, useRef } from 'react'
import { io } from 'socket.io-client'
import { useAuthStore } from '../store/authStore'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TournamentConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export interface RegisteredPlayer {
  id: string
  botId: string
  botName: string
  userId: string
  userName: string
  chipCount?: number
  joinedAt?: string
}

export interface TournamentLobbyState {
  tournamentId: string
  status: 'registering' | 'running' | 'final_table' | 'finished' | 'cancelled'
  registeredPlayers: RegisteredPlayer[]
  currentPlayerCount: number
  maxPlayers: number
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseTournamentLobbyOptions {
  tournamentId: string
  enabled?: boolean
  onTournamentStarted?: () => void
}

interface UseTournamentLobbyReturn {
  connectionStatus: TournamentConnectionStatus
  registeredPlayers: RegisteredPlayer[]
  currentPlayerCount: number
  isConnected: boolean
  tournamentStatus: string | null
  error: string | null
}

export function useTournamentLobby({
  tournamentId,
  enabled = true,
  onTournamentStarted,
}: UseTournamentLobbyOptions): UseTournamentLobbyReturn {
  const token = useAuthStore((s) => s.token)
  const onTournamentStartedRef = useRef(onTournamentStarted)
  const hasRedirectedRef = useRef(false)
  const [connectionStatus, setConnectionStatus] = useState<TournamentConnectionStatus>('disconnected')
  const [registeredPlayers, setRegisteredPlayers] = useState<RegisteredPlayer[]>([])
  const [currentPlayerCount, setCurrentPlayerCount] = useState(0)
  const [tournamentStatus, setTournamentStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Keep ref updated without triggering re-connection
  useEffect(() => {
    onTournamentStartedRef.current = onTournamentStarted
  }, [onTournamentStarted])

  useEffect(() => {
    if (!enabled || !tournamentId) {
      hasRedirectedRef.current = false
      return
    }

    const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
    const socket = io(`${baseURL}/tournament`, {
      auth: token ? { token } : {},
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling'],
    })

    // Connection events
    socket.on('connect', () => {
      setConnectionStatus('connected')
      socket.emit('subscribe_tournament', { tournamentId })
    })

    socket.on('disconnect', () => {
      setConnectionStatus('disconnected')
    })

    socket.on('connect_error', (err) => {
      console.error('❌ Tournament connection error:', err)
      setConnectionStatus('error')
      setError('Connection error. Reconnecting...')
    })

    // Initial registered players list
    socket.on('tournament_registered_players', (data: { players: Array<{ id: string; botId: string; botName: string; userId: string; userName: string; joinedAt?: string }> }) => {
      setRegisteredPlayers(
        data.players.map((p) => ({
          id: p.id,
          botId: p.botId,
          botName: p.botName,
          userId: p.userId,
          userName: p.userName,
          joinedAt: p.joinedAt,
        }))
      )
      setCurrentPlayerCount(data.players.length)
      setConnectionStatus('connected')
      setError(null)
    })

    // Tournament state updates
    socket.on('tournament_state_updated', (update: { status: string; registeredCount?: number }) => {
      setTournamentStatus(update.status)

      if (update.registeredCount !== undefined) {
        setCurrentPlayerCount(update.registeredCount)
      }

      // Trigger callback when tournament starts (only once)
      if (update.status === 'running' && !hasRedirectedRef.current) {
        hasRedirectedRef.current = true
        onTournamentStartedRef.current?.()
      }
    })

    // Player action updates
    socket.on('tournament_player_action', (action: { action: string; botId: string; botName: string; userId: string; userName: string; timestamp: string }) => {
      if (action.action === 'joined') {
        setRegisteredPlayers((prev) => {
          // Check if player already exists
          const exists = prev.some((p) => p.botId === action.botId)
          if (exists) return prev

          return [
            ...prev,
            {
              id: action.botId, // Use botId as id
              botId: action.botId,
              botName: action.botName,
              userId: action.userId,
              userName: action.userName,
              joinedAt: action.timestamp,
            },
          ]
        })
        setCurrentPlayerCount((prev) => prev + 1)
      } else if (action.action === 'busted') {
        setRegisteredPlayers((prev) =>
          prev.filter((p) => p.botId !== action.botId)
        )
        setCurrentPlayerCount((prev) => Math.max(0, prev - 1))
      }
    })

    return () => {
      socket.disconnect()
    }
  }, [tournamentId, token, enabled])

  return {
    connectionStatus,
    registeredPlayers,
    currentPlayerCount,
    isConnected: connectionStatus === 'connected',
    tournamentStatus,
    error,
  }
}
