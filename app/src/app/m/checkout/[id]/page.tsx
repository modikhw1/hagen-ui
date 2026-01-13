'use client'

import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { loadConceptById } from '@/lib/conceptLoader'
import { display } from '@/lib/display'
import { colors, fontFamily, pageContainer, scrollContainer, buttonBase, primaryButton, tagStyle } from '@/styles/mobile-design'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function MobileCheckoutPage({ params }: PageProps) {
  const { id } = use(params)
  const router = useRouter()
  const [isProcessing, setIsProcessing] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [email, setEmail] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvc, setCvc] = useState('')
  const [name, setName] = useState('')

  const concept = loadConceptById(id)

  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsProcessing(true)

    // Simulate payment processing
    await new Promise((resolve) => setTimeout(resolve, 2000))

    setIsProcessing(false)
    setIsComplete(true)

    // Redirect to concept viewer after delay
    setTimeout(() => {
      router.push(`/m/concept/${concept?.id}`)
    }, 2000)
  }

  const inputStyle = {
    width: '100%',
    padding: '14px 16px',
    fontSize: 16,
    fontFamily,
    border: `1px solid ${colors.muted}`,
    borderRadius: 12,
    boxSizing: 'border-box' as const,
    outline: 'none',
    background: '#fff',
  }

  const labelStyle = {
    fontSize: 13,
    fontWeight: 500,
    color: colors.textMuted,
    display: 'block',
    marginBottom: 8,
    fontFamily,
  }

  if (!concept) {
    return (
      <div style={{ ...pageContainer, background: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <p style={{ fontSize: 18, color: colors.text, marginBottom: 16, fontFamily }}>Konceptet hittades inte</p>
          <button
            onClick={() => router.back()}
            style={{ ...buttonBase, background: colors.muted, padding: '12px 24px', borderRadius: 12, color: colors.text, fontFamily }}
          >
            Tillbaka
          </button>
        </div>
      </div>
    )
  }

  if (isComplete) {
    return (
      <div style={{ ...pageContainer, background: colors.bg }}>
        <div style={{
          ...scrollContainer,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          minHeight: '100%',
        }}>
          <div style={{
            width: 80,
            height: 80,
            background: colors.success,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
          }}>
            <span style={{ fontSize: 40, color: '#fff' }}>✓</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: colors.text, marginBottom: 8, fontFamily }}>
            Klart!
          </h1>
          <p style={{ fontSize: 15, color: colors.textMuted, fontFamily }}>
            Tar dig till ditt koncept...
          </p>
          <div style={{
            marginTop: 24,
            width: 24,
            height: 24,
            border: `3px solid ${colors.muted}`,
            borderTopColor: colors.primary,
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <style>{`
            @keyframes spin { to { transform: rotate(360deg); } }
          `}</style>
        </div>
      </div>
    )
  }

  const headline = concept.headline_sv || concept.headline

  return (
    <div style={{ ...pageContainer, background: colors.bg }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
      <div style={scrollContainer}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: colors.card,
          borderBottom: `1px solid ${colors.muted}`,
        }}>
          <button
            onClick={() => router.back()}
            aria-label="Tillbaka"
            style={{ ...buttonBase, background: 'none', color: colors.text, fontSize: 20, padding: 4 }}
          >
            <span aria-hidden="true">←</span>
          </button>
          <span style={{ fontSize: 17, fontWeight: 600, color: colors.text, fontFamily }}>Checkout</span>
        </div>

        <div style={{ padding: 20 }}>
          {/* Order summary */}
          <div style={{
            background: colors.card,
            borderRadius: 16,
            padding: 20,
            marginBottom: 20,
          }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: colors.textMuted, marginBottom: 12, fontFamily, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Din beställning
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 16, fontWeight: 600, color: colors.text, marginBottom: 8, fontFamily, lineHeight: 1.3 }}>
                  {headline}
                </p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={tagStyle}>{concept.matchPercentage}% match</span>
                  <span style={tagStyle}>{display.difficulty(concept.difficulty).label}</span>
                </div>
              </div>
              <p style={{ fontSize: 18, fontWeight: 600, color: colors.text, fontFamily }}>
                ${concept.price}
              </p>
            </div>
          </div>

          {/* Payment form */}
          <form onSubmit={handlePurchase}>
            <div style={{
              background: colors.card,
              borderRadius: 16,
              padding: 20,
              marginBottom: 20,
            }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: colors.textMuted, marginBottom: 16, fontFamily, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                💳 Betalning
              </p>

              <label style={{ display: 'block', marginBottom: 16 }}>
                <span style={labelStyle}>E-post</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="din@email.se"
                  required
                  style={inputStyle}
                />
              </label>

              <label style={{ display: 'block', marginBottom: 16 }}>
                <span style={labelStyle}>Kortnummer</span>
                <input
                  type="text"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  placeholder="4242 4242 4242 4242"
                  required
                  style={inputStyle}
                />
              </label>

              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <label style={{ display: 'block', flex: 1 }}>
                  <span style={labelStyle}>Utgång</span>
                  <input
                    type="text"
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                    placeholder="MM / ÅÅ"
                    required
                    style={inputStyle}
                  />
                </label>
                <label style={{ display: 'block', width: 100 }}>
                  <span style={labelStyle}>CVC</span>
                  <input
                    type="text"
                    value={cvc}
                    onChange={(e) => setCvc(e.target.value)}
                    placeholder="123"
                    required
                    style={inputStyle}
                  />
                </label>
              </div>

              <label style={{ display: 'block' }}>
                <span style={labelStyle}>Namn på kort</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Fullständigt namn"
                  required
                  style={inputStyle}
                />
              </label>
            </div>

            {/* Total & CTA */}
            <div style={{
              background: colors.card,
              borderRadius: 16,
              padding: 20,
              marginBottom: 20,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 14, color: colors.textMuted, fontFamily }}>Koncept</span>
                <span style={{ fontSize: 14, color: colors.text, fontFamily }}>${concept.price}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ fontSize: 14, color: colors.textMuted, fontFamily }}>Avgift</span>
                <span style={{ fontSize: 14, color: colors.text, fontFamily }}>$0</span>
              </div>
              <div style={{ height: 1, background: colors.muted, marginBottom: 16 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: colors.text, fontFamily }}>Totalt</span>
                <span style={{ fontSize: 20, fontWeight: 600, color: colors.text, fontFamily }}>${concept.price}</span>
              </div>

              <button
                type="submit"
                disabled={isProcessing}
                style={{
                  ...primaryButton,
                  opacity: isProcessing ? 0.7 : 1,
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {isProcessing && (
                  <span style={{
                    width: 16,
                    height: 16,
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                )}
                {isProcessing ? 'Behandlar...' : `Betala $${concept.price}`}
              </button>
            </div>

            {/* Benefits */}
            <div style={{ padding: '0 4px' }}>
              {[
                'Direkt tillgång efter köp',
                'Full video, manus och guide',
                'Behåll för alltid',
              ].map((text, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ color: colors.success, fontSize: 14 }}>✓</span>
                  <span style={{ fontSize: 13, color: colors.textMuted, fontFamily }}>{text}</span>
                </div>
              ))}
            </div>

            {/* Security note */}
            <p style={{
              marginTop: 20,
              fontSize: 12,
              color: colors.textSubtle,
              textAlign: 'center',
              fontFamily,
            }}>
              🔒 Säkrad av Stripe. Vi lagrar aldrig dina kortuppgifter.
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
