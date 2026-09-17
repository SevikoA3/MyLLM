import { Link, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import Markdown from 'react-native-markdown-display';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ChatMessage } from '../../domain/conversation';
import type { AppError } from '../../domain/error';
import { InfoBlock, Screen } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { useActiveEndpoint } from '../setup/use-active-endpoint';
import { useChat } from './use-chat';

export default function ChatScreen() {
  const { status, profile } = useActiveEndpoint();
  const params = useLocalSearchParams<{ conversationId?: string; fresh?: string }>();
  const startFresh = params.conversationId === 'new';
  const requestedConversationId =
    typeof params.conversationId === 'string' && !startFresh ? params.conversationId : null;
  const chat = useChat(profile, requestedConversationId, startFresh);
  const [draft, setDraft] = useState('');
  const theme = useTheme();
  const router = useRouter();
  const reloadModel = chat.reloadModel;

  useFocusEffect(
    useCallback(() => {
      void reloadModel();
    }, [reloadModel]),
  );

  const submit = useCallback(() => {
    const prompt = draft.trim();
    if (
      prompt.length === 0 ||
      chat.pending ||
      chat.loadingModel ||
      chat.activeModelId === null
    ) {
      return;
    }
    setDraft('');
    void chat.send(prompt);
  }, [chat, draft]);
  const sendDisabled =
    !chat.pending &&
    (chat.loadingModel || chat.activeModelId === null || draft.trim().length === 0);

  if (status === 'loading') {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            paddingHorizontal: theme.spacing.screen,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: theme.typography.title,
                fontWeight: '800',
              }}>
              MyLLM
            </Text>
            <Text
              numberOfLines={1}
              style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
              {chat.loadingModel
                ? 'Memuat model aktif...'
                : (chat.activeModelId ?? 'Belum ada model aktif')}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New chat"
            disabled={chat.pending || chat.messages.length === 0}
            onPress={() => {
              chat.newChat();
              setDraft('');
              if (requestedConversationId !== null) {
                router.replace({
                  pathname: '/chat/[conversationId]',
                  params: { conversationId: 'new' },
                });
              }
            }}
            style={({ pressed }) => ({
              minHeight: 44,
              justifyContent: 'center',
              paddingHorizontal: 12,
              borderRadius: theme.radius.control,
              backgroundColor: theme.colors.surface,
              opacity: chat.pending || chat.messages.length === 0 ? 0.5 : pressed ? 0.7 : 1,
            })}>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: theme.typography.meta,
                fontWeight: '700',
              }}>
              New chat
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Buka history"
            onPress={() => router.push('/history')}
            style={({ pressed }) => ({
              minWidth: 44,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.radius.control,
              backgroundColor: theme.colors.surface,
              opacity: pressed ? 0.7 : 1,
            })}>
            <SymbolView
              name={{ ios: 'clock.arrow.circlepath', android: 'history' }}
              size={21}
              tintColor={theme.colors.text}
            />
          </Pressable>
        </View>

        {profile === null ? (
          <View style={{ flex: 1, padding: theme.spacing.screen }}>
            <InfoBlock title="Endpoint belum tersedia" body="Hubungkan endpoint sebelum mengirim pesan." />
          </View>
        ) : chat.activeModelId === null && !chat.loadingModel ? (
          <View style={{ flex: 1, gap: 12, padding: theme.spacing.screen }}>
            <InfoBlock title="Pilih model" body="Chat membutuhkan satu model aktif dari katalog." />
            <Link href="/models" asChild>
              <Pressable
                accessibilityRole="button"
                style={{
                  minHeight: 48,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: theme.radius.control,
                  backgroundColor: theme.colors.accent,
                }}>
                <Text
                  style={{
                    color: theme.colors.accentText,
                    fontSize: theme.typography.body,
                    fontWeight: '700',
                  }}>
                  Buka katalog model
                </Text>
              </Pressable>
            </Link>
          </View>
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={chat.messages}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              flexGrow: 1,
              gap: 12,
              justifyContent: chat.messages.length === 0 ? 'center' : 'flex-start',
              padding: theme.spacing.screen,
            }}
            ListEmptyComponent={<EmptyChat />}
            ListFooterComponent={chat.pending ? <PendingMessage /> : null}
            renderItem={({ item }) =>
              item.role === 'assistant' && item.status === 'sending' && item.text.length === 0
                ? null
                : <MessageBubble message={item} />
            }
          />
        )}

        {chat.error !== null && (
          <ErrorCard error={chat.error} canRetry={chat.canRetry} onRetry={() => void chat.retry()} />
        )}
        {chat.error === null && chat.canRetry && (
          <RetryCard onRetry={() => void chat.retry()} />
        )}

        <View
          style={{
            gap: 8,
            padding: theme.spacing.screen,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.background,
          }}>
          {chat.reasoningOptions.length > 0 && (
            <ReasoningSelector
              options={chat.reasoningOptions}
              selected={chat.reasoningEffort}
              disabled={chat.pending}
              onSelect={(effort) => void chat.setReasoningEffort(effort)}
            />
          )}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <TextInput
              accessibilityLabel="Pesan"
              value={draft}
              onChangeText={setDraft}
              placeholder="Tulis pesan..."
              placeholderTextColor={theme.colors.textMuted}
              editable={!chat.pending && !chat.loadingModel && chat.activeModelId !== null}
              multiline
              style={{
                minHeight: 48,
                maxHeight: 132,
                flex: 1,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.card,
                backgroundColor: theme.colors.surface,
                color: theme.colors.text,
                fontSize: theme.typography.body,
                textAlignVertical: 'top',
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={chat.pending ? 'Stop' : 'Kirim'}
              accessibilityHint={
                chat.pending ? 'Menghentikan jawaban yang sedang berjalan' : 'Mengirim pesan'
              }
              disabled={sendDisabled}
              onPress={chat.pending ? chat.stop : submit}
              style={({ pressed }) => ({
                width: 48,
                height: 48,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 24,
                backgroundColor: chat.pending ? theme.colors.danger : theme.colors.accent,
                opacity: sendDisabled ? 0.45 : pressed ? 0.75 : 1,
              })}>
              {chat.pending ? (
                <SymbolView
                  name={{ ios: 'stop.fill', android: 'stop' }}
                  size={21}
                  tintColor={theme.colors.accentText}
                />
              ) : (
                <SymbolView
                  name={{ ios: 'paperplane.fill', android: 'send' }}
                  size={21}
                  tintColor={theme.colors.accentText}
                />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

export function ReasoningSelector({
  options,
  selected,
  disabled,
  onSelect,
}: {
  options: string[];
  selected: string | null;
  disabled: boolean;
  onSelect: (effort: string) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
        Reasoning
      </Text>
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6 }}>
        {options.map((effort) => {
          const active = effort === selected;
          return (
            <Pressable
              key={effort}
              accessibilityRole="radio"
              accessibilityLabel={'Reasoning ' + effort}
              accessibilityState={{ checked: active, disabled }}
              disabled={disabled}
              onPress={() => onSelect(effort)}
              style={({ pressed }) => ({
                minHeight: 38,
                justifyContent: 'center',
                paddingHorizontal: 12,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: active ? theme.colors.borderStrong : theme.colors.border,
                backgroundColor: active ? theme.colors.accent : theme.colors.surface,
                opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
              })}>
              <Text
                style={{
                  color: active ? theme.colors.accentText : theme.colors.text,
                  fontSize: theme.typography.meta,
                  fontWeight: active ? '700' : '500',
                }}>
                {effort}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const theme = useTheme();
  const user = message.role === 'user';
  return (
    <View
      accessibilityLabel={user ? 'Pesan kamu' : 'Jawaban asisten'}
      style={{
        maxWidth: '88%',
        alignSelf: user ? 'flex-end' : 'flex-start',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 11,
        borderWidth: user ? 0 : 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.card,
        backgroundColor: user ? theme.colors.accent : theme.colors.surface,
      }}>
      {message.reasoningSummary !== null && (
        <View style={{ gap: 3, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontSize: theme.typography.meta,
              fontWeight: '700',
            }}>
            Ringkasan reasoning
          </Text>
          <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
            {message.reasoningSummary}
          </Text>
        </View>
      )}
      {!user && message.status === 'completed' ? (
        <Markdown
          style={{
            body: { color: theme.colors.text, fontSize: theme.typography.body, lineHeight: 22 },
            code_inline: { backgroundColor: theme.colors.background, color: theme.colors.text },
            code_block: { backgroundColor: theme.colors.background, color: theme.colors.text },
            fence: { backgroundColor: theme.colors.background, color: theme.colors.text },
            link: { color: theme.colors.accent },
          }}>
          {message.text}
        </Markdown>
      ) : (
        <Text
          style={{
            color: user ? theme.colors.accentText : theme.colors.text,
            fontSize: theme.typography.body,
            lineHeight: 22,
          }}>
          {message.text}
        </Text>
      )}
      {!user && message.status === 'interrupted' && (
        <Text style={{ color: theme.colors.warningText, fontSize: theme.typography.meta }}>
          Terputus saat aplikasi ditutup
        </Text>
      )}
    </View>
  );
}

function EmptyChat() {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 10, padding: 24 }}>
      <View
        style={{
          width: 56,
          height: 56,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 28,
          backgroundColor: theme.colors.surface,
        }}>
        <SymbolView
          name={{ ios: 'bubble.left.and.bubble.right.fill', android: 'chat_bubble' }}
          size={27}
          tintColor={theme.colors.accent}
        />
      </View>
      <Text
        style={{ color: theme.colors.text, fontSize: theme.typography.subtitle, fontWeight: '700' }}>
        Mulai percakapan
      </Text>
      <Text
        style={{
          maxWidth: 280,
          color: theme.colors.textMuted,
          fontSize: theme.typography.body,
          textAlign: 'center',
          lineHeight: 21,
        }}>
        Percakapan disimpan otomatis dan tersedia di History.
      </Text>
    </View>
  );
}

function PendingMessage() {
  const theme = useTheme();
  return (
    <View
      accessibilityLabel="Menunggu jawaban"
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 11,
        borderRadius: theme.radius.card,
        backgroundColor: theme.colors.surface,
      }}>
      <ActivityIndicator size="small" color={theme.colors.accent} />
      <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
        Menunggu jawaban...
      </Text>
    </View>
  );
}

function ErrorCard({
  error,
  canRetry,
  onRetry,
}: {
  error: AppError;
  canRetry: boolean;
  onRetry: () => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        gap: 8,
        marginHorizontal: theme.spacing.screen,
        marginBottom: 4,
        padding: 12,
        borderWidth: 1,
        borderColor: theme.colors.danger,
        borderRadius: theme.radius.control,
        backgroundColor: theme.colors.surface,
      }}>
      <Text style={{ color: theme.colors.danger, fontSize: theme.typography.meta, fontWeight: '700' }}>
        Request gagal
      </Text>
      <Text style={{ color: theme.colors.text, fontSize: theme.typography.meta }}>{error.message}</Text>
      {canRetry && (
        <Pressable accessibilityRole="button" accessibilityLabel="Coba lagi" onPress={onRetry}>
          <Text style={{ color: theme.colors.accent, fontSize: theme.typography.meta, fontWeight: '700' }}>
            Coba lagi
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function RetryCard({ onRetry }: { onRetry: () => void }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginHorizontal: theme.spacing.screen,
        marginBottom: 4,
        padding: 12,
        borderRadius: theme.radius.control,
        backgroundColor: theme.colors.warningBg,
      }}>
      <Text style={{ flex: 1, color: theme.colors.warningText, fontSize: theme.typography.meta }}>
        Jawaban sebelumnya terputus.
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Coba lagi" onPress={onRetry}>
        <Text style={{ color: theme.colors.warningText, fontWeight: '800' }}>Coba lagi</Text>
      </Pressable>
    </View>
  );
}
