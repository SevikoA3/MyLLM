import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SetupScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <View className="flex-1 items-center justify-center gap-2 px-6">
        <Text className="text-xl font-bold text-black dark:text-white">Setup endpoint</Text>
        <Text className="text-center text-base text-neutral-600 dark:text-neutral-400">
          Placeholder. Form base URL, API key, dan auth mode diisi pada Phase 2.
        </Text>
      </View>
    </SafeAreaView>
  );
}
