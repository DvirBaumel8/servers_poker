import { useEffect, useState } from 'react'

const font = "'Trebuchet MS', sans-serif"

interface SyncStatusProps {
  isSaving: boolean
  savedJustNow: boolean
  isDirty: boolean
}

export function SyncStatus({ isSaving, savedJustNow, isDirty }: SyncStatusProps) {
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (!savedJustNow) {
      const t = setTimeout(() => setFading(false), 0)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setFading(true), 2000)
    return () => clearTimeout(t)
  }, [savedJustNow])

  const visible = isSaving || savedJustNow || isDirty
  if (!visible) return null

  const pillOpacity = fading ? 0.35 : 1

  return (
    <>
      <style>{`
        @keyframes sync-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes sync-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '0.25rem 0.65rem',
        background: 'rgba(24, 24, 27, 0.85)',
        border: '1px solid #3f3f46',
        borderRadius: 9999,
        fontFamily: font,
        fontSize: '0.75rem',
        opacity: pillOpacity,
        transition: 'opacity 0.6s ease',
        userSelect: 'none',
      }}>
        {isSaving && (
          <>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              border: '2px solid rgba(0, 229, 255, 0.25)',
              borderTopColor: '#00e5ff',
              display: 'inline-block',
              animation: 'sync-spin 0.9s linear infinite',
              flexShrink: 0,
            }} />
            <span style={{ color: '#9ca3af' }}>Saving…</span>
          </>
        )}
        {savedJustNow && !isSaving && (
          <>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="6" cy="6" r="5.5" stroke="#1d9e75" />
              <path d="M3.5 6l1.8 1.8 3.2-3.6" stroke="#1d9e75" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ color: '#1d9e75' }}>Saved</span>
          </>
        )}
        {isDirty && !isSaving && !savedJustNow && (
          <>
            <span style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#00e5ff',
              display: 'inline-block',
              animation: 'sync-pulse 1.8s ease-in-out infinite',
              flexShrink: 0,
            }} />
            <span style={{ color: '#9ca3af' }}>Unsaved</span>
          </>
        )}
      </div>
    </>
  )
}
