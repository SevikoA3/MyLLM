import { useColorScheme } from 'react-native';

import { radius, spacing, typography } from './tokens';

export type ThemeColors = {
  background: string;
  surface: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  accent: string;
  accentText: string;
  warningBg: string;
  warningText: string;
  danger: string;
};

/**
 * Mode gelap tidak dibuat dengan membalik dua warna: teks sekunder tetap dipilih
 * agar berada di atas rasio kontras 4.5:1 terhadap latarnya.
 */
const light: ThemeColors = {
  background: '#ffffff',
  surface: '#f4f4f5',
  border: '#d4d4d8',
  borderStrong: '#18181b',
  text: '#09090b',
  textMuted: '#52525b',
  accent: '#1d4ed8',
  accentText: '#ffffff',
  warningBg: '#fef3c7',
  warningText: '#78350f',
  danger: '#b91c1c',
};

const dark: ThemeColors = {
  background: '#09090b',
  surface: '#1c1c1f',
  border: '#52525b',
  borderStrong: '#fafafa',
  text: '#fafafa',
  textMuted: '#d4d4d8',
  accent: '#bfdbfe',
  accentText: '#0b1220',
  warningBg: '#78350f',
  warningText: '#fef3c7',
  danger: '#fca5a5',
};

/**
 * StyleSheet dilewati karena NativeWind sudah menjadi jalur styling repo ini, dan
 * nilai dark/light dipilih lewat satu hook yang sama agar kedua mode konsisten.
 * Hanya properti yang berbeda per mode yang dihasilkan di sini.
 */
export function useTheme() {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  return { mode, colors: mode === 'dark' ? dark : light, spacing, radius, typography };
}
