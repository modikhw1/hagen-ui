'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { usePathname, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase/client'

export type LoginMode = 'login' | 'register' | 'forgot'
export type PasswordStrength = 'weak' | 'ok' | 'strong' | null

export interface LoginFormData {
  // State
  mode: LoginMode
  email: string
  password: string
  businessName: string
  error: string
  success: string
  loading: boolean
  passwordStrength: PasswordStrength

  // Setters
  setEmail: (email: string) => void
  setPassword: (password: string) => void
  setBusinessName: (name: string) => void
  setMode: (mode: LoginMode) => void

  // Actions
  handleSubmit: (e: React.FormEvent) => Promise<void>
  clearMessages: () => void
}

interface UseLoginFormOptions {
  /** Redirect path after successful login */
  loginRedirect: string
  /** Redirect path for demo mode */
  demoRedirect: string
  /** Password reset redirect URL */
  resetRedirectUrl: string
  /** Optional extra demo credentials (e.g., auth1/auth1 for mobile) */
  extraDemoCredentials?: { email: string; password: string; redirect: string }[]
}

const ALLOWED_REDIRECT_PREFIXES = ['/', '/admin', '/studio-v2', '/studio', '/customer', '/m/customer']

function normalizeStudioPath(path: string): string {
  if (path === '/studio-v2' || path.startsWith('/studio-v2/')) {
    return `/studio${path.slice('/studio-v2'.length)}`
  }

  return path
}

function customerDestinationForPath(pathname: string): string {
  return pathname === '/m/login' ? '/m/customer/feed' : '/'
}

function getSafeRedirectPath(candidate: string | null): string | null {
  if (!candidate) return null
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return null

  const [path] = candidate.split('?')
  if (!path) return null
  if (path === '/' || path === '/login' || path === '/m/login') return null

  const normalizedPath = normalizeStudioPath(path)
  const allowed = ALLOWED_REDIRECT_PREFIXES.some((prefix) => {
    if (prefix === '/') return path === '/'
    return path === prefix || path.startsWith(`${prefix}/`)
  })

  if (!allowed) return null

  const queryIndex = candidate.indexOf('?')
  const querySuffix = queryIndex === -1 ? '' : candidate.slice(queryIndex)
  return `${normalizedPath}${querySuffix}`
}

export function useLoginForm(options: UseLoginFormOptions): LoginFormData {
  const { loginRedirect, demoRedirect, resetRedirectUrl, extraDemoCredentials = [] } = options

  const [mode, setMode] = useState<LoginMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [localLoading, setLocalLoading] = useState(false)

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { signIn, signUp, authLoading, profileLoading, user, profile } = useAuth()

  // Combined loading state
  const loading = localLoading || authLoading || profileLoading

  // Compute password strength
  const passwordStrength: PasswordStrength = mode === 'register' && password
    ? password.length < 6 ? 'weak' : password.length < 10 ? 'ok' : 'strong'
    : null

  const clearMessages = () => {
    setError('')
    setSuccess('')
  }

  const resolvePostLoginDestination = useCallback(async (): Promise<string | null> => {
    const requestedRedirect = getSafeRedirectPath(searchParams.get('redirect'))
    if (requestedRedirect) {
      return requestedRedirect
    }

    if (pathname === '/login' || pathname === '/m/login') {
      // Check from context first
      if (profile?.is_admin || profile?.role === 'admin') {
        return '/admin'
      }
      if (profile?.role === 'content_manager') {
        return '/studio'
      }
      if (profile?.role === 'customer') {
        return customerDestinationForPath(pathname)
      }

      // If profile not loaded yet, fetch from DB
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (session?.user?.id) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('is_admin, role')
          .eq('id', session.user.id)
          .maybeSingle()

        if (profileData?.is_admin || profileData?.role === 'admin') {
          return '/admin'
        }
        if (profileData?.role === 'content_manager') {
          return '/studio'
        }
        if (profileData?.role === 'customer') {
          return customerDestinationForPath(pathname)
        }
      }
    }

    if (pathname === '/login' || pathname === '/m/login') {
      // Authenticated user without mapped role still lands on main dashboard.
      return pathname === '/m/login' ? '/m' : '/'
    }

    return loginRedirect
  }, [searchParams, pathname, profile, loginRedirect])

  useEffect(() => {
    if (authLoading || !user) return

    let cancelled = false

    const run = async () => {
      const destination = await resolvePostLoginDestination()
      if (!cancelled && destination && destination !== pathname) {
        router.replace(destination)
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [authLoading, user, resolvePostLoginDestination, router, pathname])

  // Handle network errors gracefully
  const handleAuthError = (err: unknown, fallbackMessage: string): string => {
    if (err instanceof Error) {
      // Network errors
      if (err.message.includes('fetch') || err.message.includes('network')) {
        return 'NÃ¤tverksfel. Kontrollera din internetanslutning.'
      }
      // Timeout errors
      if (err.message.includes('timeout') || err.message.includes('timed out')) {
        return 'FÃ¶rfrÃ¥gan tog fÃ¶r lÃ¥ng tid. FÃ¶rsÃ¶k igen.'
      }
      // Supabase-specific errors
      if (err.message.includes('Invalid login')) {
        return 'Fel e-post eller lösenord'
      }
      if (err.message.includes('Email not confirmed')) {
        return 'Du behÃ¶ver bekrÃ¤fta din e-post fÃ¶rst. Kolla din inkorg.'
      }
      if (err.message.includes('already registered') || err.message.includes('already been registered')) {
        return 'E-postadressen Ã¤r redan registrerad. Prova logga in istÃ¤llet!'
      }
      if (err.message.includes('invalid') && err.message.includes('email')) {
        return 'Ogiltig e-postadress'
      }
      if (err.message.includes('password') && err.message.includes('weak')) {
        return 'LÃ¶senordet Ã¤r fÃ¶r svagt. AnvÃ¤nd minst 6 tecken.'
      }
      if (err.message.includes('rate limit') || err.message.includes('too many requests')) {
        return 'FÃ¶r mÃ¥nga fÃ¶rsÃ¶k. VÃ¤nta en stund och fÃ¶rsÃ¶k igen.'
      }
      return err.message
    }
    return fallbackMessage
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearMessages()

    // Demo mode FIRST - before email validation (so "demo" works)
    if (email === 'demo' && password === 'demo') {
      router.replace(demoRedirect)
      return
    }

    // Check extra demo credentials
    for (const cred of extraDemoCredentials) {
      if (email === cred.email && password === cred.password) {
        router.replace(cred.redirect)
        return
      }
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError('Ange en giltig e-postadress')
      return
    }

    setLocalLoading(true)

    try {
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: resetRedirectUrl,
        })
        
        if (error) {
          setError(handleAuthError(error, 'Kunde inte skicka Ã¥terstÃ¤llningslÃ¤nk'))
        } else {
          setSuccess('Kolla din e-post fÃ¶r Ã¥terstÃ¤llningslÃ¤nk!')
        }
        setLocalLoading(false)
        return
      }

      if (mode === 'login') {
        const { error } = await signIn(email, password)
        
        if (error) {
          setError(handleAuthError(error, 'Inloggningen misslyckades'))
          setLocalLoading(false)
          return
        }
        setSuccess('Inloggningen lyckades! Omdirigerar...')
        setLocalLoading(false)
        return
      } else {
        // Register
        if (!businessName.trim()) {
          setError('Ange ditt fÃ¶retagsnamn')
          setLocalLoading(false)
          return
        }

        if (password.length < 6) {
          setError('LÃ¶senordet mÃ¥ste vara minst 6 tecken')
          setLocalLoading(false)
          return
        }

        const { error: signUpError, needsConfirmation } = await signUp(email, password, businessName)

        if (signUpError) {
          setError(handleAuthError(signUpError, 'Registreringen misslyckades'))
          setLocalLoading(false)
          return
        }

        if (needsConfirmation) {
          setSuccess('Konto skapat! Kolla din e-post fÃ¶r att bekrÃ¤fta.')
          setLocalLoading(false)
          return
        }

        setSuccess('Valkommen! Omdirigerar...')
        setLocalLoading(false)
        return
      }
    } catch (err) {
      setError(handleAuthError(err, 'NÃ¥got gick fel. FÃ¶rsÃ¶k igen.'))
    }

    setLocalLoading(false)
  }

  return {
    mode,
    email,
    password,
    businessName,
    error,
    success,
    loading,
    passwordStrength,
    setEmail,
    setPassword,
    setBusinessName,
    setMode,
    handleSubmit,
    clearMessages,
  }
}
