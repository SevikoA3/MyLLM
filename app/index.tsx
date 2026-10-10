import { Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useActiveEndpoint } from '../src/features/setup/use-active-endpoint';
import { colors, fonts, spacing, typography } from '../src/ui/tokens';

export default function EntryScreen() {
  const { status, profile } = useActiveEndpoint();

  if (status === 'loading') {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style="light" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.small, padding: spacing.screen }}>
          <ActivityIndicator accessibilityLabel="Loading endpoint configuration" color={colors.primary} />
          <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: typography.title }}>Preparing MyLLM</Text>
          <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: typography.body }}>Loading endpoint configuration.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return profile === null ? <Redirect href="/setup" /> : <Redirect href="/chat/new" />;
}
