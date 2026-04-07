import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, MessageCircle, HelpCircle } from 'lucide-react'
import api from '../lib/axios'
import { useAuthStore } from '../store/authStore'
import { Sidebar } from '../components/Sidebar'
import Toast from '../components/Toast'
import CustomSelect from '../components/CustomSelect'

const C = {
  bg: '#0a0a1a',
  card: 'rgba(18,18,27,0.50)',
  border: 'rgba(255,255,255,0.08)',
  accent: '#00f5ff',
  accentDim: 'rgba(0,245,255,0.08)',
  text: '#ffffff',
  muted: '#9ca3af',
  danger: '#e24b4a',
  success: '#1d9e75',
  font: "'Trebuchet MS', sans-serif",
}

const SUBJECT_OPTIONS = [
  { value: '', label: 'Select a subject…' },
  { value: 'Bug Report', label: 'Bug Report' },
  { value: 'Feature Request', label: 'Feature Request' },
  { value: 'Strategy Inquiry', label: 'Strategy Inquiry' },
  { value: 'Other', label: 'Other' },
]

const QUICK_RESOURCES = [
  {
    icon: BookOpen,
    title: 'Documentation',
    description: 'Learn how to build advanced bot logic.',
    href: '#',
  },
  {
    icon: MessageCircle,
    title: 'Discord Community',
    description: 'Connect with other developers.',
    href: '#',
  },
  {
    icon: HelpCircle,
    title: 'FAQ',
    description: 'Quick answers to common questions.',
    href: '#',
  },
]

const MAX_MESSAGE_LENGTH = 1000

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(12,12,30,0.60)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  border: `1px solid ${C.border}`,
  borderRadius: 8, padding: '11px 14px', color: C.text,
  fontSize: 14, outline: 'none', fontFamily: C.font,
  boxSizing: 'border-box',
  transition: 'border-color 0.2s',
}

const readonlyStyle: React.CSSProperties = {
  ...inputStyle,
  color: C.muted, cursor: 'default',
}

function FieldLabel({ text }: { text: string }) {
  return (
    <label style={{
      display: 'block', fontSize: 11, fontWeight: 600, color: C.muted,
      textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8,
    }}>
      {text}
    </label>
  )
}


export default function SupportPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<{ subject?: string; message?: string }>({})
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')
  const [toast, setToast] = useState('')

  function validate(): boolean {
    const errs: { subject?: string; message?: string } = {}
    if (!subject) errs.subject = 'Please select a subject.'
    if (!message.trim()) errs.message = 'Message is required.'
    else if (message.trim().length < 10) errs.message = 'Message must be at least 10 characters.'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setStatus('loading')
    try {
      await api.post('/contact', {
        email: user?.email ?? '',
        subject,
        message: message.trim(),
      })
      setStatus('success')
    } catch (err: unknown) {
      setStatus('idle')
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 429) {
        setToast("You've reached the 3 messages/hour limit. Please try again later.")
      } else {
        setToast('Something went wrong. Please try again.')
      }
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: C.font }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        {/* Main card */}
        <div style={{
          width: '100%', maxWidth: 560,
          background: C.card,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${C.border}`,
          borderRadius: 16, padding: '40px 44px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.45), 0 0 15px rgba(0,245,255,0.05)',
        }}>
          {status === 'success' ? (
            <SuccessState onBack={() => navigate('/')} />
          ) : (
            <>
              {/* Header */}
              <div style={{ marginBottom: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: C.accentDim, border: `1px solid rgba(0,229,255,0.25)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <circle cx="12" cy="12" r="4"/>
                      <line x1="4.93" y1="4.93" x2="9.17" y2="9.17"/>
                      <line x1="14.83" y1="14.83" x2="19.07" y2="19.07"/>
                      <line x1="14.83" y1="9.17" x2="19.07" y2="4.93"/>
                      <line x1="4.93" y1="19.07" x2="9.17" y2="14.83"/>
                    </svg>
                  </div>
                  <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text }}>Contact Support</h1>
                </div>
                <p style={{ margin: 0, fontSize: 14, color: C.muted, lineHeight: 1.6 }}>
                  Found a bug? Have a strategy question? We're here to help.
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} noValidate>
                {/* Name + Email row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                  <div>
                    <FieldLabel text="Name" />
                    <input
                      type="text"
                      value={user?.name ?? ''}
                      readOnly
                      style={readonlyStyle}
                    />
                  </div>
                  <div>
                    <FieldLabel text="Email" />
                    <input
                      type="email"
                      value={user?.email ?? ''}
                      readOnly
                      style={readonlyStyle}
                    />
                  </div>
                </div>

                {/* Subject */}
                <div style={{ marginBottom: 20 }}>
                  <FieldLabel text="Subject" />
                  <CustomSelect
                    value={subject}
                    onChange={(val) => { setSubject(val); setErrors(prev => ({ ...prev, subject: undefined })) }}
                    options={SUBJECT_OPTIONS.filter(o => o.value !== '')}
                    placeholder={SUBJECT_OPTIONS[0].label}
                    error={!!errors.subject}
                  />
                  {errors.subject && (
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.danger, marginTop: 6 }}>
                      {errors.subject}
                    </div>
                  )}
                </div>

                {/* Message */}
                <div style={{ marginBottom: 28 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                    <FieldLabel text="Message" />
                    <span style={{ fontSize: 12, color: message.length > MAX_MESSAGE_LENGTH * 0.9 ? C.danger : C.muted }}>
                      {message.length}/{MAX_MESSAGE_LENGTH}
                    </span>
                  </div>
                  <textarea
                    value={message}
                    onChange={(e) => {
                      if (e.target.value.length <= MAX_MESSAGE_LENGTH) {
                        setMessage(e.target.value)
                        setErrors(prev => ({ ...prev, message: undefined }))
                      }
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(0,245,255,0.4)' }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = errors.message ? C.danger : C.border }}
                    rows={6}
                    placeholder="Describe your issue or question in detail…"
                    style={{
                      ...inputStyle,
                      resize: 'vertical',
                      minHeight: 120,
                      borderColor: errors.message ? C.danger : C.border,
                    }}
                  />
                  {errors.message && (
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.danger, marginTop: 6 }}>
                      {errors.message}
                    </div>
                  )}
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  onMouseEnter={(e) => { if (status !== 'loading') (e.currentTarget as HTMLElement).style.boxShadow = '0 0 32px rgba(0,245,255,0.45)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 0 20px rgba(0,245,255,0.3)' }}
                  style={{
                    width: '100%', padding: '13px 0',
                    background: status === 'loading'
                      ? 'rgba(0,229,255,0.3)'
                      : 'linear-gradient(135deg, #06b6d4, #00d4e8)',
                    border: 'none', borderRadius: 8,
                    color: status === 'loading' ? C.muted : '#000',
                    fontWeight: 700, fontSize: 14, fontFamily: C.font,
                    cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                    letterSpacing: 1, transition: 'box-shadow 0.2s, opacity 0.2s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: status === 'loading' ? 'none' : '0 0 20px rgba(0,245,255,0.3)',
                  }}
                >
                  {status === 'loading' ? (
                    <>
                      <Spinner />
                      Sending…
                    </>
                  ) : (
                    'Send Message'
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Quick Resources */}
        <div style={{ width: '100%', maxWidth: 560, marginTop: 16 }}>
          <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: 2 }}>
            Quick Resources
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {QUICK_RESOURCES.map((res) => (
              <ResourceCard key={res.title} {...res} />
            ))}
          </div>
        </div>
      </div>
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  )
}

function ResourceCard({
  icon: Icon,
  title,
  description,
  href,
}: {
  icon: React.ElementType
  title: string
  description: string
  href: string
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <a
      href={href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'block',
        background: C.card,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${hovered ? 'rgba(0,245,255,0.3)' : C.border}`,
        borderRadius: 12,
        padding: 16,
        textDecoration: 'none',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        boxShadow: hovered ? '0 0 12px rgba(0,245,255,0.12), 0 4px 16px rgba(0,0,0,0.3)' : '0 2px 10px rgba(0,0,0,0.3)',
      }}
    >
      <Icon size={20} color={C.accent} style={{ marginBottom: 8 }} />
      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{title}</div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>{description}</div>
    </a>
  )
}

function Spinner() {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      style={{ animation: 'spin 0.7s linear infinite' }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
  )
}

function SuccessState({ onBack }: { onBack: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '20px 0', animation: 'fadeIn 0.4s ease-out forwards' }}>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }`}</style>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: 'rgba(29,158,117,0.15)', border: '1px solid rgba(29,158,117,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 24px',
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1d9e75" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: C.text }}>Message Sent!</h2>
      <p style={{ margin: '0 0 6px', fontSize: 13, color: C.accent, fontWeight: 500 }}>
        We'll get back to you within 24 hours.
      </p>
      <p style={{ margin: '0 0 32px', fontSize: 14, color: C.muted, lineHeight: 1.6 }}>
        Thanks for reaching out. We'll get back to you as soon as possible.
      </p>
      <button
        onClick={onBack}
        style={{
          padding: '12px 32px',
          background: 'linear-gradient(135deg, #06b6d4, #00d4e8)',
          border: 'none', borderRadius: 8,
          color: '#000', fontWeight: 700, fontSize: 14,
          fontFamily: C.font, cursor: 'pointer', letterSpacing: 1,
          boxShadow: '0 0 20px rgba(0,245,255,0.3)',
        }}
      >
        Back to Dashboard
      </button>
    </div>
  )
}
