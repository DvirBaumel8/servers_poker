import { useState } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import { cardStyle, C } from '../styles/tokens'

// Unified card shell shared by Bot Dashboard cards and Lineup cards.
// Handles: border, background, border-radius, padding, hover-lift.
// Callers add their own flexDirection/gap via the `style` prop.
interface BaseCardProps {
  children: ReactNode
  style?: CSSProperties
  onClick?: () => void
  /** When false the card border stays C.border even on hover (non-interactive cards) */
  accentHover?: boolean
}

export default function BaseCard({ children, style, onClick, accentHover = true }: BaseCardProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...cardStyle(accentHover && hovered),
        ...(onClick && { cursor: 'pointer' }),
        ...(hovered && onClick && { transform: 'translateY(-2px)' }),
        fontFamily: C.font,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
