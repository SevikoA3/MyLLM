import { designSystem } from './tokens';

export type ThemeColors = typeof designSystem.colors;

/** MyLLM uses the fixed dark operational theme defined in DESIGN.md. */
export function useTheme() {
  return designSystem;
}
