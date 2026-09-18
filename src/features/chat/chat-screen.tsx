import { Link, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import Markdown from 'react-native-markdown-display';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ChatMessage } from '../../domain/conversation';
import type { AppError } from '../../domain/error';
import type { ToolActivity } from '../../domain/tool';
import type { TurnMetrics } from '../../domain/usage';
import { parseWebSearchOutput } from '../../domain/web-search';
import { formatDuration, formatRate } from '../../domain/usage';
import { InfoBlock, Screen } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { useActiveEndpoint } from '../setup/use-active-endpoint';
import { useChat } from './use-chat';
import { ContextPill } from './context-pill';

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
                ? 'Loading active model...'
                : (chat.activeModelId ?? 'No active model')}
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
              minHeight: 48,
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
            accessibilityLabel="Open history"
            onPress={() => router.push('/history')}
            style={({ pressed }) => ({
              minWidth: 48,
              minHeight: 48,
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
            <InfoBlock title="No endpoint connected" body="Connect an endpoint before sending a message." />
          </View>
        ) : chat.activeModelId === null && !chat.loadingModel ? (
          <View style={{ flex: 1, gap: 12, padding: theme.spacing.screen }}>
            <InfoBlock title="Choose a model" body="Chat needs one active model from the catalog." />
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
              gap: 12,
              justifyContent: chat.messages.length === 0 ? 'center' : 'flex-start',
              padding: theme.spacing.screen,
            }}
            ListEmptyComponent={<EmptyChat />}
            ListHeaderComponent={chat.compactionActive ? <CompactionSeparator /> : null}
            ListFooterComponent={
              <>
                {chat.toolProgress.length > 0 && <ToolProgress calls={chat.toolProgress} />}
                {chat.pending && <PendingMessage calls={chat.toolProgress} />}
              </>
            }
            renderItem={({ item }) =>
              item.role === 'assistant' && item.status === 'sending' && item.text.length === 0
                ? null
                : <MessageBubble message={item} />
            }
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
            paddingVertical: 8,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.background,
          }}>
          <View
            style={{
              gap: 2,
              paddingHorizontal: 8,
              paddingTop: 8,
              paddingBottom: 4,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.card,
              backgroundColor: theme.colors.surface,
            }}>
            <TextInput
              accessibilityLabel="Message"
              accessibilityHint="Write a message to send to the active model"
              value={draft}
              onChangeText={setDraft}
              placeholder="Write a message..."
              placeholderTextColor={theme.colors.textMuted}
              editable={
                !chat.pending &&
                !chat.compacting &&
                !chat.loadingModel &&
                chat.activeModelId !== null
              }
              multiline
              style={{
                minHeight: 40,
                maxHeight: 132,
                paddingHorizontal: 6,
                paddingVertical: 6,
                color: theme.colors.text,
                fontSize: theme.typography.body,
                textAlignVertical: 'top',
              }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
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
                  cacheHitPercent={chat.metrics.at(-1)?.cacheHitPercent ?? null}
                  policy={chat.contextPolicy}
                  autoCompact={chat.autoCompact}
                  compacting={chat.compacting}
                  canCompact={chat.conversationId !== null && !chat.pending}
                  onCompact={() => void chat.compactNow()}
                  onToggleAutoCompact={(enabled) => void chat.setAutoCompact(enabled)}
                />
              )}
              <View style={{ flex: 1 }}>
                {chat.metrics.length > 0 && <MetricsFooter metrics={chat.metrics} />}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={chat.pending ? 'Stop' : 'Send'}
                accessibilityHint={chat.pending ? 'Stop the current response' : 'Send message'}
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
        </View>
      </KeyboardAvoidingView>
      <ToolApprovalModal activity={chat.toolApproval} onResolve={chat.resolveToolApproval} />
    </Screen>
  );
}

function CompactionSeparator() {
  const theme = useTheme();
  return (
    <View style={{ paddingBottom: 4 }}>
      <Text
        style={{
          color: theme.colors.textMuted,
          fontSize: theme.typography.meta,
          textAlign: 'center',
        }}>
        Local summary active. The original transcript is preserved.
      </Text>
    </View>
  );
}

function MetricsFooter({ metrics }: { metrics: TurnMetrics[] }) {
  const theme = useTheme();
  const latest = metrics[metrics.length - 1];
  if (latest === undefined) {
    return null;
  }
  return (
    <Text
      numberOfLines={1}
      accessibilityLabel={`Request stats, ${formatDuration(latest.ttftMs)}, ${formatRate(latest.tokensPerSecond)}`}
      style={{ color: theme.colors.textMuted, fontSize: 10, textAlign: 'right' }}>
      {formatDuration(latest.ttftMs)} · {formatRate(latest.tokensPerSecond)}
    </Text>
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
          minHeight: 48,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingHorizontal: 10,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.background,
          opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
        })}>
        <Text style={{ color: theme.colors.text, fontSize: theme.typography.meta, fontWeight: '700' }}>
          {selectedLabel}
        </Text>
        <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
          {open ? '⌃' : '⌄'}
        </Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View
          style={{
            flex: 1,
            justifyContent: 'flex-end',
            padding: 16,
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
              maxWidth: 420,
              alignSelf: 'center',
              gap: 4,
              padding: 8,
              borderRadius: theme.radius.card,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
            }}>
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

export function MessageBubble({ message }: { message: ChatMessage }) {
  const theme = useTheme();
  const user = message.role === 'user';
  return (
    <View
      accessibilityLabel={user ? 'Your message' : 'Assistant response'}
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
            Thinking summary
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
          }}
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
            color: user ? theme.colors.accentText : theme.colors.text,
            fontSize: theme.typography.body,
            lineHeight: 22,
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
        Start a conversation
      </Text>
      <Text
        style={{
          maxWidth: 280,
          color: theme.colors.textMuted,
          fontSize: theme.typography.body,
          textAlign: 'center',
          lineHeight: 21,
        }}>
        Conversations are saved automatically and appear in History.
      </Text>
    </View>
  );
}

function ToolProgress({ calls }: { calls: ToolActivity[] }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6, paddingBottom: 8 }}>
      {calls.map((call) => (
        <View
          key={call.callId}
          accessibilityLabel={`Tool ${call.name}, ${toolStatusLabel(call.status)}`}
          style={{
            gap: 2,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.card,
            backgroundColor: theme.colors.surface,
          }}>
          <Text style={{ color: theme.colors.text, fontSize: theme.typography.meta, fontWeight: '700' }}>
            {call.name || 'Unknown tool'}
          </Text>
          <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
            {toolStatusLabel(call.status)}
          </Text>
          {call.name === 'web_search' && <WebSearchSourceCards output={call.result?.output ?? null} />}
        </View>
      ))}
    </View>
  );
}

export function WebSearchSourceCards({ output }: { output: string | null }) {
  const theme = useTheme();
  const search = output === null ? null : parseWebSearchOutput(output);
  if (search === null || search.results.length === 0) {
    return null;
  }
  return (
    <View style={{ gap: 6, paddingTop: 6 }}>
      <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta, fontWeight: '700' }}>
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
              borderRadius: theme.radius.control,
              backgroundColor: theme.colors.background,
              opacity: pressed ? 0.7 : 1,
            })}>
            <Text style={{ color: theme.colors.accent, fontSize: theme.typography.meta, fontWeight: '700' }}>
              {title}
            </Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
              {result.source}{result.publishedAt === null ? '' : ` · ${result.publishedAt}`}
            </Text>
            {result.snippet !== null && (
              <Text numberOfLines={3} style={{ color: theme.colors.text, fontSize: theme.typography.meta }}>
                {result.snippet}
              </Text>
            )}
            <Text style={{ color: theme.colors.textMuted, fontSize: 10 }}>
              Untrusted web content
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PendingMessage({ calls }: { calls: ToolActivity[] }) {
  const theme = useTheme();
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
        backgroundColor: theme.colors.surface,
      }}>
      <ActivityIndicator size="small" color={theme.colors.accent} />
      <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
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
  const theme = useTheme();
  if (activity === null) {
    return null;
  }
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => onResolve(false)}>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          padding: theme.spacing.screen,
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
        }}>
        <View
          style={{
            maxHeight: '82%',
            gap: 12,
            padding: theme.spacing.screen,
            borderRadius: theme.radius.card,
            backgroundColor: theme.colors.surface,
          }}>
          <Text style={{ color: theme.colors.text, fontSize: theme.typography.subtitle, fontWeight: '800' }}>
            Approve tool call?
          </Text>
          <ApprovalField label="Tool" value={activity.name || 'Unknown tool'} />
          <ApprovalField label="Target" value={activity.target} />
          <ApprovalField label="Side effect" value={activity.sideEffect} />
          <View style={{ gap: 4 }}>
            <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta, fontWeight: '700' }}>
              Arguments
            </Text>
            <ScrollView
              style={{ maxHeight: 180, borderRadius: theme.radius.control, backgroundColor: theme.colors.background }}
              contentContainerStyle={{ padding: 10 }}>
              <Text selectable style={{ color: theme.colors.text, fontSize: theme.typography.meta }}>
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
              <Text style={{ color: theme.colors.text, fontSize: theme.typography.body, fontWeight: '700' }}>
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
              <Text style={{ color: theme.colors.accentText, fontSize: theme.typography.body, fontWeight: '700' }}>
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
  const theme = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta, fontWeight: '700' }}>
        {label}
      </Text>
      <Text style={{ color: theme.colors.text, fontSize: theme.typography.body }}>{value}</Text>
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
