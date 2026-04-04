import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useSidebarStore } from '../store/sidebarStore'

const C = {
  bg: '#0d0d22',
  border: '#1e1e3f',
  card: '#13132a',
  accent: '#00e5ff',
  accentDim: 'rgba(0,229,255,0.08)',
  text: '#ffffff',
  muted: '#9ca3af',
  danger: '#e24b4a',
  font: "'Trebuchet MS', sans-serif",
}

const NAV = [
  { label: 'Home', path: '/' },
  { label: 'My Bots', path: '/bots' },
  { label: 'Tournaments', path: '/tournaments' },
  { label: 'Leaderboard', path: '/leaderboard' },
  { label: 'Tournament Analytics', path: '/games' },
  { label: 'Simulations', path: '/simulations' },
  { label: 'Scenario Lab', path: '/scenario-lab' },
  { label: 'Support', path: '/support' },
]

const NAV_ICONS: Record<string, React.ReactNode> = {
  Home: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
    </svg>
  ),
  'My Bots': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  ),
  Tournaments: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1" fill="currentColor"/><circle cx="3" cy="12" r="1" fill="currentColor"/><circle cx="3" cy="18" r="1" fill="currentColor"/>
    </svg>
  ),
  Leaderboard: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="14" width="4" height="8"/><rect x="10" y="6" width="4" height="16"/><rect x="16" y="10" width="4" height="12"/>
    </svg>
  ),
  'Tournament Analytics': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/>
    </svg>
  ),
  Simulations: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  ),
  'Scenario Lab': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18"/>
    </svg>
  ),
  Support: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="4"/>
      <line x1="4.93" y1="4.93" x2="9.17" y2="9.17"/>
      <line x1="14.83" y1="14.83" x2="19.07" y2="19.07"/>
      <line x1="14.83" y1="9.17" x2="19.07" y2="4.93"/>
      <line x1="4.93" y1="19.07" x2="9.17" y2="14.83"/>
    </svg>
  ),
}

export function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const collapsed = useSidebarStore((s) => s.collapsed)
  const toggle = useSidebarStore((s) => s.toggle)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  return (
    <div style={{
      width: collapsed ? 60 : 210, height: '100vh', position: 'sticky', top: 0, background: C.bg, borderRight: `1px solid ${C.border}`,
      display: 'flex', flexDirection: 'column', flexShrink: 0, fontFamily: C.font, transition: 'width 0.2s', overflow: 'visible',
    }}>
      {/* Logo */}
      <div style={{ padding: collapsed ? '12px 12px 6px' : '18px 20px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        {!collapsed && (
          <>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase' }}>
              <span style={{ color: C.text }}>Bot</span>
              <span style={{ color: C.accent }}>Royale</span>
            </div>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginTop: 4, whiteSpace: 'nowrap' }}>
              Automate. Compete. Win.
            </div>
          </>
        )}
        {collapsed && (
          <div style={{ fontSize: 16, color: C.accent }}>◆</div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, minHeight: 0, padding: '10px 0', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'visible' }}>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle() }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = C.accent }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(0, 229, 255, 0.5)' }}
          style={{
            position: 'absolute', right: '-17px', top: '50%', transform: 'translateY(-50%)',
            width: 34, height: 34, background: 'transparent', border: 'none',
            color: 'rgba(0, 229, 255, 0.5)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 'bold', transition: 'color 0.2s', zIndex: 10, padding: 0,
            pointerEvents: 'auto',
          }}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '»' : '«'}
        </button>
        {NAV.map(({ label, path }) => {
          const active = location.pathname === path
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: collapsed ? 0 : 10,
                width: '100%', padding: collapsed ? '7px 0' : '7px 20px',
                background: active ? C.accentDim : 'transparent',
                border: 'none', borderLeft: collapsed ? 'none' : `3px solid ${active ? C.accent : 'transparent'}`,
                color: active ? C.text : C.muted,
                fontSize: 14, fontFamily: C.font, cursor: 'pointer',
                textAlign: 'left', transition: 'all 0.15s',
              }}
            >
              <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {NAV_ICONS[label]}
              </span>
              {!collapsed && label}
            </button>
          )
        })}
      </nav>

      {/* User */}
      <div style={{ padding: collapsed ? '12px 4px' : '12px 20px', borderTop: `1px solid ${C.border}`, position: 'relative', flexShrink: 0 }}>
        <button
          onClick={() => setDropdownOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 10, width: '100%',
            background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
          }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, #00e5ff, #0070ff)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: '#000', flexShrink: 0,
          }}>
            {(user?.name?.[0] ?? '?').toUpperCase()}
          </div>
          {!collapsed && (
            <>
              <div style={{ overflow: 'hidden', flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: 13, color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.name ?? 'Player'}
                </div>
                <div style={{ fontSize: 11, color: C.muted }}>{user?.role ?? 'user'}</div>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ flexShrink: 0, transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </>
          )}
        </button>
        {dropdownOpen && !collapsed && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 12, right: 12, marginBottom: 6,
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
            overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          }}>
            <button
              onClick={() => { setDropdownOpen(false); logout() }}
              style={{
                width: '100%', padding: '10px 14px', background: 'transparent',
                border: 'none', color: C.danger, fontSize: 13, fontFamily: C.font,
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
