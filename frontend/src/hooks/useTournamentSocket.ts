import { useEffect, useState, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '../store/authStore'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TournamentConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export interface TournamentStateUpdate {
  tournamentId: string
  status: 'registering' | 'running' | 'final_table' | 'finished' | 'cancelled'
  registered_count: number
  current_participants: number
  current_level?: number
  hands_played?: number
  active_tables?: number
  timestamp: string
}

export interface TournamentPlayerUpdate {
  tournamentId: string
  playerId: string
  botId: string
  botName: string
  userName: string
  action: 'joined' | 'busted' | 'advanced_level'
  chipCount?: number
  tableNumber?: number
  timestamp: string
}

export interface TournamentNotification {
  tournamentId: string
  type: 'blind_increase' | 'player_joined' | 'player_busted' | 'final_table_reached'
  message: string
  data?: Record<string, any>
  timestamp: string
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseTournamentSocketOptions {
  tournamentId: string
  enabled?: boolean
}

interface UseTournamentSocketReturn {
  connectionStatus: TournamentConnectionStatus
  latestUpdate: TournamentStateUpdate | null
  playerUpdates: TournamentPlayerUpdate[]
  notifications: TournamentNotification[]
  refreshTournament: () => void
  socket: Socket | null
}

export function useTournamentSocket({
  tournamentId,
  enabled = true,
}: UseTournamentSocketOptions): UseTournamentSocketReturn {
  const token = useAuthStore((s) => s.token)
  const socketRef = useRef<Socket | null>(null)

  const [connectionStatus, setConnectionStatus] = useState<TournamentConnectionStatus>('disconnected')
  const [latestUpdate, setLatestUpdate] = useState<TournamentStateUpdate | null>(null)
  const [playerUpdates, setPlayerUpdates] = useState<TournamentPlayerUpdate[]>([])
  const [notifications, setNotifications] = useState<TournamentNotification[]>([])

  useEffect(() => {
    if (!enabled || !token || !tournamentId) {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
      return
    }

    // Connect to tournament updates
    const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
    const socket = io(`${baseURL}/tournament`, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling'],
    })

    socketRef.current = socket

    // Connection events
    socket.on('connect', () => {
      console.log('🔗 Connected to tournament updates')
      setConnectionStatus('connected')
      // Subscribe to this tournament
      socket.emit('subscribe_tournament', { tournamentId })
    })

    socket.on('disconnect', () => {
      console.log('🔌 Disconnected from tournament updates')
      setConnectionStatus('disconnected')
    })

    socket.on('connect_error', (error) => {
      console.error('❌ Tournament socket error:', error)
      setConnectionStatus('error')
    })

    // Tournament state updates (real-time)
    socket.on('tournament_state_updated', (update: TournamentStateUpdate) => {
      console.log('📊 Tournament state update:', update)
      setLatestUpdate(update)
    })

    // Player activity updates
    socket.on('tournament_player_action', (update: TournamentPlayerUpdate) => {
      console.log('👤 Player action:', update)
      setPlayerUpdates((prev) => [update, ...prev.slice(0, 9)]) // Keep last 10
    })

    // Tournament notifications (blind increases, milestones, etc.)
    socket.on('tournament_notification', (notification: TournamentNotification) => {
      console.log('📢 Tournament notification:', notification)
      setNotifications((prev) => [notification, ...prev.slice(0, 4)]) // Keep last 5
      // Auto-remove after 5 seconds
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.timestamp !== notification.timestamp))
      }, 5000)
    })

    return () => {
      socket.emit('unsubscribe_tournament', { tournamentId })
      socket.disconnect()
      socketRef.current = null
    }
  }, [tournamentId, token, enabled])

  const refreshTournament = () => {
    if (socketRef.current) {
      socketRef.current.emit('refresh_tournament_state', { tournamentId })
    }
  }

  return {
    connectionStatus,
    latestUpdate,
    playerUpdates,
    notifications,
    refreshTournament,
    socket: socketRef.current,
  }
}
