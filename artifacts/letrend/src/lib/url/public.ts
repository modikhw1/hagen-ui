// @ts-nocheck
const DEFAULT_APP_URL = 'http://localhost:3000'
const DEFAULT_MARKETING_URL = 'http://localhost:3001'

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

export function getAppUrl() {
  const configuredUrl = import.meta.env.VITE_APP_URL
  const vercelUrl = import.meta.env.VITE_APP_URL ? `https://${import.meta.env.VITE_APP_URL}` : undefined

  return trimTrailingSlash(configuredUrl || vercelUrl || DEFAULT_APP_URL)
}

export function getMarketingUrl() {
  return trimTrailingSlash(import.meta.env.VITE_MARKETING_URL || DEFAULT_MARKETING_URL)
}

export function getAuthCallbackUrl(flow?: 'recovery' | 'invite') {
  const url = new URL('/auth/callback', getAppUrl())
  if (flow) {
    url.searchParams.set('flow', flow)
  }
  return url.toString()
}

export function getAllowedPublicOrigins() {
  const configured = (import.meta.env.VITE_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => trimTrailingSlash(value.trim()))
    .filter(Boolean)

  const defaults = [
    getMarketingUrl(),
    'https://letrend.se',
    'https://www.letrend.se',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]

  return Array.from(new Set([...configured, ...defaults].filter(Boolean)))
}

export function getContactInbox() {
  return import.meta.env.VITE_CONTACT_EMAIL || 'hej@letrend.se'
}

export function getResendFromEmail() {
  return import.meta.env.VITE_RESEND_FROM || 'LeTrend <hej@letrend.se>'
}
