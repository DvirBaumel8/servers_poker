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
  /** Called when "Build Your First Bot" is clicked — navigate to bot builder. */
  onBuildBot?: (persist: boolean) => void
}

// ─── Illustrations ─────────────────────────────────────────────────────────────

function IllustrationPrizePool() {
  return (
    <svg viewBox="0 0 220 260" width="220" height="260" style={{ display: 'block' }}>
      {/* Background glow */}
      <radialGradient id="pool-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.15" />
        <stop offset="100%" stopColor="#00e5ff" stopOpacity="0" />
      </radialGradient>
      <ellipse cx="110" cy="130" rx="95" ry="90" fill="url(#pool-glow)" />

      {/* Growing bar chart — 4 bars increasing left to right */}
      {/* Heights kept below y=70 so they never overlap the badge at y=8–34 */}
      {[
        { x: 30,  h: 36,  fill: 'rgba(0,229,255,0.25)', stroke: 'rgba(0,229,255,0.4)' },
        { x: 65,  h: 58,  fill: 'rgba(0,229,255,0.35)', stroke: 'rgba(0,229,255,0.5)' },
        { x: 100, h: 84,  fill: 'rgba(0,229,255,0.5)',  stroke: 'rgba(0,229,255,0.7)' },
        { x: 135, h: 110, fill: 'rgba(0,229,255,0.7)',  stroke: '#00e5ff' },
      ].map(({ x, h, fill, stroke }, i) => (
        <g key={i}>
          <rect
            x={x} y={170 - h} width={28} height={h} rx="3"
            fill={fill} stroke={stroke} strokeWidth="1"
          />
          {/* Glow cap on tallest bar — no filter to avoid compositing issues */}
          {i === 3 && (
            <rect x={x} y={170 - h} width={28} height={6} rx="3" fill="#00e5ff" opacity="0.9" />
          )}
        </g>
      ))}

      {/* Baseline */}
      <line x1="22" y1="171" x2="175" y2="171" stroke="rgba(0,229,255,0.2)" strokeWidth="1" />

      {/* Upward arrow on the right */}
      <polyline points="185,155 185,75 180,85" fill="none" stroke="rgba(0,229,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="185,75 190,85" fill="none" stroke="rgba(0,229,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Prize pool label */}
      <text x="110" y="200" textAnchor="middle" fontSize="9" fill="rgba(0,229,255,0.6)" letterSpacing="2">
        PRIZE POOL
      </text>

      {/* User silhouettes joining (pro members) */}
      {[55, 82, 109, 136].map((x, i) => (
        <g key={i} transform={`translate(${x}, 215)`} opacity={0.5 + i * 0.15}>
          <circle cx="0" cy="0" r="5" fill={i >= 2 ? '#00e5ff' : 'rgba(120,140,180,0.6)'} />
          <rect x="-5" y="6" width="10" height="12" rx="3" fill={i >= 2 ? 'rgba(0,229,255,0.5)' : 'rgba(80,100,140,0.5)'} />
        </g>
      ))}

      {/* "More Pros →" label */}
      <text x="110" y="248" textAnchor="middle" fontSize="9" fill={C.muted} letterSpacing="1">
        More Pros → Bigger Pots
      </text>

      {/* Floating particles */}
      {[[45, 95], [170, 100], [55, 145], [175, 60]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 2 === 0 ? 1.5 : 1}
          fill="#00e5ff" opacity={i % 2 === 0 ? 0.5 : 0.3}
          style={{ animation: `wc-glow ${1.5 + i * 0.4}s ease-in-out infinite` }}
        />
      ))}

      {/* "COMMUNITY POWERED" badge — rendered last so it always paints on top */}
      <rect x="28" y="8" width="164" height="24" rx="12" fill="rgba(4,14,30,0.85)" stroke="rgba(0,229,255,0.4)" strokeWidth="1" />
      <text x="110" y="24" textAnchor="middle" fontSize="10" fontWeight="800" fill="#00e5ff" letterSpacing="2">
        COMMUNITY POWERED
      </text>
    </svg>
  )
}

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

      {/* Bot A — left side (blue/steel) */}
      <g transform="translate(54, 120)">
        {/* Body */}
        <rect x="0" y="20" width="26" height="34" rx="5" fill="#1a2040" stroke="rgba(100,120,200,0.5)" strokeWidth="1.5" />
        {/* Head */}
        <rect x="2" y="6" width="22" height="18" rx="4" fill="#1e2655" stroke="rgba(100,130,220,0.5)" strokeWidth="1" />
        {/* Eyes — blue LEDs */}
        <rect x="5" y="11" width="6" height="4" rx="1" fill="rgba(80,130,255,0.8)" style={{ filter: 'drop-shadow(0 0 2px #6082ff)' }} />
        <rect x="13" y="11" width="6" height="4" rx="1" fill="rgba(80,130,255,0.8)" style={{ filter: 'drop-shadow(0 0 2px #6082ff)' }} />
        {/* Chest panel */}
        <rect x="4" y="26" width="18" height="10" rx="2" fill="rgba(60,80,160,0.5)" stroke="rgba(80,110,200,0.3)" strokeWidth="0.5" />
        {/* Legs */}
        <rect x="2" y="55" width="8" height="12" rx="3" fill="#111828" />
        <rect x="16" y="55" width="8" height="12" rx="3" fill="#111828" />
        {/* Arm raised (toward table) */}
        <rect x="-6" y="22" width="7" height="18" rx="3" fill="#1a2040" stroke="rgba(80,100,180,0.3)" strokeWidth="1" />
        <rect x="27" y="22" width="7" height="18" rx="3" fill="#1a2040" stroke="rgba(80,100,180,0.3)" strokeWidth="1" />
      </g>

      {/* Versus "VS" */}
      <text x="110" y="148" textAnchor="middle" fontSize="11" fontWeight="900"
        fill="rgba(255,100,100,0.7)" letterSpacing="2"
        style={{ filter: 'drop-shadow(0 0 4px rgba(255,80,80,0.5))' }}>
        VS
      </text>

      {/* Bot B — right side (cyan/armored) */}
      <g transform="translate(140, 120)">
        {/* Body */}
        <rect x="0" y="20" width="26" height="34" rx="5" fill="#001f2a" stroke="rgba(0,229,255,0.5)" strokeWidth="1.5" />
        {/* Head */}
        <rect x="2" y="6" width="22" height="18" rx="4" fill="#002a33" stroke="rgba(0,229,255,0.4)" strokeWidth="1" />
        {/* Eyes — cyan LEDs */}
        <rect x="5" y="11" width="6" height="4" rx="1" fill="rgba(0,229,255,0.9)" style={{ filter: 'drop-shadow(0 0 3px #00e5ff)' }} />
        <rect x="13" y="11" width="6" height="4" rx="1" fill="rgba(0,229,255,0.9)" style={{ filter: 'drop-shadow(0 0 3px #00e5ff)' }} />
        {/* Chest panel */}
        <rect x="4" y="26" width="18" height="10" rx="2" fill="rgba(0,60,80,0.6)" stroke="rgba(0,200,230,0.3)" strokeWidth="0.5" />
        {/* Legs */}
        <rect x="2" y="55" width="8" height="12" rx="3" fill="#001018" />
        <rect x="16" y="55" width="8" height="12" rx="3" fill="#001018" />
        {/* Arms */}
        <rect x="-6" y="22" width="7" height="18" rx="3" fill="#001f2a" stroke="rgba(0,180,210,0.3)" strokeWidth="1" />
        <rect x="27" y="22" width="7" height="18" rx="3" fill="#001f2a" stroke="rgba(0,180,210,0.3)" strokeWidth="1" />
      </g>

      {/* Glowing "⚔" clash point above table */}
      <text x="110" y="118" textAnchor="middle" fontSize="16"
        fill="rgba(255,200,50,0.85)"
        style={{ filter: 'drop-shadow(0 0 6px rgba(255,200,50,0.6))', animation: 'wc-glow 1.2s ease-in-out infinite' }}>
        ⚔
      </text>

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

      {/* Time label — 21:00 IST displayed on the clock face */}
      <text x="110" y="101" textAnchor="middle" fontSize="18" fontWeight="900" fill="#00e5ff"
        style={{ filter: 'drop-shadow(0 0 8px #00e5ff)', fontFamily: 'monospace' }}>
        21:00
      </text>
      <text x="110" y="117" textAnchor="middle" fontSize="9" fill="rgba(0,229,255,0.7)" letterSpacing="2">
        NIGHTLY
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

      {/* Converts to your local time */}
      <text x="110" y="235" textAnchor="middle" fontSize="10" fill={C.muted} letterSpacing="1">
        Shown in your local time below
      </text>
    </svg>
  )
}

// ─── Local time helper ─────────────────────────────────────────────────────────

/**
 * Returns the user's local equivalent of 21:00 Israel Standard Time (UTC+3).
 * Format: "HH:MM" (24-hour). Israel does not observe DST in this context —
 * we use a fixed UTC+3 offset which matches IST year-round.
 */
function getLocalTournamentTime(): string {
  const israelOffsetHours = 3       // Israel Standard Time = UTC+3
  const tournamentHourIST = 21      // 21:00 IST

  const tournamentUtcHour = tournamentHourIST - israelOffsetHours // = 18:00 UTC

  const now = new Date()
  const localOffsetHours = -now.getTimezoneOffset() / 60 // getTimezoneOffset returns negative for UTC+

  const localHour = ((tournamentUtcHour + localOffsetHours) % 24 + 24) % 24
  const hh = String(Math.floor(localHour)).padStart(2, '0')
  const mm = '00'
  return `${hh}:${mm}`
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
            fontSize: 11, color: C.accent, textTransform: 'uppercase',
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

function Slide1() {
  return (
    <SlideLayout
      subheader="The Model"
      header="Zero Risk. Pure Profit."
      illustration={<IllustrationPrizePool />}
    >
      <p style={{ margin: '0 0 24px', fontSize: 15, color: C.muted, lineHeight: 1.7 }}>
        Free players <span style={{ color: C.text, fontWeight: 700 }}>never pay to play</span>.
        Our prize pools grow as the community expands—more Pro users means{' '}
        <span style={{ color: C.accent, fontWeight: 700 }}>bigger rewards for everyone</span>.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          { icon: '🎁', label: 'Free Players Only Win', sub: 'You cannot lose money — only gain' },
          { icon: '🌐', label: 'Community Prize Pools', sub: 'More Pro users = larger pots for all' },
          { icon: '📈', label: 'Growing Rewards', sub: 'The platform grows — so does your upside' },
        ].map(({ icon, label, sub }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{label}</div>
              <div style={{ fontSize: 12, color: C.muted }}>{sub}</div>
            </div>
          </div>
        ))}
      </div>
    </SlideLayout>
  )
}

function Slide2() {
  return (
    <SlideLayout
      subheader="The Arena"
      header="The Arena of Algorithms."
      illustration={<IllustrationArena />}
    >
      <p style={{ margin: '0 0 24px', fontSize: 15, color: C.muted, lineHeight: 1.7 }}>
        A battle of skill, logic, and code.{' '}
        <span style={{ color: C.text, fontWeight: 700 }}>No luck, no instincts</span>
        —only the best strategy wins.
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
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 3 }}>Bot vs Bot — Pure Logic</div>
          <div style={{ fontSize: 12, color: C.muted }}>No human luck. No instincts. Only algorithms.</div>
        </div>
      </div>
    </SlideLayout>
  )
}

function Slide3() {
  const localTime = getLocalTournamentTime()
  return (
    <SlideLayout
      subheader="Daily Royale"
      header="Tournament Entry: How it Works."
      illustration={<IllustrationTimer />}
    >
      <p style={{ margin: '0 0 16px', fontSize: 14, color: C.muted, lineHeight: 1.6 }}>
        The Daily Royale fires every night at{' '}
        <span style={{ color: C.accent, fontWeight: 700 }}>{localTime} your time</span>.
        How your bot gets in depends on your tier:
      </p>

      {/* Free tier row */}
      <div style={{
        display: 'flex', gap: 12, padding: '12px 14px', marginBottom: 10,
        borderRadius: 10, border: `1px solid ${C.border}`,
        background: 'rgba(255,255,255,0.03)',
      }}>
        <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>🖐</span>
        <div>
          <div style={{ fontSize: 13, marginBottom: 3 }}>
            <span style={{ color: C.muted, fontWeight: 600 }}>Free Tier: </span>
            <span style={{ color: C.text, fontWeight: 800 }}>Manual Daily Check-in Required.</span>
          </div>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
            Register your bot each day to participate.
          </div>
        </div>
      </div>

      {/* Pro tier row */}
      <div style={{
        display: 'flex', gap: 12, padding: '12px 14px',
        borderRadius: 10,
        border: `1px solid rgba(0,229,255,0.3)`,
        background: 'rgba(0,229,255,0.06)',
      }}>
        <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>⚡</span>
        <div>
          <div style={{ fontSize: 13, marginBottom: 3 }}>
            <span style={{ color: C.accent, fontWeight: 600 }}>Pro Tier: </span>
            <span style={{ color: C.text, fontWeight: 800 }}>100% Automated.</span>
          </div>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
            Your bots enter all tourneys automatically—no check-ins needed.
          </div>
        </div>
      </div>
    </SlideLayout>
  )
}

function Slide4() {
  return (
    <SlideLayout
      subheader="Get Started"
      header="Ready to Deploy?"
      illustration={<IllustrationArena />}
    >
      <p style={{ margin: '0 0 20px', fontSize: 15, color: C.muted, lineHeight: 1.7 }}>
        Start with <span style={{ color: C.text, fontWeight: 700 }}>1 Free Bot</span> or upgrade to Pro for{' '}
        <span style={{ color: C.accent, fontWeight: 700 }}>5 Bot Slots</span> and maximum ROI.
      </p>

      {/* Compact tier comparison */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{
          padding: '12px 14px', borderRadius: 10,
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 11, color: C.muted, letterSpacing: 2, marginBottom: 6 }}>FREE</div>
          {['1 Bot slot', 'Manual daily entry', 'Win cash prizes'].map(item => (
            <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
              <span style={{ color: C.muted, fontSize: 12 }}>–</span>
              <span style={{ fontSize: 12, color: C.muted }}>{item}</span>
            </div>
          ))}
        </div>
        <div style={{
          padding: '12px 14px', borderRadius: 10,
          background: 'rgba(0,229,255,0.06)',
          border: `1px solid rgba(0,229,255,0.3)`,
        }}>
          <div style={{ fontSize: 11, color: C.accent, letterSpacing: 2, marginBottom: 6 }}>PRO</div>
          {['5 Bot slots', 'Auto-Entry ALL', 'Maximum ROI'].map(item => (
            <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
              <span style={{ color: C.accent, fontSize: 12 }}>✓</span>
              <span style={{ fontSize: 12, color: C.text }}>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </SlideLayout>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────────

export default function WelcomeCarousel({ userName: _userName, onClose, onUpgrade, onBuildBot }: WelcomeCarouselProps) {
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
    // Completing the full flow always marks the carousel as seen (persist=true),
    // regardless of the "Don't show again" checkbox state.
    if (onBuildBot) {
      setClosing(true)
      setTimeout(() => onBuildBot(true), 260)
    } else {
      triggerClose(true)
    }
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
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
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
          {slide === 0 && <Slide1 />}
          {slide === 1 && <Slide2 />}
          {slide === 2 && <Slide3 />}
          {slide === 3 && <Slide4 />}
        </div>

        {/* ── Footer nav ──────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center',
          gap: 10, padding: '12px 24px',
          borderTop: `1px solid ${C.border}`,
          background: 'rgba(0,0,0,0.2)',
        }}>
          {/* "Don't show this again" — custom-styled, visible on all slides */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8,
            cursor: 'pointer', userSelect: 'none',
            marginRight: 'auto', flexShrink: 0,
          }}>
            {/* Hidden native checkbox drives the state; visual box is the sibling div */}
            <input
              data-testid="carousel-dont-show"
              type="checkbox"
              checked={dontShow}
              onChange={e => setDontShow(e.target.checked)}
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
            />
            {/* Custom visual checkbox */}
            <div style={{
              width: 16, height: 16, borderRadius: 3, flexShrink: 0,
              background: dontShow ? '#06b6d4' : '#27272a',   /* cyan-500 : zinc-800 */
              border: `1px solid ${dontShow ? '#06b6d4' : '#3f3f46'}`, /* zinc-700 when unchecked */
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
              boxShadow: dontShow ? '0 0 10px rgba(6,182,212,0.5)' : 'none',
            }}>
              {dontShow && (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4L3.5 6.5L9 1" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span style={{ fontSize: 12, color: '#a1a1aa', fontFamily: C.font }}>
              Don't show this again
            </span>
          </label>

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
              }}
            >
              ← Back
            </button>
          )}

          {/* Next / final slide buttons */}
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
                boxShadow: '0 0 14px rgba(0,229,255,0.25)',
              }}
            >
              Next →
            </button>
          ) : (
            <>
              {/* Secondary — Upgrade to Pro */}
              <button
                className="wc-btn-hover"
                onClick={handleUpgrade}
                style={{
                  padding: '9px 18px',
                  background: 'transparent',
                  border: `1px solid rgba(0,229,255,0.4)`,
                  borderRadius: 8, color: C.accent,
                  fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', fontFamily: C.font, letterSpacing: 0.3,
                  transition: 'opacity 0.15s',
                }}
              >
                ⚡ Upgrade to Pro
              </button>
              {/* Primary — Build Your First Bot */}
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
                  boxShadow: '0 0 16px rgba(0,229,255,0.35)',
                }}
              >
                🤖 Build Your First Bot
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
