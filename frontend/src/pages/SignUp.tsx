import { useEffect, useRef, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import LeftPanel from '../components/LeftPanel'
import Toast from '../components/Toast'
import api from '../lib/axios'
import { useAuthStore } from '../store/authStore'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const inputBase: React.CSSProperties = {
  width: '100%', background: '#0c0c1e', border: '1px solid #252550',
  borderRadius: '8px', padding: '11px 14px', color: '#ffffff',
  fontSize: '15px', outline: 'none', fontFamily: "'Exo 2', sans-serif",
}

function label(text: string) {
  return (
    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>
      {text}
    </label>
  ) as React.ReactNode
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
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84z" />
    </svg>
  )
}

function passwordScore(pw: string): number {
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  return score
}

const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong']
const strengthColors = ['', '#e24b4a', '#f59e0b', '#1d9e75', '#00e5ff']

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null
  const score = passwordScore(password)
  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ flex: 1, height: '3px', borderRadius: '2px', background: i <= score ? strengthColors[score] : '#252550', transition: 'background 0.2s' }} />
        ))}
      </div>
      <span style={{ fontSize: '12px', color: strengthColors[score] }}>{strengthLabels[score]}</span>
    </div>
  )
}

function StepIndicator({ step }: { step: number }) {
  const steps = ['Account', 'Verify', 'Phone']
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '28px' }}>
      {steps.map((s, i) => {
        const idx = i + 1
        const active = idx === step
        const done = idx < step
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'unset' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '12px', fontWeight: 700,
                background: done ? '#1d9e75' : active ? '#00e5ff' : '#252550',
                color: done || active ? '#000' : '#555',
              }}>
                {done ? '✓' : idx}
              </div>
              <span style={{ fontSize: '11px', color: active ? '#00e5ff' : done ? '#1d9e75' : '#555', whiteSpace: 'nowrap' }}>{s}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: '1px', background: done ? '#1d9e75' : '#252550', margin: '0 8px', marginBottom: '18px' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function CodeInputs({ onComplete }: { onComplete: (code: string) => void }) {
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const refs = useRef<(HTMLInputElement | null)[]>([])

  function handleChange(i: number, val: string) {
    const d = val.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[i] = d
    setDigits(next)
    if (d && i < 5) refs.current[i + 1]?.focus()
    if (next.every((x) => x !== '')) onComplete(next.join(''))
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus()
    if (e.key === 'Enter' && digits.every((x) => x !== '')) onComplete(digits.join(''))
  }

  return (
    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', margin: '20px 0' }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          style={{
            width: '44px', height: '52px', background: '#0c0c1e', border: `1px solid ${d ? '#00e5ff' : '#252550'}`,
            borderRadius: '8px', color: '#ffffff', fontSize: '20px', fontWeight: 700,
            textAlign: 'center', outline: 'none', fontFamily: "'Exo 2', sans-serif",
          }}
        />
      ))}
    </div>
  )
}

export default function SignUp() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)

  const [step, setStep] = useState(1)
  const [viaGoogle, setViaGoogle] = useState(false)
  const [toast, setToast] = useState('')

  // Define handleEnterArena early so it can be used in useEffect
  const handleEnterArena = useCallback(() => {
    navigate('/')
  }, [navigate])

  useEffect(() => {
    if (step !== 3) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Enter') handleEnterArena()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [step, handleEnterArena])

  // Step 1 fields
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [nameError, setNameError] = useState('')
  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [step1Error, setStep1Error] = useState('')
  const [step1Loading, setStep1Loading] = useState(false)

  // Step 2
  const [verifyError, setVerifyError] = useState('')
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [resendMsg, setResendMsg] = useState('')

  // Step 3
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [smsSent, setSmsSent] = useState(false)

  const emailValid = EMAIL_RE.test(email)
  const score = passwordScore(password)

  async function checkName() {
    if (!name || name.length < 2) return
    try {
      await api.get(`/users/check-name?name=${encodeURIComponent(name)}`)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 409) {
        setNameError('This name is already taken')
      }
    }
  }

  async function handleStep1(e: React.FormEvent) {
    e.preventDefault()
    setStep1Error('')
    let hasError = false

    if (!name) { setNameError('Name is required'); hasError = true }
    else if (name.length < 2) { setNameError('Name must be at least 2 characters'); hasError = true }
    if (!emailValid) { setEmailTouched(true); hasError = true }
    if (score < 3) { hasError = true }
    if (hasError) return

    setStep1Loading(true)
    try {
      const res = await api.post('/auth/register', { name, email, password })
      if (res.data.verificationCode) {
        await handleVerify(res.data.verificationCode)
      } else {
        setStep(2)
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setStep1Error(msg || 'Registration failed')
    } finally {
      setStep1Loading(false)
    }
  }

  async function handleVerify(code: string) {
    setVerifyLoading(true)
    setVerifyError('')
    try {
      const res = await api.post('/auth/verify-email', { email, code })
      login(res.data.accessToken, res.data.user)
      setStep(3)
    } catch {
      setVerifyError('Invalid or expired code')
    } finally {
      setVerifyLoading(false)
    }
  }

  async function handleResend() {
    try {
      await api.post('/auth/resend-verification', { email })
      setResendMsg('Code resent!')
    } catch {
      setResendMsg('Failed to resend')
    }
  }

  const primaryBtn: React.CSSProperties = {
    width: '100%', padding: '13px', border: 'none', borderRadius: '8px',
    background: 'linear-gradient(90deg, #00e5ff, #0070ff)',
    color: '#000000', fontWeight: 700, fontSize: '14px',
    textTransform: 'uppercase', letterSpacing: '1px',
    cursor: 'pointer', fontFamily: "'Exo 2', sans-serif",
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <div style={{ flex: '0 0 45%' }} className="hidden md:block">
        <LeftPanel />
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', background: '#0f0f23' }}>
        <div style={{ width: '100%', maxWidth: '420px' }}>
          <div style={{ background: '#13132a', border: '1px solid #252550', borderRadius: '14px', padding: '40px 36px' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '20px' }}>
              <span style={{ color: '#ffffff' }}>Bot</span>
              <span style={{ color: '#00e5ff' }}>Royale</span>
            </div>

            <StepIndicator step={step} />

            {/* ── Step 1 ── */}
            {step === 1 && (
              <form onSubmit={handleStep1} noValidate>
                <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff', margin: '0 0 20px' }}>Create your account</h2>

                {step1Error && (
                  <div style={{ background: 'rgba(226,75,74,0.1)', border: '1px solid #e24b4a', borderRadius: '8px', padding: '10px 14px', color: '#e24b4a', fontSize: '14px', marginBottom: '16px' }}>
                    {step1Error}
                  </div>
                )}

                {/* Name */}
                <div style={{ marginBottom: '16px' }}>
                  {label('Name')}
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => { const v = e.target.value.trimStart(); setName(v ? v[0].toUpperCase() + v.slice(1) : v); setNameError('') }}
                    onBlur={() => { setNameTouched(true); checkName() }}
                    placeholder="Your display name"
                    style={{ ...inputBase, borderColor: nameError ? '#e24b4a' : nameTouched && name.length >= 2 ? '#1d9e75' : '#252550' }}
                  />
                  {nameError && <p style={{ color: '#e24b4a', fontSize: '12px', marginTop: '4px' }}>{nameError}</p>}
                </div>

                {/* Email */}
                <div style={{ marginBottom: '16px' }}>
                  {label('Email')}
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value) }}
                    onBlur={() => setEmailTouched(true)}
                    placeholder="you@example.com"
                    style={{ ...inputBase, borderColor: emailTouched ? (emailValid ? '#1d9e75' : '#e24b4a') : '#252550' }}
                  />
                  {emailTouched && !emailValid && (
                    <p style={{ color: '#e24b4a', fontSize: '12px', marginTop: '4px' }}>Enter a valid email</p>
                  )}
                </div>

                {/* Password */}
                <div style={{ marginBottom: '8px' }}>
                  {label('Password')}
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      style={{ ...inputBase, paddingRight: '44px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: 0, display: 'flex' }}
                    >
                      {showPassword ? <EyeClosed /> : <EyeOpen />}
                    </button>
                  </div>
                  <PasswordStrength password={password} />
                  {password && score < 3 && (
                    <p style={{ color: '#f59e0b', fontSize: '12px', marginTop: '4px' }}>Password must be at least Good to continue</p>
                  )}
                </div>

                <div style={{ marginTop: '24px' }}>
                  <button type="submit" disabled={step1Loading} style={{ ...primaryBtn, opacity: step1Loading ? 0.7 : 1, cursor: step1Loading ? 'not-allowed' : 'pointer' }}>
                    {step1Loading ? 'Creating account...' : 'Continue'}
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0' }}>
                  <div style={{ flex: 1, height: '1px', background: '#252550' }} />
                  <span style={{ color: '#555', fontSize: '13px' }}>or</span>
                  <div style={{ flex: 1, height: '1px', background: '#252550' }} />
                </div>

                <button
                  type="button"
                  onClick={() => { setViaGoogle(true); setStep(3) }}
                  style={{ width: '100%', padding: '12px', border: '1px solid #e0e0e0', borderRadius: '8px', background: '#ffffff', color: '#1f1f1f', fontWeight: 600, fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontFamily: "'Exo 2', sans-serif" }}
                >
                  <GoogleIcon />
                  Continue with Google
                </button>

                <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '14px', color: '#9ca3af' }}>
                  Already have an account?{' '}
                  <Link to="/signin" style={{ color: '#00e5ff', textDecoration: 'none' }}>Sign in</Link>
                </p>
              </form>
            )}

            {/* ── Step 2 ── */}
            {step === 2 && (
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff', margin: '0 0 8px' }}>Check your inbox</h2>
                <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '4px' }}>
                  We sent a 6-digit code to <strong style={{ color: '#ffffff' }}>{email}</strong>
                </p>

                {verifyError && (
                  <div style={{ background: 'rgba(226,75,74,0.1)', border: '1px solid #e24b4a', borderRadius: '8px', padding: '10px 14px', color: '#e24b4a', fontSize: '14px', marginTop: '12px' }}>
                    {verifyError}
                  </div>
                )}

                <CodeInputs onComplete={handleVerify} />

                {verifyLoading && <p style={{ textAlign: 'center', color: '#555', fontSize: '13px' }}>Verifying...</p>}

                <button
                  onClick={() => { /* auto-submit handled */ }}
                  style={{ ...primaryBtn, marginBottom: '12px', cursor: 'pointer' }}
                >
                  Verify Email
                </button>

                <div style={{ textAlign: 'center' }}>
                  <button type="button" onClick={handleResend} style={{ background: 'none', border: 'none', color: '#00e5ff', fontSize: '13px', cursor: 'pointer', fontFamily: "'Exo 2', sans-serif" }}>
                    Resend code
                  </button>
                  {resendMsg && <span style={{ color: '#9ca3af', fontSize: '12px', marginLeft: '8px' }}>{resendMsg}</span>}
                </div>

                <button type="button" onClick={() => setStep(1)} style={{ background: 'none', border: 'none', color: '#555', fontSize: '13px', cursor: 'pointer', marginTop: '16px', fontFamily: "'Exo 2', sans-serif", display: 'block' }}>
                  ← Back
                </button>
              </div>
            )}

            {/* ── Step 3 ── */}
            {step === 3 && (
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff', margin: '0 0 16px' }}>Verify your phone</h2>

                {viaGoogle && (
                  <div style={{ background: 'rgba(0,112,255,0.1)', border: '1px solid rgba(0,112,255,0.4)', borderRadius: '8px', padding: '10px 14px', color: '#60a5fa', fontSize: '13px', marginBottom: '16px' }}>
                    Email already verified via Google — just verify your phone
                  </div>
                )}

                <div style={{ marginBottom: '16px' }}>
                  {label('Phone number')}
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setPhoneError('') }}
                    placeholder="+1 555 000 0000"
                    style={{ ...inputBase, borderColor: phoneError ? '#e24b4a' : '#252550' }}
                  />
                  {phoneError && <p style={{ color: '#e24b4a', fontSize: '12px', marginTop: '4px' }}>{phoneError}</p>}
                </div>

                <button
                  type="button"
                  onClick={() => { setToast('SMS verification coming soon'); setSmsSent(true) }}
                  style={{ ...primaryBtn, marginBottom: '20px', cursor: 'pointer' }}
                >
                  Send SMS Code
                </button>

                {smsSent && (
                  <>
                    <p style={{ color: '#9ca3af', fontSize: '13px', marginBottom: '4px', textAlign: 'center' }}>Enter the 6-digit code</p>
                    <CodeInputs onComplete={() => {}} />
                  </>
                )}

                <button
                  type="button"
                  onClick={handleEnterArena}
                  style={{
                    width: '100%', padding: '13px', border: '1px solid #00e5ff', borderRadius: '8px',
                    background: 'transparent', color: '#00e5ff', fontWeight: 700, fontSize: '14px',
                    textTransform: 'uppercase', letterSpacing: '1px', cursor: 'pointer',
                    fontFamily: "'Exo 2', sans-serif", marginTop: '8px',
                  }}
                >
                  Enter the arena →
                </button>

                <button
                  type="button"
                  onClick={() => setStep(viaGoogle ? 1 : 2)}
                  style={{ background: 'none', border: 'none', color: '#555', fontSize: '13px', cursor: 'pointer', marginTop: '16px', fontFamily: "'Exo 2', sans-serif", display: 'block' }}
                >
                  ← Back
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  )
}
