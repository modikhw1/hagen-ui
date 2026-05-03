'use client'

import { Suspense } from 'react'
import { LoginDesktop } from '@/components/features/Login'

export default function LoginPage() {
  return (
    <Suspense>
      <LoginDesktop />
    </Suspense>
  )
}
