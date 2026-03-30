'use client'

import { Suspense } from 'react'
import { LoginMobile } from '@/components/features/Login'

export default function MobileLoginPage() {
  return (
    <Suspense>
      <LoginMobile />
    </Suspense>
  )
}
