export function SentryErrorFallback({ resetError }: { resetError: () => void }) {
  return (
    <div style={{ minHeight: '100vh', background: '#030712', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        textAlign: 'center',
        padding: '2rem',
        background: '#111827',
        borderRadius: '0.75rem',
        border: '1px solid rgba(6,182,212,0.3)',
        maxWidth: '28rem',
        boxShadow: '0 0 40px rgba(6,182,212,0.05)',
      }}>
        <h1 style={{ color: '#22d3ee', fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem', fontFamily: "'Trebuchet MS', sans-serif" }}>
          Something went wrong
        </h1>
        <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1.5rem', fontFamily: "'Trebuchet MS', sans-serif" }}>
          An unexpected error occurred. Our team has been notified.
        </p>
        <button
          onClick={resetError}
          style={{
            padding: '0.5rem 1.5rem',
            background: '#06b6d4',
            color: '#030712',
            fontWeight: 600,
            borderRadius: '0.5rem',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontFamily: "'Trebuchet MS', sans-serif",
            transition: 'background 0.15s',
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = '#22d3ee')}
          onMouseOut={(e) => (e.currentTarget.style.background = '#06b6d4')}
        >
          Reload
        </button>
      </div>
    </div>
  )
}
