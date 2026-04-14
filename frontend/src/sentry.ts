import * as Sentry from '@sentry/react'

const SENSITIVE_KEYS = ['password', 'token', 'secret', 'authorization', 'bot_logic', 'strategy']

export function initSentry() {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    enabled: import.meta.env.PROD,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,  // 10% in production, 100% in dev
    beforeSend(event) {
      if (event.request?.data) {
        scrubObject(event.request.data as Record<string, unknown>)
      }
      if (event.extra) {
        scrubObject(event.extra as Record<string, unknown>)
      }
      return event
    },
  })
}

function scrubObject(obj: Record<string, unknown>) {
  for (const key of Object.keys(obj)) {
    if (SENSITIVE_KEYS.some((k) => key.toLowerCase().includes(k))) {
      obj[key] = '[Filtered]'
    }
  }
}

export { Sentry }
