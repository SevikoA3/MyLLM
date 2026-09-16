import { useLocalSearchParams } from 'expo-router';

import { PlaceholderScreen } from '../../src/ui/components';

export default function ChatScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();

  return (
    <PlaceholderScreen
      title="Chat"
      body={
        'Percakapan ' + conversationId + '. Composer dan streaming diisi pada Phase 4 dan 5.'
      }
    />
  );
}
