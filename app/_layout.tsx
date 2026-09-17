import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import '../global.css';

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="setup" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="history" />
        <Stack.Screen name="chat/[conversationId]" />
      </Stack>
    </>
  );
}
