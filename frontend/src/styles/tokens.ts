// ─── Design tokens — single source of truth ───────────────────────────────────
// Import C, T, and style helpers from here instead of defining per-file.

export const C = {
  bg:        '#0a0a1a',
  card:      '#13132a',
  cardHover: '#161630',
  border:    '#1e1e3f',
  accent:    '#00e5ff',
  accentDim: 'rgba(0,229,255,0.08)',
  text:      '#ffffff',
  muted:     '#a8b3c4',   // slightly brighter than #9ca3af for readability on dark bg
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
  background:   hovered ? C.cardHover : C.card,
  border:       `1px solid ${hovered ? C.accent : C.border}`,
  borderRadius: 14,
  padding:      20,
  transition:   'border-color 0.2s, background 0.2s, box-shadow 0.2s',
  boxShadow:    hovered
    ? '0 0 0 1px rgba(0,229,255,0.15), 0 8px 32px rgba(0,229,255,0.08)'
    : '0 4px 24px rgba(0,0,0,0.45)',
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

// Primary CTA button — cyan gradient + glow (matches carousel "Next" / "Upgrade" buttons)
export const primaryButtonStyle: React.CSSProperties = {
  background:  'linear-gradient(90deg, #00e5ff, #0070ff)',
  border:      'none',
  borderRadius: 8,
  color:       '#000',
  fontWeight:  700,
  fontSize:    13,
  cursor:      'pointer',
  letterSpacing: 0.5,
  boxShadow:   '0 0 20px rgba(0,229,255,0.25)',
  transition:  'box-shadow 0.2s, opacity 0.2s',
}

// Section / card header — matches carousel slide headers
export const sectionHeaderStyle: React.CSSProperties = {
  fontSize:      T.xl,   // 18px
  fontWeight:    700,
  color:         '#ffffff',
  letterSpacing: 0.3,
}
