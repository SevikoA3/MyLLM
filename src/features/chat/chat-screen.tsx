import { Link, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { StatusBar } from 'expo-status-bar';
import { memo, useCallback, useEffect, useState } from 'react';
import Markdown from 'react-native-markdown-display';
import {
  ActivityIndicator,
  FlatList,
  type ImageStyle,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ChatMessage } from '../../domain/conversation';
import type { AppError } from '../../domain/error';
import type { ToolActivity } from '../../domain/tool';
import { parseWebSearchOutput } from '../../domain/web-search';
import { formatCount } from '../../domain/usage';
import { useActiveEndpoint } from '../setup/use-active-endpoint';
import { useChat } from './use-chat';
import { ContextPill } from './context-pill';

const CHAT_THEME = {
  colors: {
    background: '#0b1326',
    canvas: '#060e20',
    sheet: '#0f172a',
    surface: '#171f33',
    surfaceLow: '#131b2e',
    surfaceHigh: '#222a3d',
    border: '#334155',
    text: '#dae2fd',
    textMuted: '#bbcabf',
    accent: '#10b981',
    accentText: '#020617',
    secondary: '#06b6d4',
    tertiary: '#f59e0b',
    danger: '#ef4444',
    warningBg: '#523200',
    warningText: '#ffddb8',
  },
  radius: { micro: 2, control: 4, card: 8, sheet: 12, bubble: 16, pill: 9999 },
  spacing: { screen: 16, gap: 8 },
  typography: { title: 26, subtitle: 18, body: 13, meta: 10 },
  fonts: { heading: 'Inter_600SemiBold', mono: 'JetBrainsMono_400Regular', monoMedium: 'JetBrainsMono_500Medium' },
} as const;

const theme = CHAT_THEME;

const MARKDOWN_STYLE: Record<string, ImageStyle | TextStyle | ViewStyle> = {
  body: { color: theme.colors.text, fontFamily: theme.fonts.mono, fontSize: theme.typography.body, lineHeight: 20 },
  paragraph: { marginTop: 0, marginBottom: 8, flexWrap: 'wrap', flexDirection: 'row', width: '100%' },
  heading1: { color: theme.colors.text, fontFamily: theme.fonts.heading, fontSize: 26, lineHeight: 32, fontWeight: '600', marginTop: 4, marginBottom: 8 },
  heading2: { color: theme.colors.text, fontFamily: theme.fonts.heading, fontSize: 22, lineHeight: 28, fontWeight: '600', marginTop: 4, marginBottom: 8 },
  heading3: { color: theme.colors.text, fontFamily: theme.fonts.heading, fontSize: 18, lineHeight: 24, fontWeight: '600', marginTop: 4, marginBottom: 4 },
  heading4: { color: theme.colors.text, fontFamily: theme.fonts.heading, fontSize: 15, lineHeight: 24, fontWeight: '600', marginTop: 4, marginBottom: 4 },
  heading5: { color: theme.colors.text, fontFamily: theme.fonts.monoMedium, fontSize: 13, lineHeight: 20, marginTop: 4, marginBottom: 4 },
  heading6: { color: theme.colors.textMuted, fontFamily: theme.fonts.monoMedium, fontSize: 11, lineHeight: 16, marginTop: 4, marginBottom: 4 },
  strong: { color: theme.colors.accent, fontFamily: theme.fonts.monoMedium, fontWeight: '600' },
  blockquote: { marginVertical: 4, paddingHorizontal: 12, paddingVertical: 8, borderLeftWidth: 2, borderLeftColor: theme.colors.secondary, borderRadius: theme.radius.control, backgroundColor: theme.colors.canvas },
  bullet_list: { marginBottom: 8 },
  ordered_list: { marginBottom: 8 },
  list_item: { flexDirection: 'row', marginBottom: 4 },
  bullet_list_icon: { marginLeft: 4, marginRight: 8, color: theme.colors.textMuted },
  bullet_list_content: { flex: 1, paddingRight: 4 },
  ordered_list_icon: { marginLeft: 4, marginRight: 8, color: theme.colors.textMuted },
  ordered_list_content: { flex: 1, paddingRight: 4 },
  code_inline: { color: theme.colors.secondary, fontFamily: theme.fonts.mono, paddingHorizontal: 4, paddingVertical: 2, borderWidth: 0, borderRadius: theme.radius.micro, backgroundColor: theme.colors.surface },
  code_block: { color: theme.colors.accent, fontFamily: theme.fonts.mono, fontSize: 11, lineHeight: 20, padding: 12, borderWidth: 0, borderRadius: theme.radius.sheet, backgroundColor: theme.colors.canvas },
  fence: { color: theme.colors.accent, fontFamily: theme.fonts.mono, fontSize: 11, lineHeight: 20, padding: 12, borderWidth: 0, borderRadius: theme.radius.sheet, backgroundColor: theme.colors.canvas },
  table: { marginVertical: 4, borderWidth: 0, borderRadius: theme.radius.control, overflow: 'hidden', backgroundColor: theme.colors.canvas },
  thead: { backgroundColor: theme.colors.surfaceHigh },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderColor: theme.colors.surfaceHigh },
  th: { flex: 1, paddingVertical: 8, paddingHorizontal: 6, color: theme.colors.textMuted, fontFamily: theme.fonts.monoMedium, fontSize: 10 },
  td: { flex: 1, paddingVertical: 8, paddingHorizontal: 6 },
  hr: { height: 1, marginVertical: 8, backgroundColor: theme.colors.border },
  link: { color: theme.colors.secondary, textDecorationLine: 'underline' },
};

export default function ChatScreen() {
  const { status, profile } = useActiveEndpoint();
  const params = useLocalSearchParams<{ conversationId?: string; fresh?: string }>();
  const startFresh = params.conversationId === 'new';
  const requestedConversationId =
    typeof params.conversationId === 'string' && !startFresh ? params.conversationId : null;
  const chat = useChat(profile, requestedConversationId, startFresh);
  const [draft, setDraft] = useState('');
  const router = useRouter();
  const reloadModel = chat.reloadModel;
  const updateContext = chat.updateContext;

  useFocusEffect(
    useCallback(() => {
      void reloadModel();
    }, [reloadModel]),
  );

  useEffect(() => {
    updateContext(draft);
  }, [chat.pending, draft, updateContext]);

  const submit = useCallback(() => {
    const prompt = draft.trim();
    if (
      prompt.length === 0 ||
      chat.pending ||
      chat.compacting ||
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
    (chat.compacting || chat.loadingModel || chat.activeModelId === null || draft.trim().length === 0);

  if (status === 'loading') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <StatusBar style="light" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            height: 56,
            paddingHorizontal: theme.spacing.screen,
            backgroundColor: theme.colors.background,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}>
          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <SymbolView name={{ ios: 'terminal', android: 'terminal' }} size={20} tintColor={theme.colors.accent} />
            <Text style={{ color: theme.colors.text, fontFamily: theme.fonts.heading, fontSize: 18 }}>
              MyLLM
            </Text>
            <View
              accessibilityLabel={profile === null ? 'No endpoint connected' : 'Endpoint configured'}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 6,
                paddingVertical: 3,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.surfaceHigh,
              }}>
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: profile === null ? theme.colors.tertiary : theme.colors.accent,
                }}
              />
              <Text
                style={{
                  color: profile === null ? theme.colors.tertiary : theme.colors.accent,
                  fontFamily: theme.fonts.monoMedium,
                  fontSize: theme.typography.meta,
                }}>
                {profile === null ? 'NO ENDPOINT' : 'CONNECTED'}
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open active model catalog"
            onPress={() => router.push('/models')}
            style={({ pressed }) => ({
              minWidth: 44,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.radius.control,
              backgroundColor: theme.colors.surfaceHigh,
              opacity: pressed ? 0.7 : 1,
            })}>
            <SymbolView name={{ ios: 'slider.horizontal.3', android: 'tune' }} size={20} tintColor={theme.colors.textMuted} />
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: theme.spacing.screen, paddingTop: 4, paddingBottom: 8, backgroundColor: theme.colors.surfaceLow }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Active model, ${chat.activeModelId ?? 'none'}`}
            onPress={() => router.push('/models')}
            hitSlop={6}
            style={({ pressed }) => ({
              flex: 1,
              minWidth: 0,
              minHeight: 32,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: theme.radius.sheet,
              backgroundColor: theme.colors.surfaceHigh,
              opacity: pressed ? 0.8 : 1,
            })}>
            <SymbolView name={{ ios: 'cpu', android: 'memory' }} size={16} tintColor={theme.colors.accent} />
            <Text
              numberOfLines={1}
              style={{ flex: 1, color: theme.colors.text, fontFamily: theme.fonts.monoMedium, fontSize: theme.typography.meta }}>
              {chat.loadingModel ? 'Loading active model...' : (chat.activeModelId ?? 'Choose active model')}
            </Text>
            <SymbolView name={{ ios: 'chevron.down', android: 'expand_more' }} size={16} tintColor={theme.colors.textMuted} />
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open history"
              hitSlop={6}
              onPress={() => router.push('/history')}
              style={({ pressed }) => ({
                width: 32,
                height: 32,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radius.card,
                backgroundColor: theme.colors.surfaceHigh,
                opacity: pressed ? 0.7 : 1,
              })}>
              <SymbolView name={{ ios: 'clock.arrow.circlepath', android: 'history' }} size={16} tintColor={theme.colors.textMuted} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start new chat"
              hitSlop={6}
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
                width: 32,
                height: 32,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radius.card,
                backgroundColor: theme.colors.accent,
                opacity: chat.pending || chat.messages.length === 0 ? 0.45 : pressed ? 0.75 : 1,
              })}>
              <SymbolView name={{ ios: 'plus', android: 'add' }} size={18} tintColor={theme.colors.accentText} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, alignItems: 'center', paddingHorizontal: theme.spacing.screen, paddingVertical: 6 }}
          style={{ maxHeight: 52, backgroundColor: theme.colors.canvas }}>
          {chat.reasoningOptions.length > 0 && (
            <ReasoningSelector
              options={chat.reasoningOptions}
              selected={chat.reasoningEffort}
              disabled={chat.pending}
              onSelect={(effort) => void chat.setReasoningEffort(effort)}
            />
          )}
          {chat.contextBudget !== null && (
            <ContextPill
              budget={chat.contextBudget}
              metrics={chat.metrics.at(-1) ?? null}
              cacheHitPercent={chat.metrics.at(-1)?.cacheHitPercent ?? null}
              policy={chat.contextPolicy}
              autoCompact={chat.autoCompact}
              autoApproveTools={chat.autoApproveTools}
              compacting={chat.compacting}
              canCompact={chat.conversationId !== null && !chat.pending}
              onCompact={() => void chat.compactNow()}
              onToggleAutoCompact={(enabled) => void chat.setAutoCompact(enabled)}
              onToggleAutoApproveTools={chat.setAutoApproveTools}
            />
          )}
        </ScrollView>

        {profile === null ? (
          <View style={{ flex: 1, padding: theme.spacing.screen }}>
            <ChatInfoBlock title="No endpoint connected" body="Connect an endpoint before sending a message." />
          </View>
        ) : chat.activeModelId === null && !chat.loadingModel ? (
          <View style={{ flex: 1, gap: 12, padding: theme.spacing.screen }}>
            <ChatInfoBlock title="Choose a model" body="Chat needs one active model from the catalog." />
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
                  Open model catalog
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
              gap: 16,
              justifyContent: chat.messages.length === 0 ? 'center' : 'flex-start',
              paddingHorizontal: theme.spacing.screen,
              paddingTop: 12,
              paddingBottom: 12,
            }}
            ListEmptyComponent={<EmptyChat />}
            ListHeaderComponent={chat.compactionActive ? <CompactionSeparator /> : null}
            renderItem={({ item }) => {
              const activeAssistant = item.role === 'assistant' && item.id === chat.messages.at(-1)?.id;
              return (
                <View style={{ gap: 8 }}>
                  {activeAssistant && chat.toolProgress.length > 0 && <ToolProgress calls={chat.toolProgress} />}
                  {activeAssistant && chat.pending && <PendingMessage calls={chat.toolProgress} />}
                  {item.role === 'assistant' && item.status === 'sending' && item.text.length === 0
                    ? null
                    : <MessageBubble message={item} modelId={chat.activeModelId} />}
                </View>
              );
            }}
          />
        )}

        {chat.error !== null && (
            <ErrorCard
              error={chat.error}
              endpointName={profile?.name ?? null}
              modelId={chat.activeModelId}
              protocol={profile?.protocol ?? null}
              canRetry={chat.canRetry}
              onRetry={() => void chat.retry()}
            />
        )}
        {chat.error === null && chat.canRetry && (
          <RetryCard onRetry={() => void chat.retry()} />
        )}

        <View
          style={{
            paddingHorizontal: theme.spacing.screen,
            paddingTop: 6,
            paddingBottom: 8,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.canvas,
          }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 6 }}>
            <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.mono, fontSize: theme.typography.meta }}>
              Context headroom:{' '}
              <Text style={{ color: theme.colors.accent, fontFamily: theme.fonts.monoMedium }}>
                {chat.contextBudget?.remainingTokens === null || chat.contextBudget === null
                  ? 'unavailable'
                  : `${formatCount(chat.contextBudget.remainingTokens)} tokens`}
              </Text>
            </Text>
            <Text style={{ color: chat.pending ? theme.colors.tertiary : theme.colors.accent, fontFamily: theme.fonts.monoMedium, fontSize: theme.typography.meta }}>
              {chat.pending ? 'Streaming' : chat.error === null ? 'Ready' : 'Error'}
            </Text>
          </View>
          <View
            style={{
              minHeight: 56,
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: 8,
              padding: 8,
              borderRadius: theme.radius.bubble,
              backgroundColor: theme.colors.surfaceHigh,
            }}>
            <TextInput
              accessibilityLabel="Message"
              accessibilityHint="Write a message to send to the active model"
              value={draft}
              onChangeText={setDraft}
              placeholder={chat.activeModelId === null ? 'Choose a model to start...' : `Message ${chat.activeModelId}...`}
              placeholderTextColor="#7f8ba8"
              editable={
                !chat.pending &&
                !chat.compacting &&
                !chat.loadingModel &&
                chat.activeModelId !== null
              }
              multiline
              style={{
                flex: 1,
                minHeight: 40,
                maxHeight: 132,
                paddingHorizontal: 8,
                paddingVertical: 5,
                color: theme.colors.text,
                fontFamily: theme.fonts.mono,
                fontSize: theme.typography.body,
                lineHeight: 20,
                textAlignVertical: 'top',
              }}
            />
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={chat.pending ? 'Stop' : 'Send'}
                accessibilityHint={chat.pending ? 'Stop the current response' : 'Send message'}
                disabled={sendDisabled}
                onPress={chat.pending ? chat.stop : submit}
                style={({ pressed }) => ({
                  width: 44,
                  height: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: theme.radius.sheet,
                  borderWidth: chat.pending ? 1 : 0,
                  borderColor: theme.colors.danger,
                  backgroundColor: chat.pending ? 'transparent' : theme.colors.accent,
                  opacity: sendDisabled ? 0.45 : pressed ? 0.75 : 1,
                })}>
                {chat.pending ? (
                  <SymbolView
                    name={{ ios: 'stop.fill', android: 'stop' }}
                    size={21}
                    tintColor={theme.colors.danger}
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
      <ToolApprovalModal activity={chat.toolApproval} onResolve={chat.resolveToolApproval} />
    </SafeAreaView>
  );
}

function CompactionSeparator() {
  return (
    <View style={{ paddingBottom: 4 }}>
      <Text
        style={{
          color: theme.colors.textMuted,
          fontFamily: theme.fonts.mono,
          fontSize: theme.typography.meta,
          textAlign: 'center',
        }}>
        Local summary active. The original transcript is preserved.
      </Text>
    </View>
  );
}

function ChatInfoBlock({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ gap: 6, padding: theme.spacing.screen, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.card, backgroundColor: theme.colors.surfaceLow }}>
      <Text style={{ color: theme.colors.text, fontFamily: theme.fonts.heading, fontSize: 16 }}>{title}</Text>
      <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.mono, fontSize: theme.typography.body, lineHeight: 20 }}>{body}</Text>
    </View>
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
  const [open, setOpen] = useState(false);
  const selectedLabel = selected ?? (options.includes('auto') ? 'auto' : 'default');

  const choose = (effort: string) => {
    setOpen(false);
    onSelect(effort);
  };

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Thinking, ${selectedLabel}`}
        accessibilityHint="Choose the model thinking level"
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => ({
          minHeight: 44,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingHorizontal: 10,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.surface,
          opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
        })}>
        <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.mono, fontSize: theme.typography.meta }}>
          Thinking:
        </Text>
        <Text style={{ color: theme.colors.tertiary, fontFamily: theme.fonts.monoMedium, fontSize: theme.typography.meta }}>
          {selectedLabel}
        </Text>
        <SymbolView name={{ ios: 'chevron.down', android: 'expand_more' }} size={14} tintColor={theme.colors.textMuted} />
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setOpen(false)}>
        <View
          style={{
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: 'rgba(0, 0, 0, 0.45)',
          }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close thinking menu"
            onPress={() => setOpen(false)}
            style={{ position: 'absolute', inset: 0 }}
          />
          <View
            style={{
              width: '100%',
              alignSelf: 'center',
              gap: 4,
              padding: 16,
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              borderTopLeftRadius: theme.radius.sheet,
              borderTopRightRadius: theme.radius.sheet,
              backgroundColor: theme.colors.sheet,
            }}>
            <View style={{ alignSelf: 'center', width: 32, height: 4, borderRadius: 2, backgroundColor: theme.colors.border }} />
            <Text
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                color: theme.colors.textMuted,
                fontSize: theme.typography.meta,
                fontWeight: '700',
              }}>
              Thinking level
            </Text>
            {options.map((effort) => {
              const active = effort === selected;
              return (
                <Pressable
                  key={effort}
                  accessibilityRole="radio"
                  accessibilityLabel={'Thinking ' + effort}
                  accessibilityState={{ checked: active, disabled }}
                  disabled={disabled}
                  onPress={() => choose(effort)}
                  style={({ pressed }) => ({
                    minHeight: 48,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: 12,
                    borderRadius: theme.radius.control,
                    backgroundColor: active ? theme.colors.background : 'transparent',
                    opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
                  })}>
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontSize: theme.typography.body,
                      fontWeight: active ? '700' : '500',
                    }}>
                    {effort}
                  </Text>
                  {active && <Text style={{ color: theme.colors.accent, fontWeight: '800' }}>✓</Text>}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </View>
  );
}

export const MessageBubble = memo(function MessageBubble({ message, modelId = null }: { message: ChatMessage; modelId?: string | null }) {
  const user = message.role === 'user';
  const [reasoningOpen, setReasoningOpen] = useState(true);
  const live = message.status === 'sending' || message.status === 'streaming';
  return (
    <View
      accessibilityLabel={user ? 'Your message' : 'Assistant response'}
      style={{
        maxWidth: user ? '92%' : '100%',
        alignSelf: user ? 'flex-end' : 'flex-start',
        gap: 8,
        padding: 12,
        borderRadius: theme.radius.bubble,
        borderTopLeftRadius: user ? theme.radius.bubble : theme.radius.micro,
        borderTopRightRadius: user ? theme.radius.micro : theme.radius.bubble,
        backgroundColor: user ? theme.colors.surfaceHigh : theme.colors.surfaceLow,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: user ? theme.colors.secondary : live ? theme.colors.accent : theme.colors.textMuted }} />
        <Text style={{ color: user ? theme.colors.textMuted : theme.colors.accent, fontFamily: theme.fonts.monoMedium, fontSize: theme.typography.meta }}>
          {user ? 'YOU' : (modelId ?? 'ASSISTANT')}
        </Text>
        {!user && (
          <Text style={{ color: live ? theme.colors.accent : theme.colors.textMuted, fontFamily: theme.fonts.monoMedium, fontSize: theme.typography.meta }}>
            {live ? 'LIVE' : message.status === 'interrupted' ? 'INTERRUPTED' : 'DONE'}
          </Text>
        )}
      </View>
      {message.reasoningSummary !== null && (
        <View style={{ borderRadius: theme.radius.control, backgroundColor: theme.colors.canvas }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Toggle thinking summary"
            accessibilityState={{ expanded: reasoningOpen }}
            onPress={() => setReasoningOpen((value) => !value)}
            style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 10 }}>
            <Text style={{ color: theme.colors.tertiary, fontFamily: theme.fonts.monoMedium, fontSize: theme.typography.meta }}>
              Thinking summary
            </Text>
            <SymbolView name={{ ios: reasoningOpen ? 'chevron.up' : 'chevron.down', android: reasoningOpen ? 'expand_less' : 'expand_more' }} size={15} tintColor={theme.colors.textMuted} />
          </Pressable>
          {reasoningOpen && (
            <Text style={{ paddingHorizontal: 10, paddingBottom: 10, color: theme.colors.textMuted, fontFamily: theme.fonts.mono, fontSize: theme.typography.meta, lineHeight: 16 }}>
              {message.reasoningSummary}
            </Text>
          )}
        </View>
      )}
      {!user && message.status === 'completed' ? (
        <Markdown
          style={MARKDOWN_STYLE}
          onLinkPress={(url) => {
            if (/^https?:\/\//i.test(url)) {
              void Linking.openURL(url).catch(() => undefined);
            }
            return false;
          }}>
          {message.text}
        </Markdown>
      ) : (
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.fonts.mono,
            fontSize: theme.typography.body,
            lineHeight: 20,
          }}>
          {message.text}
        </Text>
      )}
      {!user && message.status === 'interrupted' && (
        <Text style={{ color: theme.colors.warningText, fontSize: theme.typography.meta }}>
          Interrupted when the app closed
        </Text>
      )}
    </View>
  );
});

function EmptyChat() {
  return (
    <View style={{ alignItems: 'center', gap: 10, padding: 24 }}>
      <View
        style={{
          width: 56,
          height: 56,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: theme.radius.card,
          backgroundColor: theme.colors.surface,
        }}>
        <SymbolView
          name={{ ios: 'bubble.left.and.bubble.right.fill', android: 'chat_bubble' }}
          size={27}
          tintColor={theme.colors.accent}
        />
      </View>
      <Text
        style={{ color: theme.colors.text, fontFamily: theme.fonts.heading, fontSize: theme.typography.subtitle }}>
        Start a conversation
      </Text>
      <Text
        style={{
          maxWidth: 280,
          color: theme.colors.textMuted,
          fontFamily: theme.fonts.mono,
          fontSize: theme.typography.body,
          textAlign: 'center',
          lineHeight: 21,
        }}>
        Conversations are saved automatically and appear in History.
      </Text>
    </View>
  );
}

export function ToolProgress({ calls }: { calls: ToolActivity[] }) {
  const [openCallId, setOpenCallId] = useState<string | null>(null);

  return (
    <View style={{ gap: 6, paddingBottom: 8 }}>
      {calls.map((call) => {
        const expanded = openCallId === call.callId;
        return (
          <View
            key={call.callId}
            style={{
              borderLeftWidth: 2,
              borderLeftColor: toolStatusColor(call.status),
              borderRadius: theme.radius.sheet,
              backgroundColor: theme.colors.surfaceLow,
            }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Tool usage, ${call.name || 'Unknown tool'}, ${toolStatusLabel(call.status)}`}
              accessibilityState={{ expanded }}
              onPress={() => setOpenCallId(expanded ? null : call.callId)}
              style={({ pressed }) => ({
                minHeight: 52,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 12,
                opacity: pressed ? 0.75 : 1,
              })}>
              <SymbolView name={{ ios: 'wrench.and.screwdriver', android: 'build' }} size={16} tintColor={theme.colors.secondary} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: theme.colors.text, fontFamily: theme.fonts.monoMedium, fontSize: theme.typography.meta }}>
                  Tool usage
                </Text>
                <Text numberOfLines={1} style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.mono, fontSize: theme.typography.meta }}>
                  {call.name || 'Unknown tool'}
                </Text>
              </View>
              <Text style={{ color: toolStatusColor(call.status), fontFamily: theme.fonts.monoMedium, fontSize: theme.typography.meta }}>
                {toolStatusLabel(call.status)}
              </Text>
              <SymbolView
                name={{ ios: expanded ? 'chevron.up' : 'chevron.down', android: expanded ? 'expand_less' : 'expand_more' }}
                size={16}
                tintColor={theme.colors.textMuted}
              />
            </Pressable>
            {expanded && (
              <View style={{ gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.canvas }}>
                <ApprovalField label="Target" value={call.target} />
                <ApprovalField label="Side effect" value={call.sideEffect} />
                <View style={{ gap: 4 }}>
                  <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.monoMedium, fontSize: theme.typography.meta }}>
                    Arguments
                  </Text>
                  <ScrollView style={{ maxHeight: 120, borderRadius: theme.radius.control, backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: 8 }}>
                    <Text selectable style={{ color: theme.colors.text, fontFamily: theme.fonts.mono, fontSize: theme.typography.meta }}>
                      {call.argumentsJson}
                    </Text>
                  </ScrollView>
                </View>
                {call.name === 'web_search' && <WebSearchSourceCards output={call.result?.output ?? null} />}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

export function WebSearchSourceCards({ output }: { output: string | null }) {
  const search = output === null ? null : parseWebSearchOutput(output);
  if (search === null || search.results.length === 0) {
    return null;
  }
  return (
    <View style={{ gap: 6, paddingTop: 6 }}>
      <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.monoMedium, fontSize: theme.typography.meta }}>
        Web sources
      </Text>
      {search.results.map((result) => {
        const title = result.title ?? result.source;
        return (
          <Pressable
            key={result.url}
            accessibilityRole="link"
            accessibilityLabel={`Open source ${title}`}
            onPress={() => {
              void Linking.openURL(result.url).catch(() => undefined);
            }}
            style={({ pressed }) => ({
              gap: 3,
              padding: 10,
              borderLeftWidth: 2,
              borderLeftColor: theme.colors.secondary,
              borderRadius: theme.radius.card,
              backgroundColor: theme.colors.canvas,
              opacity: pressed ? 0.7 : 1,
            })}>
            <Text style={{ color: theme.colors.accent, fontFamily: theme.fonts.monoMedium, fontSize: theme.typography.meta }}>
              {title}
            </Text>
            <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.mono, fontSize: theme.typography.meta }}>
              {result.source}{result.publishedAt === null ? '' : ` · ${result.publishedAt}`}
            </Text>
            {result.snippet !== null && (
              <Text numberOfLines={3} style={{ color: theme.colors.text, fontFamily: theme.fonts.mono, fontSize: theme.typography.meta }}>
                {result.snippet}
              </Text>
            )}
            <Text style={{ color: theme.colors.secondary, fontFamily: theme.fonts.mono, fontSize: 10 }}>
              Untrusted web content
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PendingMessage({ calls }: { calls: ToolActivity[] }) {
  const active = calls.find((call) => call.status === 'awaiting_approval' || call.status === 'executing');
  const label = active === undefined ? 'Waiting for response...' : toolStatusLabel(active.status);
  return (
    <View
      accessibilityLabel="Waiting for response"
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 11,
        borderRadius: theme.radius.card,
        backgroundColor: theme.colors.surfaceLow,
      }}>
      <ActivityIndicator size="small" color={theme.colors.accent} />
      <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.mono, fontSize: theme.typography.meta }}>
        {label}
      </Text>
    </View>
  );
}

export function ToolApprovalModal({
  activity,
  onResolve,
}: {
  activity: ToolActivity | null;
  onResolve: (approved: boolean) => void;
}) {
  if (activity === null) {
    return null;
  }
  return (
    <Modal
      visible
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => onResolve(false)}>
      <View
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
        }}>
        <View
          style={{
            width: '100%',
            maxHeight: '82%',
            gap: 12,
            padding: theme.spacing.screen,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            borderTopLeftRadius: theme.radius.sheet,
            borderTopRightRadius: theme.radius.sheet,
            backgroundColor: theme.colors.sheet,
          }}>
          <View style={{ alignSelf: 'center', width: 32, height: 4, borderRadius: 2, backgroundColor: theme.colors.border }} />
          <Text style={{ color: theme.colors.text, fontFamily: theme.fonts.heading, fontSize: theme.typography.subtitle }}>
            Approve tool call?
          </Text>
          <ApprovalField label="Tool" value={activity.name || 'Unknown tool'} />
          <ApprovalField label="Target" value={activity.target} />
          <ApprovalField label="Side effect" value={activity.sideEffect} />
          <View style={{ gap: 4 }}>
            <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.monoMedium, fontSize: theme.typography.meta }}>
              Arguments
            </Text>
            <ScrollView
              style={{ maxHeight: 180, borderRadius: theme.radius.control, backgroundColor: theme.colors.background }}
              contentContainerStyle={{ padding: 10 }}>
              <Text selectable style={{ color: theme.colors.text, fontFamily: theme.fonts.mono, fontSize: theme.typography.meta }}>
                {activity.argumentsJson}
              </Text>
            </ScrollView>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reject tool call"
              onPress={() => onResolve(false)}
              style={({ pressed }) => ({
                minHeight: 48,
                justifyContent: 'center',
                paddingHorizontal: 16,
                borderRadius: theme.radius.control,
                backgroundColor: theme.colors.background,
                opacity: pressed ? 0.7 : 1,
              })}>
              <Text style={{ color: theme.colors.text, fontFamily: theme.fonts.heading, fontSize: theme.typography.body }}>
                Reject
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Approve tool call"
              onPress={() => onResolve(true)}
              style={({ pressed }) => ({
                minHeight: 48,
                justifyContent: 'center',
                paddingHorizontal: 16,
                borderRadius: theme.radius.control,
                backgroundColor: theme.colors.accent,
                opacity: pressed ? 0.7 : 1,
              })}>
              <Text style={{ color: theme.colors.accentText, fontFamily: theme.fonts.heading, fontSize: theme.typography.body }}>
                Approve
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ApprovalField({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.monoMedium, fontSize: theme.typography.meta }}>
        {label}
      </Text>
      <Text style={{ color: theme.colors.text, fontFamily: theme.fonts.mono, fontSize: theme.typography.body }}>{value}</Text>
    </View>
  );
}

function toolStatusLabel(status: ToolActivity['status']): string {
  if (status === 'awaiting_approval') {
    return 'Waiting for your approval';
  }
  if (status === 'executing') {
    return 'Running tool...';
  }
  if (status === 'completed') {
    return 'Tool completed';
  }
  if (status === 'rejected') {
    return 'Tool rejected';
  }
  if (status === 'timed_out') {
    return 'Tool timed out';
  }
  if (status === 'cancelled') {
    return 'Tool cancelled';
  }
  if (status === 'interrupted') {
    return 'Tool interrupted';
  }
  return 'Tool failed';
}

function toolStatusColor(status: ToolActivity['status']): string {
  if (status === 'awaiting_approval' || status === 'timed_out') {
    return theme.colors.tertiary;
  }
  if (status === 'executing') {
    return theme.colors.secondary;
  }
  if (status === 'completed') {
    return theme.colors.accent;
  }
  if (status === 'rejected' || status === 'failed' || status === 'cancelled') {
    return theme.colors.danger;
  }
  return theme.colors.textMuted;
}

function ErrorCard({
  error,
  endpointName,
  modelId,
  protocol,
  canRetry,
  onRetry,
}: {
  error: AppError;
  endpointName: string | null;
  modelId: string | null;
  protocol: string | null;
  canRetry: boolean;
  onRetry: () => void;
}) {
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
        Request failed
      </Text>
      <Text style={{ color: theme.colors.text, fontSize: theme.typography.meta }}>{error.message}</Text>
      <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
        Endpoint {endpointName ?? 'unavailable'} · Model {modelId ?? 'unavailable'} · Protocol{' '}
        {protocol ?? 'unavailable'}
      </Text>
      <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
        Status {error.httpStatus ?? 'unavailable'}
        {error.providerCode === null ? '' : ` · Code ${error.providerCode}`}
        {error.requestId === null ? '' : ` · Request ${error.requestId}`}
      </Text>
      <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
        Safe next step:{' '}
        {error.retryable ? 'try again after checking the endpoint.' : 'check the endpoint and active model.'}
      </Text>
      {canRetry && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry"
          accessibilityHint="Retry the failed request"
          style={{ minHeight: 48, justifyContent: 'center' }}
          onPress={onRetry}>
          <Text style={{ color: theme.colors.accent, fontSize: theme.typography.meta, fontWeight: '700' }}>
            Retry
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function RetryCard({ onRetry }: { onRetry: () => void }) {
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
        Previous response was interrupted.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retry"
        accessibilityHint="Retry the interrupted request"
        style={{ minHeight: 48, justifyContent: 'center' }}
        onPress={onRetry}>
        <Text style={{ color: theme.colors.warningText, fontWeight: '800' }}>Retry</Text>
      </Pressable>
    </View>
  );
}
