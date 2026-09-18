import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';

import type { ConversationCursor, ConversationSummary } from '../../domain/conversation';
import { conversationRepository } from '../../services/persistence/conversation-store';
import { Screen } from '../../ui/components';
import { useTheme } from '../../ui/theme';

const PAGE_SIZE = 20;

export default function HistoryScreen() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [cursor, setCursor] = useState<ConversationCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const router = useRouter();
  const theme = useTheme();

  const loadFirst = useCallback(async () => {
    setLoading(true);
    try {
      const page = await conversationRepository.list(PAGE_SIZE);
      setConversations(page.conversations);
      setCursor(page.nextCursor);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadFirst();
    }, [loadFirst]),
  );

  const loadMore = useCallback(async () => {
    if (cursor === null || loadingMore) {
      return;
    }
    setLoadingMore(true);
    try {
      const page = await conversationRepository.list(PAGE_SIZE, cursor);
      setConversations((current) => [...current, ...page.conversations]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore]);

  const saveTitle = useCallback(async (id: string) => {
    const next = title.trim();
    if (next.length === 0) {
      return;
    }
    await conversationRepository.rename(id, next);
    setEditingId(null);
    await loadFirst();
  }, [loadFirst, title]);

  const confirmDelete = useCallback((conversation: ConversationSummary) => {
    Alert.alert('Delete conversation?', conversation.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void conversationRepository.remove(conversation.id).then(loadFirst);
        },
      },
    ]);
  }, [loadFirst]);

  return (
    <Screen>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: theme.spacing.screen,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}>
        <Text style={{ color: theme.colors.text, fontSize: theme.typography.title, fontWeight: '800' }}>
          History
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start a new chat"
          onPress={() =>
            router.push({
              pathname: '/chat/[conversationId]',
              params: { conversationId: 'new' },
            })
          }
          style={{
            minHeight: 48,
            justifyContent: 'center',
            paddingHorizontal: 12,
            borderRadius: theme.radius.control,
            backgroundColor: theme.colors.accent,
          }}>
          <Text style={{ color: theme.colors.accentText, fontWeight: '700' }}>New chat</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={conversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            flexGrow: 1,
            gap: theme.spacing.gap,
            padding: theme.spacing.screen,
          }}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Text style={{ color: theme.colors.text, fontSize: theme.typography.subtitle, fontWeight: '700' }}>
                No conversations yet
              </Text>
              <Text style={{ color: theme.colors.textMuted }}>Your first chat will appear here.</Text>
            </View>
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator color={theme.colors.accent} /> : null}
          renderItem={({ item }) => (
            <View
              style={{
                gap: 10,
                padding: 14,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.card,
                backgroundColor: theme.colors.surface,
              }}>
              {editingId === item.id ? (
                <TextInput
                  accessibilityLabel="Conversation title"
                  autoFocus
                  value={title}
                  onChangeText={setTitle}
                  onSubmitEditing={() => void saveTitle(item.id)}
                  style={{
                    minHeight: 48,
                    paddingHorizontal: 10,
                    borderWidth: 1,
                    borderColor: theme.colors.borderStrong,
                    borderRadius: theme.radius.control,
                    color: theme.colors.text,
                  }}
                />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={'Open ' + item.title}
                  style={{ minHeight: 48, justifyContent: 'center' }}
                  onPress={() =>
                    router.push({
                      pathname: '/chat/[conversationId]',
                      params: { conversationId: item.id },
                    })
                  }>
                  <Text
                    numberOfLines={2}
                    style={{ color: theme.colors.text, fontSize: theme.typography.subtitle, fontWeight: '700' }}>
                    {item.title}
                  </Text>
                  <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
                    {new Date(item.updatedAt).toLocaleString()} · {item.activeModelId}
                  </Text>
                  {item.status === 'interrupted' && (
                    <Text style={{ color: theme.colors.warningText, fontSize: theme.typography.meta }}>
                      Interrupted when the app closed
                    </Text>
                  )}
                </Pressable>
              )}
              <View style={{ flexDirection: 'row', gap: 18 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={editingId === item.id ? 'Save title' : 'Edit title'}
                  style={{ minHeight: 48, justifyContent: 'center' }}
                  onPress={() => {
                    if (editingId === item.id) {
                      void saveTitle(item.id);
                    } else {
                      setEditingId(item.id);
                      setTitle(item.title);
                    }
                  }}>
                  <Text style={{ color: theme.colors.accent, fontWeight: '700' }}>
                    {editingId === item.id ? 'Save' : 'Rename'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={'Delete ' + item.title}
                  style={{ minHeight: 48, justifyContent: 'center' }}
                  onPress={() => confirmDelete(item)}>
                  <Text style={{ color: theme.colors.danger, fontWeight: '700' }}>Delete</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
    </Screen>
  );
}
