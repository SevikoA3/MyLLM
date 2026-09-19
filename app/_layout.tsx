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

export { ErrorBoundary } from 'expo-router';

void setBackgroundColorAsync('#0b1326');

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
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0b1326' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="setup" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="history" />
        <Stack.Screen name="chat/[conversationId]" />
      </Stack>
    </>
  );
}

function BootstrapScreen() {
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: '#0b1326' }}>
      <StatusBar style="light" />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16 }}>
        <View style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: '#222a3d' }}>
          <SymbolView name={{ ios: 'terminal.fill', android: 'terminal' }} size={24} tintColor="#4edea3" />
        </View>
        <ActivityIndicator accessibilityLabel="Loading MyLLM" color="#4edea3" />
        <Text style={{ color: '#dae2fd', fontSize: 14, fontWeight: '600' }}>Preparing MyLLM</Text>
        <Text style={{ color: '#bbcabf', fontSize: 11 }}>Loading interface resources.</Text>
      </View>
    </SafeAreaView>
  );
}
