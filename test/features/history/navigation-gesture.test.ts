import { isNavigationSwipe } from '../../../src/features/history/navigation-gesture';

it.each([
  ['right from the left edge', 'open', 80, 4, 8, 1, true],
  ['right inside the system back edge', 'open', 80, 4, 40, 1, true],
  ['right on the 48 dp edge boundary', 'open', 80, 4, 48, 1, true],
  ['right outside the 48 dp edge', 'open', 80, 4, 49, 1, false],
  ['outside the screen', 'open', 80, 4, -1, 1, false],
  ['left cannot open', 'open', -80, 4, 8, 1, false],
  ['left inside the sidebar', 'close', -80, 4, 180, 1, true],
  ['right cannot close', 'close', 80, 4, 180, 1, false],
  ['vertical opening', 'open', 10, 80, 8, 1, false],
  ['vertical closing', 'close', -10, 80, 180, 1, false],
  ['diagonal opening', 'open', 80, 60, 8, 1, false],
  ['diagonal closing', 'close', -80, 60, 180, 1, false],
  ['short opening', 'open', 20, 0, 8, 1, false],
  ['short closing', 'close', -20, 0, 180, 1, false],
  ['tap', 'open', 0, 0, 8, 1, false],
  ['multiple touches', 'open', 80, 0, 8, 2, false],
  ['released finger', 'close', -80, 0, 180, 0, true],
] as const)('recognizes %s intent', (_name, direction, dx, dy, x0, numberActiveTouches, expected) => {
  expect(isNavigationSwipe({ dx, dy, x0, numberActiveTouches }, direction, 48)).toBe(expected);
});

it('captures clear intent before committing a full swipe', () => {
  const gesture = { dx: 12, dy: 2, x0: 8, numberActiveTouches: 1 };
  expect(isNavigationSwipe(gesture, 'open', 8)).toBe(true);
  expect(isNavigationSwipe(gesture, 'open', 48)).toBe(false);
});
