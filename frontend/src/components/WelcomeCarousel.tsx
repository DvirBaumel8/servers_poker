import { useState } from 'react'

// ─── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg: '#0a0a1a',
  card: '#0d0d22',
  cardInner: '#111128',
  border: '#1e1e3f',
  accent: '#00e5ff',
  accentDim: 'rgba(0,229,255,0.12)',
  text: '#ffffff',
  muted: '#9ca3af',
  font: "'Trebuchet MS', sans-serif",
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface WelcomeCarouselProps {
  userName: string
  /** Called when the carousel is dismissed. `persist` = true means set localStorage. */
  onClose: (persist: boolean) => void
  /** Called when Upgrade to Pro is clicked. `persist` = true if checkbox was checked. */
  onUpgrade: (persist: boolean) => void
}

// ─── Illustrations ─────────────────────────────────────────────────────────────

function IllustrationArena() {
  return (
    <svg viewBox="0 0 220 260" width="220" height="260" style={{ display: 'block' }}>
      {/* Ambient glow */}
      <radialGradient id="arena-glow" cx="50%" cy="60%" r="50%">
        <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.18" />
        <stop offset="100%" stopColor="#00e5ff" stopOpacity="0" />
      </radialGradient>
      <ellipse cx="110" cy="155" rx="100" ry="80" fill="url(#arena-glow)" />

      {/* Poker table ellipse */}
      <ellipse cx="110" cy="175" rx="88" ry="40" fill="#0a1f14" stroke="#1a5232" strokeWidth="2.5" />
      <ellipse cx="110" cy="175" rx="72" ry="32" fill="#0e3d22" />
      {/* Rail felt edge highlight */}
      <ellipse cx="110" cy="175" rx="88" ry="40" fill="none" stroke="rgba(0,229,255,0.12)" strokeWidth="1" />

      {/* Chip stacks on table */}
      {[80, 110, 140].map((x, i) => (
        <g key={i} transform={`translate(${x}, 168)`}>
          {[0, 3, 6].map(dy => (
            <ellipse key={dy} cx="0" cy={-dy} rx="7" ry="3"
              fill={i === 1 ? '#00e5ff' : '#2a4a7f'}
              stroke={i === 1 ? 'rgba(0,229,255,0.5)' : 'rgba(255,255,255,0.1)'}
              strokeWidth="0.5"
            />
          ))}
        </g>
      ))}

      {/* Female silhouette — body */}
      {/* Dress / lower body */}
      <path d="M95 220 Q110 200 125 220" fill="#1a2040" />
      {/* Torso */}
      <rect x="102" y="170" width="16" height="30" rx="5" fill="#1e2655" />
      {/* Arms */}
      <path d="M102 178 Q88 182 85 195" stroke="#1e2655" strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M118 178 Q132 182 135 195" stroke="#1e2655" strokeWidth="5" strokeLinecap="round" fill="none" />
      {/* Head */}
      <ellipse cx="110" cy="160" rx="11" ry="13" fill="#c8a882" />
      {/* Hair */}
      <path d="M99 158 Q99 145 110 143 Q121 145 121 158 Q118 150 110 149 Q102 150 99 158Z" fill="#2a1a0a" />
      <path d="M99 158 Q96 162 97 168" stroke="#2a1a0a" strokeWidth="3" strokeLinecap="round" fill="none" />
      {/* Confident stance — slight lean */}
      <path d="M110 200 L105 225 M110 200 L115 225" stroke="#1e2655" strokeWidth="4" strokeLinecap="round" fill="none" />

      {/* Glowing cyan "1" orb */}
      <circle cx="165" cy="80" r="30" fill="rgba(0,229,255,0.08)" stroke="rgba(0,229,255,0.3)" strokeWidth="1.5" />
      <circle cx="165" cy="80" r="22" fill="rgba(0,229,255,0.12)" stroke="rgba(0,229,255,0.5)" strokeWidth="1" />
      <text x="165" y="87" textAnchor="middle" fontSize="26" fontWeight="900"
        fill="#00e5ff" style={{ filter: 'drop-shadow(0 0 8px #00e5ff)' }}>1</text>

      {/* Floating particles */}
      {[[45, 95], [170, 135], [55, 140], [175, 60]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 2 === 0 ? 1.5 : 1}
          fill="#00e5ff" opacity={i % 2 === 0 ? 0.5 : 0.3}
          style={{ animation: `wc-glow ${1.5 + i * 0.4}s ease-in-out infinite` }}
        />
      ))}
    </svg>
  )
}

function IllustrationTimer() {
  return (
    <svg viewBox="0 0 220 260" width="220" height="260" style={{ display: 'block' }}>
      {/* Background glow */}
      <radialGradient id="timer-glow" cx="50%" cy="42%" r="40%">
        <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.2" />
        <stop offset="100%" stopColor="#00e5ff" stopOpacity="0" />
      </radialGradient>
      <ellipse cx="110" cy="110" rx="90" ry="90" fill="url(#timer-glow)" />

      {/* Outer ring track */}
      <circle cx="110" cy="108" r="72" fill="none" stroke="rgba(0,229,255,0.1)" strokeWidth="8" />
      {/* Progress ring — 60% filled */}
      <circle cx="110" cy="108" r="72" fill="none" stroke="#00e5ff" strokeWidth="7"
        strokeDasharray="271 181" strokeLinecap="round"
        transform="rotate(-90 110 108)"
        style={{ filter: 'drop-shadow(0 0 6px #00e5ff)', animation: 'wc-glow 2s ease-in-out infinite' }}
      />

      {/* Inner dial face */}
      <circle cx="110" cy="108" r="58" fill="#0a0f1e" stroke="rgba(0,229,255,0.08)" strokeWidth="1" />

      {/* Clock tick marks */}
      {Array.from({ length: 12 }, (_, i) => {
        const angle = (i / 12) * Math.PI * 2 - Math.PI / 2
        const r1 = 50, r2 = 55
        return (
          <line key={i}
            x1={110 + r1 * Math.cos(angle)} y1={108 + r1 * Math.sin(angle)}
            x2={110 + r2 * Math.cos(angle)} y2={108 + r2 * Math.sin(angle)}
            stroke={i % 3 === 0 ? 'rgba(0,229,255,0.6)' : 'rgba(255,255,255,0.2)'}
            strokeWidth={i % 3 === 0 ? 2 : 1}
          />
        )
      })}

      {/* Laser sweep hand */}
      <g style={{ transformOrigin: '110px 108px', animation: 'wc-sweep 4s linear infinite' }}>
        <line x1="110" y1="108" x2="110" y2="62" stroke="#00e5ff" strokeWidth="2" strokeLinecap="round"
          style={{ filter: 'drop-shadow(0 0 4px #00e5ff)' }}
        />
        <circle cx="110" cy="108" r="3" fill="#00e5ff" />
      </g>

      {/* Time label */}
      <text x="110" y="101" textAnchor="middle" fontSize="18" fontWeight="900" fill="#00e5ff"
        style={{ filter: 'drop-shadow(0 0 8px #00e5ff)', fontFamily: 'monospace' }}>
        21:00
      </text>
      <text x="110" y="117" textAnchor="middle" fontSize="9" fill="rgba(0,229,255,0.7)" letterSpacing="2">
        IST DAILY
      </text>

      {/* Mini bot icons fighting below */}
      <g transform="translate(50, 185)">
        {/* Bot A */}
        <rect x="0" y="0" width="18" height="20" rx="3" fill="#1a2040" stroke="rgba(100,120,200,0.5)" strokeWidth="1" />
        <circle cx="9" cy="-4" r="6" fill="#1e2655" stroke="rgba(100,120,200,0.4)" strokeWidth="1" />
        <rect x="3" y="4" width="5" height="3" rx="1" fill="rgba(100,150,255,0.6)" />
        <rect x="10" y="4" width="5" height="3" rx="1" fill="rgba(100,150,255,0.6)" />
      </g>
      <text x="78" y="200" textAnchor="middle" fontSize="14" fill="rgba(255,100,100,0.8)"
        style={{ animation: 'wc-glow 1s ease-in-out infinite' }}>⚔</text>
      <g transform="translate(90, 185)">
        {/* Bot B — cyan armored */}
        <rect x="0" y="0" width="18" height="20" rx="3" fill="#001f2a" stroke="rgba(0,229,255,0.5)" strokeWidth="1" />
        <circle cx="9" cy="-4" r="6" fill="#002a33" stroke="rgba(0,229,255,0.4)" strokeWidth="1" />
        <rect x="3" y="4" width="5" height="3" rx="1" fill="rgba(0,229,255,0.7)" />
        <rect x="10" y="4" width="5" height="3" rx="1" fill="rgba(0,229,255,0.7)" />
      </g>

      {/* UTC label */}
      <text x="110" y="235" textAnchor="middle" fontSize="10" fill={C.muted} letterSpacing="1">
        19:00 UTC  ·  UTC+0
      </text>
    </svg>
  )
}

function IllustrationTiers() {
  return (
    <svg viewBox="0 0 220 260" width="220" height="260" style={{ display: 'block' }}>
      {/* Vertical divider */}
      <line x1="110" y1="30" x2="110" y2="240" stroke="rgba(0,229,255,0.2)" strokeWidth="1" strokeDasharray="4 3" />

      {/* FREE label */}
      <text x="55" y="28" textAnchor="middle" fontSize="10" fill={C.muted} fontWeight="700" letterSpacing="2">FREE</text>
      {/* PRO label */}
      <text x="165" y="28" textAnchor="middle" fontSize="10" fill="#00e5ff" fontWeight="700" letterSpacing="2">PRO</text>

      {/* FREE bot — small, grey, standard */}
      <g transform="translate(32, 50)">
        {/* Body */}
        <rect x="8" y="24" width="32" height="40" rx="5" fill="#1c1c2e" stroke="rgba(120,120,160,0.4)" strokeWidth="1.5" />
        {/* Head */}
        <rect x="10" y="8" width="28" height="22" rx="5" fill="#1a1a30" stroke="rgba(120,120,160,0.35)" strokeWidth="1" />
        {/* Eyes */}
        <circle cx="19" cy="19" r="4" fill="rgba(120,120,160,0.5)" />
        <circle cx="29" cy="19" r="4" fill="rgba(120,120,160,0.5)" />
        <circle cx="19" cy="19" r="2" fill="rgba(180,180,220,0.4)" />
        <circle cx="29" cy="19" r="2" fill="rgba(180,180,220,0.4)" />
        {/* Chest panel */}
        <rect x="13" y="30" width="22" height="12" rx="2" fill="rgba(80,80,120,0.4)" stroke="rgba(100,100,150,0.3)" strokeWidth="0.5" />
        {/* Legs */}
        <rect x="12" y="65" width="10" height="16" rx="3" fill="#161628" />
        <rect x="26" y="65" width="10" height="16" rx="3" fill="#161628" />
        {/* Arms */}
        <rect x="2" y="26" width="8" height="22" rx="4" fill="#1c1c2e" stroke="rgba(100,100,150,0.3)" strokeWidth="1" />
        <rect x="38" y="26" width="8" height="22" rx="4" fill="#1c1c2e" stroke="rgba(100,100,150,0.3)" strokeWidth="1" />
        {/* "1" badge */}
        <circle cx="24" cy="2" r="8" fill="#1a1a30" stroke="rgba(120,120,160,0.4)" strokeWidth="1" />
        <text x="24" y="6" textAnchor="middle" fontSize="9" fill="rgba(160,160,200,0.8)" fontWeight="700">1</text>
      </g>

      {/* PRO bot — sleek, cyan armored, larger */}
      <g transform="translate(108, 38)">
        {/* Cyan aura */}
        <ellipse cx="50" cy="80" rx="38" ry="30" fill="rgba(0,229,255,0.06)" />
        {/* Body — armor plates */}
        <rect x="14" y="28" width="44" height="52" rx="7" fill="#001a22" stroke="rgba(0,229,255,0.5)" strokeWidth="2" />
        {/* Shoulder armor */}
        <path d="M14 34 Q8 30 6 42 Q8 50 14 48Z" fill="#002233" stroke="rgba(0,229,255,0.4)" strokeWidth="1" />
        <path d="M58 34 Q64 30 66 42 Q64 50 58 48Z" fill="#002233" stroke="rgba(0,229,255,0.4)" strokeWidth="1" />
        {/* Head */}
        <rect x="16" y="8" width="40" height="28" rx="7" fill="#001a22" stroke="rgba(0,229,255,0.6)" strokeWidth="1.5" />
        {/* Visor — glowing */}
        <rect x="19" y="14" width="34" height="10" rx="3" fill="rgba(0,229,255,0.15)" stroke="rgba(0,229,255,0.5)" strokeWidth="0.8"
          style={{ filter: 'drop-shadow(0 0 4px rgba(0,229,255,0.5))' }} />
        <rect x="21" y="16" width="6" height="6" rx="1" fill="#00e5ff" opacity="0.8" />
        <rect x="34" y="16" width="6" height="6" rx="1" fill="#00e5ff" opacity="0.8" />
        <rect x="45" y="16" width="6" height="6" rx="1" fill="#00e5ff" opacity="0.5" />
        {/* Chest panel — HUD */}
        <rect x="19" y="34" width="34" height="20" rx="3" fill="rgba(0,229,255,0.08)" stroke="rgba(0,229,255,0.3)" strokeWidth="0.8" />
        <line x1="22" y1="40" x2="50" y2="40" stroke="rgba(0,229,255,0.4)" strokeWidth="1" />
        <line x1="22" y1="44" x2="44" y2="44" stroke="rgba(0,229,255,0.25)" strokeWidth="1" />
        <line x1="22" y1="48" x2="40" y2="48" stroke="rgba(0,229,255,0.15)" strokeWidth="1" />
        {/* Legs — armored */}
        <rect x="18" y="81" width="15" height="20" rx="4" fill="#001a22" stroke="rgba(0,229,255,0.35)" strokeWidth="1" />
        <rect x="39" y="81" width="15" height="20" rx="4" fill="#001a22" stroke="rgba(0,229,255,0.35)" strokeWidth="1" />
        {/* "5" badge */}
        <circle cx="36" cy="2" r="10" fill="#001a22" stroke="#00e5ff" strokeWidth="1.5"
          style={{ filter: 'drop-shadow(0 0 6px rgba(0,229,255,0.6))' }} />
        <text x="36" y="7" textAnchor="middle" fontSize="11" fill="#00e5ff" fontWeight="900">5</text>
      </g>

      {/* Stats below each bot */}
      <text x="55" y="185" textAnchor="middle" fontSize="9" fill={C.muted}>Manual Entry</text>
      <text x="55" y="197" textAnchor="middle" fontSize="9" fill={C.muted}>1 tournament / day</text>
      <text x="163" y="185" textAnchor="middle" fontSize="9" fill="#00e5ff">Auto-Entry ALL</text>
      <text x="163" y="197" textAnchor="middle" fontSize="9" fill="rgba(0,229,255,0.7)">5 bots active</text>
    </svg>
  )
}

function IllustrationLab() {
  return (
    <svg viewBox="0 0 220 260" width="220" height="260" style={{ display: 'block' }}>
      {/* Ambient glow */}
      <radialGradient id="lab-glow" cx="50%" cy="50%" r="55%">
        <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.12" />
        <stop offset="100%" stopColor="#00e5ff" stopOpacity="0" />
      </radialGradient>
      <rect x="0" y="0" width="220" height="260" fill="url(#lab-glow)" />

      {/* Main holographic screen */}
      <rect x="20" y="20" width="180" height="120" rx="8" fill="rgba(0,20,30,0.9)" stroke="rgba(0,229,255,0.35)" strokeWidth="1.5" />
      {/* Screen reflection */}
      <rect x="22" y="22" width="176" height="3" rx="2" fill="rgba(0,229,255,0.08)" />

      {/* Heatmap grid — 6×5 */}
      {Array.from({ length: 6 }, (_, row) =>
        Array.from({ length: 5 }, (_, col) => {
          const val = Math.sin(row * 1.3 + col * 0.9) * 0.5 + 0.5
          const r = Math.round(val * 0 + (1 - val) * 0)
          const g = Math.round(val * 229)
          const b = Math.round(val * 255)
          return (
            <rect key={`${row}-${col}`}
              x={28 + col * 26} y={30 + row * 14}
              width="22" height="11" rx="2"
              fill={`rgba(${r},${g},${b},${0.15 + val * 0.55})`}
              stroke={val > 0.6 ? 'rgba(0,229,255,0.5)' : 'rgba(255,255,255,0.05)'}
              strokeWidth="0.5"
            />
          )
        })
      )}

      {/* Card combo labels */}
      <text x="28" y="122" fontSize="7" fill="rgba(0,229,255,0.5)" fontFamily="monospace">AA</text>
      <text x="54" y="122" fontSize="7" fill="rgba(0,229,255,0.4)" fontFamily="monospace">KK</text>
      <text x="80" y="122" fontSize="7" fill="rgba(0,229,255,0.35)" fontFamily="monospace">AKs</text>
      <text x="106" y="122" fontSize="7" fill="rgba(0,229,255,0.3)" fontFamily="monospace">QQ</text>
      <text x="132" y="122" fontSize="7" fill="rgba(0,229,255,0.25)" fontFamily="monospace">JJ</text>

      {/* Win-rate indicator */}
      <rect x="162" y="30" width="32" height="84" rx="4" fill="rgba(0,10,15,0.9)" stroke="rgba(0,229,255,0.2)" strokeWidth="1" />
      <text x="178" y="44" textAnchor="middle" fontSize="7" fill={C.muted} letterSpacing="0.5">WIN%</text>
      {[80, 65, 42, 58, 71].map((v, i) => (
        <g key={i}>
          <rect x="166" y={50 + i * 13} width="24" height="9" rx="2" fill="rgba(0,229,255,0.06)" />
          <rect x="166" y={50 + i * 13} width={24 * v / 100} height="9" rx="2"
            fill={`rgba(0,229,255,${0.3 + v / 250})`}
          />
          <text x="178" y={57 + i * 13} textAnchor="middle" fontSize="6" fill="rgba(0,229,255,0.8)"
            fontFamily="monospace">{v}%</text>
        </g>
      ))}

      {/* Floating label — Scenario Lab */}
      <rect x="25" y="150" width="82" height="18" rx="4" fill="rgba(0,229,255,0.1)" stroke="rgba(0,229,255,0.3)" strokeWidth="0.8" />
      <text x="66" y="162" textAnchor="middle" fontSize="8" fill="#00e5ff" fontWeight="700" letterSpacing="1">SCENARIO LAB</text>

      {/* Floating label — Deep Simulations */}
      <rect x="113" y="150" width="82" height="18" rx="4" fill="rgba(0,112,255,0.1)" stroke="rgba(0,112,255,0.3)" strokeWidth="0.8" />
      <text x="154" y="162" textAnchor="middle" fontSize="8" fill="#0070ff" fontWeight="700" letterSpacing="0.5">DEEP SIM</text>

      {/* Hand interacting — pointing finger */}
      <path d="M90 188 Q100 175 112 172 Q118 171 118 177 Q118 183 112 184 L96 190Z"
        fill="#c8a882" stroke="rgba(200,168,130,0.3)" strokeWidth="0.5" />
      <path d="M112 172 L120 162" stroke="#c8a882" strokeWidth="4" strokeLinecap="round" />
      <circle cx="120" cy="160" r="2" fill="#00e5ff" opacity="0.9"
        style={{ filter: 'drop-shadow(0 0 5px #00e5ff)' }} />

      {/* Connector lines from hand to screen */}
      <line x1="120" y1="162" x2="120" y2="138" stroke="rgba(0,229,255,0.25)" strokeWidth="0.8" strokeDasharray="3 2" />

      {/* Simulation count */}
      <text x="110" y="220" textAnchor="middle" fontSize="20" fontWeight="900" fill="#00e5ff"
        style={{ filter: 'drop-shadow(0 0 10px #00e5ff)', animation: 'wc-pulse 2s ease-in-out infinite' }}>
        1,000×
      </text>
      <text x="110" y="235" textAnchor="middle" fontSize="9" fill={C.muted} letterSpacing="2">SIMULATIONS</text>
    </svg>
  )
}

// ─── Slides ─────────────────────────────────────────────────────────────────────

function SlideLayout({ illustration, header, subheader, children }: {
  illustration: React.ReactNode
  header: string
  subheader?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 380 }}>
      {/* Left — illustration */}
      <div className="wc-ill" style={{
        width: 240, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #060614 0%, #0a0f1e 60%, #06080f 100%)',
        borderRight: `1px solid ${C.border}`,
        padding: '24px 12px',
      }}>
        {illustration}
      </div>

      {/* Right — text */}
      <div style={{
        flex: 1, padding: '32px 36px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
      }}>
        {subheader && (
          <div style={{
            fontSize: 10, color: C.accent, textTransform: 'uppercase',
            letterSpacing: 3, marginBottom: 10, opacity: 0.8,
          }}>
            {subheader}
          </div>
        )}
        <h2 style={{
          margin: '0 0 20px', fontSize: 22, fontWeight: 900,
          color: C.text, lineHeight: 1.25, fontFamily: C.font,
          letterSpacing: 0.3,
        }}>
          {header}
        </h2>
        {children}
      </div>
    </div>
  )
}

function Slide1({ userName }: { userName: string }) {
  return (
    <SlideLayout
      subheader="Welcome"
      header={`Welcome, ${userName}! The Arena Awaits.`}
      illustration={<IllustrationArena />}
    >
      <p style={{ margin: '0 0 24px', fontSize: 15, color: C.muted, lineHeight: 1.7 }}>
        Your first Bot is ready. Step into the Arena.{' '}
        <span style={{ color: C.text, fontWeight: 700 }}>You have 1 Free Bot.</span>
      </p>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 18px',
        background: C.accentDim,
        border: `1px solid rgba(0,229,255,0.2)`,
        borderRadius: 10,
      }}>
        <span style={{ fontSize: 24 }}>🤖</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 3 }}>Free Tier Active</div>
          <div style={{ fontSize: 12, color: C.muted }}>1 bot slot · Manual daily registration</div>
        </div>
      </div>
    </SlideLayout>
  )
}

function Slide2() {
  return (
    <SlideLayout
      subheader="Daily Tournament"
      header="FIGHT FOR GLORY. EVERY DAY."
      illustration={<IllustrationTimer />}
    >
      <p style={{ margin: '0 0 24px', fontSize: 15, color: C.muted, lineHeight: 1.7 }}>
        Matches begin every day at{' '}
        <span style={{ color: C.accent, fontWeight: 700 }}>21:00 IST</span>{' '}
        <span style={{ color: C.muted }}>(19:00 UTC)</span>.
        The colosseum is fierce.{' '}
        <span style={{ color: C.text, fontWeight: 600 }}>Can your Bot survive?</span>
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          { icon: '⏰', label: 'Daily at 21:00 IST', sub: 'Runs every night without exception' },
          { icon: '🏆', label: 'Last Bot Standing', sub: 'Eliminate opponents, claim the throne' },
          { icon: '📍', label: 'UTC+0 · IST · All timezones', sub: 'Global arena — no home advantage' },
        ].map(({ icon, label, sub }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{label}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{sub}</div>
            </div>
          </div>
        ))}
      </div>
    </SlideLayout>
  )
}

function Slide3({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <SlideLayout
      subheader="Tiers & Limits"
      header="TIERS & LIMITS: KNOW YOUR POWER."
      illustration={<IllustrationTiers />}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
        {/* Free tier */}
        <div style={{
          padding: '16px', borderRadius: 10,
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 8 }}>FREE TIER</div>
          {['1 Bot only', 'Manual registration', 'Daily entry required', 'Standard analytics'].map(item => (
            <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
              <span style={{ color: C.muted, fontSize: 12 }}>–</span>
              <span style={{ fontSize: 12, color: C.muted }}>{item}</span>
            </div>
          ))}
        </div>

        {/* Pro tier */}
        <div style={{
          padding: '16px', borderRadius: 10,
          background: 'rgba(0,229,255,0.06)',
          border: `1px solid rgba(0,229,255,0.3)`,
        }}>
          <div style={{ fontSize: 10, color: C.accent, letterSpacing: 2, marginBottom: 8 }}>PRO TIER</div>
          {['5 Bots', 'Auto-Entry ALL', 'Zero daily friction', 'Deep analytics'].map(item => (
            <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
              <span style={{ color: C.accent, fontSize: 12 }}>✓</span>
              <span style={{ fontSize: 12, color: C.text }}>{item}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={onUpgrade}
        style={{
          width: '100%', padding: '12px',
          background: 'linear-gradient(90deg, #00e5ff, #0070ff)',
          border: 'none', borderRadius: 10,
          color: '#000', fontWeight: 900, fontSize: 14,
          cursor: 'pointer', fontFamily: C.font,
          letterSpacing: 1,
          boxShadow: '0 0 20px rgba(0,229,255,0.25)',
        }}
      >
        ⚡ Upgrade to Pro — Unlock All 5 Bots
      </button>
    </SlideLayout>
  )
}

function Slide4({ dontShow, onDontShowChange }: {
  dontShow: boolean
  onDontShowChange: (v: boolean) => void
}) {
  return (
    <SlideLayout
      subheader="The Lab"
      header="ANALYZE & OPTIMIZE in THE LAB."
      illustration={<IllustrationLab />}
    >
      <p style={{ margin: '0 0 24px', fontSize: 15, color: C.muted, lineHeight: 1.7 }}>
        Replay any hand. Run{' '}
        <span style={{ color: C.accent, fontWeight: 700 }}>1,000s of simulations</span>.
        Shave leaks and dominate the meta.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        {[
          { icon: '🔬', label: 'Scenario Lab', sub: 'Construct any hand — see how your bot reasons' },
          { icon: '📊', label: 'Deep Simulations', sub: 'Run thousands of hands in seconds' },
          { icon: '🎬', label: 'Hand Replay', sub: 'Analyze every decision post-tournament' },
        ].map(({ icon, label, sub }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{label}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{sub}</div>
            </div>
          </div>
        ))}
      </div>
      <label style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 12, color: C.muted, cursor: 'pointer',
      }}>
        <input
          data-testid="carousel-dont-show"
          type="checkbox"
          checked={dontShow}
          onChange={e => onDontShowChange(e.target.checked)}
          style={{ accentColor: C.accent, width: 14, height: 14, cursor: 'pointer' }}
        />
        Don't show this again
      </label>
    </SlideLayout>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────────

export default function WelcomeCarousel({ userName, onClose, onUpgrade }: WelcomeCarouselProps) {
  const [slide, setSlide] = useState(0)
  const [dontShow, setDontShow] = useState(false)
  const [animKey, setAnimKey] = useState(0)
  const [closing, setClosing] = useState(false)

  function goTo(n: number) {
    setAnimKey(k => k + 1)
    setSlide(n)
  }

  /** Play fade-out animation then fire callback. */
  function triggerClose(persist: boolean) {
    setClosing(true)
    setTimeout(() => onClose(persist), 260)
  }

  function triggerUpgrade(persist: boolean) {
    setClosing(true)
    setTimeout(() => onUpgrade(persist), 260)
  }

  function handleClose() {
    triggerClose(dontShow)
  }

  function handleUpgrade() {
    triggerUpgrade(dontShow)
  }

  function handleBuildBot() {
    triggerClose(true) // always mark as seen on final CTA
  }

  return (
    <div
      data-testid="welcome-carousel"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.78)',
        backdropFilter: 'blur(4px)',
        fontFamily: C.font,
        animation: closing ? 'wc-fadeout 260ms ease forwards' : 'wc-fadein 320ms ease forwards',
      }}
      onClick={handleClose}
    >
      <style>{`
        @keyframes wc-fadein  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes wc-fadeout { from { opacity: 1; } to { opacity: 0; } }
        @keyframes wc-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes wc-card-out { from { opacity:1; transform:scale(1) translateY(0); } to { opacity:0; transform:scale(0.96) translateY(6px); } }
        @keyframes wc-sweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes wc-glow { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
        @keyframes wc-pulse { 0%,100% { transform: scale(1); opacity:1; } 50% { transform: scale(1.05); opacity:0.85; } }
        .wc-btn-hover:hover { opacity: 0.82; }
        .wc-back-hover:hover { background: rgba(255,255,255,0.06) !important; }
        .wc-ill { display: flex; }
        @media (max-width: 620px) { .wc-ill { display: none !important; } }
      `}</style>

      {/* Modal card — stop propagation so clicks inside don't close */}
      <div
        style={{
          position: 'relative',
          width: '90vw', maxWidth: 860,
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(0,0,0,0.72), 0 0 0 1px rgba(0,229,255,0.05)',
          display: 'flex', flexDirection: 'column',
          animation: closing ? 'wc-card-out 260ms ease forwards' : undefined,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header bar ─────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px',
          borderBottom: `1px solid ${C.border}`,
          background: 'rgba(0,0,0,0.28)',
        }}>
          {/* Upgrade pill — all slides */}
          <button
            className="wc-btn-hover"
            onClick={handleUpgrade}
            style={{
              padding: '5px 13px',
              background: 'linear-gradient(90deg, rgba(0,229,255,0.12), rgba(0,112,255,0.12))',
              border: `1px solid rgba(0,229,255,0.3)`,
              borderRadius: 20, color: C.accent,
              fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
              cursor: 'pointer', fontFamily: C.font,
              transition: 'opacity 0.15s',
            }}
          >
            ⚡ Upgrade to Pro
          </button>

          {/* Dot progress */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                onClick={() => goTo(i)}
                style={{
                  width: i === slide ? 22 : 7, height: 7,
                  borderRadius: 4,
                  background: i === slide ? C.accent : 'rgba(255,255,255,0.18)',
                  transition: 'all 0.28s ease',
                  cursor: 'pointer',
                  boxShadow: i === slide ? '0 0 8px rgba(0,229,255,0.5)' : 'none',
                }}
              />
            ))}
          </div>

          {/* X close */}
          <button
            data-testid="carousel-close"
            onClick={handleClose}
            style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${C.border}`,
              color: C.muted, fontSize: 14, lineHeight: 1,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s',
            }}
          >
            ✕
          </button>
        </div>

        {/* ── Slide content ───────────────────────────────────────────────── */}
        <div
          key={animKey}
          style={{ animation: 'wc-fade 0.32s ease forwards', flex: 1 }}
        >
          {slide === 0 && <Slide1 userName={userName} />}
          {slide === 1 && <Slide2 />}
          {slide === 2 && <Slide3 onUpgrade={handleUpgrade} />}
          {slide === 3 && <Slide4 dontShow={dontShow} onDontShowChange={setDontShow} />}
        </div>

        {/* ── Footer nav ──────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          gap: 10, padding: '14px 24px',
          borderTop: `1px solid ${C.border}`,
          background: 'rgba(0,0,0,0.2)',
        }}>
          {/* Back button */}
          {slide > 0 && (
            <button
              data-testid="carousel-back"
              className="wc-back-hover"
              onClick={() => goTo(slide - 1)}
              style={{
                padding: '9px 18px',
                background: 'transparent',
                border: `1px solid ${C.border}`,
                borderRadius: 8, color: C.muted,
                fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: C.font,
                transition: 'background 0.15s',
                marginRight: 'auto',
              }}
            >
              ← Back
            </button>
          )}

          {/* Next / Build Bot */}
          {slide < 3 ? (
            <button
              data-testid="carousel-next"
              className="wc-btn-hover"
              onClick={() => goTo(slide + 1)}
              style={{
                padding: '9px 24px',
                background: 'linear-gradient(90deg, #00e5ff, #0070ff)',
                border: 'none', borderRadius: 8,
                color: '#000', fontWeight: 800, fontSize: 13,
                cursor: 'pointer', fontFamily: C.font, letterSpacing: 0.5,
                transition: 'opacity 0.15s',
              }}
            >
              Next →
            </button>
          ) : (
            <button
              data-testid="carousel-build-bot"
              className="wc-btn-hover"
              onClick={handleBuildBot}
              style={{
                padding: '9px 24px',
                background: 'linear-gradient(90deg, #00e5ff, #0070ff)',
                border: 'none', borderRadius: 8,
                color: '#000', fontWeight: 800, fontSize: 13,
                cursor: 'pointer', fontFamily: C.font, letterSpacing: 0.5,
                transition: 'opacity 0.15s',
                boxShadow: '0 0 16px rgba(0,229,255,0.3)',
              }}
            >
              🤖 Build Your First Bot
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
