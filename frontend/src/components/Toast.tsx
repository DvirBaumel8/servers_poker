import { useEffect, useState } from 'react'

interface ToastProps {
  message: string
  onClose: () => void
  duration?: number
}

export default function Toast({ message, onClose, duration = 3000 }: ToastProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(onClose, 300)
    }, duration)
    return () => clearTimeout(timer)
  }, [duration, onClose])

  return (
    <div
      style={{
        position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
        background: '#13132a', border: '1px solid #252550', borderRadius: '8px',
        padding: '12px 20px', color: '#ffffff', fontSize: '14px',
        zIndex: 9999, transition: 'opacity 0.3s',
        opacity: visible ? 1 : 0, whiteSpace: 'nowrap',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      }}
    >
      {message}
    </div>
  )
}
