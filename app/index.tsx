import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useActiveEndpoint } from '../src/features/setup/use-active-endpoint';

export default function EntryScreen() {
  const { status, profile } = useActiveEndpoint();

  if (status === 'loading') {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white dark:bg-black">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator accessibilityLabel="Checking endpoint" />
        </View>
      </SafeAreaView>
    );
  }

  return profile === null ? <Redirect href="/setup" /> : <Redirect href="/(tabs)" />;
}
