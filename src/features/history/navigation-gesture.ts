import type { PanResponderGestureState } from 'react-native';

import { interaction } from '../../ui/tokens';

export function isNavigationSwipe(
  gesture: Pick<PanResponderGestureState, 'dx' | 'dy' | 'x0' | 'numberActiveTouches'>,
  direction: 'open' | 'close',
  minimumDistance: number,
): boolean {
  const { dx, dy, x0, numberActiveTouches } = gesture;
  // Area 48 dp memberi ruang mulai swipe di dalam tepi gesture back Android.
  return numberActiveTouches <= 1
    && (direction === 'close' || (x0 >= 0 && x0 <= interaction.touchTarget))
    && (direction === 'open' ? dx : -dx) >= minimumDistance
    && Math.abs(dx) > Math.abs(dy) * 2;
}
