import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import LeftPanel from '../components/LeftPanel'
import Toast from '../components/Toast'
import api from '../lib/axios'
import { useAuthStore } from '../store/authStore'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const inputBase: React.CSSProperties = {
  width: '100%', background: '#0c0c1e', border: '1px solid #252550',
  borderRadius: '8px', padding: '11px 14px', color: '#ffffff',
  fontSize: '15px', outline: 'none',
}

function EyeOpen() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeClosed() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

export default function SignIn() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [emailTouched, setEmailTouched] = useState(false)
  const [emailFocused, setEmailFocused] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [apiError, setApiError] = useState<'email' | 'password' | null>(null)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')

  const emailValid = EMAIL_RE.test(email)
  const emailBorderColor = emailFocused || emailTouched
    ? emailValid ? '#1d9e75' : (email.length > 0 ? '#e24b4a' : '#252550')
    : '#252550'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setApiError(null)
    const newErrors: typeof errors = {}
    if (!email) newErrors.email = 'Email is required'
    else if (!emailValid) newErrors.email = 'Enter a valid email address'
    if (!password) newErrors.password = 'Password is required'
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return }

    setLoading(true)
    try {
      const res = await api.post('/auth/login', { email, password })
      login(res.data.accessToken, res.data.user)
      navigate('/')
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      // 404 = account not found → email field; 401 = wrong password → password field
      setApiError(status === 404 ? 'email' : 'password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <div style={{ flex: '0 0 45%' }} className="hidden md:block">
        <LeftPanel />
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', background: '#0f0f23' }}>
        <div style={{ width: '100%', maxWidth: '420px' }}>
          <div style={{ background: '#13132a', border: '1px solid #252550', borderRadius: '14px', padding: '40px 36px' }}>
            {/* Logo */}
            <div style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px' }}>
              <span style={{ color: '#ffffff' }}>Bot</span>
              <span style={{ color: '#00e5ff' }}>Royale</span>
            </div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#ffffff', margin: '0 0 28px' }}>Welcome back</h1>

            <form onSubmit={handleSubmit} noValidate>
              {/* Email */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: '' })); setApiError(null) }}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => { setEmailFocused(false); setEmailTouched(true) }}
                  placeholder="you@example.com"
                  style={{ ...inputBase, borderColor: (errors.email || apiError === 'email') ? '#e24b4a' : emailBorderColor }}
                />
                {(errors.email || (emailTouched && !emailFocused && email.length > 0 && !emailValid) || apiError === 'email') && (
                  <p style={{ color: '#e24b4a', fontSize: '12px', marginTop: '4px' }}>
                    {apiError === 'email' ? 'No account found with this email' : errors.email || 'Enter a valid email address'}
                  </p>
                )}
              </div>

              {/* Password */}
              <div style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: '' })); setApiError(null) }}
                    placeholder="••••••••"
                    style={{ ...inputBase, paddingRight: '44px', borderColor: (errors.password || apiError === 'password') ? '#e24b4a' : '#252550' }}
                  />
                  <button
                    type="button"
                    onClick={() => { if (password) setShowPassword(!showPassword) }}
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: password ? 'pointer' : 'default', color: password ? '#555' : '#2a2a3a', padding: 0, display: 'flex' }}
                  >
                    {showPassword ? <EyeClosed /> : <EyeOpen />}
                  </button>
                </div>
                {(errors.password || apiError === 'password') && (
                  <p style={{ color: '#e24b4a', fontSize: '12px', marginTop: '4px' }}>
                    {apiError === 'password' ? 'Incorrect password — please try again' : errors.password}
                  </p>
                )}
              </div>

              {/* Forgot */}
              <div style={{ textAlign: 'right', marginBottom: '24px' }}>
                <span style={{ color: '#555', fontSize: '13px', cursor: 'not-allowed' }}>Forgot password? (Coming soon)</span>
              </div>

              {/* Sign in button */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', padding: '13px', border: 'none', borderRadius: '8px',
                  background: 'linear-gradient(90deg, #00e5ff, #0070ff)',
                  color: '#000000', fontWeight: 700, fontSize: '14px',
                  textTransform: 'uppercase', letterSpacing: '1px',
                  cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
                  fontFamily: "'Exo 2', sans-serif",
                }}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>

              {/* Divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0' }}>
                <div style={{ flex: 1, height: '1px', background: '#252550' }} />
                <span style={{ color: '#555', fontSize: '13px' }}>or</span>
                <div style={{ flex: 1, height: '1px', background: '#252550' }} />
              </div>

              {/* Google button */}
              <button
                type="button"
                onClick={() => setToast('Google sign in coming soon')}
                style={{
                  width: '100%', padding: '12px', border: '1px solid #e0e0e0', borderRadius: '8px',
                  background: '#ffffff', color: '#1f1f1f', fontWeight: 600, fontSize: '14px',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                  fontFamily: "'Exo 2', sans-serif",
                }}
              >
                <GoogleIcon />
                Continue with Google
              </button>
            </form>

            {/* Sign up link */}
            <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '14px', color: '#9ca3af' }}>
              Don't have an account?{' '}
              <Link to="/signup" style={{ color: '#00e5ff', textDecoration: 'none' }}>Sign up</Link>
            </p>
          </div>
        </div>
      </div>

      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  )
}
