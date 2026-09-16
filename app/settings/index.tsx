import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <View className="flex-1 items-center justify-center gap-2 px-6">
        <Text className="text-xl font-bold text-black dark:text-white">Settings</Text>
        <Text className="text-center text-base text-neutral-600 dark:text-neutral-400">
          Placeholder. Endpoint, model, dan compaction settings diisi pada Phase 2, 3, dan 10.
        </Text>
      </View>
    </SafeAreaView>
  );
}
