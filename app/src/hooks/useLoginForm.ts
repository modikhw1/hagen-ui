'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
  const { signIn, signUp, loading: authLoading } = useAuth()

  // Combined loading state
  const loading = localLoading || authLoading

  // Compute password strength
  const passwordStrength: PasswordStrength = mode === 'register' && password
    ? password.length < 6 ? 'weak' : password.length < 10 ? 'ok' : 'strong'
    : null

  const clearMessages = () => {
    setError('')
    setSuccess('')
  }

  // Handle network errors gracefully
  const handleAuthError = (err: unknown, fallbackMessage: string): string => {
    if (err instanceof Error) {
      // Network errors
      if (err.message.includes('fetch') || err.message.includes('network')) {
        return 'Nätverksfel. Kontrollera din internetanslutning.'
      }
      // Timeout errors
      if (err.message.includes('timeout') || err.message.includes('timed out')) {
        return 'Förfrågan tog för lång tid. Försök igen.'
      }
      // Supabase-specific errors
      if (err.message.includes('Invalid login')) {
        return 'Fel e-post eller lösenord'
      }
      if (err.message.includes('Email not confirmed')) {
        return 'Du behöver bekräfta din e-post först. Kolla din inkorg.'
      }
      if (err.message.includes('already registered') || err.message.includes('already been registered')) {
        return 'E-postadressen är redan registrerad. Prova logga in istället!'
      }
      if (err.message.includes('invalid') && err.message.includes('email')) {
        return 'Ogiltig e-postadress'
      }
      if (err.message.includes('password') && err.message.includes('weak')) {
        return 'Lösenordet är för svagt. Använd minst 6 tecken.'
      }
      if (err.message.includes('rate limit') || err.message.includes('too many requests')) {
        return 'För många försök. Vänta en stund och försök igen.'
      }
      return err.message
    }
    return fallbackMessage
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearMessages()

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError('Ange en giltig e-postadress')
      return
    }

    // Demo mode: demo/demo
    if (email === 'demo' && password === 'demo') {
      router.push(demoRedirect)
      return
    }

    // Check extra demo credentials
    for (const cred of extraDemoCredentials) {
      if (email === cred.email && password === cred.password) {
        router.push(cred.redirect)
        return
      }
    }

    setLocalLoading(true)

    try {
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: resetRedirectUrl,
        })
        
        if (error) {
          setError(handleAuthError(error, 'Kunde inte skicka återställningslänk'))
        } else {
          setSuccess('Kolla din e-post för återställningslänk!')
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
        
        // Wait a moment for auth state to propagate, then redirect
        setSuccess('Inloggningen lyckades! Omdirigerar...')
        setTimeout(() => router.push(loginRedirect), 500)
      } else {
        // Register
        if (!businessName.trim()) {
          setError('Ange ditt företagsnamn')
          setLocalLoading(false)
          return
        }

        if (password.length < 6) {
          setError('Lösenordet måste vara minst 6 tecken')
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
          setSuccess('Konto skapat! Kolla din e-post för att bekräfta.')
          setLocalLoading(false)
          return
        }

        setSuccess('Välkommen! Omdirigerar...')
        setTimeout(() => router.push(loginRedirect), 1000)
      }
    } catch (err) {
      setError(handleAuthError(err, 'Något gick fel. Försök igen.'))
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
