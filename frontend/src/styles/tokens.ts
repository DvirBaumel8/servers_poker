// ─── Design tokens — single source of truth ───────────────────────────────────
// Import C, T, and style helpers from here instead of defining per-file.

export const C = {
  bg:        '#09090b',
  card:      'rgba(18,18,27,0.50)',   // zinc-900/50 — semi-transparent for glassmorphism
  cardHover: 'rgba(28,28,44,0.65)',
  border:    'rgba(255,255,255,0.08)', // border-white/8
  accent:    '#00f5ff',               // neon-cyan
  accentDim: 'rgba(0,245,255,0.08)',
  text:      '#ffffff',
  muted:     '#a8b3c4',
  danger:    '#e24b4a',
  success:   '#1d9e75',
  warning:   '#f59e0b',
  gold:      '#ffd700',
  silver:    '#c0c0c0',
  bronze:    '#cd7f32',
  resultsBg: '#0c0c20',
  font:      "'Trebuchet MS', sans-serif",
} as const

// Typography scale (numeric px — use in fontSize)
// Floor: 12. Nothing in the UI should go below xs.
export const T = {
  xs:   12,  // micro-labels, metadata, tooltips
  sm:   13,  // secondary text, stat values, buttons
  base: 14,  // body text, descriptions, labels
  md:   15,  // bot names, important values
  lg:   16,  // card primary titles
  xl:   18,  // section headers
  h2:   20,  // page titles / topbar
  h1:   24,  // hero headings
} as const

// Shared card styles — spread into a div's style prop
export const cardStyle = (hovered = false): React.CSSProperties => ({
  background:             hovered ? C.cardHover : C.card,
  backdropFilter:         'blur(12px)',
  WebkitBackdropFilter:   'blur(12px)',
  border:                 `1px solid ${hovered ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)'}`,
  borderRadius:           14,
  padding:                20,
  transition:             'border-color 0.2s, background 0.2s, box-shadow 0.2s',
  boxShadow:              hovered
    ? '0 0 0 1px rgba(0,245,255,0.15), 0 8px 32px rgba(0,245,255,0.08), 0 0 15px rgba(0,245,255,0.05)'
    : '0 4px 24px rgba(0,0,0,0.45), 0 0 15px rgba(0,245,255,0.05)',
})

// Unified progress bar track
export const barTrack: React.CSSProperties = {
  height: 5, background: C.border, borderRadius: 3, overflow: 'hidden',
  flex: 1,
}

// Progress bar fill — color is the fill color, glow adds a subtle outer glow
export const barFill = (widthPct: number, color: string, glow = false): React.CSSProperties => ({
  width:        `${widthPct}%`,
  height:       '100%',
  background:   color,
  borderRadius: 3,
  transition:   'width 0.3s ease',
  ...(glow && { boxShadow: `0 0 6px ${color}80` }),
})

// Micro uppercase label (e.g. "BOT DNA", "WIN RATE", trait names)
export const microLabel: React.CSSProperties = {
  fontSize:      T.xs,
  color:         C.muted,
  textTransform: 'uppercase',
  letterSpacing: 1,
}

// Glassmorphism chip for bot avatars and suit icons
export const glassChip = (size: number): React.CSSProperties => ({
  width:          size,
  height:         size,
  borderRadius:   Math.round(size * 0.28),
  background:     'rgba(255,255,255,0.04)',
  border:         '1px solid rgba(255,255,255,0.08)',
  backdropFilter: 'blur(8px)',
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'center',
  flexShrink:     0,
})

// Primary CTA button — cyan gradient + glow
export const primaryButtonStyle: React.CSSProperties = {
  background:    'linear-gradient(135deg, #06b6d4, #00d4e8)',
  border:        'none',
  borderRadius:  8,
  color:         '#000',
  fontWeight:    700,
  fontSize:      13,
  cursor:        'pointer',
  letterSpacing: 0.5,
  boxShadow:     '0 0 16px rgba(0,245,255,0.25)',
  transition:    'box-shadow 0.2s, opacity 0.2s',
}

// Monospace style for numeric data (ELO, chips, latencies, prize amounts)
export const monoStyle: React.CSSProperties = {
  fontFamily:         "'JetBrains Mono', 'Fira Code', monospace",
  fontVariantNumeric: 'tabular-nums',
}

// Section / card header — matches carousel slide headers
export const sectionHeaderStyle: React.CSSProperties = {
  fontSize:      T.xl,   // 18px
  fontWeight:    700,
  color:         '#ffffff',
  letterSpacing: 0.3,
}
