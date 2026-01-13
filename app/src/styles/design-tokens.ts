/**
 * LeTrend Design System
 * Unified design tokens for both mobile and desktop
 */

// ===========================================
// COLOR PALETTE
// ===========================================
export const colors = {
  // Primary Browns
  primary: '#4A2F18',
  primaryMedium: '#5D3A1A',
  primaryLight: '#6B4423',

  // Accent Colors
  accent: '#8B6914',
  success: '#5A8F5A',

  // Backgrounds
  bg: '#FAF8F5',
  bgDark: '#F5F2EE',
  card: '#FFFFFF',
  surface: '#F0EBE4',

  // Text
  text: '#1A1612',
  textSecondary: '#7D6E5D',
  textMuted: '#9D8E7D',
  textPlaceholder: '#B5A99A',

  // Dark Variants
  dark: '#3D3530',
  scriptBg: '#2F2A27',

  // Borders
  border: 'rgba(74, 47, 24, 0.08)',
  borderMedium: 'rgba(74, 47, 24, 0.12)',
} as const

// ===========================================
// TYPOGRAPHY
// ===========================================
export const fontFamily = '"DM Sans", system-ui, -apple-system, sans-serif'

export const fontSize = {
  xs: '11px',
  sm: '12px',
  base: '14px',
  md: '16px',
  lg: '18px',
  xl: '20px',
  '2xl': '24px',
  '3xl': '32px',
} as const

export const fontWeight = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const

// ===========================================
// SPACING
// ===========================================
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
} as const

// ===========================================
// BORDER RADIUS
// ===========================================
export const borderRadius = {
  sm: 8,
  base: 10,
  md: 12,
  lg: 14,
  xl: 16,
  '2xl': 20,
  '3xl': 24,
  full: '50%',
} as const

// ===========================================
// BREAKPOINTS
// ===========================================
export const breakpoints = {
  mobile: 480,
  tablet: 768,
  desktop: 1024,
  wide: 1200,
} as const

// ===========================================
// SHADOWS
// ===========================================
export const shadows = {
  sm: '0 1px 3px rgba(74, 47, 24, 0.08)',
  base: '0 2px 8px rgba(74, 47, 24, 0.08)',
  md: '0 2px 12px rgba(74, 47, 24, 0.06)',
  lg: '0 4px 16px rgba(74, 47, 24, 0.1)',
  xl: '0 8px 24px rgba(74, 47, 24, 0.12)',
} as const

// ===========================================
// COMMON STYLES
// ===========================================
export const commonStyles = {
  pageContainer: {
    position: 'fixed' as const,
    inset: 0,
    overflow: 'hidden',
    fontFamily,
  },

  scrollContainer: {
    width: '100%',
    height: '100%',
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
    WebkitOverflowScrolling: 'touch' as const,
    overscrollBehavior: 'contain' as const,
  },

  buttonBase: {
    border: 'none',
    cursor: 'pointer',
    fontFamily,
    WebkitTapHighlightColor: 'transparent',
  } as React.CSSProperties,

  cardStyle: {
    background: colors.card,
    borderRadius: borderRadius['2xl'],
    padding: spacing.lg,
    boxShadow: shadows.md,
  } as React.CSSProperties,

  headerStyle: {
    padding: `${spacing.lg}px ${spacing.xl}px`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: colors.card,
    borderBottom: `1px solid ${colors.surface}`,
    position: 'sticky' as const,
    top: 0,
    zIndex: 10,
  } as React.CSSProperties,

  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
    marginBottom: spacing.md,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  } as React.CSSProperties,

  tagStyle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    background: colors.surface,
    padding: `${spacing.xs}px ${spacing.base}px`,
    borderRadius: borderRadius.md,
  } as React.CSSProperties,
}

// ===========================================
// BUTTON VARIANTS
// ===========================================
export const buttonVariants = {
  primary: {
    ...commonStyles.buttonBase,
    width: '100%',
    padding: spacing.base,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    background: `linear-gradient(135deg, ${colors.primaryLight} 0%, ${colors.primary} 100%)`,
    color: '#fff',
    borderRadius: borderRadius.lg,
    boxShadow: '0 4px 12px rgba(74, 47, 24, 0.2)',
  } as React.CSSProperties,

  secondary: {
    ...commonStyles.buttonBase,
    padding: `${spacing.md}px ${spacing.xl}px`,
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    background: colors.surface,
    color: colors.text,
    borderRadius: borderRadius.md,
  } as React.CSSProperties,
}

// ===========================================
// GRADIENTS
// ===========================================
export const gradients = {
  primary: `linear-gradient(135deg, ${colors.primaryLight} 0%, ${colors.primary} 100%)`,
  primaryDark: 'linear-gradient(145deg, #4A2F18, #3D2510)',
  surface: `linear-gradient(145deg, ${colors.bgDark}, ${colors.bg})`,
} as const

// ===========================================
// LOGO STYLE
// ===========================================
export const logoStyle = {
  width: 36,
  height: 36,
  background: gradients.primary,
  borderRadius: borderRadius.full,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
} as React.CSSProperties

// ===========================================
// RESPONSIVE HELPERS
// ===========================================
export const responsive = {
  // Utility function to get device-specific values
  value: <T,>(mobile: T, desktop: T, currentVariant: 'mobile' | 'desktop' = 'desktop'): T => {
    return currentVariant === 'mobile' ? mobile : desktop
  },

  // Common responsive patterns
  padding: (variant: 'mobile' | 'desktop' = 'desktop') => ({
    padding: variant === 'mobile' ? spacing.base : spacing.xl,
  }),

  fontSize: (variant: 'mobile' | 'desktop' = 'desktop') => ({
    fontSize: variant === 'mobile' ? fontSize.base : fontSize.md,
  }),
}

// ===========================================
// EXPORTS FOR BACKWARD COMPATIBILITY
// ===========================================
// Support for existing mobile-design.ts imports
export {
  commonStyles as pageContainer,
  commonStyles as scrollContainer,
  commonStyles as buttonBase,
  commonStyles as cardStyle,
  commonStyles as headerStyle,
  commonStyles as sectionLabel,
  commonStyles as tagStyle,
  buttonVariants as primaryButton,
}
