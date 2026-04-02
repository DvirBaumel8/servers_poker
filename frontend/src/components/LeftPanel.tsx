export default function LeftPanel() {
  return (
    <div className="relative flex flex-col justify-between overflow-hidden" style={{ background: '#0a0a1a', minHeight: '100vh', padding: '48px 40px' }}>
      {/* Decorative circles */}
      <div
        style={{
          position: 'absolute', top: '-80px', left: '-80px',
          width: '320px', height: '320px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,229,255,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute', bottom: '120px', right: '-60px',
          width: '260px', height: '260px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,112,255,0.1) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Logo */}
      <div>
        <div style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '48px' }}>
          <span style={{ color: '#ffffff' }}>Bot</span>
          <span style={{ color: '#00e5ff' }}>Royale</span>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: '32px', marginBottom: '48px' }}>
          {[
            { label: 'Bots', value: '2,847' },
            { label: 'Hands', value: '1.2M' },
            { label: 'Tournaments', value: '384' },
          ].map((stat) => (
            <div key={stat.label}>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#00e5ff' }}>{stat.value}</div>
              <div style={{ fontSize: '12px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '2px' }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Feature list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[
            'Build and deploy poker bots',
            'Compete in live tournaments',
            'Provably fair — on-chain RNG',
            'Real-time analytics & replays',
          ].map((feature) => (
            <div key={feature} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00e5ff', flexShrink: 0 }} />
              <span style={{ fontSize: '15px', color: '#9ca3af' }}>{feature}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Large spade */}
      <div style={{
        position: 'absolute', bottom: '32px', right: '32px',
        fontSize: '120px', color: 'rgba(0,229,255,0.06)', lineHeight: 1,
        userSelect: 'none', pointerEvents: 'none',
      }}>
        ♠
      </div>
    </div>
  )
}
