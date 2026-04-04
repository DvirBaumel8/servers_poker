import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { Sentry } from '../sentry'

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
const api = axios.create({
  baseURL: `${baseURL}/api/v1`,
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Track if we're already handling a 401 to avoid redirect loops
let is401Handling = false

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status

    // Only handle 401 if token exists (user was trying to use an expired/invalid token)
    if (status === 401 && !is401Handling) {
      const { logout, token } = useAuthStore.getState()

      // Only redirect if user was actually authenticated
      if (token) {
        is401Handling = true
        logout()

        // Use a small delay to ensure state updates before redirecting
        setTimeout(() => {
          window.location.href = '/signin'
        }, 100)
      }
    }

    // Report 5xx server errors and unexpected 4xx to Sentry.
    // Skip 401 (auth redirect handled above) and 422/400 (validation — expected user errors).
    const SKIP_STATUSES = new Set([401, 422])
    if (!status || (!SKIP_STATUSES.has(status) && status >= 400)) {
      Sentry.withScope((scope) => {
        scope.setTag('kind', 'http_error')
        scope.setContext('request', {
          url: error.config?.url,
          method: error.config?.method?.toUpperCase(),
          status,
        })
        Sentry.captureException(error)
      })
    }

    return Promise.reject(error)
  }
)

export default api
