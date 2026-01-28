'use client'

import { useState } from 'react'
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
  const [loading, setLoading] = useState(false)

  const router = useRouter()
  const { signIn, signUp } = useAuth()

  // Compute password strength
  const passwordStrength: PasswordStrength = mode === 'register' && password
    ? password.length < 6 ? 'weak' : password.length < 10 ? 'ok' : 'strong'
    : null

  const clearMessages = () => {
    setError('')
    setSuccess('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearMessages()

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

    setLoading(true)

    try {
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: resetRedirectUrl,
        })
        if (error) {
          setError('Kunde inte skicka återställningslänk')
        } else {
          setSuccess('Kolla din e-post för återställningslänk!')
        }
        setLoading(false)
        return
      }

      if (mode === 'login') {
        const { error } = await signIn(email, password)
        if (error) {
          if (error.message.includes('Invalid login')) {
            setError('Fel e-post eller lösenord')
          } else if (error.message.includes('Email not confirmed')) {
            setError('Du behöver bekräfta din e-post först.')
          } else {
            setError(error.message || 'Inloggningen misslyckades')
          }
          setLoading(false)
          return
        }
        router.push(loginRedirect)
      } else {
        // Register
        if (!businessName.trim()) {
          setError('Ange ditt företagsnamn')
          setLoading(false)
          return
        }

        if (password.length < 6) {
          setError('Lösenordet måste vara minst 6 tecken')
          setLoading(false)
          return
        }

        const { error, needsConfirmation } = await signUp(email, password, businessName)

        if (error) {
          if (error.message.includes('already registered') || error.message.includes('already been registered')) {
            setError('E-postadressen är redan registrerad. Prova logga in istället!')
          } else if (error.message.includes('invalid') && error.message.includes('email')) {
            setError('Ogiltig e-postadress')
          } else if (error.message.includes('password')) {
            setError('Lösenordet uppfyller inte kraven')
          } else {
            setError(error.message || 'Registreringen misslyckades')
          }
          setLoading(false)
          return
        }

        if (needsConfirmation) {
          setSuccess('Konto skapat! Kolla din e-post för att bekräfta.')
          setLoading(false)
          return
        }

        setSuccess('Välkommen! Omdirigerar...')
        setTimeout(() => router.push(loginRedirect), 1000)
      }
    } catch {
      setError('Något gick fel. Försök igen.')
    }

    setLoading(false)
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
