import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <View className="flex-1 items-center justify-center gap-2 px-6">
        <Text className="text-2xl font-bold text-black dark:text-white">MyLLM</Text>
        <Text className="text-base text-neutral-600 dark:text-neutral-400">
          Endpoint aktif. Chat UI diisi pada Phase 4.
        </Text>
        <Link href="/models" asChild>
          <Text className="text-base font-semibold text-blue-600 dark:text-blue-400">
            Pilih model
          </Text>
        </Link>
      </View>
    </SafeAreaView>
  );
}
