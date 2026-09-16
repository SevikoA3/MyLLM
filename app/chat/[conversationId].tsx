import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ChatScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <View className="flex-1 items-center justify-center gap-2 px-6">
        <Text className="text-xl font-bold text-black dark:text-white">Chat</Text>
        <Text className="text-center text-base text-neutral-600 dark:text-neutral-400">
          Placeholder conversation {conversationId}. Chat UI dan streaming diisi pada Phase 4 dan 5.
        </Text>
      </View>
    </SafeAreaView>
  );
}
