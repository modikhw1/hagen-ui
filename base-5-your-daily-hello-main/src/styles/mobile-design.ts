/**
 * LeTrend Mobile Design System
 * Based on LeTrendMobile.jsx design language
 */

export const colors = {
  primary: '#4A2F18',
  secondary: '#6B4423',
  accent: '#8B6914',
  bg: '#FAF8F5',
  card: '#FFFFFF',
  muted: '#F0EBE4',
  text: '#1A1612',
  textMuted: '#7D6E5D',
  textSubtle: '#9D8E7D',
  success: '#5A8F5A',
  dark: '#3D3530',
  scriptBg: '#2F2A27',
} as const

export const fontFamily = '"DM Sans", system-ui, -apple-system, sans-serif'

// Shared styles
export const pageContainer: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  overflow: 'hidden',
  fontFamily,
}

export const scrollContainer: React.CSSProperties = {
  width: '100%',
  height: '100%',
  overflowY: 'auto',
  overflowX: 'hidden',
  WebkitOverflowScrolling: 'touch',
  overscrollBehavior: 'contain',
}

export const buttonBase: React.CSSProperties = {
  border: 'none',
  cursor: 'pointer',
  fontFamily,
  WebkitTapHighlightColor: 'transparent',
}

export const cardStyle: React.CSSProperties = {
  background: colors.card,
  borderRadius: 20,
  padding: 20,
  boxShadow: '0 2px 12px rgba(74, 47, 24, 0.06)',
}

export const headerStyle: React.CSSProperties = {
  padding: '20px 24px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  background: colors.card,
  borderBottom: `1px solid ${colors.muted}`,
  position: 'sticky',
  top: 0,
  zIndex: 10,
}

export const sectionLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: colors.textSubtle,
  marginBottom: 14,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
}

export const tagStyle: React.CSSProperties = {
  fontSize: 12,
  color: colors.textMuted,
  background: colors.muted,
  padding: '4px 10px',
  borderRadius: 12,
}

export const primaryButton: React.CSSProperties = {
  ...buttonBase,
  width: '100%',
  padding: 16,
  fontSize: 16,
  fontWeight: 600,
  background: `linear-gradient(135deg, ${colors.secondary} 0%, ${colors.primary} 100%)`,
  color: '#fff',
  borderRadius: 14,
  boxShadow: '0 4px 12px rgba(74, 47, 24, 0.2)',
}

export const logoStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  background: `linear-gradient(135deg, ${colors.secondary} 0%, ${colors.primary} 100%)`,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}
