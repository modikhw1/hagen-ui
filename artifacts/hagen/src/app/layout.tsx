import { Inter } from 'next/font/google'
import './globals.css'
import { Navigation } from '@/components/ui/Navigation'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Hagen - AI Video Analysis',
  description: 'Analyze and rate video content with AI-powered insights',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-gray-950">
          <Navigation />
          {children}
        </div>
      </body>
    </html>
  )
}
