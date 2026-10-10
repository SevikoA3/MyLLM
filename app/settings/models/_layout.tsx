import { Stack } from 'expo-router';

import { colors } from '../../../src/ui/tokens';

export const unstable_settings = { initialRouteName: 'index' };

export default function ModelsLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}
