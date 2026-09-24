// Satu sumber untuk keputusan visual. DESIGN.md menjelaskan alasan dan aturan pakainya.
export const colors = {
  background: '#0b1326',
  canvas: '#060e20',
  surfaceLowest: '#060e20',
  panelLowest: '#060e20',
  sheet: '#0f172a',
  surfaceLow: '#131b2e',
  panel: '#131b2e',
  surface: '#171f33',
  control: '#1e293b',
  surfaceHigh: '#222a3d',
  controlActive: '#222a3d',
  border: '#334155',
  outline: '#86948a',
  text: '#dae2fd',
  muted: '#bbcabf',
  textMuted: '#bbcabf',
  primary: '#10b981',
  accent: '#10b981',
  primaryText: '#020617',
  accentText: '#020617',
  secondary: '#06b6d4',
  tertiary: '#f59e0b',
  warning: '#f59e0b',
  warningBackground: '#523200',
  warningBg: '#523200',
  warningText: '#ffddb8',
  error: '#ffb4ab',
  danger: '#ef4444',
  errorBackground: '#450a0a',
  errorContainer: '#ef4444',
  errorText: '#fecaca',
  errorButtonText: '#020617',
  backdrop: 'rgba(0, 0, 0, 0.55)',
} as const;

export const fonts = {
  heading: 'Inter_600SemiBold',
  headingMedium: 'Inter_500Medium',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
} as const;

export const spacing = {
  hairline: 2,
  xsmall: 4,
  small: 8,
  medium: 12,
  screen: 16,
  large: 24,
  xlarge: 32,
  gap: 8,
} as const;

export const radius = {
  micro: 2,
  control: 4,
  card: 8,
  sheet: 12,
  bubble: 16,
  pill: 9999,
} as const;

export const typography = {
  display: 26,
  title: 22,
  subtitle: 18,
  componentTitle: 15,
  body: 13,
  label: 11,
  meta: 10,
} as const;

export const interaction = {
  touchTarget: 48,
  compactTouchTarget: 44,
  pressedOpacity: 0.75,
  disabledOpacity: 0.45,
} as const;

export const motion = {
  backdropIn: 180,
  backdropOut: 140,
  sheetIn: 220,
  sheetOut: 180,
} as const;

export const designSystem = { colors, fonts, spacing, radius, typography, interaction, motion } as const;
