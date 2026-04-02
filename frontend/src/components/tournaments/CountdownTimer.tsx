import { useEffect, useState } from 'react'

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  card: '#13132a',
  border: '#1e1e3f',
  accent: '#00e5ff',
  accentDim: 'rgba(0,229,255,0.08)',
  text: '#ffffff',
  muted: '#9ca3af',
  success: '#1d9e75',
  warning: '#f59e0b',
  font: "'Trebuchet MS', sans-serif",
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CountdownTimerProps {
  scheduledStartTime: string | Date
  onTimeUp?: () => void
  size?: 'small' | 'medium' | 'large'
}

interface TimeRemaining {
  days: number
  hours: number
  minutes: number
  seconds: number
  totalSeconds: number
}

// ─── Helper functions ─────────────────────────────────────────────────────────

function calculateTimeRemaining(targetTime: Date): TimeRemaining {
  const now = new Date()
  const diff = targetTime.getTime() - now.getTime()

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 }
  }

  const totalSeconds = Math.floor(diff / 1000)
  const days = Math.floor(totalSeconds / (24 * 60 * 60))
  const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60))
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60)
  const seconds = totalSeconds % 60

  return { days, hours, minutes, seconds, totalSeconds }
}

function formatTimeRemaining(time: TimeRemaining): string {
  if (time.totalSeconds <= 0) {
    return 'Starting now...'
  }

  if (time.days > 0) {
    return `${time.days}d ${time.hours}h`
  }

  if (time.hours > 0) {
    return `${time.hours}h ${time.minutes}m`
  }

  if (time.minutes > 0) {
    return `${time.minutes}m ${time.seconds}s`
  }

  return `${time.seconds}s`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CountdownTimer({
  scheduledStartTime,
  onTimeUp,
  size = 'medium',
}: CountdownTimerProps) {
  const targetTime = typeof scheduledStartTime === 'string'
    ? new Date(scheduledStartTime)
    : scheduledStartTime

  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining>(
    calculateTimeRemaining(targetTime)
  )
  const [hasStarted, setHasStarted] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      const time = calculateTimeRemaining(targetTime)
      setTimeRemaining(time)

      if (time.totalSeconds <= 0 && !hasStarted) {
        setHasStarted(true)
        onTimeUp?.()
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [targetTime])

  const displayText = formatTimeRemaining(timeRemaining)
  const isStartingSoon = timeRemaining.totalSeconds > 0 && timeRemaining.totalSeconds <= 60
  const hasTimeUp = timeRemaining.totalSeconds <= 0

  const sizeConfig = {
    small: { fontSize: 16, labelSize: 10, padding: '8px 12px' },
    medium: { fontSize: 24, labelSize: 12, padding: '12px 16px' },
    large: { fontSize: 36, labelSize: 14, padding: '16px 24px' },
  }

  const config = sizeConfig[size]

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: config.padding,
        textAlign: 'center',
        fontFamily: C.font,
        animation: isStartingSoon ? 'pulse 1s ease-in-out infinite' : 'none',
      }}
    >
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1 }
          50% { opacity: 0.7 }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 10px rgba(0,229,255,0.5) }
          50% { box-shadow: 0 0 20px rgba(0,229,255,0.8) }
        }
      `}</style>

      <div
        style={{
          fontSize: config.labelSize,
          color: C.muted,
          textTransform: 'uppercase',
          letterSpacing: 2,
          marginBottom: 6,
        }}
      >
        {hasTimeUp ? '🎉 Tournament Starting' : 'Starts in'}
      </div>

      <div
        style={{
          fontSize: config.fontSize,
          fontWeight: 700,
          color: hasTimeUp ? C.accent : isStartingSoon ? C.warning : C.text,
          fontFamily: 'monospace',
          letterSpacing: 1,
          transition: 'color 0.3s',
        }}
      >
        {displayText}
      </div>

      {isStartingSoon && (
        <div
          style={{
            fontSize: 12,
            color: C.warning,
            marginTop: 8,
            fontWeight: 600,
          }}
        >
          ⚡ Starting soon!
        </div>
      )}
    </div>
  )
}
