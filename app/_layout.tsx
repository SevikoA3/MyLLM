import { Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { StatusBar } from 'expo-status-bar';
import { setBackgroundColorAsync } from 'expo-system-ui';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import '../global.css';
import { colors, fonts, radius, typography } from '../src/ui/tokens';

export { ErrorBoundary } from 'expo-router';

void setBackgroundColorAsync(colors.background);

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_500Medium,
    Inter_600SemiBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });

  if (!fontsLoaded) {
    return <BootstrapScreen />;
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="setup" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="history" />
        <Stack.Screen name="chat/[conversationId]" />
        <Stack.Screen name="settings/endpoints" />
        <Stack.Screen name="settings/usage" />
      </Stack>
    </>
  );
}

function BootstrapScreen() {
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16 }}>
        <View style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.surfaceHigh }}>
          <SymbolView name={{ ios: 'terminal.fill', android: 'terminal' }} size={24} tintColor={colors.primary} />
        </View>
        <ActivityIndicator accessibilityLabel="Loading MyLLM" color={colors.primary} />
        <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: typography.body }}>Preparing MyLLM</Text>
        <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: typography.label }}>Loading interface resources.</Text>
      </View>
    </SafeAreaView>
  );
}
