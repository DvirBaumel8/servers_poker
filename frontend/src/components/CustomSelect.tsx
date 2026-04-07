import { useState, useRef, useEffect } from 'react'
import { Check } from 'lucide-react'

const CS = {
  card: '#13132a',
  border: '#1e1e3f',
  accent: '#00e5ff',
  text: '#ffffff',
  muted: '#9ca3af',
  danger: '#e24b4a',
  font: "'Trebuchet MS', sans-serif",
}

export interface SelectOption {
  value: string
  label: string
  /** Optional tooltip shown as a muted subtitle below the label */
  description?: string
}

export interface SelectGroup {
  label: string
  options: SelectOption[]
}

interface CustomSelectProps {
  value: string
  onChange: (val: string) => void
  /** Flat list of options (use either options or groups, not both) */
  options?: SelectOption[]
  /** Grouped options with category headers */
  groups?: SelectGroup[]
  /** Text shown when nothing is selected */
  placeholder?: string
  /** Red border state */
  error?: boolean
  /** Grays out and disables interaction */
  disabled?: boolean
  /**
   * 'md' (default) — 11px 14px / fontSize 14 (form fields)
   * 'sm' — 6px 10px / fontSize 12 (compact inline selects)
   * 'xs' — 3px 8px / fontSize 11 (tiny toolbar selects)
   */
  size?: 'xs' | 'sm' | 'md'
  /** Applied to the outer wrapper div (use for flex:1, width, minWidth, etc.) */
  style?: React.CSSProperties
}

export default function CustomSelect({
  value,
  onChange,
  options,
  groups,
  placeholder,
  error = false,
  disabled = false,
  size = 'md',
  style,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false)
  const [hoveredValue, setHoveredValue] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  function handleToggle() {
    if (disabled) return
    setOpen(prev => {
      if (!prev) setSearchQuery('')
      return !prev
    })
  }

  // Resolve the label for the current value
  let selectedLabel: string = placeholder ?? 'Select…'
  if (value) {
    if (options) {
      selectedLabel = options.find(o => o.value === value)?.label ?? value
    } else if (groups) {
      outer: for (const g of groups) {
        for (const o of g.options) {
          if (o.value === value) { selectedLabel = o.label; break outer }
        }
      }
    }
  }

  const isPlaceholder = !value

  const pad = size === 'xs' ? '3px 8px' : size === 'sm' ? '8px 12px' : '11px 14px'
  const fs  = size === 'xs' ? 11 : size === 'sm' ? 13 : 14

  // Auto-feature thresholds
  const totalOptions = groups
    ? groups.reduce((n, g) => n + g.options.length, 0)
    : (options ?? []).length
  const showSearch = totalOptions > 8
  const twoColumn  = !groups && totalOptions > 8

  function filterOptions(opts: SelectOption[]) {
    if (!searchQuery) return opts
    const q = searchQuery.toLowerCase()
    return opts.filter(o => o.label.toLowerCase().includes(q))
  }

  function renderOption(opt: SelectOption, indented: boolean) {
    const isSelected = opt.value === value
    const isHovered  = hoveredValue === opt.value
    return (
      <div
        key={opt.value}
        onMouseEnter={() => setHoveredValue(opt.value)}
        onMouseLeave={() => setHoveredValue(null)}
        onClick={() => { onChange(opt.value); setOpen(false) }}
        style={{
          margin: twoColumn ? '0' : '0 4px',
          padding: indented ? `6px 16px 6px 24px` : '6px 16px',
          borderRadius: 6,
          fontSize: fs,
          fontFamily: CS.font,
          cursor: 'pointer',
          color: isSelected || isHovered ? '#22d3ee' : CS.text,
          background: isHovered ? '#27272a' : isSelected ? 'rgba(0,229,255,0.05)' : 'transparent',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          transition: 'background-color 0.15s, color 0.15s',
        }}
      >
        <span style={{ width: 12, flexShrink: 0, paddingTop: 2 }}>
          {isSelected && <Check size={12} strokeWidth={2.5} />}
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
          <span>{opt.label}</span>
          {opt.description && (
            <span style={{
              fontSize: fs - 2,
              color: isHovered ? 'rgba(34,211,238,0.55)' : 'rgba(156,163,175,0.6)',
              fontWeight: 400,
              lineHeight: 1.3,
              transition: 'color 0.15s',
            }}>
              {opt.description}
            </span>
          )}
        </span>
      </div>
    )
  }

  function renderOptions() {
    if (groups) {
      return groups.map((group, gIdx) => {
        const filtered = filterOptions(group.options)
        if (filtered.length === 0) return null
        return (
          <div key={group.label}>
            <div style={{
              margin: '0 4px',
              padding: '4px 14px 3px',
              fontSize: 10,
              fontWeight: 700,
              color: CS.muted,
              textTransform: 'uppercase',
              letterSpacing: 1.5,
              userSelect: 'none',
              borderRadius: 4,
              background: 'rgba(0, 0, 0, 0.35)',
              borderTop: gIdx > 0 ? `1px solid ${CS.border}` : 'none',
              marginTop: gIdx > 0 ? 4 : 0,
            }}>
              {group.label}
            </div>
            {filtered.map(opt => renderOption(opt, true))}
          </div>
        )
      })
    }

    const filtered = filterOptions(options ?? [])
    if (filtered.length === 0) {
      return (
        <div style={{ padding: '12px 16px', fontSize: fs, color: CS.muted, fontFamily: CS.font }}>
          No results
        </div>
      )
    }

    if (twoColumn) {
      return (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          padding: '4px',
          gap: 2,
        }}>
          {filtered.map(opt => renderOption(opt, false))}
        </div>
      )
    }

    return filtered.map(opt => renderOption(opt, false))
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative', ...style }}>
      {/* Trigger */}
      <div
        onClick={handleToggle}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: pad,
          background: '#0c0c1e',
          border: `1px solid ${error ? CS.danger : open ? CS.accent : CS.border}`,
          borderRadius: 6,
          color: isPlaceholder ? CS.muted : CS.text,
          fontSize: fs,
          fontFamily: CS.font,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          userSelect: 'none',
          transition: 'border-color 0.15s',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {selectedLabel}
        </span>
        <svg
          width="10" height="7" viewBox="0 0 10 7" fill="none"
          style={{ flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}
        >
          <path d="M1 1L5 6L9 1" stroke={CS.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Dropdown panel */}
      {open && !disabled && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          right: 'auto',
          minWidth: '100%',
          width: 'max-content',
          maxWidth: 480,
          background: 'rgba(18, 18, 27, 0.97)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(63, 63, 70, 0.75)',
          borderRadius: 8,
          zIndex: 9999,
          boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 8px 24px rgba(0,0,0,0.6)',
          maxHeight: 400,
          overflowY: 'auto',
          paddingBottom: 4,
          scrollbarWidth: 'thin',
          scrollbarColor: '#3f3f46 transparent',
        }}>
          {/* Sticky search bar */}
          {showSearch && (
            <div
              onMouseDown={e => e.stopPropagation()}
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 1,
                background: '#1c1c27',
                borderBottom: `1px solid ${CS.border}`,
              }}
            >
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search…"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '9px 12px',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: CS.text,
                  fontSize: fs,
                  fontFamily: CS.font,
                }}
              />
            </div>
          )}
          <div style={{ paddingTop: 4 }}>
            {renderOptions()}
          </div>
        </div>
      )}
    </div>
  )
}
