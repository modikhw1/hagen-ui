/**
 * LeTrend Design System
 *
 * Centralized design tokens for consistent styling across admin and studio.
 * Based on CSS variables in globals.css
 */

export const LeTrendColors = {
  // Brand colors
  cream: '#FAF8F5',
  brownDark: '#4A2F18',
  brownMedium: '#5D3A1A',
  brownLight: '#6B4423',

  // Text colors
  textPrimary: '#1A1612',
  textSecondary: '#7D6E5D',
  textMuted: '#9D8E7D',
  textPlaceholder: '#B5A99A',

  // Surface colors
  surface: '#F5F2EE',
  surfaceLight: '#F0EBE4',

  // Utility colors
  success: '#5A8F5A',
  error: '#C53030',
  warning: '#D97706',
  info: '#2563EB',

  // Border
  border: 'rgba(74, 47, 24, 0.08)',
  borderMedium: 'rgba(74, 47, 24, 0.12)',
  borderDark: 'rgba(74, 47, 24, 0.2)',
} as const;

export const LeTrendTypography = {
  fontFamily: {
    body: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    heading: "Georgia, 'Times New Roman', serif",
    mono: "'SF Mono', Monaco, 'Cascadia Code', 'Courier New', monospace",
  },
  fontSize: {
    xs: '12px',
    sm: '13px',
    base: '14px',
    md: '15px',
    lg: '16px',
    xl: '18px',
    '2xl': '20px',
    '3xl': '24px',
    '4xl': '28px',
    '5xl': '32px',
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.7,
  },
} as const;

export const LeTrendSpacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  '2xl': '24px',
  '3xl': '32px',
  '4xl': '40px',
  '5xl': '48px',
} as const;

export const LeTrendRadius = {
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
} as const;

export const LeTrendShadows = {
  sm: '0 1px 2px rgba(74, 47, 24, 0.05)',
  md: '0 4px 6px rgba(74, 47, 24, 0.07)',
  lg: '0 8px 16px rgba(74, 47, 24, 0.1)',
  xl: '0 12px 24px rgba(74, 47, 24, 0.12)',
  inner: 'inset 0 2px 4px rgba(74, 47, 24, 0.06)',
} as const;

export const LeTrendGradients = {
  brownPrimary: 'linear-gradient(145deg, #4A2F18, #3D2510)',
  brownLight: 'linear-gradient(135deg, #6B4423 0%, #5D3A1A 100%)',
  cream: 'linear-gradient(180deg, #FAF8F5 0%, #F5F2EE 100%)',
} as const;

/**
 * Helper function to create consistent card styles
 */
export const cardStyle = (variant: 'default' | 'elevated' | 'flat' = 'default') => ({
  background: LeTrendColors.cream,
  borderRadius: LeTrendRadius.xl,
  border: variant === 'flat' ? `1px solid ${LeTrendColors.border}` : 'none',
  boxShadow: variant === 'elevated' ? LeTrendShadows.lg : variant === 'default' ? LeTrendShadows.md : 'none',
  padding: LeTrendSpacing['2xl'],
});

/**
 * Helper function for button styles
 */
export const buttonStyle = (variant: 'primary' | 'secondary' | 'ghost' = 'primary') => {
  const base = {
    padding: `${LeTrendSpacing.md} ${LeTrendSpacing.xl}`,
    borderRadius: LeTrendRadius.md,
    fontWeight: LeTrendTypography.fontWeight.semibold,
    fontSize: LeTrendTypography.fontSize.base,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    border: 'none',
  };

  const variants = {
    primary: {
      ...base,
      background: LeTrendColors.brownLight,
      color: LeTrendColors.cream,
    },
    secondary: {
      ...base,
      background: LeTrendColors.surface,
      color: LeTrendColors.brownDark,
      border: `1px solid ${LeTrendColors.border}`,
    },
    ghost: {
      ...base,
      background: 'transparent',
      color: LeTrendColors.textSecondary,
    },
  };

  return variants[variant];
};

/**
 * Helper for consistent input styles
 */
export const inputStyle = () => ({
  padding: `${LeTrendSpacing.md} ${LeTrendSpacing.lg}`,
  borderRadius: LeTrendRadius.md,
  border: `1px solid ${LeTrendColors.border}`,
  background: LeTrendColors.cream,
  fontSize: LeTrendTypography.fontSize.base,
  fontFamily: LeTrendTypography.fontFamily.body,
  color: LeTrendColors.textPrimary,
  outline: 'none',
  transition: 'border-color 0.2s ease',
});

/**
 * Decorative divider
 */
export const decorativeDivider = () => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: LeTrendColors.textMuted,
  fontSize: LeTrendTypography.fontSize.sm,
  letterSpacing: '4px',
  margin: `${LeTrendSpacing['2xl']} 0`,
});
